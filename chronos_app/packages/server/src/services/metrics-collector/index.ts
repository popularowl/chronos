import { DataSource } from 'typeorm'
import { v4 as uuidv4 } from 'uuid'
import * as fs from 'fs'
import * as path from 'path'
import { ExecutionMetrics } from '../../database/entities/ExecutionMetrics'
import { IAgentflowExecutedData } from '../../Interface'
import logger from '../../utils/logger'

/**
 * Price index entry for a single model.
 */
interface ModelPrice {
    inputCost: number
    outputCost: number
}

/**
 * Model breakdown entry stored as JSON in execution_metrics.
 */
interface ModelBreakdownEntry {
    inputTokens: number
    outputTokens: number
    cost: number
}

/** Cached pricing index */
let pricingIndex: Map<string, ModelPrice> | null = null
let pricingCurrency = 'USD'

/**
 * Builds a flat lookup map from the models.json file.
 * Maps model name to { inputCost, outputCost } per token.
 */
const buildPricingIndex = async (): Promise<Map<string, ModelPrice>> => {
    if (pricingIndex) return pricingIndex

    pricingIndex = new Map()

    try {
        const checkPaths = [
            process.env.MODEL_LIST_CONFIG_LOCATION,
            path.join(__dirname, '..', '..', '..', '..', 'components', 'models.json'),
            path.join(__dirname, '..', '..', '..', '..', '..', 'components', 'models.json'),
            path.join(__dirname, '..', '..', '..', '..', '..', 'packages', 'components', 'models.json')
        ].filter(Boolean) as string[]

        let modelsData: any = null
        for (const checkPath of checkPaths) {
            try {
                if (fs.existsSync(checkPath)) {
                    const content = await fs.promises.readFile(checkPath, 'utf8')
                    modelsData = JSON.parse(content)
                    break
                }
            } catch {
                continue
            }
        }

        if (!modelsData) {
            logger.warn('[MetricsCollector] Could not find models.json for pricing data')
            return pricingIndex
        }

        if (modelsData.currency) {
            pricingCurrency = modelsData.currency
        }

        for (const category of ['chat', 'llm', 'embedding']) {
            const providers = modelsData[category]
            if (!Array.isArray(providers)) continue

            for (const provider of providers) {
                if (!Array.isArray(provider.models)) continue

                for (const model of provider.models) {
                    if (model.name && (model.input_cost !== undefined || model.output_cost !== undefined)) {
                        pricingIndex.set(model.name, {
                            inputCost: model.input_cost || 0,
                            outputCost: model.output_cost || 0
                        })
                    }
                }
            }
        }

        logger.info(`[MetricsCollector] Loaded pricing for ${pricingIndex.size} models (currency: ${pricingCurrency})`)
    } catch (error) {
        logger.warn(`[MetricsCollector] Error building pricing index: ${error}`)
    }

    return pricingIndex
}

/**
 * Returns the currency from models.json.
 */
export const getPricingCurrency = (): string => {
    return pricingCurrency
}

/**
 * Resets the cached pricing index.
 */
export const resetPricingIndex = (): void => {
    pricingIndex = null
}

/**
 * Collects metrics from a completed execution and stores them in execution_metrics.
 * @param appDataSource - TypeORM data source
 * @param execution - The completed execution record (partial)
 * @param triggerType - How the execution was triggered
 */
