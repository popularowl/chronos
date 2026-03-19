import { StatusCodes } from 'http-status-codes'
import { utilGetChatMessageFeedback } from '../../utils/getChatMessageFeedback'
import { utilAddChatMessageFeedback } from '../../utils/addChatMessageFeedback'
import { utilUpdateChatMessageFeedback } from '../../utils/updateChatMessageFeedback'
import { IChatMessageFeedback } from '../../Interface'
import { InternalChronosError } from '../../errors/internalChronosError'
import { getErrorMessage } from '../../errors/utils'

// Get all chatmessage feedback from agentflowid
const getAllChatMessageFeedback = async (
    agentflowid: string,
    chatId: string | undefined,
    sortOrder: string | undefined,
    startDate: string | undefined,
    endDate: string | undefined
) => {
    try {
        const dbResponse = await utilGetChatMessageFeedback(agentflowid, chatId, sortOrder, startDate, endDate)
        return dbResponse
    } catch (error) {
        throw new InternalChronosError(
            StatusCodes.INTERNAL_SERVER_ERROR,
            `Error: feedbackService.getAllChatMessageFeedback - ${getErrorMessage(error)}`
        )
    }
}

// Add chatmessage feedback
const createChatMessageFeedbackForAgentflow = async (requestBody: Partial<IChatMessageFeedback>): Promise<any> => {
    try {
        const dbResponse = await utilAddChatMessageFeedback(requestBody)
        return dbResponse
    } catch (error) {
        throw new InternalChronosError(
            StatusCodes.INTERNAL_SERVER_ERROR,
            `Error: feedbackService.createChatMessageFeedbackForAgentflow - ${getErrorMessage(error)}`
        )
    }
}

// Add chatmessage feedback
const updateChatMessageFeedbackForAgentflow = async (feedbackId: string, requestBody: Partial<IChatMessageFeedback>): Promise<any> => {
    try {
        const dbResponse = await utilUpdateChatMessageFeedback(feedbackId, requestBody)
        return dbResponse
    } catch (error) {
        throw new InternalChronosError(
            StatusCodes.INTERNAL_SERVER_ERROR,
            `Error: feedbackService.updateChatMessageFeedbackForAgentflow - ${getErrorMessage(error)}`
        )
    }
}

export default {
    getAllChatMessageFeedback,
    createChatMessageFeedbackForAgentflow,
    updateChatMessageFeedbackForAgentflow
}
