export interface IMetricsProvider {
    getName(): string
    initializeCounters(): void
    setupMetricsEndpoint(): void
    incrementCounter(counter: CHRONOS_METRIC_COUNTERS, payload: any): void
}

export enum CHRONOS_COUNTER_STATUS {
    SUCCESS = 'success',
    FAILURE = 'failure'
}

export enum CHRONOS_METRIC_COUNTERS {
    AGENTFLOW_CREATED = 'agentflow_created',
    ASSISTANT_CREATED = 'assistant_created',
    TOOL_CREATED = 'tool_created',
    TOOL_INVOCATION = 'tool_invocation',
    VECTORSTORE_UPSERT = 'vector_upserted',

    AGENTFLOW_PREDICTION_INTERNAL = 'agentflow_prediction_internal',
    AGENTFLOW_PREDICTION_EXTERNAL = 'agentflow_prediction_external'
}