export const collectExecutionMetrics = async (
    appDataSource: DataSource,
    execution: {
        id: string
        agentflowId: string
        executionData?: string
        state?: string
        createdDate?: Date
        updatedDate?: Date
        stoppedDate?: Date
    },
    triggerType: string = 'manual'
): Promise<void> => {
    try {
        if (!execution.id || !execution.agentflowId) return

        const terminalStates = ['FINISHED', 'ERROR', 'TIMEOUT', 'TERMINATED', 'STOPPED']
        if (!execution.state || !terminalStates.includes(execution.state)) return

        const pricing = await buildPricingIndex()

        let executedNodes: IAgentflowExecutedData[] = []
        try {
            if (execution.executionData) {
                executedNodes = typeof execution.executionData === 'string' ? JSON.parse(execution.executionData) : execution.executionData
            }
        } catch {
            logger.warn(`[MetricsCollector] Failed to parse executionData for execution ${execution.id}`)
            return
        }

        let totalInputTokens = 0
        let totalOutputTokens = 0
        let totalTokensAll = 0
        let llmCallCount = 0
        let hasPricing = true
        const modelBreakdown: Record<string, ModelBreakdownEntry> = {}

        for (const node of executedNodes) {
            const nodeData = node.data as Record<string, any> | undefined
            if (!nodeData) continue

            // Node data structure: { id, name, input, output: { usageMetadata, ... }, state, chatHistory }
            // usageMetadata may be on output (LLM/Agent nodes) or directly on nodeData
            const output = nodeData.output as Record<string, any> | undefined
            const usageMetadata = output?.usageMetadata || nodeData.usageMetadata
            if (!usageMetadata) continue

            llmCallCount++

            const inputTokens = usageMetadata.input_tokens || 0
            const outputTokens = usageMetadata.output_tokens || 0
            const nodeTotal = usageMetadata.total_tokens || inputTokens + outputTokens

            totalInputTokens += inputTokens
            totalOutputTokens += outputTokens
            totalTokensAll += nodeTotal

            const modelName = extractModelName(output || nodeData)

            if (modelName) {
                const price = pricing.get(modelName)
                const nodeCost = price ? inputTokens * price.inputCost + outputTokens * price.outputCost : 0

                if (!price) hasPricing = false

                if (!modelBreakdown[modelName]) {
                    modelBreakdown[modelName] = { inputTokens: 0, outputTokens: 0, cost: 0 }
                }
                modelBreakdown[modelName].inputTokens += inputTokens
                modelBreakdown[modelName].outputTokens += outputTokens
                modelBreakdown[modelName].cost += nodeCost
            } else {
                hasPricing = false
            }
        }

        const estimatedCostUsd = Object.values(modelBreakdown).reduce((sum, m) => sum + m.cost, 0)

        let durationMs = 0
        if (execution.stoppedDate && execution.createdDate) {
            const created = execution.createdDate instanceof Date ? execution.createdDate : new Date(execution.createdDate)
            const stopped = execution.stoppedDate instanceof Date ? execution.stoppedDate : new Date(execution.stoppedDate)
            durationMs = stopped.getTime() - created.getTime()
        } else if (execution.createdDate && execution.updatedDate) {
            const created = execution.createdDate instanceof Date ? execution.createdDate : new Date(execution.createdDate)
            const updated = execution.updatedDate instanceof Date ? execution.updatedDate : new Date(execution.updatedDate)
            durationMs = updated.getTime() - created.getTime()
        }

        const metricsRepo = appDataSource.getRepository(ExecutionMetrics)
        const metrics = new ExecutionMetrics()
        metrics.id = uuidv4()
        metrics.agentflowId = execution.agentflowId
        metrics.executionId = execution.id
        metrics.state = execution.state
        metrics.durationMs = Math.max(0, durationMs)
        metrics.totalTokens = totalTokensAll
        metrics.inputTokens = totalInputTokens
        metrics.outputTokens = totalOutputTokens
        metrics.estimatedCostUsd = estimatedCostUsd
        metrics.hasPricing = hasPricing
        metrics.nodeCount = executedNodes.length
        metrics.llmCallCount = llmCallCount
        metrics.modelBreakdown = Object.keys(modelBreakdown).length > 0 ? JSON.stringify(modelBreakdown) : null
        metrics.triggerType = triggerType

        await metricsRepo.save(metrics)

        logger.info(
            `[MetricsCollector] Collected metrics for execution ${execution.id}: ` +
                `${totalTokensAll} tokens, $${estimatedCostUsd.toFixed(6)}, ${durationMs}ms, ` +
                `${llmCallCount} LLM calls, ${executedNodes.length} nodes`
        )
        if (llmCallCount === 0 && executedNodes.length > 0) {
            const nodeKeys = executedNodes.map((n: any) => ({
                label: n.nodeLabel,
                dataKeys: n.data ? Object.keys(n.data) : [],
                hasOutput: !!n.data?.output,
                outputKeys: n.data?.output ? Object.keys(n.data.output) : []
            }))
            logger.info(`[MetricsCollector] No LLM calls detected. Node structure: ${JSON.stringify(nodeKeys)}`)
        }
    } catch (error) {
        logger.warn(`[MetricsCollector] Failed to collect metrics for execution ${execution.id}: ${error}`)
    }
}

/**
 * Extracts the model name from node output data.
 */
const extractModelName = (output: Record<string, any>): string | undefined => {
    if (output.responseMetadata) {
        if (output.responseMetadata.model) return output.responseMetadata.model
        if (output.responseMetadata.model_name) return output.responseMetadata.model_name
        if (output.responseMetadata.modelName) return output.responseMetadata.modelName
    }
    if (output.usageMetadata?.model) return output.usageMetadata.model
    return undefined
}

export default {
    collectExecutionMetrics,
    getPricingCurrency,
    resetPricingIndex
}
