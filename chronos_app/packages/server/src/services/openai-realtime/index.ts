import { StatusCodes } from 'http-status-codes'
import { InternalChronosError } from '../../errors/internalChronosError'
import { getErrorMessage } from '../../errors/utils'
import {
    buildFlow,
    constructGraphs,
    databaseEntities,
    getAPIOverrideConfig,
    getEndingNodes,
    getStartingNodes,
    resolveVariables
} from '../../utils'
import { checkStorage, updateStorageUsage } from '../../utils/quotaUsage'
import { getRunningExpressApp } from '../../utils/getRunningExpressApp'
import { AgentFlow } from '../../database/entities/AgentFlow'
import { IDepthQueue, IReactFlowNode } from '../../Interface'
import { ICommonObject, INodeData } from 'chronos-components'
import { convertToOpenAIFunction } from '@langchain/core/utils/function_calling'
import { v4 as uuidv4 } from 'uuid'
import { Variable } from '../../database/entities/Variable'

const SOURCE_DOCUMENTS_PREFIX = '\n\n----CHRONOS_SOURCE_DOCUMENTS----\n\n'
const ARTIFACTS_PREFIX = '\n\n----CHRONOS_ARTIFACTS----\n\n'
const TOOL_ARGS_PREFIX = '\n\n----CHRONOS_TOOL_ARGS----\n\n'

const buildAndInitTool = async (agentflowid: string, _chatId?: string, _apiMessageId?: string) => {
    const appServer = getRunningExpressApp()
    const agentflow = await appServer.AppDataSource.getRepository(AgentFlow).findOneBy({
        id: agentflowid
    })
    if (!agentflow) {
        throw new InternalChronosError(StatusCodes.NOT_FOUND, `Agentflow ${agentflowid} not found`)
    }

    const chatId = _chatId || uuidv4()
    const apiMessageId = _apiMessageId || uuidv4()
    const flowData = JSON.parse(agentflow.flowData)
    const nodes = flowData.nodes
    const edges = flowData.edges

    const toolAgentNode = nodes.find(
        (node: IReactFlowNode) => node.data.inputAnchors.find((acr) => acr.type === 'Tool') && node.data.category === 'Agents'
    )
    if (!toolAgentNode) {
        throw new InternalChronosError(StatusCodes.NOT_FOUND, `Agent with tools not found in agentflow ${agentflowid}`)
    }

    const { graph, nodeDependencies } = constructGraphs(nodes, edges)
    const directedGraph = graph
    const endingNodes = getEndingNodes(nodeDependencies, directedGraph, nodes)

    /*** Get Starting Nodes with Reversed Graph ***/
    const constructedObj = constructGraphs(nodes, edges, { isReversed: true })
    const nonDirectedGraph = constructedObj.graph
    let startingNodeIds: string[] = []
    let depthQueue: IDepthQueue = {}
    const endingNodeIds = endingNodes.map((n) => n.id)
    for (const endingNodeId of endingNodeIds) {
        const resx = getStartingNodes(nonDirectedGraph, endingNodeId)
        startingNodeIds.push(...resx.startingNodeIds)
        depthQueue = Object.assign(depthQueue, resx.depthQueue)
    }
    startingNodeIds = [...new Set(startingNodeIds)]

    /*** Get API Config ***/
    const availableVariables = await appServer.AppDataSource.getRepository(Variable).find()
    const { nodeOverrides, variableOverrides, apiOverrideStatus } = getAPIOverrideConfig(agentflow)

    // Open source: No workspace/organization lookup needed
    const workspaceId = ''
    const orgId = ''
    const subscriptionId = ''

    const reactFlowNodes = await buildFlow({
        startingNodeIds,
        reactFlowNodes: nodes,
        reactFlowEdges: edges,
        graph,
        depthQueue,
        componentNodes: appServer.nodesPool.componentNodes,
        question: '',
        chatHistory: [],
        chatId: chatId,
        sessionId: chatId,
        agentflowid: agentflowid,
        apiMessageId,
        appDataSource: appServer.AppDataSource,
        usageCacheManager: appServer.usageCacheManager,
        cachePool: appServer.cachePool,
        apiOverrideStatus,
        nodeOverrides,
        availableVariables,
        variableOverrides,
        orgId,
        workspaceId,
        subscriptionId,
        updateStorageUsage,
        checkStorage
    })

    const nodeToExecute =
        endingNodeIds.length === 1
            ? reactFlowNodes.find((node: IReactFlowNode) => endingNodeIds[0] === node.id)
            : reactFlowNodes[reactFlowNodes.length - 1]

    if (!nodeToExecute) {
        throw new InternalChronosError(StatusCodes.NOT_FOUND, `Node not found`)
    }

    const flowDataObj: ICommonObject = { agentflowid: agentflowid, chatId }

    const reactFlowNodeData: INodeData = await resolveVariables(
        nodeToExecute.data,
        reactFlowNodes,
        '',
        [],
        flowDataObj,
        '',
        availableVariables,
        variableOverrides
    )
    let nodeToExecuteData = reactFlowNodeData

    const nodeInstanceFilePath = appServer.nodesPool.componentNodes[nodeToExecuteData.name].filePath as string
    const nodeModule = await import(nodeInstanceFilePath)
    const nodeInstance = new nodeModule.nodeClass()

    const agent = await nodeInstance.init(nodeToExecuteData, '', {
        agentflowid: agentflowid,
        chatId,
        orgId,
        workspaceId,
        appDataSource: appServer.AppDataSource,
        databaseEntities,
        analytic: agentflow.analytic
    })

    return agent
}

