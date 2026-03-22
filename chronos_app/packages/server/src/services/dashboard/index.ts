import { DataSource } from 'typeorm'
import { ExecutionMetrics } from '../../database/entities/ExecutionMetrics'
import { DailyMetrics } from '../../database/entities/DailyMetrics'
import { AgentFlow } from '../../database/entities/AgentFlow'
import { getPricingCurrency } from '../metrics-collector'
import logger from '../../utils/logger'

/**
 * Returns summary statistics for the dashboard.
 * Uses daily_metrics for multi-day ranges, execution_metrics for intra-day.
 */
const getSummary = async (appDataSource: DataSource, startDate: string, endDate: string, agentflowId?: string): Promise<any> => {
    try {
        const isIntraDay = startDate === endDate
        const currency = getPricingCurrency()

        if (isIntraDay) {
            return await getIntraDaySummary(appDataSource, startDate, agentflowId, currency)
        }

        return await getMultiDaySummary(appDataSource, startDate, endDate, agentflowId, currency)
    } catch (error) {
        logger.error(`[DashboardService] getSummary error: ${error}`)
        throw error
    }
}

/**
 * Returns time-series data for dashboard charts.
 */
const getTimeseries = async (
    appDataSource: DataSource,
    startDate: string,
    endDate: string,
    granularity: string = 'daily',
    agentflowId?: string
): Promise<any> => {
    try {
        const currency = getPricingCurrency()

        if (granularity === 'hourly') {
            return await getHourlyTimeseries(appDataSource, startDate, endDate, agentflowId, currency)
        }

        return await getDailyTimeseries(appDataSource, startDate, endDate, agentflowId, currency)
    } catch (error) {
        logger.error(`[DashboardService] getTimeseries error: ${error}`)
        throw error
    }
}

/**
 * Returns per-agent statistics for the agents table.
 */
const getAgents = async (
    appDataSource: DataSource,
    startDate: string,
    endDate: string,
    sortBy: string = 'executionCount',
    sortOrder: string = 'DESC',
    page: number = 1,
    limit: number = 20
): Promise<any> => {
    try {
        const currency = getPricingCurrency()
        const metricsRepo = appDataSource.getRepository(ExecutionMetrics)

        const qb = metricsRepo
            .createQueryBuilder('em')
            .select('em.agentflowId', 'agentflowId')
            .addSelect('COUNT(*)', 'executionCount')
            .addSelect('SUM(CASE WHEN em.state = :finished THEN 1 ELSE 0 END)', 'successCount')
            .addSelect('SUM(CASE WHEN em.state IN (:...errorStates) THEN 1 ELSE 0 END)', 'errorCount')
            .addSelect('SUM(em.totalTokens)', 'totalTokens')
            .addSelect('SUM(em.estimatedCostUsd)', 'totalCost')
            .addSelect('AVG(em.durationMs)', 'avgDurationMs')
            .where('em.createdDate >= :start', { start: new Date(`${startDate}T00:00:00`) })
            .andWhere('em.createdDate <= :end', { end: new Date(`${endDate}T23:59:59.999`) })
            .setParameters({ finished: 'FINISHED', errorStates: ['ERROR', 'TERMINATED'] })
            .groupBy('em.agentflowId')

        const allowedSorts: Record<string, string> = {
            executionCount: 'executionCount',
            totalCost: 'totalCost',
            avgDurationMs: 'avgDurationMs',
            totalTokens: 'totalTokens'
        }

        const rawResults = await qb.getRawMany()

        // Get agentflow names
        const agentflowRepo = appDataSource.getRepository(AgentFlow)
        const agentflowIds = rawResults.map((r: any) => r.agentflowId)
        const agentflows =
            agentflowIds.length > 0
                ? await agentflowRepo
                      .createQueryBuilder('af')
                      .select(['af.id', 'af.name'])
                      .where('af.id IN (:...ids)', { ids: agentflowIds })
                      .getMany()
                : []

        const nameMap = new Map(agentflows.map((af: AgentFlow) => [af.id, af.name]))

        // Map and sort
        let agents = rawResults.map((r: any) => {
            const execCount = Number(r.executionCount) || 0
            const succCount = Number(r.successCount) || 0
            return {
                agentflowId: r.agentflowId,
                agentflowName: nameMap.get(r.agentflowId) || 'Unknown',
                executionCount: execCount,
                successRate: execCount > 0 ? Math.round((succCount / execCount) * 1000) / 10 : 0,
                totalCost: Number(Number(r.totalCost || 0).toFixed(6)),
                avgDurationMs: Math.round(Number(r.avgDurationMs) || 0),
                totalTokens: Number(r.totalTokens) || 0
            }
        })

        // Sort
        const order = sortOrder.toUpperCase() === 'ASC' ? 1 : -1
        const sortKey = allowedSorts[sortBy] ? sortBy : 'executionCount'
        agents.sort((a: any, b: any) => (a[sortKey] - b[sortKey]) * order)

        const total = agents.length
        const offset = (page - 1) * limit
        agents = agents.slice(offset, offset + limit)

        return { agents, total, currency }
    } catch (error) {
        logger.error(`[DashboardService] getAgents error: ${error}`)
        throw error
    }
}

