import { Request } from 'express'
import { DataSource } from 'typeorm'
import * as path from 'path'
import { v4 as uuidv4 } from 'uuid'
import { cloneDeep, get, omit } from 'lodash'
import TurndownService from 'turndown'
import { trace, context, SpanStatusCode, Span } from '@opentelemetry/api'
import {
    AnalyticHandler,
    ICommonObject,
    ICondition,
    IFileUpload,
    IHumanInput,
    IMessage,
    IServerSideEventStreamer,
    convertChatHistoryToText,
    convertSpeechToText,
    generateFollowUpPrompts,
    addSingleFileToStorage,
    addArrayFilesToStorage,
    mapMimeTypeToInputField,
    mapExtToInputField,
    getFileFromUpload,
    removeSpecificFileFromUpload
} from 'chronos-components'
import { StatusCodes } from 'http-status-codes'
import {
    IncomingAgentflowInput,
    IncomingInput,
    INodeData,
    IReactFlowObject,
    IExecuteFlowParams,
    IFlowConfig,
    IAgentflowExecutedData,
    ExecutionState,
    IExecution,
    IChatMessage,
    ChatType,
    IReactFlowNode,
    IReactFlowEdge,
    IComponentNodes,
    INodeOverrides,
    IVariableOverride,
    INodeDirectedGraph,
    MODE
} from '../Interface'
import { InternalChronosError } from '../errors/internalChronosError'
import {
    RUNTIME_MESSAGES_LENGTH_VAR_PREFIX,
    CHAT_HISTORY_VAR_PREFIX,
    databaseEntities,
    FILE_ATTACHMENT_PREFIX,
    getAppVersion,
    getGlobalVariable,
    getStartingNode,
    getTelemetryFlowObj,
    QUESTION_VAR_PREFIX,
    CURRENT_DATE_TIME_VAR_PREFIX,
    _removeCredentialId,
    validateHistorySchema,
    LOOP_COUNT_VAR_PREFIX
} from '.'
import { AgentFlow } from '../database/entities/AgentFlow'
import { Variable } from '../database/entities/Variable'
import { replaceInputsWithConfig, constructGraphs, getAPIOverrideConfig } from '../utils'
import logger from './logger'
import { getErrorMessage } from '../errors/utils'
import { Execution } from '../database/entities/Execution'
import { utilAddChatMessage } from './addChatMesage'
import { CachePool } from '../CachePool'
import { ChatMessage } from '../database/entities/ChatMessage'
import { Telemetry } from './telemetry'
import { getWorkspaceSearchOptions } from './openSourceStubs'
import { UsageCacheManager } from '../UsageCacheManager'
import { generateTTSForResponseStream, shouldAutoPlayTTS } from './ttsUtils'
import { getRunningExpressApp } from './getRunningExpressApp'
import { validateFileMimeTypeAndExtensionMatch } from './fileValidation'
import { validateFlowAPIKey } from './validateKey'
import { checkStorage, updatePredictionsUsage, updateStorageUsage } from './quotaUsage'
import { CHRONOS_METRIC_COUNTERS, CHRONOS_COUNTER_STATUS, IMetricsProvider } from '../Interface.Metrics'
import { OMIT_QUEUE_JOB_DATA } from './constants'
import { isTracingEnabled } from '../tracing'

const agentflowTracer = trace.getTracer('chronos-agentflow')

export interface IWaitingNode {
    nodeId: string
    receivedInputs: Map<string, any>
    expectedInputs: Set<string>
    isConditional: boolean
    conditionalGroups: Map<string, string[]>
}

export interface INodeQueue {
    nodeId: string
    data: any
    inputs: Record<string, any>
}

interface IProcessNodeOutputsParams {
    nodeId: string
    nodeName: string
    result: any
    humanInput?: IHumanInput
    graph: Record<string, string[]>
    nodes: IReactFlowNode[]
    edges: IReactFlowEdge[]
    nodeExecutionQueue: INodeQueue[]
    waitingNodes: Map<string, IWaitingNode>
    loopCounts: Map<string, number>
    abortController?: AbortController
    sseStreamer?: IServerSideEventStreamer
    chatId: string
}

interface IAgentFlowRuntime {
    state?: ICommonObject
    chatHistory?: IMessage[]
    form?: Record<string, any>
}

interface IExecuteNodeParams {
    nodeId: string
    reactFlowNode: IReactFlowNode
    nodes: IReactFlowNode[]
    edges: IReactFlowEdge[]
    graph: INodeDirectedGraph
    reversedGraph: INodeDirectedGraph
    incomingInput: IncomingAgentflowInput
    agentflow: AgentFlow
    chatId: string
    sessionId: string
    apiMessageId: string
    evaluationRunId?: string
    isInternal: boolean
    pastChatHistory: IMessage[]
    prependedChatHistory: IMessage[]
    appDataSource: DataSource
    usageCacheManager: UsageCacheManager
    telemetry: Telemetry
    componentNodes: IComponentNodes
    cachePool: CachePool
    sseStreamer: IServerSideEventStreamer
    baseURL: string
    overrideConfig?: ICommonObject
    apiOverrideStatus?: boolean
    nodeOverrides?: INodeOverrides
    variableOverrides?: IVariableOverride[]
    uploadedFilesContent?: string
    fileUploads?: IFileUpload[]
    humanInput?: IHumanInput
    agentFlowExecutedData?: IAgentflowExecutedData[]
    agentflowRuntime: IAgentFlowRuntime
    abortController?: AbortController
    parentTraceIds?: ICommonObject
    analyticHandlers?: AnalyticHandler
    parentExecutionId?: string
    isRecursive?: boolean
    iterationContext?: ICommonObject
    loopCounts?: Map<string, number>
    orgId: string
    workspaceId: string
    subscriptionId: string
    productId: string
}

interface IExecuteAgentFlowParams extends Omit<IExecuteFlowParams, 'incomingInput'> {
    incomingInput: IncomingAgentflowInput
}

const MAX_LOOP_COUNT = process.env.MAX_LOOP_COUNT ? parseInt(process.env.MAX_LOOP_COUNT) : 10

/**
 * Add execution to database
 * @param {DataSource} appDataSource
 * @param {string} agentflowId
 * @param {IAgentflowExecutedData[]} agentFlowExecutedData
 * @param {string} sessionId
 * @returns {Promise<Execution>}
 */
const addExecution = async (
    appDataSource: DataSource,
    agentflowId: string,
    agentFlowExecutedData: IAgentflowExecutedData[],
    sessionId: string
) => {
    const newExecution = new Execution()
    const bodyExecution = {
        agentflowId,
        state: 'INPROGRESS',
        sessionId,
        executionData: JSON.stringify(agentFlowExecutedData)
    }
    Object.assign(newExecution, bodyExecution)

    const execution = appDataSource.getRepository(Execution).create(newExecution)
    return await appDataSource.getRepository(Execution).save(execution)
}

/**
 * Update execution in database
 * @param {DataSource} appDataSource
 * @param {string} executionId
 * @param {Partial<IExecution>} data
 * @returns {Promise<void>}
 */
const updateExecution = async (appDataSource: DataSource, executionId: string, data?: Partial<IExecution>) => {
    const execution = await appDataSource.getRepository(Execution).findOneBy({
        id: executionId
    })

    if (!execution) {
        throw new Error(`Execution ${executionId} not found`)
    }

    const updateExecution = new Execution()
    const bodyExecution: ICommonObject = {}
    if (data && data.executionData) {
        bodyExecution.executionData = typeof data.executionData === 'string' ? data.executionData : JSON.stringify(data.executionData)
    }
    if (data && data.state) {
        bodyExecution.state = data.state

        if (data.state === 'STOPPED') {
            bodyExecution.stoppedDate = new Date()
        }
    }

    Object.assign(updateExecution, bodyExecution)

    appDataSource.getRepository(Execution).merge(execution, updateExecution)
    await appDataSource.getRepository(Execution).save(execution)
}

