import { Request, Response, NextFunction } from 'express'
import { StatusCodes } from 'http-status-codes'
import { InternalChronosError } from '../../errors/internalChronosError'
import mcpServersService from '../../services/mcp-servers'

const getAllMCPServers = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const page = req.query.page ? parseInt(req.query.page as string) : -1
        const limit = req.query.limit ? parseInt(req.query.limit as string) : -1
        const filters = {
            transport: req.query.transport as string | undefined,
            status: req.query.status as string | undefined
        }
        const data = await mcpServersService.getAllMCPServers(page, limit, filters)
        return res.json({ success: true, data })
    } catch (error) {
        next(error)
    }
}

const getMCPServerById = async (req: Request, res: Response, next: NextFunction) => {
    try {
        if (!req.params.id) {
            throw new InternalChronosError(StatusCodes.BAD_REQUEST, 'MCP server id is required')
        }
        const data = await mcpServersService.getMCPServerById(req.params.id)
        return res.json({ success: true, data })
    } catch (error) {
        next(error)
    }
}

const createMCPServer = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const data = await mcpServersService.createMCPServer(req.body)
        return res.status(StatusCodes.CREATED).json({ success: true, data })
    } catch (error) {
        next(error)
    }
}

const updateMCPServer = async (req: Request, res: Response, next: NextFunction) => {
    try {
        if (!req.params.id) {
            throw new InternalChronosError(StatusCodes.BAD_REQUEST, 'MCP server id is required')
        }
        const data = await mcpServersService.updateMCPServer(req.params.id, req.body)
        return res.json({ success: true, data })
    } catch (error) {
        next(error)
    }
}

const deleteMCPServer = async (req: Request, res: Response, next: NextFunction) => {
    try {
        if (!req.params.id) {
            throw new InternalChronosError(StatusCodes.BAD_REQUEST, 'MCP server id is required')
        }
        const data = await mcpServersService.deleteMCPServer(req.params.id)
        return res.json({ success: true, data })
    } catch (error) {
        next(error)
    }
}

const toggleMCPServer = async (req: Request, res: Response, next: NextFunction) => {
    try {
        if (!req.params.id) {
            throw new InternalChronosError(StatusCodes.BAD_REQUEST, 'MCP server id is required')
        }
        if (typeof req.body.enabled !== 'boolean') {
            throw new InternalChronosError(StatusCodes.BAD_REQUEST, 'enabled (boolean) is required')
        }
        const data = await mcpServersService.toggleMCPServer(req.params.id, req.body.enabled)
        return res.json({ success: true, data })
    } catch (error) {
        next(error)
    }
}

const testMCPServerConnection = async (req: Request, res: Response, next: NextFunction) => {
    try {
        if (!req.params.id) {
            throw new InternalChronosError(StatusCodes.BAD_REQUEST, 'MCP server id is required')
        }
        const data = await mcpServersService.testMCPServerConnection(req.params.id)
        return res.json({ success: true, data })
    } catch (error) {
        next(error)
    }
}

const listMCPServerTools = async (req: Request, res: Response, next: NextFunction) => {
    try {
        if (!req.params.id) {
            throw new InternalChronosError(StatusCodes.BAD_REQUEST, 'MCP server id is required')
        }
        const tools = await mcpServersService.listMCPServerTools(req.params.id)
        return res.json({ success: true, data: { tools } })
    } catch (error) {
        next(error)
    }
}

const previewMCPServerTools = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const tools = await mcpServersService.previewMCPServerTools(req.body)
        return res.json({ success: true, data: { tools } })
    } catch (error) {
        next(error)
    }
}

export default {
    getAllMCPServers,
    getMCPServerById,
    createMCPServer,
    updateMCPServer,
    deleteMCPServer,
    toggleMCPServer,
    testMCPServerConnection,
    listMCPServerTools,
    previewMCPServerTools
}
