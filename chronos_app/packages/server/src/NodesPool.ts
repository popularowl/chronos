import { IComponentNodes, IComponentCredentials } from './Interface'
import path from 'path'
import { Dirent } from 'fs'
import { getNodeModulesPackagePath } from './utils'
import { existsSync, promises } from 'fs'
import { ICommonObject } from 'chronos-components'
import logger from './utils/logger'
import { appConfig } from './AppConfig'

/**
 * Load the enabled providers allowlist.
 * Resolution order (highest priority first):
 *   1. ENABLED_PROVIDERS env var (comma-separated)
 *   2. PROVIDERS_CONFIG_LOCATION env var → file/URL
 *   3. providers.config.json next to the server package
 *   4. null (all providers enabled)
 */
export const loadEnabledProviders = (): string[] | null => {
    if (process.env.ENABLED_PROVIDERS) {
        return process.env.ENABLED_PROVIDERS.split(',')
            .map((s) => s.trim())
            .filter(Boolean)
    }

    const configPath = process.env.PROVIDERS_CONFIG_LOCATION || path.join(__dirname, '..', 'providers.config.json')

    if (existsSync(configPath)) {
        try {
            const raw = JSON.parse(require('fs').readFileSync(configPath, 'utf8'))
            if (raw.mode === 'allowlist' && Array.isArray(raw.providers)) {
                return raw.providers as string[]
            }
            logger.warn(`[server]: providers.config.json has unrecognised mode "${raw.mode}", allowing all providers`)
        } catch (err) {
            logger.error(`[server]: Failed to parse providers config at ${configPath}:`, err)
        }
    }

    return null
}

export class NodesPool {
    componentNodes: IComponentNodes = {}
    componentCredentials: IComponentCredentials = {}
    private credentialIconPath: ICommonObject = {}

    /**
     * Initialize to get all nodes & credentials
     */
    async initialize() {
        await this.initializeNodes()
        await this.initializeCredentials()
        this.validateProviderConfig()
    }

    /**
     * Warn about provider names in the allowlist that don't match any registered Chat Model node.
     */
    private validateProviderConfig() {
        const enabledProviders = loadEnabledProviders()
        if (!enabledProviders) return

        const registeredChatModels = Object.values(this.componentNodes)
            .filter((n) => n.category === 'Chat Models')
            .map((n) => n.name)

        for (const name of enabledProviders) {
            if (!registeredChatModels.includes(name)) {
                logger.warn(`[server]: Provider "${name}" in allowlist does not match any registered Chat Model node`)
            }
        }
    }

    /**
     * Initialize nodes
     */
    private async initializeNodes() {
        const disabled_nodes = process.env.DISABLED_NODES ? process.env.DISABLED_NODES.split(',') : []
        const enabled_providers = loadEnabledProviders()
        if (enabled_providers) {
            logger.info(`[server]: Provider allowlist active — ${enabled_providers.length} providers enabled`)
        }
        const packagePath = getNodeModulesPackagePath('chronos-components')
        const nodesPath = path.join(packagePath, 'dist', 'nodes')
        const nodeFiles = await this.getFiles(nodesPath)
        return Promise.all(
            nodeFiles.map(async (file) => {
                if (file.endsWith('.js')) {
                    try {
                        const nodeModule = await require(file)

                        if (nodeModule.nodeClass) {
                            const newNodeInstance = new nodeModule.nodeClass()
                            newNodeInstance.filePath = file

                            // Replace file icon with absolute path
                            if (
                                newNodeInstance.icon &&
                                (newNodeInstance.icon.endsWith('.svg') ||
                                    newNodeInstance.icon.endsWith('.png') ||
                                    newNodeInstance.icon.endsWith('.jpg'))
                            ) {
                                const filePath = file.replace(/\\/g, '/').split('/')
                                filePath.pop()
                                const nodeIconAbsolutePath = `${filePath.join('/')}/${newNodeInstance.icon}`
                                newNodeInstance.icon = nodeIconAbsolutePath

                                // Store icon path for componentCredentials
                                if (newNodeInstance.credential) {
                                    for (const credName of newNodeInstance.credential.credentialNames) {
                                        this.credentialIconPath[credName] = nodeIconAbsolutePath
                                    }
                                }
                            }

                            const skipCategories = ['Analytic', 'SpeechToText']
                            const conditionOne = !skipCategories.includes(newNodeInstance.category)

                            const isCommunityNodesAllowed = appConfig.showCommunityNodes
                            const isAuthorPresent = newNodeInstance.author
                            let conditionTwo = true
                            if (!isCommunityNodesAllowed && isAuthorPresent) conditionTwo = false

                            const isDisabled = disabled_nodes.includes(newNodeInstance.name)
                            const isChatModel = newNodeInstance.category === 'Chat Models'
                            const isAllowed = !enabled_providers || !isChatModel || enabled_providers.includes(newNodeInstance.name)

                            if (conditionOne && conditionTwo && !isDisabled && isAllowed) {
                                this.componentNodes[newNodeInstance.name] = newNodeInstance
                            }
                        }
                    } catch (err) {
                        logger.error(`❌ [server]: Error during initDatabase with file ${file}:`, err)
                    }
                }
            })
        )
    }

    /**
     * Initialize credentials
     */
    private async initializeCredentials() {
        const packagePath = getNodeModulesPackagePath('chronos-components')
        const nodesPath = path.join(packagePath, 'dist', 'credentials')
        const nodeFiles = await this.getFiles(nodesPath)
        return Promise.all(
            nodeFiles.map(async (file) => {
                if (file.endsWith('.credential.js')) {
                    const credentialModule = await require(file)
                    if (credentialModule.credClass) {
                        const newCredInstance = new credentialModule.credClass()
                        newCredInstance.icon = this.credentialIconPath[newCredInstance.name] ?? ''
                        this.componentCredentials[newCredInstance.name] = newCredInstance
                    }
                }
            })
        )
    }

    /**
     * Recursive function to get node files
     * @param {string} dir
     * @returns {string[]}
     */
    private async getFiles(dir: string): Promise<string[]> {
        const dirents = await promises.readdir(dir, { withFileTypes: true })
        const files = await Promise.all(
            dirents.map((dirent: Dirent) => {
                const res = path.resolve(dir, dirent.name)
                return dirent.isDirectory() ? this.getFiles(res) : res
            })
        )
        return Array.prototype.concat(...files)
    }
}
