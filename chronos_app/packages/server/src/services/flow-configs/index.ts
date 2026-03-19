import { StatusCodes } from 'http-status-codes'
import { findAvailableConfigs } from '../../utils'
import { IReactFlowObject } from '../../Interface'
import { getRunningExpressApp } from '../../utils/getRunningExpressApp'
import agentflowsService from '../agentflows'
import { InternalChronosError } from '../../errors/internalChronosError'
import { getErrorMessage } from '../../errors/utils'

const getSingleFlowConfig = async (agentflowId: string): Promise<any> => {
    try {
        const appServer = getRunningExpressApp()
        const agentflow = await agentflowsService.getAgentflowById(agentflowId)
        if (!agentflow) {
            throw new InternalChronosError(StatusCodes.NOT_FOUND, `Agentflow ${agentflowId} not found in the database!`)
        }
        const flowData = agentflow.flowData
        const parsedFlowData: IReactFlowObject = JSON.parse(flowData)
        const nodes = parsedFlowData.nodes
        const dbResponse = findAvailableConfigs(nodes, appServer.nodesPool.componentCredentials)
        return dbResponse
    } catch (error) {
        throw new InternalChronosError(
            StatusCodes.INTERNAL_SERVER_ERROR,
            `Error: flowConfigService.getSingleFlowConfig - ${getErrorMessage(error)}`
        )
    }
}

export default {
    getSingleFlowConfig
}
