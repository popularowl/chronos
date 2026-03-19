import { StatusCodes } from 'http-status-codes'
import { ChatMessageRatingType, ChatType } from '../../Interface'
import { ChatMessage } from '../../database/entities/ChatMessage'
import { utilGetChatMessage } from '../../utils/getChatMessage'
import { ChatMessageFeedback } from '../../database/entities/ChatMessageFeedback'
import { InternalChronosError } from '../../errors/internalChronosError'
import { getErrorMessage } from '../../errors/utils'

// get stats for showing in agentflow
const getAgentflowStats = async (
    agentflowid: string,
    chatTypes: ChatType[] | undefined,
    startDate?: string,
    endDate?: string,
    messageId?: string,
    feedback?: boolean,
    feedbackTypes?: ChatMessageRatingType[]
): Promise<any> => {
    try {
        const chatmessages = (await utilGetChatMessage({
            agentflowid: agentflowid,
            chatTypes,
            startDate,
            endDate,
            messageId,
            feedback,
            feedbackTypes
        })) as Array<ChatMessage & { feedback?: ChatMessageFeedback }>
        const totalMessages = chatmessages.length
        const totalFeedback = chatmessages.filter((message) => message?.feedback).length
        const positiveFeedback = chatmessages.filter((message) => message?.feedback?.rating === 'THUMBS_UP').length
        // count the number of unique sessions in the chatmessages - count unique sessionId
        const uniqueSessions = new Set(chatmessages.map((message) => message.sessionId))
        const totalSessions = uniqueSessions.size
        const dbResponse = {
            totalMessages,
            totalFeedback,
            positiveFeedback,
            totalSessions
        }

        return dbResponse
    } catch (error) {
        throw new InternalChronosError(
            StatusCodes.INTERNAL_SERVER_ERROR,
            `Error: statsService.getAgentflowStats - ${getErrorMessage(error)}`
        )
    }
}

export default {
    getAgentflowStats
}
