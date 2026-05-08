import { StatusCodes } from 'http-status-codes'
import { In } from 'typeorm'
import { Agent } from '../../database/entities/Agent'
import { ChatMessage } from '../../database/entities/ChatMessage'
import { Execution } from '../../database/entities/Execution'
import { InternalChronosError } from '../../errors/internalChronosError'
import { getErrorMessage } from '../../errors/utils'
import { ExecutionState, IAgentflowExecutedData } from '../../Interface'
import { UserContext } from '../../Interface.Auth'
import { _removeCredentialId } from '../../utils'
import { getRunningExpressApp } from '../../utils/getRunningExpressApp'

/**
 * Bulk-resolve `Agent` registry rows for a list of execution rows and
 * attach them as `(row as any).agent` (reduced shape: id, name, slug,
 * runtimeType). Two ID conventions can match a row's `agentflowId`:
 *
 *   - HTTP-agent executions write `agentflowId = Agent.id` directly
 *     (`agent-runtime-http/index.ts:writeStartExecution`).
 *   - Built-in (canvas) executions write `agentflowId = AgentFlow.id`;
 *     the matching `Agent` row carries `builtinAgentflowId = AgentFlow.id`.
 *
 * One bulk query covers both. Rows whose `agentflowId` matches neither
 * (legacy data, deleted agent) just don't get the field. The UI falls
 * back to `agentflow.name` in that case.
 */
const _attachAgents = async <T extends { agentflowId?: string }>(rows: T[]): Promise<void> => {
    if (rows.length === 0) return
    const ids = Array.from(new Set(rows.map((r) => r.agentflowId).filter((id): id is string => Boolean(id))))
    if (ids.length === 0) return
    const appServer = getRunningExpressApp()
    const agentRepo = appServer.AppDataSource.getRepository(Agent)
    const matches = await agentRepo
        .createQueryBuilder('agent')
        .where('agent.id IN (:...ids)', { ids })
        .orWhere('agent.builtinAgentflowId IN (:...ids)', { ids })
        .getMany()
    const byId = new Map<string, Agent>()
    for (const a of matches) {
        if (a.id) byId.set(a.id, a)
        if (a.builtinAgentflowId) byId.set(a.builtinAgentflowId, a)
    }
    for (const row of rows) {
        if (!row.agentflowId) continue
        const a = byId.get(row.agentflowId)
        if (!a) continue
        ;(row as any).agent = {
            id: a.id,
            name: a.name,
            slug: a.slug,
            runtimeType: a.runtimeType
        }
    }
}

export interface ExecutionFilters {
    id?: string
    agentflowId?: string
    agentflowName?: string
    sessionId?: string
    state?: ExecutionState
    startDate?: Date
    endDate?: Date
    page?: number
    limit?: number
}

const getExecutionById = async (executionId: string, userContext?: UserContext): Promise<Execution | null> => {
    try {
        const appServer = getRunningExpressApp()
        const executionRepository = appServer.AppDataSource.getRepository(Execution)

        const res = await executionRepository.findOne({
            where: { id: executionId },
            relations: userContext && userContext.role !== 'admin' ? ['agentflow'] : undefined
        })
        if (!res) {
            throw new InternalChronosError(StatusCodes.NOT_FOUND, `Execution ${executionId} not found`)
        }
        if (userContext && userContext.role !== 'admin' && res.agentflow?.userId !== userContext.userId) {
            throw new InternalChronosError(StatusCodes.FORBIDDEN, 'You do not have permission to access this execution')
        }
        await _attachAgents([res])
        return res
    } catch (error) {
        throw new InternalChronosError(
            StatusCodes.INTERNAL_SERVER_ERROR,
            `Error: executionsService.getExecutionById - ${getErrorMessage(error)}`
        )
    }
}

const getPublicExecutionById = async (executionId: string): Promise<Execution | null> => {
    try {
        const appServer = getRunningExpressApp()
        const executionRepository = appServer.AppDataSource.getRepository(Execution)
        const res = await executionRepository.findOne({ where: { id: executionId, isPublic: true } })
        if (!res) {
            throw new InternalChronosError(StatusCodes.NOT_FOUND, `Execution ${executionId} not found`)
        }
        const executionData = typeof res?.executionData === 'string' ? JSON.parse(res?.executionData) : res?.executionData
        const executionDataWithoutCredentialId = executionData.map((data: IAgentflowExecutedData) => _removeCredentialId(data))
        const stringifiedExecutionData = JSON.stringify(executionDataWithoutCredentialId)
        return { ...res, executionData: stringifiedExecutionData }
    } catch (error) {
        throw new InternalChronosError(
            StatusCodes.INTERNAL_SERVER_ERROR,
            `Error: executionsService.getPublicExecutionById - ${getErrorMessage(error)}`
        )
    }
}

