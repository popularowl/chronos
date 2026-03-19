import { Request, Response, NextFunction } from 'express'
import leadsService from '../../services/leads'
import { StatusCodes } from 'http-status-codes'
import { InternalChronosError } from '../../errors/internalChronosError'

const getAllLeadsForAgentflow = async (req: Request, res: Response, next: NextFunction) => {
    try {
        if (typeof req.params.id === 'undefined' || req.params.id === '') {
            throw new InternalChronosError(
                StatusCodes.PRECONDITION_FAILED,
                `Error: leadsController.getAllLeadsForAgentflow - id not provided!`
            )
        }
        const agentflowid = req.params.id
        const apiResponse = await leadsService.getAllLeads(agentflowid)
        return res.json(apiResponse)
    } catch (error) {
        next(error)
    }
}

const createLeadInAgentflow = async (req: Request, res: Response, next: NextFunction) => {
    try {
        if (typeof req.body === 'undefined' || req.body === '') {
            throw new InternalChronosError(
                StatusCodes.PRECONDITION_FAILED,
                `Error: leadsController.createLeadInAgentflow - body not provided!`
            )
        }
        const apiResponse = await leadsService.createLead(req.body)
        return res.json(apiResponse)
    } catch (error) {
        next(error)
    }
}

export default {
    createLeadInAgentflow,
    getAllLeadsForAgentflow
}
