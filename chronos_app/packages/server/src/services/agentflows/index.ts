import { ICommonObject, removeFolderFromStorage } from 'chronos-components'
import { StatusCodes } from 'http-status-codes'
import { In } from 'typeorm'
import { AgentflowType, IReactFlowObject } from '../../Interface'
import { UserContext } from '../../Interface.Auth'
import { CHRONOS_COUNTER_STATUS, CHRONOS_METRIC_COUNTERS } from '../../Interface.Metrics'
import { AgentFlow, EnumAgentflowType } from '../../database/entities/AgentFlow'
import { AgentflowVersion } from '../../database/entities/AgentflowVersion'
import { ChatMessage } from '../../database/entities/ChatMessage'
import { ChatMessageFeedback } from '../../database/entities/ChatMessageFeedback'
import { UpsertHistory } from '../../database/entities/UpsertHistory'
import { InternalChronosError } from '../../errors/internalChronosError'
import { getErrorMessage } from '../../errors/utils'
import documentStoreService from '../../services/documentstore'
import { getAppVersion, getTelemetryFlowObj } from '../../utils'
import { containsBase64File, updateFlowDataWithFilePaths } from '../../utils/fileRepository'
import { getRunningExpressApp } from '../../utils/getRunningExpressApp'
import { utilGetUploadsConfig } from '../../utils/getUploadsConfig'
import logger from '../../utils/logger'

export const enum AgentflowErrorMessage {
    INVALID_AGENTFLOW_TYPE = 'Invalid Agentflow Type'
}

export function validateAgentflowType(type: AgentflowType | undefined) {
    if (!Object.values(EnumAgentflowType).includes(type as EnumAgentflowType))
        throw new InternalChronosError(StatusCodes.BAD_REQUEST, AgentflowErrorMessage.INVALID_AGENTFLOW_TYPE)
}

// Check if agentflow valid for streaming
const checkIfAgentflowIsValidForStreaming = async (agentflowId: string): Promise<any> => {
    try {
        const appServer = getRunningExpressApp()
        const agentflow = await appServer.AppDataSource.getRepository(AgentFlow).findOneBy({
            id: agentflowId
        })
        if (!agentflow) {
            throw new InternalChronosError(StatusCodes.NOT_FOUND, `Agentflow ${agentflowId} not found`)
        }

        /* Check for post-processing settings, if available isStreamValid is always false */
        let agentflowConfig: ICommonObject = {}
        if (agentflow.chatbotConfig) {
            agentflowConfig = JSON.parse(agentflow.chatbotConfig)
            if (agentflowConfig?.postProcessing?.enabled === true) {
                return { isStreaming: false }
            }
        }

        // Agentflows always support streaming
        return { isStreaming: true }
    } catch (error) {
        throw new InternalChronosError(
            StatusCodes.INTERNAL_SERVER_ERROR,
            `Error: agentflowsService.checkIfAgentflowIsValidForStreaming - ${getErrorMessage(error)}`
        )
    }
}

// Check if agentflow valid for uploads
const checkIfAgentflowIsValidForUploads = async (agentflowId: string): Promise<any> => {
    try {
        const dbResponse = await utilGetUploadsConfig(agentflowId)
        return dbResponse
    } catch (error) {
        throw new InternalChronosError(
            StatusCodes.INTERNAL_SERVER_ERROR,
            `Error: agentflowsService.checkIfAgentflowIsValidForUploads - ${getErrorMessage(error)}`
        )
    }
}