/**
 * Exports raw execution_metrics data.
 */
const getExport = async (appDataSource: DataSource, startDate: string, endDate: string, agentflowId?: string): Promise<any[]> => {
    try {
        const metricsRepo = appDataSource.getRepository(ExecutionMetrics)
        const qb = metricsRepo
            .createQueryBuilder('em')
            .where('em.createdDate >= :startDate', { startDate: new Date(`${startDate}T00:00:00`) })
            .andWhere('em.createdDate <= :endDate', { endDate: new Date(`${endDate}T23:59:59.999`) })
            .orderBy('em.createdDate', 'DESC')

        if (agentflowId) {
            qb.andWhere('em.agentflowId = :agentflowId', { agentflowId })
        }

        return await qb.getMany()
    } catch (error) {
        logger.error(`[DashboardService] getExport error: ${error}`)
        throw error
    }
}

// --- Private helpers ---

/** Summary from execution_metrics (intra-day) */
const getIntraDaySummary = async (
    appDataSource: DataSource,
    date: string,
    agentflowId: string | undefined,
    currency: string
): Promise<any> => {
    const metricsRepo = appDataSource.getRepository(ExecutionMetrics)
    const startOfDay = new Date(`${date}T00:00:00`)
    const endOfDay = new Date(`${date}T23:59:59.999`)
    const qb = metricsRepo
        .createQueryBuilder('em')
        .where('em.createdDate >= :start', { start: startOfDay })
        .andWhere('em.createdDate <= :end', { end: endOfDay })

    if (agentflowId) {
        qb.andWhere('em.agentflowId = :agentflowId', { agentflowId })
    }

    const metrics = await qb.getMany()

    logger.info(`[DashboardService] Intra-day query date=${date} found ${metrics.length} execution_metrics rows`)

    // Also check total rows in execution_metrics for debugging
    if (metrics.length === 0) {
        const totalRows = await metricsRepo.count()
        logger.info(`[DashboardService] Total execution_metrics rows in DB: ${totalRows}`)
    }

    const totalExecutions = metrics.length
    const successCount = metrics.filter((m) => m.state === 'FINISHED').length
    const successRate = totalExecutions > 0 ? Math.round((successCount / totalExecutions) * 1000) / 10 : 0
    const totalCost = metrics.reduce((sum, m) => sum + Number(m.estimatedCostUsd), 0)
    const avgDurationMs = totalExecutions > 0 ? Math.round(metrics.reduce((sum, m) => sum + Number(m.durationMs), 0) / totalExecutions) : 0
    const totalTokens = metrics.reduce((sum, m) => sum + Number(m.totalTokens), 0)

    return { totalExecutions, successRate, totalCost: Number(totalCost.toFixed(6)), avgDurationMs, totalTokens, currency }
}

/** Summary from daily_metrics (multi-day) */
const getMultiDaySummary = async (
    appDataSource: DataSource,
    startDate: string,
    endDate: string,
    agentflowId: string | undefined,
    currency: string
): Promise<any> => {
    const dailyRepo = appDataSource.getRepository(DailyMetrics)
    const qb = dailyRepo.createQueryBuilder('dm').where('dm.date >= :startDate', { startDate }).andWhere('dm.date <= :endDate', { endDate })

    if (agentflowId) {
        qb.andWhere('dm.agentflowId = :agentflowId', { agentflowId })
    }

    const rows = await qb.getMany()

    const totalExecutions = rows.reduce((sum, r) => sum + Number(r.executionCount), 0)
    const successCount = rows.reduce((sum, r) => sum + Number(r.successCount), 0)
    const successRate = totalExecutions > 0 ? Math.round((successCount / totalExecutions) * 1000) / 10 : 0
    const totalCost = rows.reduce((sum, r) => sum + Number(r.totalCostUsd), 0)
    const totalTokens = rows.reduce((sum, r) => sum + Number(r.totalTokens), 0)

    // Weighted average duration
    let avgDurationMs = 0
    if (totalExecutions > 0) {
        const weightedSum = rows.reduce((sum, r) => sum + Number(r.avgDurationMs) * Number(r.executionCount), 0)
        avgDurationMs = Math.round(weightedSum / totalExecutions)
    }

    return { totalExecutions, successRate, totalCost: Number(totalCost.toFixed(6)), avgDurationMs, totalTokens, currency }
}

