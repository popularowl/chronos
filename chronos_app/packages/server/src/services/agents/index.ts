import crypto from 'crypto'
import { StatusCodes } from 'http-status-codes'
import { Agent } from '../../database/entities/Agent'
import { AgentFlow } from '../../database/entities/AgentFlow'
import { InternalChronosError } from '../../errors/internalChronosError'
import { getErrorMessage } from '../../errors/utils'
import { getRunningExpressApp } from '../../utils/getRunningExpressApp'
import { AgentRuntimeType, AgentStatus } from '../../Interface'

const DEFAULT_HTTP_TIMEOUT_MS = 60000

const isAgentsEnabled = (): boolean => process.env.ENABLE_AGENTS === 'true'

const assertAgentsEnabled = (): void => {
    if (!isAgentsEnabled()) {
        throw new InternalChronosError(StatusCodes.SERVICE_UNAVAILABLE, 'Agents are not enabled. Set ENABLE_AGENTS=true to enable them.')
    }
}

const generateCallbackToken = (): string => crypto.randomBytes(32).toString('hex')

/**
 * Validates a URL is HTTP/HTTPS and rejects loopback / RFC1918 / link-local
 * targets unless `ALLOW_LOOPBACK_AGENTS=true` is set. Closes a small SSRF
 * surface — Chronos issues callback tokens, so a misconfigured agent
 * pointing at an internal address could probe the local network.
 */
const validateOutboundUrl = (raw: string, fieldName: string): void => {
    let parsed: URL
    try {
        parsed = new URL(raw)
    } catch {
        throw new InternalChronosError(StatusCodes.BAD_REQUEST, `${fieldName} must be a valid HTTP or HTTPS URL`)
    }
    if (!['http:', 'https:'].includes(parsed.protocol)) {
        throw new InternalChronosError(StatusCodes.BAD_REQUEST, `${fieldName} must use http or https`)
    }

    if (process.env.ALLOW_LOOPBACK_AGENTS === 'true') return

    const host = parsed.hostname.toLowerCase()
    if (
        host === 'localhost' ||
        host.endsWith('.localhost') ||
        host.endsWith('.local') ||
        host === '0.0.0.0' ||
        host === '::' ||
        host === '::1' ||
        host.startsWith('127.') ||
        host.startsWith('10.') ||
        host.startsWith('192.168.') ||
        host.startsWith('169.254.') ||
        /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(host) ||
        /^fe80:/i.test(host) ||
        /^fc[0-9a-f]{2}:/i.test(host) ||
        /^fd[0-9a-f]{2}:/i.test(host)
    ) {
        throw new InternalChronosError(
            StatusCodes.BAD_REQUEST,
            `${fieldName} cannot point at loopback or private addresses. Set ALLOW_LOOPBACK_AGENTS=true for local development.`
        )
    }
}

const slugifyName = (name: string, idHint?: string): string => {
    const base =
        (name || 'agent')
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '')
            .slice(0, 60) || 'agent'
    if (!idHint) return base
    const suffix = idHint.replace(/-/g, '').slice(0, 8)
    return `${base}-${suffix}`
}

const ensureUniqueSlug = async (slug: string, excludeId?: string): Promise<string> => {
    const appServer = getRunningExpressApp()
    const repo = appServer.AppDataSource.getRepository(Agent)
    let candidate = slug
    for (let n = 1; n <= 1000; n++) {
        const existing = await repo.findOneBy({ slug: candidate })
        if (!existing || existing.id === excludeId) return candidate
        candidate = `${slug}-${n}`
    }
    throw new InternalChronosError(StatusCodes.CONFLICT, `Could not find a unique slug after 1000 attempts (base: ${slug})`)
}