const deleteAgentflow = async (agentflowId: string, userContext?: UserContext): Promise<any> => {
    try {
        const appServer = getRunningExpressApp()

        const agentflow = await getAgentflowById(agentflowId)
        if (userContext && userContext.role !== 'admin' && agentflow.userId !== userContext.userId) {
            throw new InternalChronosError(StatusCodes.FORBIDDEN, 'You do not have permission to delete this agentflow')
        }

        const dbResponse = await appServer.AppDataSource.getRepository(AgentFlow).delete({ id: agentflowId })

        // Update document store usage
        await documentStoreService.updateDocumentStoreUsage(agentflowId, undefined)

        // Delete all chat messages
        await appServer.AppDataSource.getRepository(ChatMessage).delete({ agentflowid: agentflowId })

        // Delete all chat feedback
        await appServer.AppDataSource.getRepository(ChatMessageFeedback).delete({ agentflowid: agentflowId })

        // Delete all upsert history
        await appServer.AppDataSource.getRepository(UpsertHistory).delete({ agentflowid: agentflowId })

        // Delete all version snapshots
        await appServer.AppDataSource.getRepository(AgentflowVersion).delete({ agentflowId })

        try {
            // Delete all uploads corresponding to this agentflow
            await removeFolderFromStorage('', agentflowId)
        } catch (e) {
            logger.error(`[server]: Error deleting file storage for agentflow ${agentflowId}`)
        }
        return dbResponse
    } catch (error) {
        throw new InternalChronosError(
            StatusCodes.INTERNAL_SERVER_ERROR,
            `Error: agentflowsService.deleteAgentflow - ${getErrorMessage(error)}`
        )
    }
}

/**
 * Look up the version number for each agentflow's currently-published
 * version row and attach it as `publishedVersion` (number | null).
 *
 * One bulk query (IN clause) keeps this O(1) regardless of page size.
 * `null` means the agentflow has never been published.
 */
const attachPublishedVersionNumbers = async (agentflows: AgentFlow[]): Promise<void> => {
    const versionIds = agentflows.map((af) => af.publishedVersionId).filter((id): id is string => Boolean(id))
    if (versionIds.length === 0) {
        agentflows.forEach((af) => ((af as any).publishedVersion = null))
        return
    }
    const appServer = getRunningExpressApp()
    const rows = await appServer.AppDataSource.getRepository(AgentflowVersion).find({
        select: ['id', 'version'],
        where: { id: In(versionIds) }
    })
    const map = new Map<string, number>(rows.map((r) => [r.id, r.version]))
    agentflows.forEach((af) => {
        ;(af as any).publishedVersion = af.publishedVersionId ? map.get(af.publishedVersionId) ?? null : null
    })
}

const getAllAgentflows = async (type?: AgentflowType, page: number = -1, limit: number = -1, userContext?: UserContext) => {
    try {
        const appServer = getRunningExpressApp()

        const queryBuilder = appServer.AppDataSource.getRepository(AgentFlow)
            .createQueryBuilder('chat_flow')
            .orderBy('chat_flow.updatedDate', 'DESC')

        if (userContext && userContext.role !== 'admin') {
            queryBuilder.andWhere('chat_flow.userId = :userId', { userId: userContext.userId })
        }
        if (page > 0 && limit > 0) {
            queryBuilder.skip((page - 1) * limit)
            queryBuilder.take(limit)
        }
        if (type) {
            queryBuilder.andWhere('chat_flow.type = :type', { type })
        }
        const [data, total] = await queryBuilder.getManyAndCount()

        await attachPublishedVersionNumbers(data)

        if (page > 0 && limit > 0) {
            return { data, total }
        } else {
            return data
        }
    } catch (error) {
        throw new InternalChronosError(
            StatusCodes.INTERNAL_SERVER_ERROR,
            `Error: agentflowsService.getAllAgentflows - ${getErrorMessage(error)}`
        )
    }
}

/**
 * Get count of agentflows - stub for open source (counts all agentflows of given type)
 * @param type - Agentflow type
 * @param _organizationId - Ignored in open source
 * @returns Count of agentflows
 */
async function getAllAgentflowsCountByOrganization(type: AgentflowType, _organizationId: string): Promise<number> {
    try {
        const appServer = getRunningExpressApp()
        const agentflowsCount = await appServer.AppDataSource.getRepository(AgentFlow).countBy({ type })
        return agentflowsCount
    } catch (error) {
        throw new InternalChronosError(
            StatusCodes.INTERNAL_SERVER_ERROR,
            `Error: agentflowsService.getAllAgentflowsCountByOrganization - ${getErrorMessage(error)}`
        )
    }
}