export const resolveVariables = async (
    reactFlowNodeData: INodeData,
    question: string,
    form: Record<string, any>,
    flowConfig: IFlowConfig | undefined,
    availableVariables: Variable[],
    variableOverrides: IVariableOverride[],
    uploadedFilesContent: string,
    chatHistory: IMessage[],
    componentNodes: IComponentNodes,
    agentFlowExecutedData?: IAgentflowExecutedData[],
    iterationContext?: ICommonObject,
    loopCounts?: Map<string, number>
): Promise<INodeData> => {
    const span = isTracingEnabled() ? agentflowTracer.startSpan('workflow.resolveVariables') : undefined
    span?.setAttribute('workflow.step.id', reactFlowNodeData.id)
    span?.setAttribute('workflow.step.name', reactFlowNodeData.label || '')

    let flowNodeData = cloneDeep(reactFlowNodeData)
    const types = 'inputs'

    const resolveNodeReference = async (value: any): Promise<any> => {
        // If value is an array, process each element
        if (Array.isArray(value)) {
            return Promise.all(value.map((item) => resolveNodeReference(item)))
        }

        // If value is an object, process each property
        if (typeof value === 'object' && value !== null) {
            const resolvedObj: any = {}
            for (const [key, val] of Object.entries(value)) {
                resolvedObj[key] = await resolveNodeReference(val)
            }
            return resolvedObj
        }

        // If value is not a string, return as is
        if (typeof value !== 'string') return value

        const turndownService = new TurndownService()
        value = turndownService.turndown(value)
        // After conversion, replace any escaped underscores with regular underscores
        value = value.replace(/\\_/g, '_')

        const matches = value.match(/{{(.*?)}}/g)

        if (!matches) return value

        let resolvedValue = value
        for (const match of matches) {
            // Remove {{ }} and trim whitespace
            const reference = match.replace(/[{}]/g, '').trim()
            const variableFullPath = reference

            if (variableFullPath === QUESTION_VAR_PREFIX) {
                resolvedValue = resolvedValue.replace(match, question)
                resolvedValue = uploadedFilesContent ? `${uploadedFilesContent}\n\n${resolvedValue}` : resolvedValue
            }

            if (variableFullPath.startsWith('$form.')) {
                const variableValue = get(form, variableFullPath.replace('$form.', ''))
                if (variableValue != null) {
                    // For arrays and objects, stringify them to prevent toString() conversion issues
                    const formattedValue =
                        Array.isArray(variableValue) || (typeof variableValue === 'object' && variableValue !== null)
                            ? JSON.stringify(variableValue)
                            : variableValue
                    resolvedValue = resolvedValue.replace(match, formattedValue)
                }
            }

            if (variableFullPath === FILE_ATTACHMENT_PREFIX) {
                resolvedValue = resolvedValue.replace(match, uploadedFilesContent)
            }

            if (variableFullPath === CHAT_HISTORY_VAR_PREFIX) {
                resolvedValue = resolvedValue.replace(match, convertChatHistoryToText(chatHistory))
            }

            if (variableFullPath === RUNTIME_MESSAGES_LENGTH_VAR_PREFIX) {
                resolvedValue = resolvedValue.replace(match, flowConfig?.runtimeChatHistoryLength ?? 0)
            }

            if (variableFullPath === LOOP_COUNT_VAR_PREFIX) {
                // Get the current loop count from the most recent loopAgentflow node execution
                let currentLoopCount = 0
                if (loopCounts && agentFlowExecutedData) {
                    // Find the most recent loopAgentflow node execution to get its loop count
                    const loopNodes = [...agentFlowExecutedData].reverse().filter((data) => data.data?.name === 'loopAgentflow')
                    if (loopNodes.length > 0) {
                        const latestLoopNode = loopNodes[0]
                        currentLoopCount = loopCounts.get(latestLoopNode.nodeId) || 0
                    }
                }
                resolvedValue = resolvedValue.replace(match, currentLoopCount.toString())
            }

            if (variableFullPath === CURRENT_DATE_TIME_VAR_PREFIX) {
                resolvedValue = resolvedValue.replace(match, new Date().toISOString())
            }

            if (variableFullPath.startsWith('$iteration')) {
                if (iterationContext && iterationContext.value) {
                    if (variableFullPath === '$iteration') {
                        // If it's exactly $iteration, stringify the entire value
                        const formattedValue =
                            typeof iterationContext.value === 'object' ? JSON.stringify(iterationContext.value) : iterationContext.value
                        resolvedValue = resolvedValue.replace(match, formattedValue)
                    } else if (typeof iterationContext.value === 'string') {
                        resolvedValue = resolvedValue.replace(match, iterationContext?.value)
                    } else if (typeof iterationContext.value === 'object') {
                        const iterationValue = get(iterationContext.value, variableFullPath.replace('$iteration.', ''))
                        // For arrays and objects, stringify them to prevent toString() conversion issues
                        const formattedValue =
                            Array.isArray(iterationValue) || (typeof iterationValue === 'object' && iterationValue !== null)
                                ? JSON.stringify(iterationValue)
                                : iterationValue
                        resolvedValue = resolvedValue.replace(match, formattedValue)
                    }
                }
            }

            if (variableFullPath.startsWith('$vars.')) {
                const vars = await getGlobalVariable(flowConfig, availableVariables, variableOverrides)
                const variableValue = get(vars, variableFullPath.replace('$vars.', ''))
                if (variableValue != null) {
                    // For arrays and objects, stringify them to prevent toString() conversion issues
                    const formattedValue =
                        Array.isArray(variableValue) || (typeof variableValue === 'object' && variableValue !== null)
                            ? JSON.stringify(variableValue)
                            : variableValue
                    resolvedValue = resolvedValue.replace(match, formattedValue)
                }
            }

            if (variableFullPath.startsWith('$flow.') && flowConfig) {
                const variableValue = get(flowConfig, variableFullPath.replace('$flow.', ''))
                if (variableValue != null) {
                    // For arrays and objects, stringify them to prevent toString() conversion issues
                    const formattedValue =
                        Array.isArray(variableValue) || (typeof variableValue === 'object' && variableValue !== null)
                            ? JSON.stringify(variableValue)
                            : variableValue
                    resolvedValue = resolvedValue.replace(match, formattedValue)
                }
            }

            // Check if the variable is an output reference like `nodeId.output.path`
            const outputMatch = variableFullPath.match(/^(.*?)\.output\.(.+)$/)
            if (outputMatch && agentFlowExecutedData) {
                // Extract nodeId and outputPath from the match
                const [, nodeIdPart, outputPath] = outputMatch
                // Clean nodeId (handle escaped underscores)
                const cleanNodeId = nodeIdPart.replace('\\', '')

                // Find the last (most recent) matching node data instead of the first one
                const nodeData = [...agentFlowExecutedData].reverse().find((d) => d.nodeId === cleanNodeId)

                if (nodeData?.data?.output && outputPath.trim()) {
                    const variableValue = get(nodeData.data.output, outputPath)
                    if (variableValue !== undefined) {
                        // Replace the reference with actual value
                        const formattedValue =
                            Array.isArray(variableValue) || (typeof variableValue === 'object' && variableValue !== null)
                                ? JSON.stringify(variableValue)
                                : variableValue
                        // If the resolved value is exactly the match, replace it directly
                        if (resolvedValue === match) {
                            resolvedValue = formattedValue
                        } else {
                            // Otherwise do a standard string‐replace
                            resolvedValue = String(resolvedValue).replace(match, String(formattedValue))
                        }
                        // Skip fallback logic
                        continue
                    }
                }
            }

            // Find node data in executed data
            // sometimes turndown value returns a backslash like `llmAgentflow\_1`, remove the backslash
            const cleanNodeId = variableFullPath.replace('\\', '')
            // Find the last (most recent) matching node data instead of the first one
            const nodeData = agentFlowExecutedData
                ? [...agentFlowExecutedData].reverse().find((data) => data.nodeId === cleanNodeId)
                : undefined
            if (nodeData && nodeData.data) {
                // Replace the reference with actual value
                const nodeOutput = nodeData.data['output'] as ICommonObject
                const actualValue = nodeOutput?.content ?? nodeOutput?.http?.data
                // For arrays and objects, stringify them to prevent toString() conversion issues
                const formattedValue =
                    Array.isArray(actualValue) || (typeof actualValue === 'object' && actualValue !== null)
                        ? JSON.stringify(actualValue)
                        : actualValue?.toString() ?? match
                resolvedValue = resolvedValue.replace(match, formattedValue)
            }
        }

        return resolvedValue
    }

    const getParamValues = async (paramsObj: ICommonObject) => {
        /*
         * EXAMPLE SCENARIO:
         *
         * 1. Agent node has inputParam: { name: "agentTools", type: "array", array: [{ name: "agentSelectedTool", loadConfig: true }] }
         * 2. Inputs contain: { agentTools: [{ agentSelectedTool: "requestsGet", agentSelectedToolConfig: { requestsGetHeaders: "Bearer {{ $vars.TOKEN }}" } }] }
         * 3. We need to resolve the variable in requestsGetHeaders because RequestsGet node defines requestsGetHeaders with acceptVariable: true
         *
         * STEP 1: Find all parameters with loadConfig=true (e.g., "agentSelectedTool")
         * STEP 2: Find their values in inputs (e.g., "requestsGet")
         * STEP 3: Look up component node definition for "requestsGet"
         * STEP 4: Find which of its parameters have acceptVariable=true (e.g., "requestsGetHeaders")
         * STEP 5: Find the config object (e.g., "agentSelectedToolConfig")
         * STEP 6: Resolve variables in config parameters that accept variables
         */

        // Helper function to find params with loadConfig recursively
        // Example: Finds ["agentModel", "agentSelectedTool"] from the inputParams structure
        const findParamsWithLoadConfig = (inputParams: any[]): string[] => {
            const paramsWithLoadConfig: string[] = []

            for (const param of inputParams) {
                // Direct loadConfig param (e.g., agentModel with loadConfig: true)
                if (param.loadConfig === true) {
                    paramsWithLoadConfig.push(param.name)
                }

                // Check nested array parameters (e.g., agentTools.array contains agentSelectedTool with loadConfig: true)
                if (param.type === 'array' && param.array && Array.isArray(param.array)) {
                    const nestedParams = findParamsWithLoadConfig(param.array)
                    paramsWithLoadConfig.push(...nestedParams)
                }
            }

            return paramsWithLoadConfig
        }

        // Helper function to find value of a parameter recursively in nested objects/arrays
        // Example: Searches for "agentSelectedTool" value in complex nested inputs structure
        // Returns "requestsGet" when found in agentTools[0].agentSelectedTool
        const findParamValue = (obj: any, paramName: string): any => {
            if (typeof obj !== 'object' || obj === null) {
                return undefined
            }

            // Handle arrays (e.g., agentTools array)
            if (Array.isArray(obj)) {
                for (const item of obj) {
                    const result = findParamValue(item, paramName)
                    if (result !== undefined) {
                        return result
                    }
                }
                return undefined
            }

            // Direct property match
            if (Object.prototype.hasOwnProperty.call(obj, paramName)) {
                return obj[paramName]
            }

            // Recursively search nested objects
            for (const value of Object.values(obj)) {
                const result = findParamValue(value, paramName)
                if (result !== undefined) {
                    return result
                }
            }

            return undefined
        }

        // Helper function to process config parameters with acceptVariable
        // Example: Processes agentSelectedToolConfig object, resolving variables in requestsGetHeaders
        const processConfigParams = async (configObj: any, configParamWithAcceptVariables: string[]) => {
            if (typeof configObj !== 'object' || configObj === null) {
                return
            }

            // Handle arrays of config objects
            if (Array.isArray(configObj)) {
                for (const item of configObj) {
                    await processConfigParams(item, configParamWithAcceptVariables)
                }
                return
            }

            for (const [key, value] of Object.entries(configObj)) {
                // Only resolve variables for parameters that accept them
                // Example: requestsGetHeaders is in configParamWithAcceptVariables, so resolve "Bearer {{ $vars.TOKEN }}"
                if (configParamWithAcceptVariables.includes(key)) {
                    configObj[key] = await resolveNodeReference(value)
                }
            }
        }

        // STEP 1: Get all params with loadConfig from inputParams
        // Example result: ["agentModel", "agentSelectedTool"]
        const paramsWithLoadConfig = findParamsWithLoadConfig(reactFlowNodeData.inputParams)

        // STEP 2-6: Process each param with loadConfig
        for (const paramWithLoadConfig of paramsWithLoadConfig) {
            // STEP 2: Find the value of this parameter in the inputs
            // Example: paramWithLoadConfig="agentSelectedTool", paramValue="requestsGet"
            const paramValue = findParamValue(paramsObj, paramWithLoadConfig)

            if (paramValue && componentNodes[paramValue]) {
                // STEP 3: Get the node instance inputs to find params with acceptVariable
                // Example: componentNodes["requestsGet"] contains the RequestsGet node definition
                const nodeInstance = componentNodes[paramValue]
                const configParamWithAcceptVariables: string[] = []

                // STEP 4: Find which parameters of the component accept variables
                // Example: RequestsGet has inputs like { name: "requestsGetHeaders", acceptVariable: true }
                if (nodeInstance.inputs && Array.isArray(nodeInstance.inputs)) {
                    for (const input of nodeInstance.inputs) {
                        if (input.acceptVariable === true) {
                            configParamWithAcceptVariables.push(input.name)
                        }
                    }
                }
                // Example result: configParamWithAcceptVariables = ["requestsGetHeaders", "requestsGetUrl", ...]

                // STEP 5: Look for the config object (paramName + "Config")
                // Example: Look for "agentSelectedToolConfig" in the inputs
                const configParamName = paramWithLoadConfig + 'Config'

                // Find all config values (handle arrays)
                const findAllConfigValues = (obj: any, paramName: string): any[] => {
                    const results: any[] = []

                    if (typeof obj !== 'object' || obj === null) {
                        return results
                    }

                    // Handle arrays (e.g., agentTools array)
                    if (Array.isArray(obj)) {
                        for (const item of obj) {
                            results.push(...findAllConfigValues(item, paramName))
                        }
                        return results
                    }

                    // Direct property match
                    if (Object.prototype.hasOwnProperty.call(obj, paramName)) {
                        results.push(obj[paramName])
                    }

                    // Recursively search nested objects
                    for (const value of Object.values(obj)) {
                        results.push(...findAllConfigValues(value, paramName))
                    }

                    return results
                }

                const configValues = findAllConfigValues(paramsObj, configParamName)

                // STEP 6: Process all config objects to resolve variables
                // Example: Resolve "Bearer {{ $vars.TOKEN }}" in requestsGetHeaders
                if (configValues.length > 0 && configParamWithAcceptVariables.length > 0) {
                    for (const configValue of configValues) {
                        await processConfigParams(configValue, configParamWithAcceptVariables)
                    }
                }
            }
        }

        // Original logic for direct acceptVariable params (maintains backward compatibility)
        // Example: Direct params like agentUserMessage with acceptVariable: true
        for (const key in paramsObj) {
            const paramValue = paramsObj[key]
            const isAcceptVariable = reactFlowNodeData.inputParams.find((param) => param.name === key)?.acceptVariable ?? false
            if (isAcceptVariable) {
                paramsObj[key] = await resolveNodeReference(paramValue)
            }
        }
    }

    const paramsObj = flowNodeData[types] ?? {}
    await getParamValues(paramsObj)

    span?.end()
    return flowNodeData
}

/*
 * Gets all input connections for a specific node
 * @param {IEdge[]} edges - Array of all edges (connections) in the workflow
 * @param {string} nodeId - ID of the node to get input connections for
 * @returns {IEdge[]} Array of input connections for the specified node
 *
 * @example
 * // For llmAgentflow_2 which has two inputs from llmAgentflow_0 and llmAgentflow_1
 * const connections = getNodeInputConnections(nodes, edges, 'llmAgentflow_2');
 * // Returns array of two edge objects connecting to llmAgentflow_2
 */
export function getNodeInputConnections(edges: IReactFlowEdge[], nodeId: string): IReactFlowEdge[] {
    // Filter edges where target matches the nodeId
    const inputConnections = edges.filter((edge) => edge.target === nodeId)

    // Sort connections by sourceHandle to maintain consistent order
    // This is important for nodes that have multiple inputs that need to be processed in order
    inputConnections.sort((a, b) => {
        // Extract index from sourceHandle (e.g., "output-0" vs "output-1")
        const indexA = parseInt(a.sourceHandle.split('-').find((part) => !isNaN(parseInt(part))) || '0')
        const indexB = parseInt(b.sourceHandle.split('-').find((part) => !isNaN(parseInt(part))) || '0')
        return indexA - indexB
    })

    return inputConnections
}

