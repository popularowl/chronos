import { format, Logform } from 'winston'

const { combine, timestamp, printf, errors } = format

/**
 * Base format applied at logger level: timestamps + error stack traces
 */
export const baseFormat: Logform.Format = combine(timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }), errors({ stack: true }))

/**
 * Human-readable console format: "2026-02-22 14:45:44 [INFO]: message"
 * Includes [Source] tag when `source` (or legacy `nodeName`) is present in metadata.
 */
export const consoleFormat: Logform.Format = printf(({ level, message, timestamp, stack, nodeName, source }) => {
    const tag = source ?? nodeName
    const sourceTag = tag ? ` [${tag}]` : ''
    const text = `${timestamp} [${level.toUpperCase()}]${sourceTag}: ${message}`
    return stack ? text + '\n' + stack : text
})

/**
 * Structured JSON format for file transports (.jsonl)
 */
export const fileJsonFormat: Logform.Format = format.json()
