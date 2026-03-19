import { Request, Response, NextFunction } from 'express'
import fs from 'fs'
import contentDisposition from 'content-disposition'
import { streamStorageFile } from 'chronos-components'
import { StatusCodes } from 'http-status-codes'
import { InternalChronosError } from '../../errors/internalChronosError'
import { getRunningExpressApp } from '../../utils/getRunningExpressApp'
import { AgentFlow } from '../../database/entities/AgentFlow'

const streamUploadedFile = async (req: Request, res: Response, next: NextFunction) => {
    try {
        if (!req.query.agentflowId || !req.query.chatId || !req.query.fileName) {
            return res.status(500).send(`Invalid file path`)
        }
        const agentflowId = req.query.agentflowId as string
        const chatId = req.query.chatId as string
        const fileName = req.query.fileName as string
        const download = req.query.download === 'true' // Check if download parameter is set

        const appServer = getRunningExpressApp()

        // Open source: No workspace/org lookup needed
        const agentflow = await appServer.AppDataSource.getRepository(AgentFlow).findOneBy({
            id: agentflowId
        })
        if (!agentflow) {
            throw new InternalChronosError(StatusCodes.NOT_FOUND, `Agentflow ${agentflowId} not found`)
        }
        const orgId = ''

        // Set Content-Disposition header - force attachment for download
        if (download) {
            res.setHeader('Content-Disposition', contentDisposition(fileName, { type: 'attachment' }))
        } else {
            res.setHeader('Content-Disposition', contentDisposition(fileName))
        }
        const fileStream = await streamStorageFile(agentflowId, chatId, fileName, orgId)

        if (!fileStream) throw new InternalChronosError(StatusCodes.INTERNAL_SERVER_ERROR, `Error: streamStorageFile`)

        if (fileStream instanceof fs.ReadStream && fileStream?.pipe) {
            fileStream.pipe(res)
        } else {
            res.send(fileStream)
        }
    } catch (error) {
        next(error)
    }
}

export default {
    streamUploadedFile
}