/**
 * Analyzes node dependencies and sets up expected inputs
 */
export function setupNodeDependencies(nodeId: string, edges: IReactFlowEdge[], nodes: IReactFlowNode[]): IWaitingNode {
    logger.debug(`[Agentflow Engine] Analyzing dependencies for node: ${nodeId}`)
    const inputConnections = getNodeInputConnections(edges, nodeId)
    const waitingNode: IWaitingNode = {
        nodeId,
        receivedInputs: new Map(),
        expectedInputs: new Set(),
        isConditional: false,
        conditionalGroups: new Map()
    }

    // Group inputs by their parent condition nodes
    const inputsByCondition = new Map<string | null, string[]>()

    for (const connection of inputConnections) {
        const sourceNode = nodes.find((n) => n.id === connection.source)
        if (!sourceNode) continue

        // Find if this input comes from a conditional branch
        const conditionParent = findConditionParent(connection.source, edges, nodes)

        if (conditionParent) {
            logger.debug(`[Agentflow Engine] Found conditional input from ${connection.source} (condition: ${conditionParent})`)
            waitingNode.isConditional = true
            const group = inputsByCondition.get(conditionParent) || []
            group.push(connection.source)
            inputsByCondition.set(conditionParent, group)
        } else {
            logger.debug(`[Agentflow Engine] Found required input from ${connection.source}`)
            waitingNode.expectedInputs.add(connection.source)
        }
    }

    // Set up conditional groups
    inputsByCondition.forEach((sources, conditionId) => {
        if (conditionId) {
            logger.debug(`[Agentflow Engine] Conditional group ${conditionId}: [${sources.join(', ')}]`)
            waitingNode.conditionalGroups.set(conditionId, sources)
        }
    })

    return waitingNode
}

/**
 * Finds the parent condition node for a given node, if any
 */
export function findConditionParent(nodeId: string, edges: IReactFlowEdge[], nodes: IReactFlowNode[]): string | null {
    const currentNode = nodes.find((n) => n.id === nodeId)
    if (!currentNode) return null
    if (
        currentNode.data.name === 'conditionAgentflow' ||
        currentNode.data.name === 'conditionAgentAgentflow' ||
        currentNode.data.name === 'humanInputAgentflow'
    ) {
        return currentNode.id
    }

    let currentId = nodeId
    const visited = new Set<string>()

    let shouldContinue = true
    while (shouldContinue) {
        if (visited.has(currentId)) {
            shouldContinue = false
            continue
        }
        visited.add(currentId)

        const parentEdge = edges.find((edge) => edge.target === currentId)
        if (!parentEdge) {
            shouldContinue = false
            continue
        }

        const parentNode = nodes.find((n) => n.id === parentEdge.source)
        if (!parentNode) {
            shouldContinue = false
            continue
        }

        if (
            parentNode.data.name === 'conditionAgentflow' ||
            parentNode.data.name === 'conditionAgentAgentflow' ||
            parentNode.data.name === 'humanInputAgentflow'
        ) {
            return parentNode.id
        }

        currentId = parentNode.id
    }

    return null
}

/**
 * Checks if a node has received all required inputs
 */
export function hasReceivedRequiredInputs(waitingNode: IWaitingNode): boolean {
    logger.debug(`[Agentflow Engine] Checking inputs for node: ${waitingNode.nodeId}`)

    // Check non-conditional required inputs
    for (const required of waitingNode.expectedInputs) {
        const hasInput = waitingNode.receivedInputs.has(required)
        logger.debug(`[Agentflow Engine] Required input ${required}: ${hasInput ? 'received' : 'missing'}`)
        if (!hasInput) return false
    }

    // Check conditional groups
    for (const [groupId, possibleSources] of waitingNode.conditionalGroups) {
        // Need at least one input from each conditional group
        const hasInputFromGroup = possibleSources.some((source) => waitingNode.receivedInputs.has(source))
        logger.debug(`[Agentflow Engine] Conditional group ${groupId}: ${hasInputFromGroup ? 'satisfied' : 'pending'}`)
        if (!hasInputFromGroup) return false
    }

    return true
}

/**
 * Determines which nodes should be ignored based on condition results
 * @param currentNode - The node being processed
 * @param result - The execution result from the node
 * @param edges - All edges in the workflow
 * @param nodeId - Current node ID
 * @returns Array of node IDs that should be ignored
 */
export async function determineNodesToIgnore(
    currentNode: IReactFlowNode,
    result: any,
    edges: IReactFlowEdge[],
    nodeId: string
): Promise<string[]> {
    const ignoreNodeIds: string[] = []

    // Check if this is a decision node
    const isDecisionNode =
        currentNode.data.name === 'conditionAgentflow' ||
        currentNode.data.name === 'conditionAgentAgentflow' ||
        currentNode.data.name === 'humanInputAgentflow'

    if (isDecisionNode && result.output?.conditions) {
        const outputConditions: ICondition[] = result.output.conditions

        // Find indexes of unfulfilled conditions
        const unfulfilledIndexes = outputConditions
            .map((condition: any, index: number) =>
                condition.isFulfilled === false || !Object.prototype.hasOwnProperty.call(condition, 'isFulfilled') ? index : -1
            )
            .filter((index: number) => index !== -1)

        // Find nodes to ignore based on unfulfilled conditions
        for (const index of unfulfilledIndexes) {
            const ignoreEdge = edges.find((edge) => edge.source === nodeId && edge.sourceHandle === `${nodeId}-output-${index}`)

            if (ignoreEdge) {
                ignoreNodeIds.push(ignoreEdge.target)
            }
        }
    }

    return ignoreNodeIds
}

/**
 * Process node outputs and handle branching logic
 */
async function processNodeOutputs({
    nodeId,
    nodeName,
    result,
    humanInput,
    graph,
    nodes,
    edges,
    nodeExecutionQueue,
    waitingNodes,
    loopCounts,
    sseStreamer,
    chatId
}: IProcessNodeOutputsParams): Promise<{ humanInput?: IHumanInput }> {
    logger.debug(`[Agentflow Engine] Processing outputs from node: ${nodeId}`)

    const activeSpan = isTracingEnabled() ? trace.getSpan(context.active()) : undefined

    let updatedHumanInput = humanInput

    const childNodeIds = graph[nodeId] || []
    logger.debug(`[Agentflow Engine] Child nodes: [${childNodeIds.join(', ')}]`)

    const currentNode = nodes.find((n) => n.id === nodeId)
    if (!currentNode) return { humanInput: updatedHumanInput }

    // Get nodes to ignore based on conditions
    const ignoreNodeIds = await determineNodesToIgnore(currentNode, result, edges, nodeId)
    if (ignoreNodeIds.length) {
        activeSpan?.addEvent('workflow.branch.skip', { 'workflow.skipped_nodes': ignoreNodeIds.join(', ') })
        logger.debug(`[Agentflow Engine] Skipping nodes: [${ignoreNodeIds.join(', ')}]`)
    }

    for (const childId of childNodeIds) {
        if (ignoreNodeIds.includes(childId)) continue

        const childNode = nodes.find((n) => n.id === childId)
        if (!childNode) continue

        logger.debug(`[Agentflow Engine] Processing child node: ${childId}`)

        let waitingNode = waitingNodes.get(childId)

        if (!waitingNode) {
            logger.debug(`[Agentflow Engine] First time seeing node ${childId} - analyzing dependencies`)
            waitingNode = setupNodeDependencies(childId, edges, nodes)
            waitingNodes.set(childId, waitingNode)
        }

        waitingNode.receivedInputs.set(nodeId, result)
        logger.debug(`[Agentflow Engine] Added input from ${nodeId}`)

        // Check if node is ready to execute
        if (hasReceivedRequiredInputs(waitingNode)) {
            logger.debug(`[Agentflow Engine] Node ${childId} ready for execution`)
            waitingNodes.delete(childId)
            nodeExecutionQueue.push({
                nodeId: childId,
                data: combineNodeInputs(waitingNode.receivedInputs),
                inputs: Object.fromEntries(waitingNode.receivedInputs)
            })
        } else {
            logger.debug(`[Agentflow Engine] Node ${childId} still waiting for inputs`)
            logger.debug(`[Agentflow Engine]   Has: [${Array.from(waitingNode.receivedInputs.keys()).join(', ')}]`)
            logger.debug(`[Agentflow Engine]   Needs: [${Array.from(waitingNode.expectedInputs).join(', ')}]`)
            if (waitingNode.conditionalGroups.size > 0) {
                logger.debug('[Agentflow Engine]   Conditional groups:')
                waitingNode.conditionalGroups.forEach((sources, groupId) => {
                    logger.debug(`[Agentflow Engine]     ${groupId}: [${sources.join(', ')}]`)
                })
            }
        }
    }

    if (nodeName === 'loopAgentflow' && result.output?.nodeID) {
        logger.debug(`[Agentflow Engine] Looping back to node: ${result.output.nodeID}`)

        const loopCount = (loopCounts.get(nodeId) || 0) + 1
        const maxLoop = result.output.maxLoopCount || MAX_LOOP_COUNT

        if (loopCount < maxLoop) {
            logger.debug(`[Agentflow Engine] Loop count: ${loopCount}/${maxLoop}`)
            loopCounts.set(nodeId, loopCount)
            nodeExecutionQueue.push({
                nodeId: result.output.nodeID,
                data: result.output,
                inputs: {}
            })

            // Clear humanInput when looping to prevent it from being reused
            if (updatedHumanInput) {
                logger.debug(`[Agentflow Engine] Clearing humanInput for loop iteration`)
                updatedHumanInput = undefined
            }
        } else {
            logger.debug(`[Agentflow Engine] Maximum loop count (${maxLoop}) reached, stopping loop`)
            const fallbackMessage = result.output.fallbackMessage || `Loop completed after reaching maximum iteration count of ${maxLoop}.`
            if (sseStreamer) {
                sseStreamer.streamTokenEvent(chatId, fallbackMessage)
            }
            result.output = { ...result.output, content: fallbackMessage }
        }
    }

    return { humanInput: updatedHumanInput }
}

/**
 * Combines inputs from multiple source nodes into a single input object
 * @param {Map<string, any>} receivedInputs - Map of inputs received from different nodes
 * @returns {any} Combined input data
 *
 * @example
 * const inputs = new Map();
 * inputs.set('node1', { json: { value: 1 }, text: 'Hello' });
 * inputs.set('node2', { json: { value: 2 }, text: 'World' });
 *
 * const combined = combineNodeInputs(inputs);
 *  Result:
 *  {
 *    json: {
 *      node1: { value: 1 },
 *      node2: { value: 2 }
 *    },
 *    text: 'Hello\nWorld'
 *  }
 */
export function combineNodeInputs(receivedInputs: Map<string, any>): any {
    // Filter out null/undefined inputs
    const validInputs = new Map(Array.from(receivedInputs.entries()).filter(([_, value]) => value !== null && value !== undefined))

    if (validInputs.size === 0) {
        return null
    }

    if (validInputs.size === 1) {
        return Array.from(validInputs.values())[0]
    }

    // Initialize result object to store combined data
    const result: {
        json: any
        text?: string
        binary?: any
        error?: Error
    } = {
        json: {}
    }

    // Sort inputs by source node ID to ensure consistent ordering
    const sortedInputs = Array.from(validInputs.entries()).sort((a, b) => a[0].localeCompare(b[0]))

    for (const [sourceNodeId, inputData] of sortedInputs) {
        if (!inputData) continue

        try {
            // Handle different types of input data
            if (typeof inputData === 'object') {
                // Merge JSON data
                if (inputData.json) {
                    result.json = {
                        ...result.json,
                        [sourceNodeId]: inputData.json
                    }
                }

                // Combine text data if present
                if (inputData.text) {
                    result.text = result.text ? `${result.text}\n${inputData.text}` : inputData.text
                }

                // Merge binary data if present
                if (inputData.binary) {
                    result.binary = {
                        ...result.binary,
                        [sourceNodeId]: inputData.binary
                    }
                }

                // Handle error data
                if (inputData.error) {
                    result.error = inputData.error
                }
            } else {
                // Handle primitive data types
                result.json[sourceNodeId] = inputData
            }
        } catch (error) {
            // Log error but continue processing other inputs
            logger.error(`[Agentflow Engine] Error combining input from node ${sourceNodeId}: ${getErrorMessage(error)}`)
            result.error = error as Error
        }
    }

    // Special handling for text-only nodes
    if (Object.keys(result.json).length === 0 && result.text) {
        result.json = { text: result.text }
    }

    return result
}

