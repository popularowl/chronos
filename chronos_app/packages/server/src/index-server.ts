import * as Server from './index'
import * as DataSource from './DataSource'
import { createModuleLogger } from './utils/logger'

const logger = createModuleLogger('server')
import { bootstrap } from './utils/bootstrap'

async function run() {
    // Register signal handlers
    bootstrap(async () => {
        logger.info(`Shutting down Chronos...`)
        const serverApp = Server.getInstance()
        if (serverApp) await serverApp.stopApp()
    })

    logger.info('Starting Chronos...')
    await DataSource.init()
    await Server.start()
}

run().catch((error) => {
    if (error.stack) logger.error(error.stack)
    process.exit(1)
})