const getAgentTools = async (agentflowid: string): Promise<any> => {
    try {
        const agent = await buildAndInitTool(agentflowid)
        const tools = agent.tools
        return tools.map(convertToOpenAIFunction)
    } catch (error) {
        throw new InternalChronosError(
            StatusCodes.INTERNAL_SERVER_ERROR,
            `Error: openaiRealTimeService.getAgentTools - ${getErrorMessage(error)}`
        )
    }
}

const executeAgentTool = async (
    agentflowid: string,
    chatId: string,
    toolName: string,
    inputArgs: string,
    apiMessageId?: string
): Promise<any> => {
    try {
        const agent = await buildAndInitTool(agentflowid, chatId, apiMessageId)
        const tools = agent.tools
        const tool = tools.find((tool: any) => tool.name === toolName)

        if (!tool) {
            throw new InternalChronosError(StatusCodes.NOT_FOUND, `Tool ${toolName} not found`)
        }

        const inputArgsObj = typeof inputArgs === 'string' ? JSON.parse(inputArgs) : inputArgs

        let toolOutput = await tool.call(inputArgsObj, undefined, undefined, { chatId })

        if (typeof toolOutput === 'object') {
            toolOutput = JSON.stringify(toolOutput)
        }

        let sourceDocuments = []
        if (typeof toolOutput === 'string' && toolOutput.includes(SOURCE_DOCUMENTS_PREFIX)) {
            const _splitted = toolOutput.split(SOURCE_DOCUMENTS_PREFIX)
            toolOutput = _splitted[0]
            const _sourceDocuments = JSON.parse(_splitted[1].trim())
            if (Array.isArray(_sourceDocuments)) {
                sourceDocuments = _sourceDocuments
            } else {
                sourceDocuments.push(_sourceDocuments)
            }
        }

        let artifacts = []
        if (typeof toolOutput === 'string' && toolOutput.includes(ARTIFACTS_PREFIX)) {
            const _splitted = toolOutput.split(ARTIFACTS_PREFIX)
            toolOutput = _splitted[0]
            const _artifacts = JSON.parse(_splitted[1].trim())
            if (Array.isArray(_artifacts)) {
                artifacts = _artifacts
            } else {
                artifacts.push(_artifacts)
            }
        }

        if (typeof toolOutput === 'string' && toolOutput.includes(TOOL_ARGS_PREFIX)) {
            const _splitted = toolOutput.split(TOOL_ARGS_PREFIX)
            toolOutput = _splitted[0]
        }

        return {
            output: toolOutput,
            sourceDocuments,
            artifacts
        }
    } catch (error) {
        throw new InternalChronosError(
            StatusCodes.INTERNAL_SERVER_ERROR,
            `Error: openaiRealTimeService.executeAgentTool - ${getErrorMessage(error)}`
        )
    }
}

export default {
    getAgentTools,
    executeAgentTool
}