const getAllAgentflowsCount = async (type?: AgentflowType, userContext?: UserContext): Promise<number> => {
    try {
        const appServer = getRunningExpressApp()
        const whereOptions: any = {}
        if (type) whereOptions.type = type
        if (userContext && userContext.role !== 'admin') whereOptions.userId = userContext.userId
        const dbResponse = await appServer.AppDataSource.getRepository(AgentFlow).countBy(whereOptions)
        return dbResponse
    } catch (error) {
        throw new InternalChronosError(
            StatusCodes.INTERNAL_SERVER_ERROR,
            `Error: agentflowsService.getAllAgentflowsCount - ${getErrorMessage(error)}`
        )
    }
}

const getAgentflowByApiKey = async (apiKeyId: string, keyonly?: unknown): Promise<any> => {
    try {
        // Here we only get agentflows that are bounded by the apikeyid and agentflows that are not bounded by any apikey
        const appServer = getRunningExpressApp()
        let query = appServer.AppDataSource.getRepository(AgentFlow)
            .createQueryBuilder('cf')
            .where('cf.apikeyid = :apikeyid', { apikeyid: apiKeyId })
        if (keyonly === undefined) {
            query = query.orWhere('cf.apikeyid IS NULL').orWhere('cf.apikeyid = ""')
        }

        const dbResponse = await query.orderBy('cf.name', 'ASC').getMany()
        if (dbResponse.length < 1) {
            throw new InternalChronosError(StatusCodes.NOT_FOUND, `Agentflow not found in the database!`)
        }
        return dbResponse
    } catch (error) {
        throw new InternalChronosError(
            StatusCodes.INTERNAL_SERVER_ERROR,
            `Error: agentflowsService.getAgentflowByApiKey - ${getErrorMessage(error)}`
        )
    }
}

const getAgentflowById = async (agentflowId: string, userContext?: UserContext): Promise<any> => {
    try {
        const appServer = getRunningExpressApp()
        const dbResponse = await appServer.AppDataSource.getRepository(AgentFlow).findOne({
            where: {
                id: agentflowId
            }
        })
        if (!dbResponse) {
            throw new InternalChronosError(StatusCodes.NOT_FOUND, `Agentflow ${agentflowId} not found in the database!`)
        }
        if (userContext && userContext.role !== 'admin' && dbResponse.userId !== userContext.userId) {
            throw new InternalChronosError(StatusCodes.FORBIDDEN, 'You do not have permission to access this agentflow')
        }
        await attachPublishedVersionNumbers([dbResponse])
        return dbResponse
    } catch (error) {
        throw new InternalChronosError(
            StatusCodes.INTERNAL_SERVER_ERROR,
            `Error: agentflowsService.getAgentflowById - ${getErrorMessage(error)}`
        )
    }
}

const saveAgentflow = async (newAgentFlow: AgentFlow, userContext?: UserContext): Promise<any> => {
    validateAgentflowType(newAgentFlow.type)
    if (userContext) {
        newAgentFlow.userId = userContext.userId
    }
    const appServer = getRunningExpressApp()

    let dbResponse: AgentFlow
    if (containsBase64File(newAgentFlow)) {
        // we need a 2-step process, as we need to save the agentflow first and then update the file paths
        // this is because we need the agentflow id to create the file paths

        // step 1 - save with empty flowData
        const incomingFlowData = newAgentFlow.flowData
        newAgentFlow.flowData = JSON.stringify({})
        const agentflow = appServer.AppDataSource.getRepository(AgentFlow).create(newAgentFlow)
        const step1Results = await appServer.AppDataSource.getRepository(AgentFlow).save(agentflow)

        // step 2 - convert base64 to file paths and update the agentflow
        step1Results.flowData = await updateFlowDataWithFilePaths(step1Results.id, incomingFlowData)
        await _checkAndUpdateDocumentStoreUsage(step1Results)
        dbResponse = await appServer.AppDataSource.getRepository(AgentFlow).save(step1Results)
    } else {
        const agentflow = appServer.AppDataSource.getRepository(AgentFlow).create(newAgentFlow)
        dbResponse = await appServer.AppDataSource.getRepository(AgentFlow).save(agentflow)
    }

    await appServer.telemetry.sendTelemetry(
        'agentflow_created',
        {
            version: await getAppVersion(),
            agentflowId: dbResponse.id,
            flowGraph: getTelemetryFlowObj(JSON.parse(dbResponse.flowData)?.nodes, JSON.parse(dbResponse.flowData)?.edges)
        },
        ''
    )

    appServer.metricsProvider?.incrementCounter(CHRONOS_METRIC_COUNTERS.AGENTFLOW_CREATED, { status: CHRONOS_COUNTER_STATUS.SUCCESS })

    return dbResponse
}

