import { Request } from 'express'
import * as path from 'path'
import {
    addArrayFilesToStorage,
    getFileFromUpload,
    IDocument,
    mapExtToInputField,
    mapMimeTypeToInputField,
    removeSpecificFileFromUpload,
    removeSpecificFileFromStorage,
    isValidUUID,
    isPathTraversal
} from 'chronos-components'
import { getRunningExpressApp } from './getRunningExpressApp'
import { validateFileMimeTypeAndExtensionMatch } from './fileValidation'
import logger from './logger'
import { getErrorMessage } from '../errors/utils'
import { checkStorage, updateStorageUsage } from './quotaUsage'
import { AgentFlow } from '../database/entities/AgentFlow'
import { InternalChronosError } from '../errors/internalChronosError'
import { StatusCodes } from 'http-status-codes'

/**
 * Create attachment
 * @param {Request} req
 */
export const createFileAttachment = async (req: Request) => {
    const appServer = getRunningExpressApp()

    const agentflowid = req.params.agentflowId
    const chatId = req.params.chatId

    if (!agentflowid || !isValidUUID(agentflowid)) {
        throw new InternalChronosError(StatusCodes.BAD_REQUEST, 'Invalid agentflowId format - must be a valid UUID')
    }
    if (isPathTraversal(agentflowid) || (chatId && isPathTraversal(chatId))) {
        throw new InternalChronosError(StatusCodes.BAD_REQUEST, 'Invalid path characters detected')
    }

    // Validate agentflow exists and check API key
    const agentflow = await appServer.AppDataSource.getRepository(AgentFlow).findOneBy({
        id: agentflowid
    })
    if (!agentflow) {
        throw new InternalChronosError(StatusCodes.NOT_FOUND, `Agentflow ${agentflowid} not found`)
    }

    // Open source: No workspace/organization needed
    const orgId = ''
    const workspaceId = ''
    const subscriptionId = ''

    // Parse chatbot configuration to get file upload settings
    let pdfConfig = {
        usage: 'perPage',
        legacyBuild: false
    }
    let allowedFileTypes: string[] = []
    let fileUploadEnabled = false

    if (agentflow.chatbotConfig) {
        try {
            const chatbotConfig = JSON.parse(agentflow.chatbotConfig)
            if (chatbotConfig?.fullFileUpload) {
                fileUploadEnabled = chatbotConfig.fullFileUpload.status

                // Get allowed file types from configuration
                if (chatbotConfig.fullFileUpload.allowedUploadFileTypes) {
                    allowedFileTypes = chatbotConfig.fullFileUpload.allowedUploadFileTypes.split(',')
                }

                // PDF specific configuration
                if (chatbotConfig.fullFileUpload.pdfFile) {
                    if (chatbotConfig.fullFileUpload.pdfFile.usage) {
                        pdfConfig.usage = chatbotConfig.fullFileUpload.pdfFile.usage
                    }
                    if (chatbotConfig.fullFileUpload.pdfFile.legacyBuild !== undefined) {
                        pdfConfig.legacyBuild = chatbotConfig.fullFileUpload.pdfFile.legacyBuild
                    }
                }
            }
        } catch (e) {
            // Use default config if parsing fails
        }
    }

    // Check if file upload is enabled
    if (!fileUploadEnabled) {
        throw new InternalChronosError(StatusCodes.BAD_REQUEST, 'File upload is not enabled for this agentflow')
    }

    // Find FileLoader node
    const fileLoaderComponent = appServer.nodesPool.componentNodes['fileLoader']
    const fileLoaderNodeInstanceFilePath = fileLoaderComponent.filePath as string
    const fileLoaderNodeModule = await import(fileLoaderNodeInstanceFilePath)
    const fileLoaderNodeInstance = new fileLoaderNodeModule.nodeClass()
    const options = {
        retrieveAttachmentChatId: true,
        orgId,
        workspaceId,
        agentflowid,
        chatId
    }
    const files = (req.files as Express.Multer.File[]) || []
    const fileAttachments = []
    if (files.length) {
        const isBase64 = req.body.base64
        for (const file of files) {
            if (!allowedFileTypes.length) {
                throw new InternalChronosError(
                    StatusCodes.BAD_REQUEST,
                    `File type '${file.mimetype}' is not allowed. Allowed types: ${allowedFileTypes.join(', ')}`
                )
            }

            // Validate file type against allowed types
            if (allowedFileTypes.length > 0 && !allowedFileTypes.includes(file.mimetype)) {
                throw new InternalChronosError(
                    StatusCodes.BAD_REQUEST,
                    `File type '${file.mimetype}' is not allowed. Allowed types: ${allowedFileTypes.join(', ')}`
                )
            }

            // Security fix: Verify file extension matches the declared MIME type
            // This prevents MIME type spoofing attacks (e.g., uploading .js file with text/plain MIME type)
            // This addresses the vulnerability (CVE-2025-61687)
            validateFileMimeTypeAndExtensionMatch(file.originalname, file.mimetype)

            await checkStorage(orgId, subscriptionId, appServer.usageCacheManager)

            const fileBuffer = await getFileFromUpload(file.path ?? file.key)
            const fileNames: string[] = []
            // Address file name with special characters: https://github.com/expressjs/multer/issues/1104
            file.originalname = Buffer.from(file.originalname, 'latin1').toString('utf8')
            const { path: storagePath, totalSize } = await addArrayFilesToStorage(
                file.mimetype,
                fileBuffer,
                file.originalname,
                fileNames,
                orgId,
                agentflowid,
                chatId
            )
            await updateStorageUsage(orgId, workspaceId, totalSize, appServer.usageCacheManager)

            const fileInputFieldFromMimeType = mapMimeTypeToInputField(file.mimetype)

            const fileExtension = path.extname(file.originalname)

            const fileInputFieldFromExt = mapExtToInputField(fileExtension)

            let fileInputField = 'txtFile'

            if (fileInputFieldFromExt !== 'txtFile') {
                fileInputField = fileInputFieldFromExt
            } else if (fileInputFieldFromMimeType !== 'txtFile') {
                fileInputField = fileInputFieldFromExt
            }

            await removeSpecificFileFromUpload(file.path ?? file.key)

            // Track sanitized filename for cleanup if processing fails
            const sanitizedFilename = fileNames.length > 0 ? fileNames[0] : undefined

            try {
                const nodeData = {
                    inputs: {
                        [fileInputField]: storagePath
                    },
                    outputs: { output: 'document' }
                }

                // Apply PDF specific configuration if this is a PDF file
                if (fileInputField === 'pdfFile') {
                    nodeData.inputs.usage = pdfConfig.usage
                    nodeData.inputs.legacyBuild = pdfConfig.legacyBuild as unknown as string
                }

                let content = ''

                if (isBase64) {
                    content = fileBuffer.toString('base64')
                } else {
                    const documents: IDocument[] = await fileLoaderNodeInstance.init(nodeData, '', options)
                    content = documents.map((doc) => doc.pageContent).join('\n')
                }

                fileAttachments.push({
                    name: file.originalname,
                    mimeType: file.mimetype,
                    size: file.size,
                    content
                })
            } catch (error) {
                // Security: Clean up storage if processing failed, which includes invalid file type or content detacted from loader
                if (sanitizedFilename) {
                    logger.info(`Clean up storage for ${file.originalname} (${sanitizedFilename}). Reason: ${getErrorMessage(error)}`)
                    try {
                        const { totalSize: newTotalSize } = await removeSpecificFileFromStorage(
                            orgId,
                            agentflowid,
                            chatId,
                            sanitizedFilename
                        )
                        await updateStorageUsage(orgId, workspaceId, newTotalSize, appServer.usageCacheManager)
                    } catch (cleanupError) {
                        logger.error(
                            `Failed to cleanup storage for ${file.originalname} (${sanitizedFilename}) - ${getErrorMessage(cleanupError)}`
                        )
                    }
                }
                throw new Error(`Failed createFileAttachment: ${file.originalname} (${file.mimetype} - ${getErrorMessage(error)}`)
            }
        }
    }

    return fileAttachments
}
