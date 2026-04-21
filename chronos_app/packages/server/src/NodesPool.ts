import { IComponentNodes, IComponentCredentials } from './Interface'
import path from 'path'
import { Dirent } from 'fs'
import { getNodeModulesPackagePath } from './utils'
import { existsSync, promises } from 'fs'
import { ICommonObject } from 'chronos-components'
import logger from './utils/logger'
import { appConfig } from './AppConfig'

/** Category allowlist: maps category name → node name array, or "*" for all nodes in that category */
export type NodesConfig = Record<string, string[] | '*'>

/**
 * Load the nodes allowlist configuration.
 * Resolution order (highest priority first):
 *   1. PROVIDERS_CONFIG_LOCATION env var → file path
 *   2. providers.config.json next to the server package
 *   3. null (all nodes enabled — backward compatible)
 *
 * Config format:
 *   { "mode": "allowlist", "categories": { "Chat Models": ["chatOpenAI"], "Tools": "*" } }
 *   - "*" means all nodes in that category are enabled
 *   - An array lists specific node names to enable
 *   - Categories not listed are disabled
 */
export const loadNodesConfig = (): NodesConfig | null => {
    const configPath = process.env.PROVIDERS_CONFIG_LOCATION || path.join(__dirname, '..', 'providers.config.json')

    if (existsSync(configPath)) {
        try {
            const raw = JSON.parse(require('fs').readFileSync(configPath, 'utf8'))
            if (raw.mode === 'allowlist' && raw.categories && typeof raw.categories === 'object') {
                return raw.categories as NodesConfig
            }
            logger.warn(`[server]: providers.config.json has unrecognised mode or missing categories, allowing all nodes`)
        } catch (err) {
            logger.error(`[server]: Failed to parse providers config at ${configPath}:`, err)
        }
    }

    return null
}

/**
 * Check whether a node is allowed by the config.
 * @param config - The loaded nodes config (null = everything allowed)
 * @param category - The node's category
 * @param name - The node's name
 */
const isNodeAllowed = (config: NodesConfig | null, category: string, name: string): boolean => {
    if (!config) return true

    const categoryRule = config[category]
    if (categoryRule === undefined) return false // category not listed → disabled
    if (categoryRule === '*') return true // wildcard → all nodes in category
    return categoryRule.includes(name) // specific allowlist
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
        this.validateNodesConfig()
    }

    /**
     * Warn about node names in the allowlist that don't match any registered node in their category.
     */
    private validateNodesConfig() {
        const config = loadNodesConfig()
        if (!config) return

        for (const [category, rule] of Object.entries(config)) {
            if (rule === '*') continue

            const registeredInCategory = Object.values(this.componentNodes)
                .filter((n) => n.category === category)
                .map((n) => n.name)

            for (const name of rule) {
                if (!registeredInCategory.includes(name)) {
                    logger.warn(`[server]: Node "${name}" in category "${category}" allowlist does not match any registered node`)
                }
            }
        }
    }

    /**
     * Initialize nodes
     */
    private async initializeNodes() {
        const disabled_nodes = process.env.DISABLED_NODES ? process.env.DISABLED_NODES.split(',') : []
        const nodesConfig = loadNodesConfig()
        if (nodesConfig) {
            const categoryCount = Object.keys(nodesConfig).length
            logger.info(`[server]: Nodes allowlist active — ${categoryCount} categories enabled`)
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
                            const isAllowed = isNodeAllowed(nodesConfig, newNodeInstance.category, newNodeInstance.name)

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