const createAgent = async (requestBody: any): Promise<Agent> => {
    try {
        assertAgentsEnabled()
        const appServer = getRunningExpressApp()

        if (!requestBody.name) {
            throw new InternalChronosError(StatusCodes.BAD_REQUEST, 'name is required')
        }

        const runtimeType = (requestBody.runtimeType as AgentRuntimeType) || AgentRuntimeType.HTTP
        if (!Object.values(AgentRuntimeType).includes(runtimeType)) {
            throw new InternalChronosError(
                StatusCodes.BAD_REQUEST,
                `Invalid runtimeType. Allowed: ${Object.values(AgentRuntimeType).join(', ')}`
            )
        }

        let runtimeConfig: any = requestBody.runtimeConfig
            ? typeof requestBody.runtimeConfig === 'string'
                ? JSON.parse(requestBody.runtimeConfig)
                : requestBody.runtimeConfig
            : {}

        if (runtimeType === AgentRuntimeType.HTTP) {
            if (!requestBody.serviceEndpoint) {
                throw new InternalChronosError(StatusCodes.BAD_REQUEST, 'serviceEndpoint is required for HTTP runtime')
            }
            validateOutboundUrl(requestBody.serviceEndpoint, 'serviceEndpoint')
            if (runtimeConfig.healthEndpoint) {
                validateOutboundUrl(runtimeConfig.healthEndpoint, 'runtimeConfig.healthEndpoint')
            }
            runtimeConfig.timeoutMs = runtimeConfig.timeoutMs ?? DEFAULT_HTTP_TIMEOUT_MS
        } else if (runtimeType === AgentRuntimeType.BUILT_IN) {
            if (!requestBody.builtinAgentflowId) {
                throw new InternalChronosError(StatusCodes.BAD_REQUEST, 'builtinAgentflowId is required for BUILT_IN runtime')
            }
            const agentflow = await appServer.AppDataSource.getRepository(AgentFlow).findOneBy({ id: requestBody.builtinAgentflowId })
            if (!agentflow) {
                throw new InternalChronosError(StatusCodes.NOT_FOUND, `AgentFlow ${requestBody.builtinAgentflowId} not found`)
            }
        }

        const requestedSlug = requestBody.slug ? slugifyName(requestBody.slug) : slugifyName(requestBody.name)
        const slug = await ensureUniqueSlug(requestedSlug)

        const newAgent = new Agent()
        newAgent.name = requestBody.name
        newAgent.slug = slug
        newAgent.description = requestBody.description ?? undefined
        newAgent.version = requestBody.version || '1.0.0'
        newAgent.protocolVersion = requestBody.protocolVersion ?? undefined
        newAgent.iconUrl = requestBody.iconUrl ?? undefined
        newAgent.provider = stringifyJsonField(requestBody.provider)
        newAgent.documentationUrl = requestBody.documentationUrl ?? undefined
        newAgent.capabilities = stringifyJsonField(requestBody.capabilities)
        newAgent.skills = stringifyJsonField(requestBody.skills)
        newAgent.defaultInputModes = stringifyJsonField(requestBody.defaultInputModes)
        newAgent.defaultOutputModes = stringifyJsonField(requestBody.defaultOutputModes)
        newAgent.serviceEndpoint = requestBody.serviceEndpoint ?? undefined
        newAgent.interfaces = stringifyJsonField(requestBody.interfaces)
        newAgent.securitySchemes = stringifyJsonField(requestBody.securitySchemes)
        newAgent.security = stringifyJsonField(requestBody.security)
        newAgent.runtimeType = runtimeType
        newAgent.status = AgentStatus.UNKNOWN
        newAgent.enabled = requestBody.enabled !== false
        newAgent.runtimeConfig = JSON.stringify(runtimeConfig)
        newAgent.outboundAuth = stringifyJsonField(requestBody.outboundAuth)
        newAgent.callbackToken = runtimeType === AgentRuntimeType.HTTP ? generateCallbackToken() : undefined
        newAgent.allowedTools = stringifyJsonField(requestBody.allowedTools)
        newAgent.builtinAgentflowId = requestBody.builtinAgentflowId ?? undefined
        newAgent.userId = requestBody.userId || undefined

        const saved = appServer.AppDataSource.getRepository(Agent).create(newAgent)
        return await appServer.AppDataSource.getRepository(Agent).save(saved)
    } catch (error) {
        if (error instanceof InternalChronosError) throw error
        throw new InternalChronosError(StatusCodes.INTERNAL_SERVER_ERROR, `Error: agentsService.createAgent - ${getErrorMessage(error)}`)
    }
}