const getAllExecutions = async (
    filters: ExecutionFilters = {},
    userContext?: UserContext
): Promise<{ data: Execution[]; total: number }> => {
    try {
        const appServer = getRunningExpressApp()
        const { id, agentflowId, agentflowName, sessionId, state, startDate, endDate, page = 1, limit = 12 } = filters

        // Handle UUID fields properly using raw parameters to avoid type conversion issues
        // This uses the query builder instead of direct objects for compatibility with UUID fields
        const queryBuilder = appServer.AppDataSource.getRepository(Execution)
            .createQueryBuilder('execution')
            .leftJoinAndSelect('execution.agentflow', 'agentflow')
            // v1.7 — additionally LEFT JOIN the Agent registry on either ID
            // convention (HTTP rows write `agentflowId = Agent.id`; BUILT_IN
            // rows write `agentflowId = AgentFlow.id` and the linked Agent
            // carries `builtinAgentflowId`). Lets the agentflowName filter
            // also match HTTP-agent name / slug — without this join, typing
            // an HTTP-agent name into the filter returns zero rows.
            .leftJoin(Agent, 'agent', 'agent.id = execution.agentflowId OR agent.builtinAgentflowId = execution.agentflowId')
            .orderBy('execution.updatedDate', 'DESC')
            .skip((page - 1) * limit)
            .take(limit)

        if (id) queryBuilder.andWhere('execution.id = :id', { id })
        if (agentflowId) queryBuilder.andWhere('execution.agentflowId = :agentflowId', { agentflowId })
        if (agentflowName)
            // OR across all three name/slug surfaces so the filter is
            // uniform: AgentFlow.name (built-in), Agent.name (HTTP), and
            // Agent.slug (HTTP — common case since slugs are namespace-y).
            queryBuilder.andWhere(
                '(LOWER(agentflow.name) LIKE LOWER(:agentflowName) OR LOWER(agent.name) LIKE LOWER(:agentflowName) OR LOWER(agent.slug) LIKE LOWER(:agentflowName))',
                { agentflowName: `%${agentflowName}%` }
            )
        if (sessionId) queryBuilder.andWhere('execution.sessionId = :sessionId', { sessionId })
        if (state) queryBuilder.andWhere('execution.state = :state', { state })

        // User scoping: non-admin users only see executions for their own agentflows
        if (userContext && userContext.role !== 'admin') {
            queryBuilder.andWhere('agentflow.userId = :userId', { userId: userContext.userId })
        }

        // Date range conditions
        if (startDate && endDate) {
            queryBuilder.andWhere('execution.createdDate BETWEEN :startDate AND :endDate', { startDate, endDate })
        } else if (startDate) {
            queryBuilder.andWhere('execution.createdDate >= :startDate', { startDate })
        } else if (endDate) {
            queryBuilder.andWhere('execution.createdDate <= :endDate', { endDate })
        }

        const [data, total] = await queryBuilder.getManyAndCount()
        await _attachAgents(data)

        return { data, total }
    } catch (error) {
        throw new InternalChronosError(
            StatusCodes.INTERNAL_SERVER_ERROR,
            `Error: executionsService.getAllExecutions - ${getErrorMessage(error)}`
        )
    }
}

const updateExecution = async (executionId: string, data: Partial<Execution>, userContext?: UserContext): Promise<Execution | null> => {
    try {
        const appServer = getRunningExpressApp()

        const execution = await appServer.AppDataSource.getRepository(Execution).findOne({
            where: { id: executionId },
            relations: userContext && userContext.role !== 'admin' ? ['agentflow'] : undefined
        })
        if (!execution) {
            throw new InternalChronosError(StatusCodes.NOT_FOUND, `Execution ${executionId} not found`)
        }
        if (userContext && userContext.role !== 'admin' && execution.agentflow?.userId !== userContext.userId) {
            throw new InternalChronosError(StatusCodes.FORBIDDEN, 'You do not have permission to update this execution')
        }
        const updateExecution = new Execution()
        Object.assign(updateExecution, data)
        await appServer.AppDataSource.getRepository(Execution).merge(execution, updateExecution)
        const dbResponse = await appServer.AppDataSource.getRepository(Execution).save(execution)
        return dbResponse
    } catch (error) {
        throw new InternalChronosError(
            StatusCodes.INTERNAL_SERVER_ERROR,
            `Error: executionsService.updateExecution - ${getErrorMessage(error)}`
        )
    }
}

/**
 * Delete multiple executions by their IDs
 * @param executionIds Array of execution IDs to delete
 * @returns Object with success status and count of deleted executions
 */
const deleteExecutions = async (executionIds: string[], userContext?: UserContext): Promise<{ success: boolean; deletedCount: number }> => {
    try {
        const appServer = getRunningExpressApp()
        const executionRepository = appServer.AppDataSource.getRepository(Execution)

        // Ownership check for non-admin users
        if (userContext && userContext.role !== 'admin') {
            const executions = await executionRepository.find({
                where: { id: In(executionIds) },
                relations: ['agentflow']
            })
            const unauthorized = executions.find((e) => e.agentflow?.userId !== userContext.userId)
            if (unauthorized) {
                throw new InternalChronosError(StatusCodes.FORBIDDEN, 'You do not have permission to delete one or more executions')
            }
        }

        // Delete executions where id is in the provided array
        const result = await executionRepository.delete({ id: In(executionIds) })

        // Update chat message executionId column to NULL
        await appServer.AppDataSource.getRepository(ChatMessage).update({ executionId: In(executionIds) }, { executionId: null as any })

        return {
            success: true,
            deletedCount: result.affected || 0
        }
    } catch (error) {
        throw new InternalChronosError(
            StatusCodes.INTERNAL_SERVER_ERROR,
            `Error: executionsService.deleteExecutions - ${getErrorMessage(error)}`
        )
    }
}

export default {
    getExecutionById,
    getAllExecutions,
    deleteExecutions,
    getPublicExecutionById,
    updateExecution
}
