import { QueueManager } from './queue/QueueManager'
import { getDataSource } from './DataSource'
import { Telemetry } from './utils/telemetry'
import { NodesPool } from './NodesPool'
import { CachePool } from './CachePool'
import { QueueEvents, QueueEventsListener } from 'bullmq'
import { AbortControllerPool } from './AbortControllerPool'
import { UsageCacheManager } from './UsageCacheManager'
import logger from './utils/logger'
import { bootstrap } from './utils/bootstrap'

interface CustomListener extends QueueEventsListener {
    abort: (args: { id: string }, id: string) => void
}

let predictionWorkerId: string
let upsertionWorkerId: string

async function prepareData() {
    // Init database
    const appDataSource = getDataSource()
    await appDataSource.initialize()
    await appDataSource.runMigrations({ transaction: 'each' })

    // Initialize abortcontroller pool
    const abortControllerPool = new AbortControllerPool()

    // Init telemetry
    const telemetry = new Telemetry()

    // Initialize nodes pool
    const nodesPool = new NodesPool()
    await nodesPool.initialize()

    // Initialize cache pool
    const cachePool = new CachePool()

    // Initialize usage cache manager
    const usageCacheManager = await UsageCacheManager.getInstance()

    return { appDataSource, telemetry, componentNodes: nodesPool.componentNodes, cachePool, abortControllerPool, usageCacheManager }
}

async function run() {
    bootstrap(async () => {
        try {
            const queueManager = QueueManager.getInstance()
            if (predictionWorkerId) {
                const predictionWorker = queueManager.getQueue('prediction').getWorker()
                logger.info(`Shutting down Chronos Prediction Worker ${predictionWorkerId}...`)
                await predictionWorker.close()
            }
            if (upsertionWorkerId) {
                const upsertWorker = queueManager.getQueue('upsert').getWorker()
                logger.info(`Shutting down Chronos Upsertion Worker ${upsertionWorkerId}...`)
                await upsertWorker.close()
            }
        } catch (error) {
            logger.error('There was an error shutting down Chronos Worker...', error)
            throw error
        }
    })

    logger.info('Starting Chronos Worker...')

    const { appDataSource, telemetry, componentNodes, cachePool, abortControllerPool, usageCacheManager } = await prepareData()

    const queueManager = QueueManager.getInstance()
    queueManager.setupAllQueues({
        componentNodes,
        telemetry,
        cachePool,
        appDataSource,
        abortControllerPool,
        usageCacheManager
    })

    /** Prediction */
    const predictionQueue = queueManager.getQueue('prediction')
    const predictionWorker = predictionQueue.createWorker()
    predictionWorkerId = predictionWorker.id
    logger.info(`Prediction Worker ${predictionWorkerId} created`)

    const predictionQueueName = predictionQueue.getQueueName()
    const queueEvents = new QueueEvents(predictionQueueName, { connection: queueManager.getConnection() })

    queueEvents.on<CustomListener>('abort', async ({ id }: { id: string }) => {
        abortControllerPool.abort(id)
    })

    /** Upsertion */
    const upsertionQueue = queueManager.getQueue('upsert')
    const upsertionWorker = upsertionQueue.createWorker()
    upsertionWorkerId = upsertionWorker.id
    logger.info(`Upsertion Worker ${upsertionWorkerId} created`)
}

run().catch(async (error) => {
    if (error.stack) logger.error(error.stack)
    await new Promise((resolve) => {
        setTimeout(resolve, 1000)
    })
    process.exit(1)
})
