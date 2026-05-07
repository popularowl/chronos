import { InternalChronosError } from '../errors/internalChronosError'
import { StatusCodes } from 'http-status-codes'
import { Request } from 'express'

type Pagination = {
    page: number
    limit: number
}

export const getPageAndLimitParams = (req: Request): Pagination => {
    // -1 is the internal sentinel for "no pagination" — accepted on the wire so
    // clients can opt out symmetrically instead of having to omit the params.
    let page = -1
    let limit = -1
    if (req.query.page) {
        page = parseInt(req.query.page as string)
        if (page < -1) {
            throw new InternalChronosError(StatusCodes.PRECONDITION_FAILED, `Error: page cannot be negative!`)
        }
    }
    if (req.query.limit) {
        limit = parseInt(req.query.limit as string)
        if (limit < -1) {
            throw new InternalChronosError(StatusCodes.PRECONDITION_FAILED, `Error: limit cannot be negative!`)
        }
    }
    return { page, limit }
}
