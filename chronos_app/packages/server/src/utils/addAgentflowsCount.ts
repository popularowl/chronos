import { StatusCodes } from 'http-status-codes'
import { AgentFlow } from '../database/entities/AgentFlow'
import { InternalChronosError } from '../errors/internalChronosError'
import { getRunningExpressApp } from '../utils/getRunningExpressApp'
import { getErrorMessage } from '../errors/utils'

export const addAgentflowsCount = async (keys: any) => {
    try {
        const appServer = getRunningExpressApp()
        let tmpResult = keys
        if (typeof keys !== 'undefined' && keys.length > 0) {
            const updatedKeys: any[] = []
            //iterate through keys and get agentflows
            for (const key of keys) {
                const agentflows = await appServer.AppDataSource.getRepository(AgentFlow)
                    .createQueryBuilder('cf')
                    .where('cf.apikeyid = :apikeyid', { apikeyid: key.id })
                    .getMany()
                const linkedAgentFlows: any[] = []
                agentflows.map((cf) => {
                    linkedAgentFlows.push({
                        flowName: cf.name,
                        category: cf.category,
                        updatedDate: cf.updatedDate
                    })
                })
                key.agentFlows = linkedAgentFlows
                updatedKeys.push(key)
            }
            tmpResult = updatedKeys
        }
        return tmpResult
    } catch (error) {
        throw new InternalChronosError(StatusCodes.INTERNAL_SERVER_ERROR, `Error: addAgentflowsCount - ${getErrorMessage(error)}`)
    }
}
