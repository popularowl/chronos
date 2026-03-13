import { NextFunction, Request, Response } from 'express'
import { StatusCodes } from 'http-status-codes'
import { InternalChronosError } from '../../errors/internalChronosError'
import skillsService from '../../services/skills'
import { getPageAndLimitParams } from '../../utils/pagination'

/**
 * Create a new skill
 */
const createSkill = async (req: Request, res: Response, next: NextFunction) => {
    try {
        if (!req.body) {
            throw new InternalChronosError(StatusCodes.PRECONDITION_FAILED, `Error: skillsController.createSkill - body not provided!`)
        }
        const orgId = ''
        const body = req.body
        const apiResponse = await skillsService.createSkill(body, orgId)
        return res.json(apiResponse)
    } catch (error) {
        next(error)
    }
}

/**
 * Delete a skill by ID
 */
const deleteSkill = async (req: Request, res: Response, next: NextFunction) => {
    try {
        if (typeof req.params === 'undefined' || !req.params.id) {
            throw new InternalChronosError(StatusCodes.PRECONDITION_FAILED, `Error: skillsController.deleteSkill - id not provided!`)
        }
        const apiResponse = await skillsService.deleteSkill(req.params.id)
        return res.json(apiResponse)
    } catch (error) {
        next(error)
    }
}

/**
 * Get all skills with optional pagination
 */
const getAllSkills = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { page, limit } = getPageAndLimitParams(req)
        const apiResponse = await skillsService.getAllSkills(page, limit)
        return res.json(apiResponse)
    } catch (error) {
        next(error)
    }
}

/**
 * Get a single skill by ID
 */
const getSkillById = async (req: Request, res: Response, next: NextFunction) => {
    try {
        if (typeof req.params === 'undefined' || !req.params.id) {
            throw new InternalChronosError(StatusCodes.PRECONDITION_FAILED, `Error: skillsController.getSkillById - id not provided!`)
        }
        const apiResponse = await skillsService.getSkillById(req.params.id)
        return res.json(apiResponse)
    } catch (error) {
        next(error)
    }
}

/**
 * Update an existing skill
 */
const updateSkill = async (req: Request, res: Response, next: NextFunction) => {
    try {
        if (typeof req.params === 'undefined' || !req.params.id) {
            throw new InternalChronosError(StatusCodes.PRECONDITION_FAILED, `Error: skillsController.updateSkill - id not provided!`)
        }
        if (!req.body) {
            throw new InternalChronosError(StatusCodes.PRECONDITION_FAILED, `Error: skillsController.updateSkill - body not provided!`)
        }
        const apiResponse = await skillsService.updateSkill(req.params.id, req.body)
        return res.json(apiResponse)
    } catch (error) {
        next(error)
    }
}

export default {
    createSkill,
    deleteSkill,
    getAllSkills,
    getSkillById,
    updateSkill
}