const updateAgentflow = async (agentflow: AgentFlow, updateAgentFlow: AgentFlow, userContext?: UserContext): Promise<any> => {
    if (userContext && userContext.role !== 'admin' && agentflow.userId !== userContext.userId) {
        throw new InternalChronosError(StatusCodes.FORBIDDEN, 'You do not have permission to update this agentflow')
    }
    const appServer = getRunningExpressApp()
    if (updateAgentFlow.flowData && containsBase64File(updateAgentFlow)) {
        updateAgentFlow.flowData = await updateFlowDataWithFilePaths(agentflow.id, updateAgentFlow.flowData)
    }
    if (updateAgentFlow.type || updateAgentFlow.type === '') {
        validateAgentflowType(updateAgentFlow.type)
    } else {
        updateAgentFlow.type = agentflow.type
    }
    const newDbAgentflow = appServer.AppDataSource.getRepository(AgentFlow).merge(agentflow, updateAgentFlow)
    await _checkAndUpdateDocumentStoreUsage(newDbAgentflow)
    const dbResponse = await appServer.AppDataSource.getRepository(AgentFlow).save(newDbAgentflow)

    return dbResponse
}

const _checkAndUpdateDocumentStoreUsage = async (agentflow: AgentFlow) => {
    const parsedFlowData: IReactFlowObject = JSON.parse(agentflow.flowData)
    const nodes = parsedFlowData.nodes
    // from the nodes array find if there is a node with name == documentStore)
    const node = nodes.length > 0 && nodes.find((node) => node.data.name === 'documentStore')
    if (!node || !node.data || !node.data.inputs || node.data.inputs['selectedStore'] === undefined) {
        await documentStoreService.updateDocumentStoreUsage(agentflow.id, undefined)
    } else {
        await documentStoreService.updateDocumentStoreUsage(agentflow.id, node.data.inputs['selectedStore'])
    }
}

const checkIfAgentflowHasChanged = async (agentflowId: string, lastUpdatedDateTime: string): Promise<any> => {
    try {
        const appServer = getRunningExpressApp()
        //**
        const agentflow = await appServer.AppDataSource.getRepository(AgentFlow).findOneBy({
            id: agentflowId
        })
        if (!agentflow) {
            throw new InternalChronosError(StatusCodes.NOT_FOUND, `Agentflow ${agentflowId} not found`)
        }
        // parse the lastUpdatedDateTime as a date and
        //check if the updatedDate is the same as the lastUpdatedDateTime
        return { hasChanged: agentflow.updatedDate.toISOString() !== lastUpdatedDateTime }
    } catch (error) {
        throw new InternalChronosError(
            StatusCodes.INTERNAL_SERVER_ERROR,
            `Error: agentflowsService.checkIfAgentflowHasChanged - ${getErrorMessage(error)}`
        )
    }
}

export default {
    checkIfAgentflowIsValidForStreaming,
    checkIfAgentflowIsValidForUploads,
    deleteAgentflow,
    getAllAgentflows,
    getAllAgentflowsCount,
    getAgentflowByApiKey,
    getAgentflowById,
    saveAgentflow,
    updateAgentflow,
    checkIfAgentflowHasChanged,
    getAllAgentflowsCountByOrganization
}
