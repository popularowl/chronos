import { removeFilesFromStorage } from 'chronos-components'
import { StatusCodes } from 'http-status-codes'
import { DeleteResult, FindOptionsWhere, In } from 'typeorm'
import { ChatMessage } from '../../database/entities/ChatMessage'
import { ChatMessageFeedback } from '../../database/entities/ChatMessageFeedback'
import { InternalChronosError } from '../../errors/internalChronosError'
import { getErrorMessage } from '../../errors/utils'
import { ChatMessageRatingType, ChatType, IChatMessage, MODE } from '../../Interface'
import { UsageCacheManager } from '../../UsageCacheManager'
import { utilAddChatMessage } from '../../utils/addChatMesage'
import { utilGetChatMessage } from '../../utils/getChatMessage'
import { getRunningExpressApp } from '../../utils/getRunningExpressApp'
import { updateStorageUsage } from '../../utils/quotaUsage'

// Add chatmessages for agentflowid
const createChatMessage = async (chatMessage: Partial<IChatMessage>) => {
    try {
        const dbResponse = await utilAddChatMessage(chatMessage)
        return dbResponse
    } catch (error) {
        throw new InternalChronosError(
            StatusCodes.INTERNAL_SERVER_ERROR,
            `Error: chatMessagesService.createChatMessage - ${getErrorMessage(error)}`
        )
    }
}

// Get all chatmessages from agentflowid
const getAllChatMessages = async (
    agentflowId: string,
    chatTypes: ChatType[] | undefined,
    sortOrder: string = 'ASC',
    chatId?: string,
    memoryType?: string,
    sessionId?: string,
    startDate?: string,
    endDate?: string,
    messageId?: string,
    feedback?: boolean,
    feedbackTypes?: ChatMessageRatingType[],
    page?: number,
    pageSize?: number
): Promise<ChatMessage[]> => {
    try {
        const dbResponse = await utilGetChatMessage({
            agentflowid: agentflowId,
            chatTypes,
            sortOrder,
            chatId,
            memoryType,
            sessionId,
            startDate,
            endDate,
            messageId,
            feedback,
            feedbackTypes,
            page,
            pageSize
        })
        return dbResponse
    } catch (error) {
        throw new InternalChronosError(
            StatusCodes.INTERNAL_SERVER_ERROR,
            `Error: chatMessagesService.getAllChatMessages - ${getErrorMessage(error)}`
        )
    }
}

// Get internal chatmessages from agentflowid
const getAllInternalChatMessages = async (
    agentflowId: string,
    chatTypes: ChatType[] | undefined,
    sortOrder: string = 'ASC',
    chatId?: string,
    memoryType?: string,
    sessionId?: string,
    startDate?: string,
    endDate?: string,
    messageId?: string,
    feedback?: boolean,
    feedbackTypes?: ChatMessageRatingType[]
): Promise<ChatMessage[]> => {
    try {
        const dbResponse = await utilGetChatMessage({
            agentflowid: agentflowId,
            chatTypes,
            sortOrder,
            chatId,
            memoryType,
            sessionId,
            startDate,
            endDate,
            messageId,
            feedback,
            feedbackTypes
        })
        return dbResponse
    } catch (error) {
        throw new InternalChronosError(
            StatusCodes.INTERNAL_SERVER_ERROR,
            `Error: chatMessagesService.getAllInternalChatMessages - ${getErrorMessage(error)}`
        )
    }
}

