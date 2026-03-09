import logger from './logger'
import dotenv from 'dotenv'
import path from 'path'

// Load .env file
dotenv.config({ path: path.join(__dirname, '..', '..', '.env'), override: true })

export function bootstrap(stopProcessFn: () => Promise<void>) {
    const onTerminate = async () => {
        try {
            // Shut down the app after timeout if it ever stuck removing pools
            setTimeout(async () => {
                logger.info('Chronos was forced to shut down after 30 secs')
                process.exit(1)
            }, 30000)

            await stopProcessFn()
            process.exit(0)
        } catch (error) {
            logger.error('There was an error shutting down Chronos...', error)
            process.exit(1)
        }
    }

    process.on('SIGTERM', onTerminate)
    process.on('SIGINT', onTerminate)

    process.on('uncaughtException', (err) => {
        logger.error('uncaughtException: ', err)
    })

    process.on('unhandledRejection', (err) => {
        logger.error('unhandledRejection: ', err)
    })
}
