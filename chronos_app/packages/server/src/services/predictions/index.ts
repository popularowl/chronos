import { Request } from 'express'
import { StatusCodes } from 'http-status-codes'
import { utilBuildAgentflow } from '../../utils/buildAgentflow'
import { InternalChronosError } from '../../errors/internalChronosError'
import { getErrorMessage } from '../../errors/utils'

const buildAgentflow = async (req: Request) => {
    try {
        const dbResponse = await utilBuildAgentflow(req)
        return dbResponse
    } catch (error) {
        throw new InternalChronosError(
            StatusCodes.INTERNAL_SERVER_ERROR,
            `Error: predictionsServices.buildAgentflow - ${getErrorMessage(error)}`
        )
    }
}

export default {
    buildAgentflow
}