const removeAllChatMessages = async (
    chatId: string,
    agentflowid: string,
    deleteOptions: FindOptionsWhere<ChatMessage>,
    usageCacheManager: UsageCacheManager
): Promise<DeleteResult> => {
    try {
        const appServer = getRunningExpressApp()
        const orgId = ''

        // Remove all related feedback records
        const feedbackDeleteOptions: FindOptionsWhere<ChatMessageFeedback> = { chatId }
        await appServer.AppDataSource.getRepository(ChatMessageFeedback).delete(feedbackDeleteOptions)

        // Delete all uploads corresponding to this agentflow/chatId
        if (chatId) {
            try {
                const { totalSize } = await removeFilesFromStorage(orgId, agentflowid, chatId)
                await updateStorageUsage(orgId, '', totalSize, usageCacheManager)
            } catch (e) {
                // Don't throw error if file deletion fails because file might not exist
            }
        }
        const dbResponse = await appServer.AppDataSource.getRepository(ChatMessage).delete(deleteOptions)
        return dbResponse
    } catch (error) {
        throw new InternalChronosError(
            StatusCodes.INTERNAL_SERVER_ERROR,
            `Error: chatMessagesService.removeAllChatMessages - ${getErrorMessage(error)}`
        )
    }
}

const removeChatMessagesByMessageIds = async (
    agentflowid: string,
    chatIdMap: Map<string, ChatMessage[]>,
    messageIds: string[],
    usageCacheManager: UsageCacheManager
): Promise<DeleteResult> => {
    try {
        const appServer = getRunningExpressApp()
        const orgId = ''

        // Get messages before deletion to check for executionId
        const messages = await appServer.AppDataSource.getRepository(ChatMessage).findByIds(messageIds)
        const executionIds = messages.map((msg) => msg.executionId).filter(Boolean)

        for (const [composite_key] of chatIdMap) {
            const [chatId] = composite_key.split('_')

            // Remove all related feedback records
            const feedbackDeleteOptions: FindOptionsWhere<ChatMessageFeedback> = { chatId }
            await appServer.AppDataSource.getRepository(ChatMessageFeedback).delete(feedbackDeleteOptions)

            // Delete all uploads corresponding to this agentflow/chatId
            try {
                const { totalSize } = await removeFilesFromStorage(orgId, agentflowid, chatId)
                await updateStorageUsage(orgId, '', totalSize, usageCacheManager)
            } catch (e) {
                // Don't throw error if file deletion fails because file might not exist
            }
        }

        // Delete executions if they exist
        if (executionIds.length > 0) {
            await appServer.AppDataSource.getRepository('Execution').delete(executionIds)
        }

        const dbResponse = await appServer.AppDataSource.getRepository(ChatMessage).delete(messageIds)
        return dbResponse
    } catch (error) {
        throw new InternalChronosError(
            StatusCodes.INTERNAL_SERVER_ERROR,
            `Error: chatMessagesService.removeChatMessagesByMessageIds - ${getErrorMessage(error)}`
        )
    }
}

const abortChatMessage = async (chatId: string, agentflowid: string) => {
    try {
        const appServer = getRunningExpressApp()
        const id = `${agentflowid}_${chatId}`

        if (process.env.MODE === MODE.QUEUE) {
            await appServer.queueManager.getPredictionQueueEventsProducer().publishEvent({
                eventName: 'abort',
                id
            })
        } else {
            appServer.abortControllerPool.abort(id)
        }
    } catch (error) {
        throw new InternalChronosError(
            StatusCodes.INTERNAL_SERVER_ERROR,
            `Error: chatMessagesService.abortChatMessage - ${getErrorMessage(error)}`
        )
    }
}

async function getMessagesByAgentflowIds(agentflowIds: string[]): Promise<ChatMessage[]> {
    const appServer = getRunningExpressApp()
    return await appServer.AppDataSource.getRepository(ChatMessage).find({ where: { agentflowid: In(agentflowIds) } })
}

async function getMessagesFeedbackByAgentflowIds(agentflowIds: string[]): Promise<ChatMessageFeedback[]> {
    const appServer = getRunningExpressApp()
    return await appServer.AppDataSource.getRepository(ChatMessageFeedback).find({ where: { agentflowid: In(agentflowIds) } })
}

export default {
    createChatMessage,
    getAllChatMessages,
    getAllInternalChatMessages,
    removeAllChatMessages,
    removeChatMessagesByMessageIds,
    abortChatMessage,
    getMessagesByAgentflowIds,
    getMessagesFeedbackByAgentflowIds
}
