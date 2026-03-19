import { Request, Response, NextFunction } from 'express'
import feedbackService from '../../services/feedback'
import { validateFeedbackForCreation, validateFeedbackForUpdate } from '../../services/feedback/validation'
import { InternalChronosError } from '../../errors/internalChronosError'
import { StatusCodes } from 'http-status-codes'

const getAllChatMessageFeedback = async (req: Request, res: Response, next: NextFunction) => {
    try {
        if (typeof req.params === 'undefined' || !req.params.id) {
            throw new InternalChronosError(
                StatusCodes.PRECONDITION_FAILED,
                `Error: feedbackController.getAllChatMessageFeedback - id not provided!`
            )
        }
        const agentflowid = req.params.id
        const chatId = req.query?.chatId as string | undefined
        const sortOrder = req.query?.order as string | undefined
        const startDate = req.query?.startDate as string | undefined
        const endDate = req.query?.endDate as string | undefined
        const apiResponse = await feedbackService.getAllChatMessageFeedback(agentflowid, chatId, sortOrder, startDate, endDate)
        return res.json(apiResponse)
    } catch (error) {
        next(error)
    }
}

const createChatMessageFeedbackForAgentflow = async (req: Request, res: Response, next: NextFunction) => {
    try {
        if (!req.body) {
            throw new InternalChronosError(
                StatusCodes.PRECONDITION_FAILED,
                `Error: feedbackController.createChatMessageFeedbackForAgentflow - body not provided!`
            )
        }
        await validateFeedbackForCreation(req.body)
        const apiResponse = await feedbackService.createChatMessageFeedbackForAgentflow(req.body)
        return res.json(apiResponse)
    } catch (error) {
        next(error)
    }
}

const updateChatMessageFeedbackForAgentflow = async (req: Request, res: Response, next: NextFunction) => {
    try {
        if (!req.body) {
            throw new InternalChronosError(
                StatusCodes.PRECONDITION_FAILED,
                `Error: feedbackController.updateChatMessageFeedbackForAgentflow - body not provided!`
            )
        }
        if (typeof req.params === 'undefined' || !req.params.id) {
            throw new InternalChronosError(
                StatusCodes.PRECONDITION_FAILED,
                `Error: feedbackController.updateChatMessageFeedbackForAgentflow - id not provided!`
            )
        }
        await validateFeedbackForUpdate(req.params.id, req.body)
        const apiResponse = await feedbackService.updateChatMessageFeedbackForAgentflow(req.params.id, req.body)
        return res.json(apiResponse)
    } catch (error) {
        next(error)
    }
}

export default {
    getAllChatMessageFeedback,
    createChatMessageFeedbackForAgentflow,
    updateChatMessageFeedbackForAgentflow
}
