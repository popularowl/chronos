import { DataSource } from 'typeorm'
import { v4 as uuidv4 } from 'uuid'
import { ExecutionMetrics } from '../../database/entities/ExecutionMetrics'
import { DailyMetrics } from '../../database/entities/DailyMetrics'
import logger from '../../utils/logger'

const DEFAULT_ROLLUP_INTERVAL_MS = 86400000 // 24 hours

/**
 * Aggregates execution_metrics into daily_metrics on a configurable interval.
 * Follows the SchedulePoller pattern for lifecycle management.
 */
export class MetricsAggregator {
    private appDataSource: DataSource
    private intervalId: ReturnType<typeof setInterval> | null = null
    private initialTimeoutId: ReturnType<typeof setTimeout> | null = null
    private running = false

    constructor(appDataSource: DataSource) {
        this.appDataSource = appDataSource
    }

    /**
     * Starts the periodic rollup job.
     */
    public start(): void {
        if (this.intervalId) return

        const rollupIntervalMs = process.env.METRICS_ROLLUP_INTERVAL_MS
            ? parseInt(process.env.METRICS_ROLLUP_INTERVAL_MS, 10)
            : DEFAULT_ROLLUP_INTERVAL_MS

        logger.info(`📊 [MetricsAggregator] Starting with ${rollupIntervalMs}ms rollup interval`)

        this.intervalId = setInterval(() => {
            this.rollup()
        }, rollupIntervalMs)

        // Run an initial rollup after a short delay
        this.initialTimeoutId = setTimeout(() => this.rollup(), 5000)
    }

    /**
     * Stops the periodic rollup job.
     */
    public stop(): void {
        if (this.initialTimeoutId) {
            clearTimeout(this.initialTimeoutId)
            this.initialTimeoutId = null
        }
        if (this.intervalId) {
            clearInterval(this.intervalId)
            this.intervalId = null
        }
        logger.info('📊 [MetricsAggregator] Stopped')
    }

    /**
     * Performs a rollup of execution_metrics into daily_metrics.
     * Aggregates today and yesterday to handle late-arriving metrics.
     */
    public async rollup(): Promise<void> {
        if (this.running) return
        this.running = true

        try {
            const today = new Date()
            const yesterday = new Date(today)
            yesterday.setDate(yesterday.getDate() - 1)

            await this.rollupDate(this.formatDate(yesterday))
            await this.rollupDate(this.formatDate(today))

            logger.debug('[MetricsAggregator] Rollup completed')
        } catch (error) {
            logger.warn(`[MetricsAggregator] Rollup error: ${error}`)
        } finally {
            this.running = false
        }
    }

    /**
     * Aggregates execution_metrics for a specific date into daily_metrics.
     */
    private async rollupDate(dateStr: string): Promise<void> {
        const metricsRepo = this.appDataSource.getRepository(ExecutionMetrics)
        const dailyRepo = this.appDataSource.getRepository(DailyMetrics)

        // Get distinct agentflow IDs for this date using query builder
        let agentflowIds: string[]
        try {
            const rawResults = await metricsRepo
                .createQueryBuilder('em')
                .select('DISTINCT em.agentflowId', 'agentflowId')
                .where('em.createdDate >= :start', { start: new Date(`${dateStr}T00:00:00`) })
                .andWhere('em.createdDate <= :end', { end: new Date(`${dateStr}T23:59:59.999`) })
                .getRawMany()
            agentflowIds = rawResults.map((r: any) => r.agentflowId)
        } catch {
            return
        }

        if (agentflowIds.length === 0) return

        for (const agentflowId of agentflowIds) {
            try {
                await this.rollupAgentflowDate(agentflowId, dateStr, metricsRepo, dailyRepo)
            } catch (error) {
                logger.warn(`[MetricsAggregator] Error rolling up agentflow ${agentflowId} for ${dateStr}: ${error}`)
            }
        }
    }

    /**
     * Aggregates metrics for a specific agentflow on a specific date.
     */
    private async rollupAgentflowDate(agentflowId: string, dateStr: string, metricsRepo: any, dailyRepo: any): Promise<void> {
        const metrics = (await metricsRepo
            .createQueryBuilder('em')
            .where('em.agentflowId = :agentflowId', { agentflowId })
            .andWhere('em.createdDate >= :start', { start: new Date(`${dateStr}T00:00:00`) })
            .andWhere('em.createdDate <= :end', { end: new Date(`${dateStr}T23:59:59.999`) })
            .getMany()) as ExecutionMetrics[]

        if (metrics.length === 0) return

        const executionCount = metrics.length
        const successCount = metrics.filter((m) => m.state === 'FINISHED').length
        const errorCount = metrics.filter((m) => m.state === 'ERROR' || m.state === 'TERMINATED').length
        const timeoutCount = metrics.filter((m) => m.state === 'TIMEOUT').length

        const totalTokens = metrics.reduce((sum, m) => sum + Number(m.totalTokens), 0)
        const inputTokens = metrics.reduce((sum, m) => sum + Number(m.inputTokens), 0)
        const outputTokens = metrics.reduce((sum, m) => sum + Number(m.outputTokens), 0)
        const totalCostUsd = metrics.reduce((sum, m) => sum + Number(m.estimatedCostUsd), 0)

        const durations = metrics.map((m) => Number(m.durationMs)).sort((a, b) => a - b)
        const avgDurationMs = Math.round(durations.reduce((sum, d) => sum + d, 0) / durations.length)
        const p50DurationMs = this.percentile(durations, 50)
        const p95DurationMs = this.percentile(durations, 95)
        const maxDurationMs = durations[durations.length - 1] || 0

        const existing = await dailyRepo.findOne({
            where: { agentflowId, date: dateStr }
        })

        if (existing) {
            existing.executionCount = executionCount
            existing.successCount = successCount
            existing.errorCount = errorCount
            existing.timeoutCount = timeoutCount
            existing.totalTokens = totalTokens
            existing.inputTokens = inputTokens
            existing.outputTokens = outputTokens
            existing.totalCostUsd = totalCostUsd
            existing.avgDurationMs = avgDurationMs
            existing.p50DurationMs = p50DurationMs
            existing.p95DurationMs = p95DurationMs
            existing.maxDurationMs = maxDurationMs
            await dailyRepo.save(existing)
        } else {
            const daily = new DailyMetrics()
            daily.id = uuidv4()
            daily.agentflowId = agentflowId
            daily.date = dateStr
            daily.executionCount = executionCount
            daily.successCount = successCount
            daily.errorCount = errorCount
            daily.timeoutCount = timeoutCount
            daily.totalTokens = totalTokens
            daily.inputTokens = inputTokens
            daily.outputTokens = outputTokens
            daily.totalCostUsd = totalCostUsd
            daily.avgDurationMs = avgDurationMs
            daily.p50DurationMs = p50DurationMs
            daily.p95DurationMs = p95DurationMs
            daily.maxDurationMs = maxDurationMs
            await dailyRepo.save(daily)
        }
    }

    /**
     * Calculates the nth percentile from a sorted array.
     */
    private percentile(sorted: number[], p: number): number {
        if (sorted.length === 0) return 0
        if (sorted.length === 1) return sorted[0]
        const index = (p / 100) * (sorted.length - 1)
        const lower = Math.floor(index)
        const upper = Math.ceil(index)
        if (lower === upper) return sorted[lower]
        return Math.round(sorted[lower] + (sorted[upper] - sorted[lower]) * (index - lower))
    }

    /**
     * Formats a Date as YYYY-MM-DD string.
     */
    private formatDate(date: Date): string {
        return date.toISOString().split('T')[0]
    }
}
