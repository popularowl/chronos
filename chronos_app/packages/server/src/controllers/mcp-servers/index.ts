import { NextFunction, Request, Response } from 'express'
import { StatusCodes } from 'http-status-codes'
import { InternalChronosError } from '../../errors/internalChronosError'
import mcpServersService from '../../services/mcp-servers'
import mcpServerChangeLogService from '../../services/mcp-server-change-log'
import { getPageAndLimitParams } from '../../utils/pagination'

const createMCPServer = async (req: Request, res: Response, next: NextFunction) => {
    try {
        if (!req.body) {
            throw new InternalChronosError(
                StatusCodes.PRECONDITION_FAILED,
                `Error: mcpServersController.createMCPServer - body not provided!`
            )
        }
        const body = { ...req.body, userId: req.userId, userEmail: req.userEmail }
        const apiResponse = await mcpServersService.createMCPServer(body)
        return res.json(apiResponse)
    } catch (error) {
        next(error)
    }
}

const updateMCPServer = async (req: Request, res: Response, next: NextFunction) => {
    try {
        if (!req.params.id) {
            throw new InternalChronosError(
                StatusCodes.PRECONDITION_FAILED,
                `Error: mcpServersController.updateMCPServer - id not provided!`
            )
        }
        if (!req.body) {
            throw new InternalChronosError(
                StatusCodes.PRECONDITION_FAILED,
                `Error: mcpServersController.updateMCPServer - body not provided!`
            )
        }
        const body = { ...req.body, userId: req.userId, userEmail: req.userEmail }
        const apiResponse = await mcpServersService.updateMCPServer(req.params.id, body)
        return res.json(apiResponse)
    } catch (error) {
        next(error)
    }
}

const deleteMCPServer = async (req: Request, res: Response, next: NextFunction) => {
    try {
        if (!req.params.id) {
            throw new InternalChronosError(
                StatusCodes.PRECONDITION_FAILED,
                `Error: mcpServersController.deleteMCPServer - id not provided!`
            )
        }
        const apiResponse = await mcpServersService.deleteMCPServer(req.params.id, {
            userId: req.userId,
            userEmail: req.userEmail
        })
        return res.json(apiResponse)
    } catch (error) {
        next(error)
    }
}

const getAllMCPServers = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { page, limit } = getPageAndLimitParams(req)
        const filters = {
            transport: req.query.transport as string | undefined,
            status: req.query.status as string | undefined
        }
        const apiResponse = await mcpServersService.getAllMCPServers(page, limit, filters)
        return res.json(apiResponse)
    } catch (error) {
        next(error)
    }
}

const getMCPServerById = async (req: Request, res: Response, next: NextFunction) => {
    try {
        if (!req.params.id) {
            throw new InternalChronosError(
                StatusCodes.PRECONDITION_FAILED,
                `Error: mcpServersController.getMCPServerById - id not provided!`
            )
        }
        const apiResponse = await mcpServersService.getMCPServerById(req.params.id)
        return res.json(apiResponse)
    } catch (error) {
        next(error)
    }
}

const toggleMCPServer = async (req: Request, res: Response, next: NextFunction) => {
    try {
        if (!req.params.id) {
            throw new InternalChronosError(
                StatusCodes.PRECONDITION_FAILED,
                `Error: mcpServersController.toggleMCPServer - id not provided!`
            )
        }
        if (typeof req.body.enabled !== 'boolean') {
            throw new InternalChronosError(
                StatusCodes.PRECONDITION_FAILED,
                `Error: mcpServersController.toggleMCPServer - enabled (boolean) not provided!`
            )
        }
        const apiResponse = await mcpServersService.toggleMCPServer(req.params.id, req.body.enabled, {
            userId: req.userId,
            userEmail: req.userEmail
        })
        return res.json(apiResponse)
    } catch (error) {
        next(error)
    }
}

const testMCPServerConnection = async (req: Request, res: Response, next: NextFunction) => {
    try {
        if (!req.params.id) {
            throw new InternalChronosError(
                StatusCodes.PRECONDITION_FAILED,
                `Error: mcpServersController.testMCPServerConnection - id not provided!`
            )
        }
        const apiResponse = await mcpServersService.testMCPServerConnection(req.params.id)
        return res.json(apiResponse)
    } catch (error) {
        next(error)
    }
}

const listMCPServerTools = async (req: Request, res: Response, next: NextFunction) => {
    try {
        if (!req.params.id) {
            throw new InternalChronosError(
                StatusCodes.PRECONDITION_FAILED,
                `Error: mcpServersController.listMCPServerTools - id not provided!`
            )
        }
        const tools = await mcpServersService.listMCPServerTools(req.params.id)
        return res.json({ tools })
    } catch (error) {
        next(error)
    }
}

const previewMCPServerTools = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const tools = await mcpServersService.previewMCPServerTools(req.body)
        return res.json({ tools })
    } catch (error) {
        next(error)
    }
}

/**
 * Returns the change-history rows for one MCP server, newest-first. Paginated
 * via the standard `page` / `limit` query params. Feeds the **History** tab
 * on `MCPServerDetail` (v1.8.0 Group A — UI slice A2).
 *
 * Wraps the service response in the `{ rows, total, page, limit }` envelope
 * used by `listToolInvocations` so the UI tab can mirror the Recent
 * Invocations data flow exactly.
 */
const getMCPServerChangeLog = async (req: Request, res: Response, next: NextFunction) => {
    try {
        if (!req.params.id) {
            throw new InternalChronosError(
                StatusCodes.PRECONDITION_FAILED,
                `Error: mcpServersController.getMCPServerChangeLog - id not provided!`
            )
        }
        const { page, limit } = getPageAndLimitParams(req)
        const result = await mcpServerChangeLogService.listForServer(req.params.id, { page, limit })
        if (Array.isArray(result)) return res.json({ rows: result })
        return res.json({ rows: result.data, total: result.total, page, limit })
    } catch (error) {
        next(error)
    }
}

export default {
    createMCPServer,
    updateMCPServer,
    deleteMCPServer,
    getAllMCPServers,
    getMCPServerById,
    toggleMCPServer,
    testMCPServerConnection,
    listMCPServerTools,
    previewMCPServerTools,
    getMCPServerChangeLog
}