/**
 * Executes a single node in the workflow
 * @param params - Parameters needed for node execution
 * @returns The result of the node execution
 */
const executeNode = async ({
    nodeId,
    reactFlowNode,
    nodes,
    edges,
    graph,
    reversedGraph,
    incomingInput,
    agentflow,
    chatId,
    sessionId,
    apiMessageId,
    evaluationRunId,
    parentExecutionId,
    pastChatHistory,
    prependedChatHistory,
    appDataSource,
    usageCacheManager,
    telemetry,
    componentNodes,
    cachePool,
    sseStreamer,
    baseURL,
    overrideConfig = {},
    apiOverrideStatus = false,
    nodeOverrides = {},
    variableOverrides = [],
    uploadedFilesContent = '',
    fileUploads,
    humanInput,
    agentFlowExecutedData = [],
    agentflowRuntime,
    abortController,
    parentTraceIds,
    analyticHandlers,
    isInternal,
    isRecursive,
    iterationContext,
    loopCounts,
    orgId,
    workspaceId,
    subscriptionId,
    productId: _productId
}: IExecuteNodeParams): Promise<{
    result: any
    shouldStop?: boolean
    agentFlowExecutedData?: IAgentflowExecutedData[]
    humanInput?: IHumanInput
}> => {
    const stepSpan: Span | undefined = isTracingEnabled()
        ? agentflowTracer.startSpan('workflow.step.execute', {
              attributes: {
                  'workflow.step.id': nodeId,
                  'workflow.step.name': reactFlowNode.data.label || '',
                  'workflow.step.type': reactFlowNode.data.name || '',
                  'workflow.id': agentflow.id,
                  'workflow.execution.id': parentExecutionId || ''
              }
          })
        : undefined

    try {
        if (abortController?.signal?.aborted) {
            throw new Error('Aborted')
        }

        // Stream progress event
        sseStreamer?.streamNextAgentFlowEvent(chatId, {
            nodeId,
            nodeLabel: reactFlowNode.data.label,
            status: 'INPROGRESS'
        })

        // Get node implementation
        const nodeInstanceFilePath = componentNodes[reactFlowNode.data.name].filePath as string
        const nodeModule = await import(nodeInstanceFilePath)
        const newNodeInstance = new nodeModule.nodeClass()

        // Prepare node data
        let flowNodeData = cloneDeep(reactFlowNode.data)

        // Apply config overrides if needed
        if (overrideConfig && apiOverrideStatus) {
            flowNodeData = replaceInputsWithConfig(flowNodeData, overrideConfig, nodeOverrides, variableOverrides)
        }

        // Get available variables and resolve them
        const availableVariables = await appDataSource.getRepository(Variable).findBy(getWorkspaceSearchOptions(workspaceId))

        // Prepare flow config
        let updatedState = cloneDeep(agentflowRuntime.state)
        const runtimeChatHistory = agentflowRuntime.chatHistory || []
        const chatHistory = [...pastChatHistory, ...runtimeChatHistory]
        const flowConfig: IFlowConfig = {
            agentflowid: agentflow.id,
            agentflowId: agentflow.id,
            chatId,
            sessionId,
            apiMessageId,
            chatHistory,
            runtimeChatHistoryLength: Math.max(0, runtimeChatHistory.length - 1),
            state: updatedState,
            ...overrideConfig
        }
        if (
            iterationContext &&
            iterationContext.agentflowRuntime &&
            iterationContext.agentflowRuntime.state &&
            Object.keys(iterationContext.agentflowRuntime.state).length > 0
        ) {
            updatedState = {
                ...updatedState,
                ...iterationContext.agentflowRuntime.state
            }
            flowConfig.state = updatedState
        }

        // Resolve variables in node data
        const reactFlowNodeData: INodeData = await resolveVariables(
            flowNodeData,
            incomingInput.question ?? '',
            incomingInput.form ?? agentflowRuntime.form ?? {},
            flowConfig,
            availableVariables,
            variableOverrides,
            uploadedFilesContent,
            chatHistory,
            componentNodes,
            agentFlowExecutedData,
            iterationContext,
            loopCounts
        )

        // Handle human input if present
        let humanInputAction: Record<string, any> | undefined
        let updatedHumanInput = humanInput

        if (agentFlowExecutedData.length) {
            const lastNodeOutput = agentFlowExecutedData[agentFlowExecutedData.length - 1]?.data?.output as ICommonObject | undefined
            humanInputAction = lastNodeOutput?.humanInputAction
        }

        // This is when human in the loop is resumed
        if (humanInput && nodeId === humanInput.startNodeId) {
            reactFlowNodeData.inputs = { ...reactFlowNodeData.inputs, humanInput }
            // Remove the stopped humanInput from execution data
            agentFlowExecutedData = agentFlowExecutedData.filter((execData) => execData.nodeId !== nodeId)

            // Clear humanInput after it's been consumed to prevent subsequent humanInputAgentflow nodes from proceeding
            logger.debug(`[Agentflow Engine] Clearing humanInput after consumption by node: ${nodeId}`)
            updatedHumanInput = undefined
        }

        // Check if this is the last node for streaming purpose
        const isLastNode =
            !isRecursive &&
            (!graph[nodeId] || graph[nodeId].length === 0 || (!humanInput && reactFlowNode.data.name === 'humanInputAgentflow'))

        if (incomingInput.question && incomingInput.form) {
            throw new Error('Question and form cannot be provided at the same time')
        }

        let finalInput: string | Record<string, any> | undefined
        if (incomingInput.question) {
            // Prepare final question with uploaded content if any
            finalInput = uploadedFilesContent ? `${uploadedFilesContent}\n\n${incomingInput.question}` : incomingInput.question
        } else if (incomingInput.form) {
            finalInput = Object.entries(incomingInput.form || {})
                .map(([key, value]) => `${key}: ${value}`)
                .join('\n')
        }

        // Prepare run parameters
        const runParams = {
            orgId,
            workspaceId,
            subscriptionId,
            chatId,
            sessionId,
            agentflowid: agentflow.id,
            agentflowId: agentflow.id,
            apiMessageId: flowConfig.apiMessageId,
            logger,
            appDataSource,
            databaseEntities,
            usageCacheManager,
            componentNodes,
            cachePool,
            analytic: agentflow.analytic,
            uploads: fileUploads,
            baseURL,
            isLastNode,
            sseStreamer,
            pastChatHistory,
            prependedChatHistory,
            agentflowRuntime,
            abortController,
            analyticHandlers,
            parentTraceIds,
            humanInputAction,
            iterationContext,
            evaluationRunId
        }

        // Execute node
        let results = await newNodeInstance.run(reactFlowNodeData, finalInput, runParams)

        // Track tool invocations for metrics
        if (reactFlowNode.data.name === 'toolAgentflow') {
            const appServer = getRunningExpressApp()
            appServer.metricsProvider?.incrementCounter(CHRONOS_METRIC_COUNTERS.TOOL_INVOCATION, {
                status: CHRONOS_COUNTER_STATUS.SUCCESS
            })
        } else if (reactFlowNode.data.name === 'agentAgentflow' && results?.usedTools && Array.isArray(results.usedTools)) {
            const appServer = getRunningExpressApp()
            for (const tool of results.usedTools) {
                appServer.metricsProvider?.incrementCounter(CHRONOS_METRIC_COUNTERS.TOOL_INVOCATION, {
                    status: tool.error ? CHRONOS_COUNTER_STATUS.FAILURE : CHRONOS_COUNTER_STATUS.SUCCESS
                })
            }
        }

        // Handle iteration node with recursive execution
        if (
            reactFlowNode.data.name === 'iterationAgentflow' &&
            results?.input?.iterationInput &&
            Array.isArray(results.input.iterationInput)
        ) {
            logger.debug(
                `[Agentflow Engine] Processing iteration node with ${results.input.iterationInput.length} items using recursive execution`
            )

            // Get child nodes for this iteration
            const childNodes = nodes.filter((node) => node.parentNode === nodeId)

            if (childNodes.length > 0) {
                logger.debug(`[Agentflow Engine] Found ${childNodes.length} child nodes for iteration`)

                // Create a new flow object containing only the nodes in this iteration block
                const iterationFlowData: IReactFlowObject = {
                    nodes: childNodes,
                    edges: edges.filter((edge: IReactFlowEdge) => {
                        const sourceNode = nodes.find((n) => n.id === edge.source)
                        const targetNode = nodes.find((n) => n.id === edge.target)
                        return sourceNode?.parentNode === nodeId && targetNode?.parentNode === nodeId
                    }),
                    viewport: { x: 0, y: 0, zoom: 1 }
                }

                // Create a modified agentflow for this iteration
                const iterationAgentflow = {
                    ...agentflow,
                    flowData: JSON.stringify(iterationFlowData)
                }

                // Initialize array to collect results from iterations
                const iterationResults: string[] = []

                // Execute sub-flow for each item in the iteration array
                for (let i = 0; i < results.input.iterationInput.length; i++) {
                    const item = results.input.iterationInput[i]
                    logger.debug(`[Agentflow Engine] Processing iteration ${i + 1}/${results.input.iterationInput.length} recursively`)

                    // Create iteration context
                    const iterationContext = {
                        index: i,
                        value: item,
                        isFirst: i === 0,
                        isLast: i === results.input.iterationInput.length - 1,
                        sessionId: sessionId
                    }

                    try {
                        // Execute sub-flow recursively
                        const subFlowResult = await executeAgentFlow({
                            componentNodes,
                            incomingInput,
                            agentflow: iterationAgentflow,
                            chatId,
                            evaluationRunId,
                            appDataSource,
                            usageCacheManager,
                            telemetry,
                            cachePool,
                            sseStreamer,
                            baseURL,
                            isInternal,
                            uploadedFilesContent,
                            fileUploads,
                            signal: abortController,
                            isRecursive: true,
                            parentExecutionId,
                            iterationContext: {
                                ...iterationContext,
                                agentflowRuntime
                            }
                        })

                        // Store the result
                        if (subFlowResult?.text) {
                            iterationResults.push(subFlowResult.text)
                        }

                        // Add executed data from sub-flow to main execution data with appropriate iteration context
                        if (subFlowResult?.agentFlowExecutedData) {
                            const subflowExecutedData = subFlowResult.agentFlowExecutedData.map((data: IAgentflowExecutedData) => ({
                                ...data,
                                data: {
                                    ...data.data,
                                    iterationIndex: i,
                                    iterationContext,
                                    parentNodeId: reactFlowNode.data.id
                                }
                            }))

                            // Add executed data to parent execution
                            agentFlowExecutedData.push(...subflowExecutedData)

                            // Update parent execution record with combined data if we have a parent execution ID
                            if (parentExecutionId) {
                                try {
                                    logger.debug(
                                        `[Agentflow Engine] Updating parent execution ${parentExecutionId} with iteration ${i + 1} data`
                                    )
                                    await updateExecution(appDataSource, parentExecutionId, {
                                        executionData: JSON.stringify(agentFlowExecutedData)
                                    })
                                } catch (error) {
                                    logger.error(`[Agentflow Engine] Error updating parent execution: ${getErrorMessage(error)}`)
                                }
                            }
                        }

                        // Merge the child iteration's runtime state back to parent
                        if (
                            subFlowResult?.agentflowRuntime &&
                            subFlowResult.agentflowRuntime.state &&
                            Object.keys(subFlowResult.agentflowRuntime.state).length > 0
                        ) {
                            logger.debug(`[Agentflow Engine] Merging iteration ${i + 1} runtime state back to parent`)

                            updatedState = {
                                ...updatedState,
                                ...subFlowResult.agentflowRuntime.state
                            }

                            // Update next iteration's runtime state
                            agentflowRuntime.state = updatedState

                            // Update parent execution's runtime state
                            results.state = updatedState
                        }
                    } catch (error) {
                        logger.error(`[Agentflow Engine] Error in iteration ${i + 1}: ${getErrorMessage(error)}`)
                        iterationResults.push(`Error in iteration ${i + 1}: ${getErrorMessage(error)}`)
                    }
                }

                // Update the output with combined results
                results.output = {
                    ...(results.output || {}),
                    iterationResults,
                    content: iterationResults.join('\n')
                }

                logger.debug(`[Agentflow Engine] Completed all iterations. Total results: ${iterationResults.length}`)
            }
        }

        // Stop going through the current route if the node is a human task
        if (!humanInput && reactFlowNode.data.name === 'humanInputAgentflow') {
            const humanInputAction = {
                id: uuidv4(),
                mapping: {
                    approve: 'Proceed',
                    reject: 'Reject'
                },
                elements: [
                    { type: 'agentflowv2-approve-button', label: 'Proceed' },
                    { type: 'agentflowv2-reject-button', label: 'Reject' }
                ],
                data: {
                    nodeId,
                    nodeLabel: reactFlowNode.data.label,
                    input: results.input
                }
            }

            const newWorkflowExecutedData: IAgentflowExecutedData = {
                nodeId,
                nodeLabel: reactFlowNode.data.label,
                data: {
                    ...results,
                    output: {
                        ...results.output,
                        humanInputAction
                    }
                },
                previousNodeIds: reversedGraph[nodeId] || [],
                status: 'STOPPED'
            }
            agentFlowExecutedData.push(newWorkflowExecutedData)

            sseStreamer?.streamNextAgentFlowEvent(chatId, {
                nodeId,
                nodeLabel: reactFlowNode.data.label,
                status: 'STOPPED'
            })
            sseStreamer?.streamAgentFlowExecutedDataEvent(chatId, agentFlowExecutedData)
            sseStreamer?.streamAgentFlowEvent(chatId, 'STOPPED')

            sseStreamer?.streamActionEvent(chatId, humanInputAction)

            return { result: results, shouldStop: true, agentFlowExecutedData, humanInput: updatedHumanInput }
        }

        // Stop going through the current route if the node is a agent node waiting for human input before using the tool
        if (reactFlowNode.data.name === 'agentAgentflow' && results?.output?.isWaitingForHumanInput) {
            const humanInputAction = {
                id: uuidv4(),
                mapping: {
                    approve: 'Proceed',
                    reject: 'Reject'
                },
                elements: [
                    { type: 'agentflowv2-approve-button', label: 'Proceed' },
                    { type: 'agentflowv2-reject-button', label: 'Reject' }
                ],
                data: {
                    nodeId,
                    nodeLabel: reactFlowNode.data.label,
                    input: results.input
                }
            }

            const newWorkflowExecutedData: IAgentflowExecutedData = {
                nodeId,
                nodeLabel: reactFlowNode.data.label,
                data: {
                    ...results,
                    output: {
                        ...results.output,
                        humanInputAction
                    }
                },
                previousNodeIds: reversedGraph[nodeId] || [],
                status: 'STOPPED'
            }
            agentFlowExecutedData.push(newWorkflowExecutedData)

            sseStreamer?.streamNextAgentFlowEvent(chatId, {
                nodeId,
                nodeLabel: reactFlowNode.data.label,
                status: 'STOPPED'
            })
            sseStreamer?.streamAgentFlowExecutedDataEvent(chatId, agentFlowExecutedData)
            sseStreamer?.streamAgentFlowEvent(chatId, 'STOPPED')

            sseStreamer?.streamActionEvent(chatId, humanInputAction)

            stepSpan?.setAttribute('workflow.step.status', 'stopped')
            stepSpan?.end()
            return { result: results, shouldStop: true, agentFlowExecutedData, humanInput: updatedHumanInput }
        }

        stepSpan?.setAttribute('workflow.step.status', 'success')
        stepSpan?.end()
        return { result: results, agentFlowExecutedData, humanInput: updatedHumanInput }
    } catch (error) {
        if (stepSpan) {
            stepSpan.recordException(error as Error)
            stepSpan.setStatus({ code: SpanStatusCode.ERROR, message: getErrorMessage(error) })
            stepSpan.setAttribute('workflow.step.status', 'failure')
            stepSpan.end()
        }
        logger.error(`[Agentflow Engine] Error executing node ${nodeId}: ${getErrorMessage(error)}`)
        throw error
    }
}

