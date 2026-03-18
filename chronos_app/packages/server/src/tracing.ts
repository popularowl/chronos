/**
 * OpenTelemetry distributed tracing initialization.
 *
 * IMPORTANT: This module must be imported before any other application code
 * so that auto-instrumentations can monkey-patch libraries (express, http, pg, etc.)
 * before they are first required.
 *
 * Controlled by environment variables:
 *   ENABLE_TRACING=true                  - enable tracing (default: false)
 *   TELEMETRY_COLLECTOR_ENDPOINT         - OTLP collector base URL (default: http://localhost:4318)
 *   TRACING_PROTOCOL                     - http | grpc | proto (default: http)
 *   TRACING_SAMPLE_RATE                  - 0.0 to 1.0 (default: 1.0)
 *   TRACING_DEBUG                        - log spans to console (default: false)
 *   METRICS_SERVICE_NAME                 - service name attribute (default: Chronos)
 */
import { diag, DiagConsoleLogger, DiagLogLevel } from '@opentelemetry/api'

/** Whether tracing was successfully initialized */
let tracingInitialized = false

/**
 * Returns true if the tracing SDK was successfully started.
 */
export function isTracingEnabled(): boolean {
    return tracingInitialized
}

/**
 * Initializes the OpenTelemetry tracing SDK if ENABLE_TRACING=true.
 * Must be called once, as early as possible in the process lifecycle.
 */
export async function initTracing(): Promise<void> {
    if (process.env.ENABLE_TRACING !== 'true') {
        return
    }

    try {
        if (process.env.TRACING_DEBUG === 'true') {
            diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.DEBUG)
        }

        const { NodeSDK } = require('@opentelemetry/sdk-node')
        const { resourceFromAttributes } = require('@opentelemetry/resources')
        const { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } = require('@opentelemetry/semantic-conventions')
        const { BatchSpanProcessor } = require('@opentelemetry/sdk-trace-base')
        const { ParentBasedSampler, TraceIdRatioBasedSampler } = require('@opentelemetry/sdk-trace-base')
        const { getNodeAutoInstrumentations } = require('@opentelemetry/auto-instrumentations-node')

        const protocol = process.env.TRACING_PROTOCOL || 'http'
        const collectorBase = (process.env.TELEMETRY_COLLECTOR_ENDPOINT || 'http://localhost:4318').replace(/\/+$/, '')
        const endpoint = `${collectorBase}/v1/traces`
        const sampleRate = parseFloat(process.env.TRACING_SAMPLE_RATE || '1.0')
        const serviceName = process.env.METRICS_SERVICE_NAME || 'Chronos'

        // Resolve the correct trace exporter based on protocol
        let OTLPTraceExporter
        if (protocol === 'grpc') {
            OTLPTraceExporter = require('@opentelemetry/exporter-trace-otlp-grpc').OTLPTraceExporter
        } else if (protocol === 'proto') {
            OTLPTraceExporter = require('@opentelemetry/exporter-trace-otlp-proto').OTLPTraceExporter
        } else {
            OTLPTraceExporter = require('@opentelemetry/exporter-trace-otlp-http').OTLPTraceExporter
        }

        const traceExporter = new OTLPTraceExporter({ url: endpoint })

        // Determine version (best-effort, fall back to 'unknown')
        let version = 'unknown'
        try {
            const { getVersion } = require('chronos-components')
            const versionInfo = await getVersion()
            version = versionInfo.version
        } catch {
            // version lookup is non-critical
        }

        const resource = resourceFromAttributes({
            [ATTR_SERVICE_NAME]: serviceName,
            [ATTR_SERVICE_VERSION]: version
        })

        const sampler = new ParentBasedSampler({
            root: new TraceIdRatioBasedSampler(sampleRate)
        })

        const sdk = new NodeSDK({
            resource,
            sampler,
            spanProcessor: new BatchSpanProcessor(traceExporter, {
                maxQueueSize: 2048,
                maxExportBatchSize: 512,
                scheduledDelayMillis: 5000
            }),
            instrumentations: [
                getNodeAutoInstrumentations({
                    // Only enable instrumentations that are useful for Chronos
                    '@opentelemetry/instrumentation-express': { enabled: true },
                    '@opentelemetry/instrumentation-http': { enabled: true },
                    '@opentelemetry/instrumentation-pg': { enabled: true },
                    '@opentelemetry/instrumentation-mysql2': { enabled: true },
                    '@opentelemetry/instrumentation-ioredis': { enabled: true },
                    // Disable noisy / unused instrumentations
                    '@opentelemetry/instrumentation-fs': { enabled: false },
                    '@opentelemetry/instrumentation-dns': { enabled: false },
                    '@opentelemetry/instrumentation-net': { enabled: false },
                    '@opentelemetry/instrumentation-generic-pool': { enabled: false }
                })
            ]
        })

        sdk.start()
        tracingInitialized = true

        // Graceful shutdown
        const shutdown = async () => {
            try {
                await sdk.shutdown()
            } catch {
                // best-effort
            }
        }
        process.on('SIGTERM', shutdown)
        process.on('SIGINT', shutdown)

        // eslint-disable-next-line no-console -- logger may not be initialized yet at this point
        console.log(`[tracing]: OpenTelemetry tracing initialized (endpoint=${endpoint}, protocol=${protocol}, sampleRate=${sampleRate})`)
    } catch (error) {
        // eslint-disable-next-line no-console -- logger may not be initialized yet at this point
        console.error('[tracing]: Failed to initialize OpenTelemetry tracing:', error)
        // Non-fatal: app continues without tracing
    }
}
