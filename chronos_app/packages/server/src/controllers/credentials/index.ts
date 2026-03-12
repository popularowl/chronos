import { Request, Response, NextFunction } from 'express'
import credentialsService from '../../services/credentials'
import { InternalChronosError } from '../../errors/internalChronosError'
import { StatusCodes } from 'http-status-codes'
import { UserContext } from '../../Interface.Auth'

/**
 * Build a UserContext from the Express request.
 * @param req - Express request with userId/userRole set by auth middleware
 * @returns UserContext or undefined if no auth info present
 */
const getUserContext = (req: Request): UserContext | undefined => {
    if (!req.userId || !req.userRole) return undefined
    return { userId: req.userId, role: req.userRole }
}

const createCredential = async (req: Request, res: Response, next: NextFunction) => {
    try {
        if (!req.body) {
            throw new InternalChronosError(
                StatusCodes.PRECONDITION_FAILED,
                `Error: credentialsController.createCredential - body not provided!`
            )
        }
        const body = req.body
        const apiResponse = await credentialsService.createCredential(body, getUserContext(req))
        return res.json(apiResponse)
    } catch (error) {
        next(error)
    }
}

const deleteCredentials = async (req: Request, res: Response, next: NextFunction) => {
    try {
        if (typeof req.params === 'undefined' || !req.params.id) {
            throw new InternalChronosError(
                StatusCodes.PRECONDITION_FAILED,
                `Error: credentialsController.deleteCredentials - id not provided!`
            )
        }
        const apiResponse = await credentialsService.deleteCredentials(req.params.id, getUserContext(req))
        return res.json(apiResponse)
    } catch (error) {
        next(error)
    }
}

const getAllCredentials = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const apiResponse = await credentialsService.getAllCredentials(req.query.credentialName, getUserContext(req))
        return res.json(apiResponse)
    } catch (error) {
        next(error)
    }
}

const getCredentialById = async (req: Request, res: Response, next: NextFunction) => {
    try {
        if (typeof req.params === 'undefined' || !req.params.id) {
            throw new InternalChronosError(
                StatusCodes.PRECONDITION_FAILED,
                `Error: credentialsController.getCredentialById - id not provided!`
            )
        }
        const apiResponse = await credentialsService.getCredentialById(req.params.id, getUserContext(req))
        return res.json(apiResponse)
    } catch (error) {
        next(error)
    }
}

const updateCredential = async (req: Request, res: Response, next: NextFunction) => {
    try {
        if (typeof req.params === 'undefined' || !req.params.id) {
            throw new InternalChronosError(
                StatusCodes.PRECONDITION_FAILED,
                `Error: credentialsController.updateCredential - id not provided!`
            )
        }
        if (!req.body) {
            throw new InternalChronosError(
                StatusCodes.PRECONDITION_FAILED,
                `Error: credentialsController.updateCredential - body not provided!`
            )
        }
        const apiResponse = await credentialsService.updateCredential(req.params.id, req.body, getUserContext(req))
        return res.json(apiResponse)
    } catch (error) {
        next(error)
    }
}

export default {
    createCredential,
    deleteCredentials,
    getAllCredentials,
    getCredentialById,
    updateCredential
}
