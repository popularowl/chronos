import path from 'path'
import * as fs from 'fs'
import { StatusCodes } from 'http-status-codes'
import { InternalChronosError } from '../../errors/internalChronosError'
import { getErrorMessage } from '../../errors/utils'

const getVersion = async () => {
    try {
        const getPackageJsonPath = (): string => {
            const checkPaths = [
                path.join(__dirname, '..', 'package.json'),
                path.join(__dirname, '..', '..', 'package.json'),
                path.join(__dirname, '..', '..', '..', 'package.json'),
                path.join(__dirname, '..', '..', '..', '..', 'package.json'),
                path.join(__dirname, '..', '..', '..', '..', '..', 'package.json')
            ]
            // Return the topmost (root) package.json found
            let found = ''
            for (const checkPath of checkPaths) {
                if (fs.existsSync(checkPath)) {
                    found = checkPath
                }
            }
            return found
        }
        const packagejsonPath = getPackageJsonPath()
        if (!packagejsonPath) {
            throw new InternalChronosError(StatusCodes.NOT_FOUND, `Version not found`)
        }
        try {
            const content = await fs.promises.readFile(packagejsonPath, 'utf8')
            const parsedContent = JSON.parse(content)
            return {
                version: parsedContent.version,
                releaseDate: parsedContent.releaseDate || null
            }
        } catch (error) {
            throw new InternalChronosError(StatusCodes.NOT_FOUND, `Version not found- ${getErrorMessage(error)}`)
        }
    } catch (error) {
        throw new InternalChronosError(StatusCodes.INTERNAL_SERVER_ERROR, `Error: versionService.getVersion - ${getErrorMessage(error)}`)
    }
}

export default {
    getVersion
}
