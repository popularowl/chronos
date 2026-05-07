import { createLogger, transports } from 'winston'
import { baseFormat, consoleFormat } from './logFormats'

const level = process.env.DEBUG === 'true' ? 'debug' : process.env.LOG_LEVEL || 'info'

const logger = createLogger({
    level,
    format: baseFormat,
    defaultMeta: {
        package: 'components'
    },
    transports: [new transports.Console({ format: consoleFormat })]
})

export function createModuleLogger(source: string) {
    return logger.child({ source })
}

export default logger