export const checkForMultipleStartNodes = (startingNodeIds: string[], isRecursive: boolean, nodes: IReactFlowNode[]) => {
    // For non-recursive, loop through and check if each starting node is inside an iteration node, if yes, delete it
    const clonedStartingNodeIds = [...startingNodeIds]
    for (const nodeId of clonedStartingNodeIds) {
        const node = nodes.find((node) => node.id === nodeId)
        if (node?.extent === 'parent' && !isRecursive) {
            startingNodeIds.splice(startingNodeIds.indexOf(nodeId), 1)
        }
    }

    if (!isRecursive && startingNodeIds.length > 1) {
        throw new Error('Multiple starting nodes are not allowed')
    }
}

export const parseFormStringToJson = (formString: string): Record<string, string> => {
    const result: Record<string, string> = {}
    const lines = formString.split('\n')

    for (const line of lines) {
        const [key, value] = line.split(': ').map((part) => part.trim())
        if (key && value) {
            result[key] = value
        }
    }

    return result
}

/*
 * Function to traverse the flow graph and execute the nodes
 */
export const executeAgentFlow = async ({
    componentNodes,
    incomingInput,
    agentflow,
    chatId,
    evaluationRunId,
    appDataSource,
    telemetry,
    usageCacheManager,
    cachePool,
    sseStreamer,
    baseURL,
    isInternal,
    uploadedFilesContent,
    fileUploads,
    signal: abortController,
    isRecursive = false,
    parentExecutionId,
    iterationContext,
    isTool = false
}: IExecuteAgentFlowParams) => {
    // Local constants for external API calls (not part of IExecuteAgentFlowParams)
    const orgId = ''
    const workspaceId = ''
    const subscriptionId = ''
    const productId = ''

    const rootSpan: Span | undefined = isTracingEnabled()
        ? agentflowTracer.startSpan('workflow.execute', {
              attributes: {
                  'workflow.id': agentflow.id,
                  'workflow.name': agentflow.name || '',
                  'workflow.type': 'agentflow',
                  'workflow.mode': process.env.MODE || 'main'
              }
          })
        : undefined

    logger.debug('[Agentflow Engine] Starting flow execution')

    const question = incomingInput.question
    const form = incomingInput.form
    let overrideConfig = incomingInput.overrideConfig ?? {}
    const uploads = incomingInput.uploads
    const userMessageDateTime = new Date()
    const agentflowid = agentflow.id
    const sessionId = iterationContext?.sessionId || overrideConfig.sessionId || chatId
    const humanInput: IHumanInput | undefined = incomingInput.humanInput

    // Validate history schema if provided
    if (incomingInput.history && incomingInput.history.length > 0) {
        if (!validateHistorySchema(incomingInput.history)) {
            throw new Error(
                'Invalid history format. Each history item must have: ' + '{ role: "apiMessage" | "userMessage", content: string }'
            )
        }
    }

    const prependedChatHistory = incomingInput.history ?? []
    const apiMessageId = uuidv4()

    /*** Get agentflows and prepare data  ***/
    const flowData = agentflow.flowData
    const parsedFlowData: IReactFlowObject = JSON.parse(flowData)
    const nodes = (parsedFlowData.nodes || []).filter((node) => node.data.name !== 'stickyNoteAgentflow')
    const edges = parsedFlowData.edges
    const { graph, nodeDependencies } = constructGraphs(nodes, edges)
    const { graph: reversedGraph } = constructGraphs(nodes, edges, { isReversed: true })
    const startInputType = nodes.find((node) => node.data.name === 'startAgentflow')?.data.inputs?.startInputType as
        | 'chatInput'
        | 'formInput'
    if (!startInputType && !isRecursive) {
        throw new Error('Start input type not found')
    }
    // @ts-ignore
    if (isTool) sseStreamer = undefined // If the request is from AgentflowTool, don't stream the response

    /*** Get API Config ***/
    const { nodeOverrides, variableOverrides, apiOverrideStatus } = getAPIOverrideConfig(agentflow)

    /*
    graph {
        startAgentflow_0: [ 'conditionAgentflow_0' ],
        conditionAgentflow_0: [ 'llmAgentflow_0', 'llmAgentflow_1' ],
        llmAgentflow_0: [ 'llmAgentflow_2' ],
        llmAgentflow_1: [ 'llmAgentflow_2' ],
        llmAgentflow_2: []
      }
    */

    /*
      nodeDependencies {
        startAgentflow_0: 0,
        conditionAgentflow_0: 1,
        llmAgentflow_0: 1,
        llmAgentflow_1: 1,
        llmAgentflow_2: 2
      }
    */

    let status: ExecutionState = 'INPROGRESS'
    let agentFlowExecutedData: IAgentflowExecutedData[] = []
    let newExecution: Execution
    const startingNodeIds: string[] = []

    // Initialize execution queue
    const nodeExecutionQueue: INodeQueue[] = []
    const waitingNodes: Map<string, IWaitingNode> = new Map()
    const loopCounts: Map<string, number> = new Map()

    // Initialize runtime state for new execution
    let agentflowRuntime: IAgentFlowRuntime = {
        state: {},
        chatHistory: [],
        form: {}
    }

    let previousExecution: Execution | undefined

    // If not a recursive call or parent execution not found, proceed normally
    if (!isRecursive) {
        const previousExecutions = await appDataSource.getRepository(Execution).find({
            where: {
                sessionId,
                agentflowId: agentflowid
            },
            order: {
                createdDate: 'DESC'
            }
        })

        if (previousExecutions.length) {
            previousExecution = previousExecutions[0]
        }
    }

    // If the state is persistent, get the state from the previous execution
    const startPersistState = nodes.find((node) => node.data.name === 'startAgentflow')?.data.inputs?.startPersistState
    if (startPersistState === true && previousExecution) {
        const previousExecutionData = (JSON.parse(previousExecution.executionData) as IAgentflowExecutedData[]) ?? []

        let previousState = {}
        if (Array.isArray(previousExecutionData) && previousExecutionData.length) {
            for (const execData of previousExecutionData.reverse()) {
                if (execData.data.state) {
                    previousState = execData.data.state
                    break
                }
            }
        }

        // Check if startState has been overridden from overrideConfig.startState and is enabled
        const startAgentflowNode = nodes.find((node) => node.data.name === 'startAgentflow')
        const isStartStateEnabled =
            nodeOverrides && startAgentflowNode
                ? nodeOverrides[startAgentflowNode.data.label]?.find((param: any) => param.name === 'startState')?.enabled ?? false
                : false

        if (isStartStateEnabled && overrideConfig?.startState) {
            if (Array.isArray(overrideConfig.startState)) {
                // Handle array format: [{"key": "foo", "value": "foo4"}]
                const overrideStateObj: ICommonObject = {}
                for (const item of overrideConfig.startState) {
                    if (item.key && item.value !== undefined) {
                        overrideStateObj[item.key] = item.value
                    }
                }
                previousState = { ...previousState, ...overrideStateObj }
            } else if (typeof overrideConfig.startState === 'object') {
                // Object override: "startState": {...}
                previousState = { ...previousState, ...overrideConfig.startState }
            }
        }

        agentflowRuntime.state = previousState
    }

    // If the start input type is form input, get the form values from the previous execution (form values are persisted in the same session)
    if (startInputType === 'formInput' && previousExecution) {
        const previousExecutionData = (JSON.parse(previousExecution.executionData) as IAgentflowExecutedData[]) ?? []

        const previousStartAgent = previousExecutionData.find((execData) => execData.data.name === 'startAgentflow')

        if (previousStartAgent) {
            const previousStartAgentOutput = previousStartAgent.data.output
            if (previousStartAgentOutput && typeof previousStartAgentOutput === 'object' && 'form' in previousStartAgentOutput) {
                const formValues = previousStartAgentOutput.form
                if (typeof formValues === 'string') {
                    agentflowRuntime.form = parseFormStringToJson(formValues)
                } else {
                    agentflowRuntime.form = formValues
                }
            }
        }
    }

    // If it is human input, find the last checkpoint and resume
    // Skip human input resumption for recursive iteration calls - they should start fresh
    if (humanInput && !(isRecursive && iterationContext)) {
        if (!previousExecution) {
            throw new Error(`No previous execution found for session ${sessionId}`)
        }

        let executionData = JSON.parse(previousExecution.executionData) as IAgentflowExecutedData[]
        let shouldUpdateExecution = false

        // Handle different execution states
        if (previousExecution.state === 'STOPPED') {
            // Normal case - execution is stopped and ready to resume
            logger.debug(`[Agentflow Engine] Previous execution is in STOPPED state, ready to resume`)
        } else if (previousExecution.state === 'ERROR') {
            // Check if second-to-last execution item is STOPPED and last is ERROR
            if (executionData.length >= 2) {
                const lastItem = executionData[executionData.length - 1]
                const secondLastItem = executionData[executionData.length - 2]

                if (lastItem.status === 'ERROR' && secondLastItem.status === 'STOPPED') {
                    logger.debug(`[Agentflow Engine] Found ERROR after STOPPED - removing last error item to allow retry`)
                    logger.debug(
                        `[Agentflow Engine] Removing: ${lastItem.nodeId} (${lastItem.nodeLabel}) - ${
                            lastItem.data?.error || 'Unknown error'
                        }`
                    )

                    // Remove the last ERROR item
                    executionData = executionData.slice(0, -1)
                    shouldUpdateExecution = true
                } else {
                    throw new Error(
                        `Cannot resume execution ${previousExecution.id} because it is in 'ERROR' state ` +
                            `and the previous item is not in 'STOPPED' state. Only executions that ended with a ` +
                            `STOPPED state (or ERROR after STOPPED) can be resumed.`
                    )
                }
            } else {
                throw new Error(
                    `Cannot resume execution ${previousExecution.id} because it is in 'ERROR' state ` +
                        `with insufficient execution data. Only executions in 'STOPPED' state can be resumed.`
                )
            }
        } else {
            throw new Error(
                `Cannot resume execution ${previousExecution.id} because it is in '${previousExecution.state}' state. ` +
                    `Only executions in 'STOPPED' state (or 'ERROR' after 'STOPPED') can be resumed.`
            )
        }

        let startNodeId = humanInput.startNodeId

        // If startNodeId is not provided, find the last node with STOPPED status from execution data
        if (!startNodeId) {
            // Search in reverse order to find the last (most recent) STOPPED node
            const stoppedNode = [...executionData].reverse().find((data) => data.status === 'STOPPED')

            if (!stoppedNode) {
                throw new Error('No stopped node found in previous execution data to resume from')
            }

            startNodeId = stoppedNode.nodeId
            logger.debug(`[Agentflow Engine] Auto-detected stopped node to resume from: ${startNodeId} (${stoppedNode.nodeLabel})`)
        }

        // Verify that the node exists in previous execution
        const nodeExists = executionData.some((data) => data.nodeId === startNodeId)

        if (!nodeExists) {
            throw new Error(
                `Node ${startNodeId} not found in previous execution. ` +
                    `This could indicate an invalid resume attempt or a modified flow.`
            )
        }

        startingNodeIds.push(startNodeId)
        checkForMultipleStartNodes(startingNodeIds, isRecursive, nodes)

        agentFlowExecutedData.push(...executionData)

        // Update execution data if we removed an error item
        if (shouldUpdateExecution) {
            logger.debug(`[Agentflow Engine] Updating execution data after removing error item`)
            await updateExecution(appDataSource, previousExecution.id, {
                executionData: JSON.stringify(executionData),
                state: 'INPROGRESS'
            })
        }

        // Get last state
        const lastState = executionData[executionData.length - 1].data.state

        // Update agentflow runtime state
        agentflowRuntime.state = (lastState as ICommonObject) ?? {}

        // Update execution state to INPROGRESS
        await updateExecution(appDataSource, previousExecution.id, {
            state: 'INPROGRESS'
        })
        newExecution = previousExecution
        parentExecutionId = previousExecution.id

        // Update humanInput with the resolved startNodeId
        humanInput.startNodeId = startNodeId
    } else if (isRecursive && parentExecutionId) {
        const { startingNodeIds: startingNodeIdsFromFlow } = getStartingNode(nodeDependencies)
        startingNodeIds.push(...startingNodeIdsFromFlow)
        checkForMultipleStartNodes(startingNodeIds, isRecursive, nodes)

        // For recursive calls with a valid parent execution ID, don't create a new execution
        // Instead, fetch the parent execution to use it
        const parentExecution = await appDataSource.getRepository(Execution).findOne({
            where: { id: parentExecutionId }
        })

        if (parentExecution) {
            logger.debug(
                `[Agentflow Engine] Using parent execution ID: ${parentExecutionId} for recursive call (iteration: ${!!iterationContext})`
            )
            newExecution = parentExecution
        } else {
            logger.warn(`[Agentflow Engine] Parent execution ID ${parentExecutionId} not found, will create new execution`)
            newExecution = await addExecution(appDataSource, agentflowid, agentFlowExecutedData, sessionId)
            parentExecutionId = newExecution.id
        }
    } else {
        const { startingNodeIds: startingNodeIdsFromFlow } = getStartingNode(nodeDependencies)
        startingNodeIds.push(...startingNodeIdsFromFlow)
        checkForMultipleStartNodes(startingNodeIds, isRecursive, nodes)

        // Only create a new execution if this is not a recursive call
        newExecution = await addExecution(appDataSource, agentflowid, agentFlowExecutedData, sessionId)
        parentExecutionId = newExecution.id
    }

    // Add starting nodes to queue
    startingNodeIds.forEach((nodeId) => {
        nodeExecutionQueue.push({
            nodeId,
            data: {},
            inputs: {}
        })
    })

    const maxIterations = process.env.MAX_ITERATIONS ? parseInt(process.env.MAX_ITERATIONS) : 1000

    // Get chat history from ChatMessage table
    const pastChatHistory = (await appDataSource
        .getRepository(ChatMessage)
        .find({
            where: {
                agentflowid,
                sessionId
            },
            order: {
                createdDate: 'ASC'
            }
        })
        .then((messages) =>
            messages.map((message) => {
                const mappedMessage: any = {
                    content: message.content,
                    role: message.role === 'userMessage' ? 'user' : 'assistant'
                }

                const hasFileUploads = message.fileUploads && message.fileUploads !== ''
                const hasArtifacts = message.artifacts && message.artifacts !== ''
                const hasFileAnnotations = message.fileAnnotations && message.fileAnnotations !== ''
                const hasUsedTools = message.usedTools && message.usedTools !== ''

                if (hasFileUploads || hasArtifacts || hasFileAnnotations || hasUsedTools) {
                    mappedMessage.additional_kwargs = {}

                    if (hasFileUploads) {
                        try {
                            mappedMessage.additional_kwargs.fileUploads = JSON.parse(message.fileUploads!)
                        } catch {
                            mappedMessage.additional_kwargs.fileUploads = message.fileUploads
                        }
                    }

                    if (hasArtifacts) {
                        try {
                            mappedMessage.additional_kwargs.artifacts = JSON.parse(message.artifacts!)
                        } catch {
                            mappedMessage.additional_kwargs.artifacts = message.artifacts
                        }
                    }

                    if (hasFileAnnotations) {
                        try {
                            mappedMessage.additional_kwargs.fileAnnotations = JSON.parse(message.fileAnnotations!)
                        } catch {
                            mappedMessage.additional_kwargs.fileAnnotations = message.fileAnnotations
                        }
                    }

                    if (hasUsedTools) {
                        try {
                            mappedMessage.additional_kwargs.usedTools = JSON.parse(message.usedTools!)
                        } catch {
                            mappedMessage.additional_kwargs.usedTools = message.usedTools
                        }
                    }
                }

                return mappedMessage
            })
        )) as IMessage[]

    let iterations = 0
    let currentHumanInput = humanInput

    // For iteration calls, clear human input since they should start fresh
    if (isRecursive && iterationContext && humanInput) {
        currentHumanInput = undefined
    }

    let analyticHandlers: AnalyticHandler | undefined
    let parentTraceIds: ICommonObject | undefined

    try {
        if (agentflow.analytic) {
            // Override config analytics
            let analyticInputs: ICommonObject = {}
            if (overrideConfig?.analytics && Object.keys(overrideConfig.analytics).length > 0) {
                analyticInputs = {
                    ...overrideConfig.analytics
                }
            }
            analyticHandlers = AnalyticHandler.getInstance({ inputs: { analytics: analyticInputs } } as any, {
                orgId,
                workspaceId,
                appDataSource,
                databaseEntities,
                componentNodes,
                analytic: agentflow.analytic,
                chatId
            })
            await analyticHandlers.init()
            parentTraceIds = await analyticHandlers.onChainStart(
                'Agentflow',
                form && Object.keys(form).length > 0 ? JSON.stringify(form) : question || ''
            )
        }
    } catch (error) {
        logger.error(`[Agentflow Engine] Error initializing analytic handlers: ${getErrorMessage(error)}`)
    }

    while (nodeExecutionQueue.length > 0 && status === 'INPROGRESS') {
        logger.debug(`[Agentflow Engine] Iteration ${iterations + 1}:`)
        logger.debug(`[Agentflow Engine] Queue: [${nodeExecutionQueue.map((n) => n.nodeId).join(', ')}]`)

        if (iterations === 0 && !isRecursive) {
            sseStreamer?.streamAgentFlowEvent(chatId, 'INPROGRESS')
        }

        if (iterations++ > maxIterations) {
            throw new Error('Maximum iteration limit reached')
        }

        const currentNode = nodeExecutionQueue.shift()
        if (!currentNode) continue

        const reactFlowNode = nodes.find((nd) => nd.id === currentNode.nodeId)
        if (!reactFlowNode || reactFlowNode === undefined || reactFlowNode.data.name === 'stickyNoteAgentflow') continue

        let nodeResult
        try {
            // Check for abort signal early in the loop
            if (abortController?.signal?.aborted) {
                throw new Error('Aborted')
            }

            logger.debug(`[Agentflow Engine] Executing node: ${reactFlowNode?.data.label}`)

            // Execute current node
            const executionResult = await executeNode({
                nodeId: currentNode.nodeId,
                reactFlowNode,
                nodes,
                edges,
                graph,
                reversedGraph,
                incomingInput,
                agentflow,
                chatId,
                sessionId,
                apiMessageId,
                evaluationRunId,
                parentExecutionId,
                isInternal,
                pastChatHistory,
                prependedChatHistory,
                appDataSource,
                usageCacheManager,
                telemetry,
                componentNodes,
                cachePool,
                sseStreamer,
                baseURL,
                overrideConfig,
                apiOverrideStatus,
                nodeOverrides,
                variableOverrides,
                uploadedFilesContent,
                fileUploads,
                humanInput: currentHumanInput,
                agentFlowExecutedData,
                agentflowRuntime,
                abortController,
                parentTraceIds,
                analyticHandlers,
                isRecursive,
                iterationContext,
                loopCounts,
                orgId,
                workspaceId,
                subscriptionId,
                productId
            })

            if (executionResult.agentFlowExecutedData) {
                agentFlowExecutedData = executionResult.agentFlowExecutedData
            }

            // Update humanInput if it was cleared by the executed node
            if (executionResult.humanInput !== currentHumanInput) {
                currentHumanInput = executionResult.humanInput
            }

            if (executionResult.shouldStop) {
                status = 'STOPPED'
                break
            }

            nodeResult = executionResult.result

            // Add execution data
            agentFlowExecutedData.push({
                nodeId: currentNode.nodeId,
                nodeLabel: reactFlowNode.data.label,
                data: nodeResult,
                previousNodeIds: reversedGraph[currentNode.nodeId],
                status: 'FINISHED'
            })

            sseStreamer?.streamNextAgentFlowEvent(chatId, {
                nodeId: currentNode.nodeId,
                nodeLabel: reactFlowNode.data.label,
                status: 'FINISHED'
            })

            if (!isRecursive) sseStreamer?.streamAgentFlowExecutedDataEvent(chatId, agentFlowExecutedData)

            // Add to agentflow runtime state
            if (nodeResult && nodeResult.state) {
                agentflowRuntime.state = nodeResult.state
            }

            if (nodeResult && nodeResult.chatHistory) {
                agentflowRuntime.chatHistory = [...(agentflowRuntime.chatHistory ?? []), ...nodeResult.chatHistory]
            }

            if (nodeResult && nodeResult.output && nodeResult.output.form) {
                agentflowRuntime.form = nodeResult.output.form
            }

            if (nodeResult && nodeResult.output && nodeResult.output.ephemeralMemory) {
                pastChatHistory.length = 0
            }

            // Process node outputs and handle branching
            const processResult = await processNodeOutputs({
                nodeId: currentNode.nodeId,
                nodeName: reactFlowNode.data.name,
                result: nodeResult,
                humanInput: currentHumanInput,
                graph,
                nodes,
                edges,
                nodeExecutionQueue,
                waitingNodes,
                loopCounts,
                sseStreamer,
                chatId
            })

            // Update humanInput if it was changed
            if (processResult.humanInput !== currentHumanInput) {
                currentHumanInput = processResult.humanInput
            }
        } catch (error) {
            const isAborted = getErrorMessage(error).includes('Aborted')
            const errorStatus = isAborted ? 'TERMINATED' : 'ERROR'
            const errorMessage = isAborted ? 'Flow execution was cancelled' : getErrorMessage(error)

            status = errorStatus

            // Add error info to execution data
            agentFlowExecutedData.push({
                nodeId: currentNode.nodeId,
                nodeLabel: reactFlowNode.data.label,
                previousNodeIds: reversedGraph[currentNode.nodeId] || [],
                data: {
                    id: currentNode.nodeId,
                    name: reactFlowNode.data.name,
                    error: errorMessage
                },
                status: errorStatus
            })

            // Stream events to client
            sseStreamer?.streamNextAgentFlowEvent(chatId, {
                nodeId: currentNode.nodeId,
                nodeLabel: reactFlowNode.data.label,
                status: errorStatus,
                error: isAborted ? undefined : errorMessage
            })

            // Only update execution record if this is not a recursive call
            if (!isRecursive) {
                sseStreamer?.streamAgentFlowExecutedDataEvent(chatId, agentFlowExecutedData)

                await updateExecution(appDataSource, newExecution.id, {
                    executionData: JSON.stringify(agentFlowExecutedData),
                    state: errorStatus
                })

                sseStreamer?.streamAgentFlowEvent(chatId, errorStatus)
            }

            if (parentTraceIds && analyticHandlers) {
                await analyticHandlers.onChainError(parentTraceIds, errorMessage, true)
            }

            if (rootSpan) {
                rootSpan.recordException(error as Error)
                rootSpan.setStatus({ code: SpanStatusCode.ERROR, message: errorMessage })
                rootSpan.setAttribute('workflow.status', errorStatus)
                rootSpan.end()
            }

            throw new Error(errorMessage)
        }

        logger.debug(`[Agentflow Engine] ---`)
    }

    // check if there is any status stopped from agentFlowExecutedData
    const terminatedNode = agentFlowExecutedData.find((data) => data.status === 'TERMINATED')
    const errorNode = agentFlowExecutedData.find((data) => data.status === 'ERROR')
    const stoppedNode = agentFlowExecutedData.find((data) => data.status === 'STOPPED')

    if (terminatedNode) {
        status = 'TERMINATED'
    } else if (errorNode) {
        status = 'ERROR'
    } else if (stoppedNode) {
        status = 'STOPPED'
    } else {
        status = 'FINISHED'
    }

    // Only update execution record if this is not a recursive call
    if (!isRecursive) {
        await updateExecution(appDataSource, newExecution.id, {
            executionData: JSON.stringify(agentFlowExecutedData),
            state: status
        })

        sseStreamer?.streamAgentFlowEvent(chatId, status)
    }

    logger.debug(`[Agentflow Engine] Flow execution completed. Status: ${status}`)

    // check if last agentFlowExecutedData.data.output contains the key "content"
    const lastNodeOutput = agentFlowExecutedData[agentFlowExecutedData.length - 1].data?.output as ICommonObject | undefined
    let content = (lastNodeOutput?.content as string) ?? ' '

    /* Check for post-processing settings */
    let agentflowConfig: ICommonObject = {}
    try {
        if (agentflow.chatbotConfig) {
            agentflowConfig = typeof agentflow.chatbotConfig === 'string' ? JSON.parse(agentflow.chatbotConfig) : agentflow.chatbotConfig
        }
    } catch (e) {
        logger.error(`[Agentflow Engine] Error parsing agentflow config: ${getErrorMessage(e)}`)
    }

    if (agentflowConfig?.postProcessing?.enabled === true && content) {
        try {
            const postProcessingFunction = JSON.parse(agentflowConfig?.postProcessing?.customFunction)
            const nodeInstanceFilePath = componentNodes['customFunctionAgentflow'].filePath as string
            const nodeModule = await import(nodeInstanceFilePath)
            //set the outputs.output to EndingNode to prevent json escaping of content...
            const nodeData = {
                inputs: { customFunctionJavascriptFunction: postProcessingFunction }
            }
            const runtimeChatHistory = agentflowRuntime.chatHistory || []
            const chatHistory = [...pastChatHistory, ...runtimeChatHistory]
            const options: ICommonObject = {
                agentflowid: agentflow.id,
                sessionId,
                chatId,
                input: question || form,
                postProcessing: {
                    rawOutput: content,
                    chatHistory: cloneDeep(chatHistory),
                    sourceDocuments: lastNodeOutput?.sourceDocuments ? cloneDeep(lastNodeOutput.sourceDocuments) : undefined,
                    usedTools: lastNodeOutput?.usedTools ? cloneDeep(lastNodeOutput.usedTools) : undefined,
                    artifacts: lastNodeOutput?.artifacts ? cloneDeep(lastNodeOutput.artifacts) : undefined,
                    fileAnnotations: lastNodeOutput?.fileAnnotations ? cloneDeep(lastNodeOutput.fileAnnotations) : undefined
                },
                appDataSource,
                databaseEntities,
                workspaceId,
                orgId,
                logger
            }
            const customFuncNodeInstance = new nodeModule.nodeClass()
            const customFunctionResponse = await customFuncNodeInstance.run(nodeData, question || form, options)
            const moderatedResponse = customFunctionResponse.output.content
            if (typeof moderatedResponse === 'string') {
                content = moderatedResponse
            } else if (typeof moderatedResponse === 'object') {
                content = '```json\n' + JSON.stringify(moderatedResponse, null, 2) + '\n```'
            } else {
                content = moderatedResponse
            }
        } catch (e) {
            logger.error(`[Agentflow Engine] Post processing error: ${getErrorMessage(e)}`)
        }
    }

    // remove credentialId from agentFlowExecutedData
    agentFlowExecutedData = agentFlowExecutedData.map((data) => _removeCredentialId(data))

    if (parentTraceIds && analyticHandlers) {
        await analyticHandlers.onChainEnd(parentTraceIds, content, true)
    }

    if (isRecursive) {
        rootSpan?.setAttribute('workflow.status', status)
        rootSpan?.end()
        return {
            agentFlowExecutedData,
            agentflowRuntime,
            status,
            text: content
        }
    }

    // Find the previous chat message with the same session/chat id and remove the action
    if (humanInput && Object.keys(humanInput).length) {
        let query = await appDataSource
            .getRepository(ChatMessage)
            .createQueryBuilder('chat_message')
            .where('chat_message.chatId = :chatId', { chatId })
            .orWhere('chat_message.sessionId = :sessionId', { sessionId })
            .orderBy('chat_message.createdDate', 'DESC')
            .getMany()

        for (const result of query) {
            if (result.action) {
                try {
                    const newChatMessage = new ChatMessage()
                    Object.assign(newChatMessage, result)
                    newChatMessage.action = null
                    const cm = await appDataSource.getRepository(ChatMessage).create(newChatMessage)
                    await appDataSource.getRepository(ChatMessage).save(cm)
                    break
                } catch (e) {
                    // error converting action to JSON
                }
            }
        }
    }

    let finalUserInput = incomingInput.question || ' '

    if (startInputType === 'chatInput') {
        finalUserInput = question || humanInput?.feedback || ' '
    } else if (startInputType === 'formInput') {
        if (form) {
            finalUserInput = Object.entries(form || {})
                .map(([key, value]) => `${key}: ${value}`)
                .join('\n')
        } else {
            finalUserInput = question || humanInput?.feedback || ' '
        }
    }

    const userMessage: Omit<IChatMessage, 'id'> = {
        role: 'userMessage',
        content: finalUserInput,
        agentflowid,
        chatType: evaluationRunId ? ChatType.EVALUATION : isInternal ? ChatType.INTERNAL : ChatType.EXTERNAL,
        chatId,
        sessionId,
        createdDate: userMessageDateTime,
        fileUploads: uploads ? JSON.stringify(fileUploads) : undefined,
        leadEmail: incomingInput.leadEmail,
        executionId: newExecution.id
    }
    await utilAddChatMessage(userMessage, appDataSource)

    const apiMessage: Omit<IChatMessage, 'createdDate'> = {
        id: apiMessageId,
        role: 'apiMessage',
        content: content,
        agentflowid,
        chatType: evaluationRunId ? ChatType.EVALUATION : isInternal ? ChatType.INTERNAL : ChatType.EXTERNAL,
        chatId,
        sessionId,
        executionId: newExecution.id
    }
    if (lastNodeOutput?.sourceDocuments) apiMessage.sourceDocuments = JSON.stringify(lastNodeOutput.sourceDocuments)
    if (lastNodeOutput?.usedTools) apiMessage.usedTools = JSON.stringify(lastNodeOutput.usedTools)
    if (lastNodeOutput?.fileAnnotations) apiMessage.fileAnnotations = JSON.stringify(lastNodeOutput.fileAnnotations)
    if (lastNodeOutput?.artifacts) apiMessage.artifacts = JSON.stringify(lastNodeOutput.artifacts)
    if (agentflow.followUpPrompts) {
        const followUpPromptsConfig = JSON.parse(agentflow.followUpPrompts)
        const followUpPrompts = await generateFollowUpPrompts(followUpPromptsConfig, apiMessage.content, {
            orgId,
            workspaceId,
            chatId,
            agentflowid,
            appDataSource,
            databaseEntities
        })
        if (followUpPrompts?.questions) {
            apiMessage.followUpPrompts = JSON.stringify(followUpPrompts.questions)
        }
    }
    if (lastNodeOutput?.humanInputAction && Object.keys(lastNodeOutput.humanInputAction).length)
        apiMessage.action = JSON.stringify(lastNodeOutput.humanInputAction)

    const chatMessage = await utilAddChatMessage(apiMessage, appDataSource)

    logger.debug(`[Agentflow Engine] Finished running agentflow ${agentflowid}`)

    await telemetry.sendTelemetry(
        'prediction_sent',
        {
            version: await getAppVersion(),
            agentflowId: agentflowid,
            chatId,
            type: evaluationRunId ? ChatType.EVALUATION : isInternal ? ChatType.INTERNAL : ChatType.EXTERNAL,
            flowGraph: getTelemetryFlowObj(nodes, edges),
            productId,
            subscriptionId
        },
        orgId
    )

    /*** Prepare response ***/
    let result: ICommonObject = {}
    result.text = content
    result.question = incomingInput.question // return the question in the response, this is used when input text is empty but question is in audio format
    result.form = form
    result.chatId = chatId
    result.chatMessageId = chatMessage?.id
    result.followUpPrompts = JSON.stringify(apiMessage.followUpPrompts)
    result.executionId = newExecution.id
    result.agentFlowExecutedData = agentFlowExecutedData

    if (sessionId) result.sessionId = sessionId

    if (shouldAutoPlayTTS(agentflow.textToSpeech) && result.text) {
        const options = {
            orgId,
            agentflowid,
            chatId,
            appDataSource,
            databaseEntities
        }

        if (sseStreamer) {
            await generateTTSForResponseStream(
                result.text,
                agentflow.textToSpeech,
                options,
                chatId,
                chatMessage?.id,
                sseStreamer,
                abortController
            )
        }
    }

    rootSpan?.setAttribute('workflow.status', status)
    rootSpan?.setAttribute('workflow.execution.id', newExecution?.id || '')
    rootSpan?.end()

    return result
}