const updateAgent = async (agentId: string, body: any): Promise<Agent> => {
    try {
        assertAgentsEnabled()
        const appServer = getRunningExpressApp()
        const repo = appServer.AppDataSource.getRepository(Agent)
        const agent = await repo.findOneBy({ id: agentId })
        if (!agent) {
            throw new InternalChronosError(StatusCodes.NOT_FOUND, `Agent ${agentId} not found`)
        }

        if (body.serviceEndpoint) {
            validateOutboundUrl(body.serviceEndpoint, 'serviceEndpoint')
            agent.serviceEndpoint = body.serviceEndpoint
        }

        if (body.runtimeConfig) {
            const cfg = typeof body.runtimeConfig === 'string' ? JSON.parse(body.runtimeConfig) : body.runtimeConfig
            if (cfg.healthEndpoint) {
                validateOutboundUrl(cfg.healthEndpoint, 'runtimeConfig.healthEndpoint')
            }
            agent.runtimeConfig = JSON.stringify(cfg)
        }

        if (body.slug && body.slug !== agent.slug) {
            agent.slug = await ensureUniqueSlug(slugifyName(body.slug), agent.id)
        }

        const updatable: Array<keyof Agent> = [
            'name',
            'description',
            'version',
            'protocolVersion',
            'iconUrl',
            'documentationUrl',
            'enabled'
        ]
        for (const key of updatable) {
            if (body[key] !== undefined) (agent as any)[key] = body[key]
        }

        const jsonFields: Array<keyof Agent> = [
            'provider',
            'capabilities',
            'skills',
            'defaultInputModes',
            'defaultOutputModes',
            'interfaces',
            'securitySchemes',
            'security',
            'outboundAuth',
            'allowedTools'
        ]
        for (const key of jsonFields) {
            if (body[key] !== undefined) (agent as any)[key] = stringifyJsonField(body[key])
        }

        return await repo.save(agent)
    } catch (error) {
        if (error instanceof InternalChronosError) throw error
        throw new InternalChronosError(StatusCodes.INTERNAL_SERVER_ERROR, `Error: agentsService.updateAgent - ${getErrorMessage(error)}`)
    }
}

const deleteAgent = async (agentId: string): Promise<any> => {
    try {
        assertAgentsEnabled()
        const appServer = getRunningExpressApp()
        const agent = await appServer.AppDataSource.getRepository(Agent).findOneBy({ id: agentId })
        if (!agent) {
            throw new InternalChronosError(StatusCodes.NOT_FOUND, `Agent ${agentId} not found`)
        }
        return await appServer.AppDataSource.getRepository(Agent).delete({ id: agentId })
    } catch (error) {
        if (error instanceof InternalChronosError) throw error
        throw new InternalChronosError(StatusCodes.INTERNAL_SERVER_ERROR, `Error: agentsService.deleteAgent - ${getErrorMessage(error)}`)
    }
}

const getAllAgents = async (
    page: number = -1,
    limit: number = -1,
    filters: { runtimeType?: string; status?: string; agentflowId?: string } = {}
) => {
    try {
        const appServer = getRunningExpressApp()
        const queryBuilder = appServer.AppDataSource.getRepository(Agent).createQueryBuilder('agent').orderBy('agent.updatedDate', 'DESC')

        if (filters.runtimeType) queryBuilder.andWhere('agent.runtimeType = :runtimeType', { runtimeType: filters.runtimeType })
        if (filters.status) queryBuilder.andWhere('agent.status = :status', { status: filters.status })
        if (filters.agentflowId) queryBuilder.andWhere('agent.builtinAgentflowId = :agentflowId', { agentflowId: filters.agentflowId })

        if (page > 0 && limit > 0) {
            queryBuilder.skip((page - 1) * limit)
            queryBuilder.take(limit)
        }
        const [data, total] = await queryBuilder.getManyAndCount()

        if (page > 0 && limit > 0) {
            return { data, total }
        }
        return data
    } catch (error) {
        throw new InternalChronosError(StatusCodes.INTERNAL_SERVER_ERROR, `Error: agentsService.getAllAgents - ${getErrorMessage(error)}`)
    }
}

const getAgentById = async (agentId: string): Promise<Agent> => {
    try {
        const appServer = getRunningExpressApp()
        const agent = await appServer.AppDataSource.getRepository(Agent).findOneBy({ id: agentId })
        if (!agent) {
            throw new InternalChronosError(StatusCodes.NOT_FOUND, `Agent ${agentId} not found`)
        }
        return agent
    } catch (error) {
        if (error instanceof InternalChronosError) throw error
        throw new InternalChronosError(StatusCodes.INTERNAL_SERVER_ERROR, `Error: agentsService.getAgentById - ${getErrorMessage(error)}`)
    }
}

const getAgentBySlug = async (slug: string): Promise<Agent | null> => {
    try {
        const appServer = getRunningExpressApp()
        return await appServer.AppDataSource.getRepository(Agent).findOneBy({ slug })
    } catch (error) {
        throw new InternalChronosError(StatusCodes.INTERNAL_SERVER_ERROR, `Error: agentsService.getAgentBySlug - ${getErrorMessage(error)}`)
    }
}

