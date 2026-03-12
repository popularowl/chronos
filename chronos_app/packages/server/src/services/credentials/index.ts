import { StatusCodes } from 'http-status-codes'
import { omit } from 'lodash'
import { ICredentialReturnResponse } from '../../Interface'
import { UserContext } from '../../Interface.Auth'
import { Credential } from '../../database/entities/Credential'
import { InternalChronosError } from '../../errors/internalChronosError'
import { getErrorMessage } from '../../errors/utils'
import { decryptCredentialData, transformToCredentialEntity } from '../../utils'
import { getRunningExpressApp } from '../../utils/getRunningExpressApp'

const createCredential = async (requestBody: any, userContext?: UserContext) => {
    try {
        const appServer = getRunningExpressApp()
        const newCredential = await transformToCredentialEntity(requestBody)

        if (requestBody.id) {
            newCredential.id = requestBody.id
        }
        if (userContext) {
            newCredential.userId = userContext.userId
        }

        const credential = await appServer.AppDataSource.getRepository(Credential).create(newCredential)
        const dbResponse = await appServer.AppDataSource.getRepository(Credential).save(credential)
        return dbResponse
    } catch (error) {
        throw new InternalChronosError(
            StatusCodes.INTERNAL_SERVER_ERROR,
            `Error: credentialsService.createCredential - ${getErrorMessage(error)}`
        )
    }
}

// Delete credential by id
const deleteCredentials = async (credentialId: string, userContext?: UserContext): Promise<any> => {
    try {
        const appServer = getRunningExpressApp()
        if (userContext && userContext.role !== 'admin') {
            const credential = await appServer.AppDataSource.getRepository(Credential).findOneBy({ id: credentialId })
            if (!credential) {
                throw new InternalChronosError(StatusCodes.NOT_FOUND, `Credential ${credentialId} not found`)
            }
            if (credential.userId !== userContext.userId) {
                throw new InternalChronosError(StatusCodes.FORBIDDEN, 'You do not have permission to delete this credential')
            }
        }
        const dbResponse = await appServer.AppDataSource.getRepository(Credential).delete({ id: credentialId })
        if (!dbResponse) {
            throw new InternalChronosError(StatusCodes.NOT_FOUND, `Credential ${credentialId} not found`)
        }
        return dbResponse
    } catch (error) {
        throw new InternalChronosError(
            StatusCodes.INTERNAL_SERVER_ERROR,
            `Error: credentialsService.deleteCredential - ${getErrorMessage(error)}`
        )
    }
}

const getAllCredentials = async (paramCredentialName: any, userContext?: UserContext) => {
    try {
        const appServer = getRunningExpressApp()
        const userFilter: any = userContext && userContext.role !== 'admin' ? { userId: userContext.userId } : {}
        let dbResponse: any[] = []
        if (paramCredentialName) {
            if (Array.isArray(paramCredentialName)) {
                for (let i = 0; i < paramCredentialName.length; i += 1) {
                    const name = paramCredentialName[i] as string
                    const searchOptions = {
                        credentialName: name,
                        ...userFilter
                    }
                    const credentials = await appServer.AppDataSource.getRepository(Credential).findBy(searchOptions)
                    dbResponse.push(...credentials)
                }
            } else {
                const searchOptions = {
                    credentialName: paramCredentialName,
                    ...userFilter
                }
                const credentials = await appServer.AppDataSource.getRepository(Credential).findBy(searchOptions)
                dbResponse = [...credentials]
            }
        } else {
            const credentials = await appServer.AppDataSource.getRepository(Credential).find({ where: userFilter })
            for (const credential of credentials) {
                dbResponse.push(omit(credential, ['encryptedData']))
            }
        }
        return dbResponse
    } catch (error) {
        throw new InternalChronosError(
            StatusCodes.INTERNAL_SERVER_ERROR,
            `Error: credentialsService.getAllCredentials - ${getErrorMessage(error)}`
        )
    }
}

const getCredentialById = async (credentialId: string, userContext?: UserContext): Promise<any> => {
    try {
        const appServer = getRunningExpressApp()
        const credential = await appServer.AppDataSource.getRepository(Credential).findOneBy({
            id: credentialId
        })
        if (!credential) {
            throw new InternalChronosError(StatusCodes.NOT_FOUND, `Credential ${credentialId} not found`)
        }
        if (userContext && userContext.role !== 'admin' && credential.userId !== userContext.userId) {
            throw new InternalChronosError(StatusCodes.FORBIDDEN, 'You do not have permission to access this credential')
        }
        // Decrypt credentialData
        const decryptedCredentialData = await decryptCredentialData(
            credential.encryptedData,
            credential.credentialName,
            appServer.nodesPool.componentCredentials
        )
        const returnCredential: ICredentialReturnResponse = {
            ...credential,
            plainDataObj: decryptedCredentialData
        }
        const dbResponse: any = omit(returnCredential, ['encryptedData'])
        return dbResponse
    } catch (error) {
        throw new InternalChronosError(
            StatusCodes.INTERNAL_SERVER_ERROR,
            `Error: credentialsService.createCredential - ${getErrorMessage(error)}`
        )
    }
}

const updateCredential = async (credentialId: string, requestBody: any, userContext?: UserContext): Promise<any> => {
    try {
        const appServer = getRunningExpressApp()
        const credential = await appServer.AppDataSource.getRepository(Credential).findOneBy({
            id: credentialId
        })
        if (!credential) {
            throw new InternalChronosError(StatusCodes.NOT_FOUND, `Credential ${credentialId} not found`)
        }
        if (userContext && userContext.role !== 'admin' && credential.userId !== userContext.userId) {
            throw new InternalChronosError(StatusCodes.FORBIDDEN, 'You do not have permission to update this credential')
        }
        const decryptedCredentialData = await decryptCredentialData(credential.encryptedData)
        requestBody.plainDataObj = { ...decryptedCredentialData, ...requestBody.plainDataObj }
        const updateCredential = await transformToCredentialEntity(requestBody)
        await appServer.AppDataSource.getRepository(Credential).merge(credential, updateCredential)
        const dbResponse = await appServer.AppDataSource.getRepository(Credential).save(credential)
        return dbResponse
    } catch (error) {
        throw new InternalChronosError(
            StatusCodes.INTERNAL_SERVER_ERROR,
            `Error: credentialsService.updateCredential - ${getErrorMessage(error)}`
        )
    }
}

export default {
    createCredential,
    deleteCredentials,
    getAllCredentials,
    getCredentialById,
    updateCredential
}