/** Hourly time-series from execution_metrics */
const getHourlyTimeseries = async (
    appDataSource: DataSource,
    startDate: string,
    endDate: string,
    agentflowId: string | undefined,
    currency: string
): Promise<any> => {
    const metricsRepo = appDataSource.getRepository(ExecutionMetrics)
    const qb = metricsRepo
        .createQueryBuilder('em')
        .where('em.createdDate >= :start', { start: new Date(`${startDate}T00:00:00`) })
        .andWhere('em.createdDate <= :end', { end: new Date(`${endDate}T23:59:59.999`) })
        .orderBy('em.createdDate', 'ASC')

    if (agentflowId) {
        qb.andWhere('em.agentflowId = :agentflowId', { agentflowId })
    }

    const metrics = await qb.getMany()

    // Group by hour
    const hourMap = new Map<string, ExecutionMetrics[]>()
    for (const m of metrics) {
        const dt = new Date(m.createdDate)
        const hourKey = `${dt.toISOString().split('T')[0]}T${String(dt.getHours()).padStart(2, '0')}:00`
        const existing = hourMap.get(hourKey) || []
        existing.push(m)
        hourMap.set(hourKey, existing)
    }

    const series = Array.from(hourMap.entries()).map(([hour, items]) => {
        const durations = items.map((m) => Number(m.durationMs)).sort((a, b) => a - b)
        return {
            date: hour,
            executions: items.length,
            successes: items.filter((m) => m.state === 'FINISHED').length,
            errors: items.filter((m) => m.state === 'ERROR' || m.state === 'TERMINATED').length,
            cost: Number(items.reduce((sum, m) => sum + Number(m.estimatedCostUsd), 0).toFixed(6)),
            avgDurationMs: Math.round(durations.reduce((s, d) => s + d, 0) / durations.length),
            p95DurationMs: percentile(durations, 95),
            inputTokens: items.reduce((sum, m) => sum + Number(m.inputTokens), 0),
            outputTokens: items.reduce((sum, m) => sum + Number(m.outputTokens), 0)
        }
    })

    return { currency, series }
}

/** Daily time-series from daily_metrics */
const getDailyTimeseries = async (
    appDataSource: DataSource,
    startDate: string,
    endDate: string,
    agentflowId: string | undefined,
    currency: string
): Promise<any> => {
    const dailyRepo = appDataSource.getRepository(DailyMetrics)
    const qb = dailyRepo
        .createQueryBuilder('dm')
        .where('dm.date >= :startDate', { startDate })
        .andWhere('dm.date <= :endDate', { endDate })
        .orderBy('dm.date', 'ASC')

    if (agentflowId) {
        qb.andWhere('dm.agentflowId = :agentflowId', { agentflowId })
    }

    const rows = await qb.getMany()

    // Group by date (aggregate across agentflows if no filter)
    const dateMap = new Map<string, DailyMetrics[]>()
    for (const r of rows) {
        const existing = dateMap.get(r.date) || []
        existing.push(r)
        dateMap.set(r.date, existing)
    }

    const series = Array.from(dateMap.entries()).map(([date, items]) => ({
        date,
        executions: items.reduce((sum, r) => sum + Number(r.executionCount), 0),
        successes: items.reduce((sum, r) => sum + Number(r.successCount), 0),
        errors: items.reduce((sum, r) => sum + Number(r.errorCount), 0),
        cost: Number(items.reduce((sum, r) => sum + Number(r.totalCostUsd), 0).toFixed(6)),
        avgDurationMs: Math.round(
            items.reduce((sum, r) => sum + Number(r.avgDurationMs) * Number(r.executionCount), 0) /
                Math.max(
                    1,
                    items.reduce((sum, r) => sum + Number(r.executionCount), 0)
                )
        ),
        p95DurationMs: Math.max(...items.map((r) => Number(r.p95DurationMs))),
        inputTokens: items.reduce((sum, r) => sum + Number(r.inputTokens), 0),
        outputTokens: items.reduce((sum, r) => sum + Number(r.outputTokens), 0)
    }))

    return { currency, series }
}

/** Calculates nth percentile from a sorted array */
const percentile = (sorted: number[], p: number): number => {
    if (sorted.length === 0) return 0
    if (sorted.length === 1) return sorted[0]
    const index = (p / 100) * (sorted.length - 1)
    const lower = Math.floor(index)
    const upper = Math.ceil(index)
    if (lower === upper) return sorted[lower]
    return Math.round(sorted[lower] + (sorted[upper] - sorted[lower]) * (index - lower))
}

export default {
    getSummary,
    getTimeseries,
    getAgents,
    getExport
}
