import { NextFunction, Request, Response } from 'express'
import { StatusCodes } from 'http-status-codes'
import { InternalChronosError } from '../../errors/internalChronosError'
import templatesService from '../../services/templates'

// Get all templates
const getAllTemplates = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const apiResponse = await templatesService.getAllTemplates()
        return res.json(apiResponse)
    } catch (error) {
        next(error)
    }
}

const deleteCustomTemplate = async (req: Request, res: Response, next: NextFunction) => {
    try {
        if (typeof req.params === 'undefined' || !req.params.id) {
            throw new InternalChronosError(
                StatusCodes.PRECONDITION_FAILED,
                `Error: templatesService.deleteCustomTemplate - id not provided!`
            )
        }
        const apiResponse = await templatesService.deleteCustomTemplate(req.params.id)
        return res.json(apiResponse)
    } catch (error) {
        next(error)
    }
}

const getAllCustomTemplates = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const apiResponse = await templatesService.getAllCustomTemplates()
        return res.json(apiResponse)
    } catch (error) {
        next(error)
    }
}

const saveCustomTemplate = async (req: Request, res: Response, next: NextFunction) => {
    try {
        if ((!req.body && !(req.body.agentflowId || req.body.tool)) || !req.body.name) {
            throw new InternalChronosError(
                StatusCodes.PRECONDITION_FAILED,
                `Error: templatesService.saveCustomTemplate - body not provided!`
            )
        }
        const body = req.body
        const apiResponse = await templatesService.saveCustomTemplate(body)
        return res.json(apiResponse)
    } catch (error) {
        next(error)
    }
}

export default {
    getAllTemplates,
    getAllCustomTemplates,
    saveCustomTemplate,
    deleteCustomTemplate
}