/**
 * Execute flow - routes to the appropriate flow executor based on type.
 * Only AGENTFLOW (v2) is supported. Other types return an error.
 */
export const executeFlow = async ({
    componentNodes,
    incomingInput,
    agentflow,
    chatId,
    isEvaluation: _isEvaluation,
    evaluationRunId,
    appDataSource,
    telemetry,
    cachePool,
    usageCacheManager,
    sseStreamer,
    baseURL,
    isInternal,
    files,
    signal,
    isTool
}: IExecuteFlowParams) => {
    // Local constants for removed parameters
    const orgId = ''
    const workspaceId = ''
    const subscriptionId = ''
    // Ensure incomingInput has all required properties with default values
    incomingInput = {
        history: [],
        streaming: false,
        ...incomingInput
    }

    let overrideConfig = incomingInput.overrideConfig ?? {}
    const uploads = incomingInput.uploads
    const agentflowid = agentflow.id

    /* Process file uploads from the chat
     * - Images
     * - Files
     * - Audio
     */
    let fileUploads: IFileUpload[] = []
    let uploadedFilesContent = ''
    if (uploads) {
        fileUploads = uploads
        for (let i = 0; i < fileUploads.length; i += 1) {
            await checkStorage(orgId, subscriptionId, usageCacheManager)

            const upload = fileUploads[i]

            // if upload in an image, a rag file, or audio
            if ((upload.type === 'file' || upload.type === 'file:rag' || upload.type === 'audio') && upload.data) {
                const filename = upload.name
                const splitDataURI = upload.data.split(',')
                const bf = Buffer.from(splitDataURI.pop() || '', 'base64')
                const mime = splitDataURI[0].split(':')[1].split(';')[0]

                // Validate file extension, MIME type, and content to prevent security vulnerabilities
                validateFileMimeTypeAndExtensionMatch(filename, mime)

                const { totalSize } = await addSingleFileToStorage(mime, bf, filename, orgId, agentflowid, chatId)
                await updateStorageUsage(orgId, workspaceId, totalSize, usageCacheManager)
                upload.type = 'stored-file'
                // Omit upload.data since we don't store the content in database
                fileUploads[i] = omit(upload, ['data'])
            }

            if (upload.type === 'url' && upload.data) {
                const filename = upload.name
                const urlData = upload.data
                fileUploads[i] = { data: urlData, name: filename, type: 'url', mime: upload.mime ?? 'image/png' }
            }

            // Run Speech to Text conversion
            if (upload.mime === 'audio/webm' || upload.mime === 'audio/mp4' || upload.mime === 'audio/ogg') {
                logger.debug(`[Agentflow Engine] Attempting speech to text conversion`)
                let speechToTextConfig: ICommonObject = {}
                if (agentflow.speechToText) {
                    const speechToTextProviders = JSON.parse(agentflow.speechToText)
                    for (const provider in speechToTextProviders) {
                        const providerObj = speechToTextProviders[provider]
                        if (providerObj.status) {
                            speechToTextConfig = providerObj
                            speechToTextConfig['name'] = provider
                            break
                        }
                    }
                }
                if (speechToTextConfig) {
                    const options: ICommonObject = {
                        orgId,
                        chatId,
                        agentflowid,
                        appDataSource,
                        databaseEntities: databaseEntities
                    }
                    const speechToTextResult = await convertSpeechToText(upload, speechToTextConfig, options)
                    logger.debug(`[Agentflow Engine] Speech to text result: ${speechToTextResult}`)
                    if (speechToTextResult) {
                        incomingInput.question = speechToTextResult
                    }
                }
            }

            if (upload.type === 'file:full' && upload.data) {
                upload.type = 'stored-file:full'
                // Omit upload.data since we don't store the content in database
                uploadedFilesContent += `<doc name='${upload.name}'>${upload.data}</doc>\n\n`
                fileUploads[i] = omit(upload, ['data'])
            }
        }
    }

    // Process form data body with files
    if (files?.length) {
        overrideConfig = { ...incomingInput }
        for (const file of files) {
            await checkStorage(orgId, subscriptionId, usageCacheManager)

            const fileNames: string[] = []
            const fileBuffer = await getFileFromUpload(file.path ?? file.key)
            // Address file name with special characters: https://github.com/expressjs/multer/issues/1104
            file.originalname = Buffer.from(file.originalname, 'latin1').toString('utf8')

            // Validate file extension, MIME type, and content to prevent security vulnerabilities
            validateFileMimeTypeAndExtensionMatch(file.originalname, file.mimetype)

            const { path: storagePath, totalSize } = await addArrayFilesToStorage(
                file.mimetype,
                fileBuffer,
                file.originalname,
                fileNames,
                orgId,
                agentflowid
            )
            await updateStorageUsage(orgId, workspaceId, totalSize, usageCacheManager)

            const fileInputFieldFromMimeType = mapMimeTypeToInputField(file.mimetype)

            const fileExtension = path.extname(file.originalname)

            const fileInputFieldFromExt = mapExtToInputField(fileExtension)

            let fileInputField = 'txtFile'

            if (fileInputFieldFromExt !== 'txtFile') {
                fileInputField = fileInputFieldFromExt
            } else if (fileInputFieldFromMimeType !== 'txtFile') {
                fileInputField = fileInputFieldFromExt
            }

            if (overrideConfig[fileInputField]) {
                const existingFileInputField = overrideConfig[fileInputField].replace('FILE-STORAGE::', '')
                const existingFileInputFieldArray = JSON.parse(existingFileInputField)

                const newFileInputField = storagePath.replace('FILE-STORAGE::', '')
                const newFileInputFieldArray = JSON.parse(newFileInputField)

                const updatedFieldArray = existingFileInputFieldArray.concat(newFileInputFieldArray)

                overrideConfig[fileInputField] = `FILE-STORAGE::${JSON.stringify(updatedFieldArray)}`
            } else {
                overrideConfig[fileInputField] = storagePath
            }

            await removeSpecificFileFromUpload(file.path ?? file.key)
        }
        if (overrideConfig.vars && typeof overrideConfig.vars === 'string') {
            overrideConfig.vars = JSON.parse(overrideConfig.vars)
        }
        incomingInput = {
            ...incomingInput,
            overrideConfig,
            chatId
        }
    }

    // Only Agentflow V2 is supported
    if (agentflow.type === 'AGENTFLOW') {
        return executeAgentFlow({
            componentNodes,
            incomingInput,
            agentflow,
            chatId,
            evaluationRunId,
            appDataSource,
            telemetry,
            cachePool,
            usageCacheManager,
            sseStreamer,
            baseURL,
            isInternal,
            uploadedFilesContent,
            fileUploads,
            signal,
            isTool
        })
    }

    // Deprecated flow types
    throw new InternalChronosError(
        StatusCodes.GONE,
        `Flow type '${agentflow.type}' is deprecated. Only Agentflow V2 (type AGENTFLOW) is supported. Please migrate your flow.`
    )
}

