import { Request } from 'express'
import { StatusCodes } from 'http-status-codes'
import { utilBuildChatflow } from '../../utils/buildAgentflow'
import { InternalChronosError } from '../../errors/internalChronosError'
import { getErrorMessage } from '../../errors/utils'

const buildChatflow = async (req: Request) => {
    try {
        const dbResponse = await utilBuildChatflow(req)
        return dbResponse
    } catch (error) {
        throw new InternalChronosError(
            StatusCodes.INTERNAL_SERVER_ERROR,
            `Error: predictionsServices.buildChatflow - ${getErrorMessage(error)}`
        )
    }
}

export default {
    buildChatflow
}
