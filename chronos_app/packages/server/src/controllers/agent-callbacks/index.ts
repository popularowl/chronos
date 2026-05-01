import { NextFunction, Request, Response } from 'express'
import { StatusCodes } from 'http-status-codes'
import { InternalChronosError } from '../../errors/internalChronosError'
import { getRunningExpressApp } from '../../utils/getRunningExpressApp'

const requireAgent = (req: Request) => {
    const agent = req.callbackAgent
    if (!agent) {
        throw new InternalChronosError(StatusCodes.UNAUTHORIZED, 'Callback agent not attached to request')
    }
    return agent
}

const requireGateway = () => {
    const app = getRunningExpressApp()
    if (!app.mcpGateway) {
        throw new InternalChronosError(
            StatusCodes.SERVICE_UNAVAILABLE,
            'MCP gateway is not enabled. Set ENABLE_MCP_SERVERS=true to enable it.'
        )
    }
    return app.mcpGateway
}

const invokeTool = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const agent = requireAgent(req)
        const { tool, params, callId } = req.body ?? {}
        if (!tool || typeof tool !== 'string') {
            throw new InternalChronosError(StatusCodes.BAD_REQUEST, 'tool (string) is required in request body')
        }

        const gateway = requireGateway()
        const result = await gateway.invoke(agent, tool, params, { callId: typeof callId === 'string' ? callId : undefined })
        return res.json({ success: true, result })
    } catch (error) {
        next(error)
    }
}

const listTools = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const agent = requireAgent(req)
        const gateway = requireGateway()
        const tools = await gateway.listAllowedTools(agent)
        return res.json({ tools })
    } catch (error) {
        next(error)
    }
}

export default {
    invokeTool,
    listTools
}