/**
 * Build/Data Preparation for execute function
 * @param {Request} req
 * @param {boolean} isInternal
 */
export const utilBuildAgentflow = async (req: Request, isInternal: boolean = false): Promise<any> => {
    const appServer = getRunningExpressApp()

    const agentflowid = req.params.id

    // Check if agentflow exists
    const agentflow = await appServer.AppDataSource.getRepository(AgentFlow).findOneBy({
        id: agentflowid
    })
    if (!agentflow) {
        throw new InternalChronosError(StatusCodes.NOT_FOUND, `Agentflow ${agentflowid} not found`)
    }

    const isAgentFlow = agentflow.type === 'AGENTFLOW'
    const httpProtocol = req.get('x-forwarded-proto') || req.protocol
    const baseURL = `${httpProtocol}://${req.get('host')}`
    const incomingInput: IncomingInput = req.body || {} // Ensure incomingInput is never undefined
    const chatId = incomingInput.chatId ?? incomingInput.overrideConfig?.sessionId ?? uuidv4()
    const files = (req.files as Express.Multer.File[]) || []
    const abortControllerId = `${agentflow.id}_${chatId}`
    const isTool = req.get('chronos-tool') === 'true'
    const isEvaluation: boolean = req.headers['X-Chronos-Evaluation'] || req.body.evaluation
    let evaluationRunId = ''
    evaluationRunId = req.body.evaluationRunId
    if (isEvaluation && agentflow.type !== 'AGENTFLOW' && req.body.evaluationRunId) {
        // this is needed for the collection of token metrics for non-agent flows,
        // for agentflows the execution trace has the info needed
        const newEval = {
            evaluation: {
                status: true,
                evaluationRunId
            }
        }
        agentflow.analytic = JSON.stringify(newEval)
    }

    let _organizationId = ''

    try {
        // Validate API Key if its external API request
        if (!isInternal) {
            const isKeyValidated = await validateFlowAPIKey(req, agentflow)
            if (!isKeyValidated) {
                throw new InternalChronosError(StatusCodes.UNAUTHORIZED, `Unauthorized`)
            }
        }

        // Open source: No workspace/organization needed
        const workspaceId = ''
        const orgId = ''
        _organizationId = orgId
        const subscriptionId = ''

        const executeData: IExecuteFlowParams = {
            incomingInput, // Use the defensively created incomingInput variable
            agentflow,
            chatId,
            baseURL,
            isInternal,
            files,
            isEvaluation,
            evaluationRunId,
            appDataSource: appServer.AppDataSource,
            sseStreamer: appServer.sseStreamer,
            telemetry: appServer.telemetry,
            cachePool: appServer.cachePool,
            componentNodes: appServer.nodesPool.componentNodes,
            isTool, // used to disable streaming if incoming request its from AgentflowTool
            usageCacheManager: appServer.usageCacheManager
        }

        if (process.env.MODE === MODE.QUEUE) {
            const predictionQueue = appServer.queueManager.getQueue('prediction')
            const job = await predictionQueue.addJob(omit(executeData, OMIT_QUEUE_JOB_DATA))
            logger.debug(`[Agentflow Engine] Job added to queue: ${job.id} (agentflow: ${agentflow.id}, chatId: ${chatId})`)

            const queueEvents = predictionQueue.getQueueEvents()
            const result = await job.waitUntilFinished(queueEvents)
            appServer.abortControllerPool.remove(abortControllerId)
            if (!result) {
                throw new Error('Job execution failed')
            }
            await updatePredictionsUsage(orgId, subscriptionId, workspaceId, appServer.usageCacheManager)
            incrementSuccessMetricCounter(appServer.metricsProvider, isInternal, isAgentFlow)
            return result
        } else {
            // Add abort controller to the pool
            const signal = new AbortController()
            appServer.abortControllerPool.add(abortControllerId, signal)
            executeData.signal = signal

            const result = await executeFlow(executeData)

            appServer.abortControllerPool.remove(abortControllerId)
            await updatePredictionsUsage(orgId, subscriptionId, workspaceId, appServer.usageCacheManager)
            incrementSuccessMetricCounter(appServer.metricsProvider, isInternal, isAgentFlow)
            return result
        }
    } catch (e) {
        logger.error(`[Agentflow Engine] Error in agentflow ${agentflow.id} (chatId: ${chatId}): ${getErrorMessage(e)}`)
        appServer.abortControllerPool.remove(`${agentflow.id}_${chatId}`)
        incrementFailedMetricCounter(appServer.metricsProvider, isInternal, isAgentFlow)
        if (e instanceof InternalChronosError && e.statusCode === StatusCodes.UNAUTHORIZED) {
            throw e
        } else {
            throw new InternalChronosError(StatusCodes.INTERNAL_SERVER_ERROR, getErrorMessage(e))
        }
    }
}

/**
 * Increment success metric counter
 */
const incrementSuccessMetricCounter = (metricsProvider: IMetricsProvider, isInternal: boolean, _isAgentFlow: boolean) => {
    metricsProvider?.incrementCounter(
        isInternal ? CHRONOS_METRIC_COUNTERS.AGENTFLOW_PREDICTION_INTERNAL : CHRONOS_METRIC_COUNTERS.AGENTFLOW_PREDICTION_EXTERNAL,
        { status: CHRONOS_COUNTER_STATUS.SUCCESS }
    )
}

/**
 * Increment failed metric counter
 */
const incrementFailedMetricCounter = (metricsProvider: IMetricsProvider, isInternal: boolean, _isAgentFlow: boolean) => {
    metricsProvider?.incrementCounter(
        isInternal ? CHRONOS_METRIC_COUNTERS.AGENTFLOW_PREDICTION_INTERNAL : CHRONOS_METRIC_COUNTERS.AGENTFLOW_PREDICTION_EXTERNAL,
        { status: CHRONOS_COUNTER_STATUS.FAILURE }
    )
}