const toggleAgent = async (agentId: string, enabled: boolean): Promise<Agent> => {
    try {
        assertAgentsEnabled()
        const appServer = getRunningExpressApp()
        const repo = appServer.AppDataSource.getRepository(Agent)
        const agent = await repo.findOneBy({ id: agentId })
        if (!agent) {
            throw new InternalChronosError(StatusCodes.NOT_FOUND, `Agent ${agentId} not found`)
        }
        agent.enabled = enabled
        if (!enabled) agent.status = AgentStatus.DISABLED
        else if (agent.status === AgentStatus.DISABLED) agent.status = AgentStatus.UNKNOWN
        return await repo.save(agent)
    } catch (error) {
        if (error instanceof InternalChronosError) throw error
        throw new InternalChronosError(StatusCodes.INTERNAL_SERVER_ERROR, `Error: agentsService.toggleAgent - ${getErrorMessage(error)}`)
    }
}

const regenerateCallbackToken = async (agentId: string): Promise<Agent> => {
    try {
        assertAgentsEnabled()
        const appServer = getRunningExpressApp()
        const repo = appServer.AppDataSource.getRepository(Agent)
        const agent = await repo.findOneBy({ id: agentId })
        if (!agent) {
            throw new InternalChronosError(StatusCodes.NOT_FOUND, `Agent ${agentId} not found`)
        }
        if (agent.runtimeType !== AgentRuntimeType.HTTP) {
            throw new InternalChronosError(StatusCodes.BAD_REQUEST, 'Callback tokens are only used by HTTP agents')
        }
        agent.callbackToken = generateCallbackToken()
        return await repo.save(agent)
    } catch (error) {
        if (error instanceof InternalChronosError) throw error
        throw new InternalChronosError(
            StatusCodes.INTERNAL_SERVER_ERROR,
            `Error: agentsService.regenerateCallbackToken - ${getErrorMessage(error)}`
        )
    }
}

const testAgentConnection = async (agentId: string): Promise<any> => {
    try {
        assertAgentsEnabled()
        const appServer = getRunningExpressApp()
        const agent = await appServer.AppDataSource.getRepository(Agent).findOneBy({ id: agentId })
        if (!agent) {
            throw new InternalChronosError(StatusCodes.NOT_FOUND, `Agent ${agentId} not found`)
        }
        if (agent.runtimeType !== AgentRuntimeType.HTTP) {
            throw new InternalChronosError(StatusCodes.BAD_REQUEST, 'Connection test is only available for HTTP agents')
        }
        const cfg = agent.runtimeConfig ? JSON.parse(agent.runtimeConfig) : {}
        const url = cfg.healthEndpoint || agent.serviceEndpoint
        if (!url) {
            throw new InternalChronosError(StatusCodes.BAD_REQUEST, 'Agent has no healthEndpoint or serviceEndpoint configured')
        }
        const timeoutMs = cfg.timeoutMs ?? DEFAULT_HTTP_TIMEOUT_MS
        const controller = new AbortController()
        const timer = setTimeout(() => controller.abort(), timeoutMs)
        try {
            const startedAt = Date.now()
            const response = await fetch(url, { method: 'GET', signal: controller.signal })
            clearTimeout(timer)
            return {
                success: response.ok,
                statusCode: response.status,
                latencyMs: Date.now() - startedAt,
                message: response.ok ? 'Health endpoint responded OK' : `Health endpoint returned HTTP ${response.status}`
            }
        } catch (fetchError) {
            clearTimeout(timer)
            return { success: false, statusCode: null, message: `Health endpoint unreachable: ${getErrorMessage(fetchError)}` }
        }
    } catch (error) {
        if (error instanceof InternalChronosError) throw error
        throw new InternalChronosError(
            StatusCodes.INTERNAL_SERVER_ERROR,
            `Error: agentsService.testAgentConnection - ${getErrorMessage(error)}`
        )
    }
}

const stringifyJsonField = (value: unknown): string | undefined => {
    if (value === undefined || value === null) return undefined
    if (typeof value === 'string') return value
    return JSON.stringify(value)
}

export default {
    isAgentsEnabled,
    createAgent,
    updateAgent,
    deleteAgent,
    getAllAgents,
    getAgentById,
    getAgentBySlug,
    toggleAgent,
    regenerateCallbackToken,
    testAgentConnection
}
