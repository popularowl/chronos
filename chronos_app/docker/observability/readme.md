# Chronos Observability Stack

Self-hosted observability stack for Chronos providing unified logs, traces, and metrics collection. All components run locally via Docker Compose with zero external dependencies.

## Components

| Service | Image | Purpose | Port |
|---------|-------|---------|------|
| **Grafana Alloy** | `grafana/alloy:latest` | Unified telemetry collector (logs via Docker socket, traces + metrics via OTLP) | 12345 (UI), 4317 (OTLP gRPC), 4318 (OTLP HTTP) |
| **Grafana Loki** | `grafana/loki:3.0.0` | Log aggregation and storage | 3100 |
| **Grafana Tempo** | `grafana/tempo:2.6.1` | Distributed trace storage | 3200 |
| **Prometheus** | `prom/prometheus:v3.2.1` | Metrics storage and scraping | 9090 |
| **Grafana** | `grafana/grafana:latest` | Visualization and dashboards | 3000 |


### Service URLs

| Service | URL | Credentials |
|---------|-----|-------------|
| Grafana | http://localhost:3000 | admin / admin |
| Alloy UI | http://localhost:12345 | - |
| Prometheus | http://localhost:9090 | - |
| Loki API | http://localhost:3100 | - |
| Tempo API | http://localhost:3200 | - |

## Architecture

```
┌─────────────────┐     ┌─────────────────┐
│  chronos-server │     │ chronos-worker  │
│  (container)    │     │  (containers)   │
└───┬─────────┬───┘     └───┬─────────┬───┘
    │         │             │         │
    │ Docker  │ OTLP        │ Docker  │ OTLP
    │ logs    │ (traces,    │ logs    │ (traces,
    │         │  metrics,   │         │  metrics,
    │         │  logs)      │         │  logs)
    │         │             │         │
    └────┬────┴─────────────┴────┬────┘
         │                       │
         ▼                       ▼
    ┌──────────────────────────────────┐
    │         Grafana Alloy            │
    │  - Docker log discovery          │
    │  - OTLP receiver (4317/4318)     │
    │  - Batch processing              │
    │  - Fan-out to backends           │
    └──┬──────────┬──────────┬─────────┘
       │          │          │
  Logs │   Traces │  Metrics │
       │          │          │
       ▼          ▼          ▼
  ┌────────┐ ┌────────┐ ┌────────────┐
  │  Loki  │ │ Tempo  │ │ Prometheus │
  │ (logs) │ │(traces)│ │ (metrics)  │
  └───┬────┘ └───┬────┘ └─────┬──────┘
      │          │    span     │
      │          │   metrics   │
      │          ├────────────►│
      │          │ (remote     │
      │          │  write)     │
      └──────────┼─────────────┘
                 │
                 ▼
          ┌────────────┐
          │  Grafana   │
          │ (unified   │
          │  dashboard)│
          └────────────┘
```

### Data Flow

1. **Logs (Docker)**: Alloy discovers running Chronos containers via the Docker socket, reads container logs, parses JSON, extracts labels, and forwards to Loki
2. **Traces (OTLP)**: Chronos app exports traces via OTLP to Alloy (ports 4317/4318), Alloy batches and forwards to Tempo
3. **Metrics (OTLP)**: When `METRICS_PROVIDER=open_telemetry`, Chronos exports metrics via OTLP to Alloy, which remote-writes to Prometheus
4. **Metrics (Prometheus scrape)**: When `METRICS_PROVIDER=prometheus`, Prometheus scrapes the `/api/v1/metrics` endpoint directly from Chronos
5. **Span Metrics (Tempo → Prometheus)**: Tempo's metrics-generator derives `traces_spanmetrics_*` metrics (call counts, latency histograms) from ingested traces and remote-writes them to Prometheus. These power the traces dashboard panels.
6. **Grafana** queries all three backends with cross-linking (click from a log line to its trace, from a trace to related metrics)

## Configuration Files

| File | Description |
|------|-------------|
| `observability-stack.yml` | Docker Compose service definitions |
| `configs/alloy-config.alloy` | Alloy pipeline: Docker log discovery + OTLP receiver + exporters |
| `configs/loki-config.yml` | Loki storage and ingestion settings |
| `configs/tempo-config.yml` | Tempo trace storage, compaction, and metrics generator |
| `configs/prometheus.yml` | Prometheus scrape targets and settings |
| `configs/grafana/provisioning/datasources/` | Auto-provisioned Grafana datasources (Loki, Tempo, Prometheus) |
| `configs/grafana/provisioning/dashboards/` | Auto-provisioned Grafana dashboards |

## Chronos Environment Variables

These variables are set on the Chronos app containers (in `docker-compose.yml` or `docker-compose-workers.yml`). When running inside Docker with the observability stack, use `alloy` as the hostname (Docker DNS). When running locally outside Docker, use `localhost`.

### Telemetry Collector

```bash
TELEMETRY_COLLECTOR_ENDPOINT=http://alloy:4318                          # OTLP base URL (use alloy:4318 in Docker, localhost:4318 outside)
```

The app appends `/v1/traces` and `/v1/metrics` automatically. One endpoint for all signals.

### Metrics

```bash
ENABLE_METRICS=true                                                     # Enable Prometheus metrics endpoint
METRICS_PROVIDER=prometheus                                             # prometheus | open_telemetry
METRICS_SERVICE_NAME=Chronos                                            # Service name in metrics
METRICS_OPEN_TELEMETRY_PROTOCOL=http                                    # http | grpc | proto
```

### Tracing

```bash
ENABLE_TRACING=true                                                     # Enable distributed tracing
TRACING_PROTOCOL=http                                                   # http | grpc | proto
TRACING_SAMPLE_RATE=1.0                                                 # 0.0 to 1.0 (1.0 = trace everything)
TRACING_DEBUG=false                                                     # Log spans to console
```

### Log-Trace Correlation

```bash
ENABLE_LOG_CORRELATION=true                                             # Inject traceId/spanId into log lines
```

## Grafana Datasource Cross-Linking

The provisioned datasources are configured with cross-references:

- **Loki -> Tempo**: Log lines containing a `traceId` field link directly to the trace in Tempo
- **Tempo -> Loki**: Trace view shows correlated logs filtered by trace/span ID
- **Tempo -> Prometheus**: Trace view links to related metrics with time-shifted queries
- **Prometheus -> Tempo**: Metric exemplars link to trace IDs in Tempo
- **Tempo service map**: Auto-generated dependency graph from span-metrics (powered by Prometheus)

## Querying

### Logs (Loki)

In Grafana, select the **Loki** datasource and use LogQL:

```logql
# All Chronos server logs
{service="chronos-server"}

# Error logs only
{service=~"chronos.*"} | json | level = "error"

# Search for specific text
{service=~"chronos.*"} |= "prediction"

# Rate of errors per minute
sum(rate({service=~"chronos.*"} | json | level = "error" [1m])) by (service)
```

### Traces (Tempo)

In Grafana, select the **Tempo** datasource and use TraceQL:

```
# Find traces for a specific workflow
{ resource.service.name = "Chronos" && name = "workflow.execute" }

# Find slow traces (> 5 seconds)
{ resource.service.name = "Chronos" && duration > 5s }

# Find error traces
{ resource.service.name = "Chronos" && status = error }
```

### Metrics (Prometheus)

In Grafana, select the **Prometheus** datasource and use PromQL:

```promql
# HTTP request rate
rate(http_requests_total[5m])

# Request duration p95
histogram_quantile(0.95, rate(http_request_duration_ms_bucket[5m]))

# Workflow execution counters
chatflow_created_total
```

### Dashboard

A pre-configured log dashboard is available at:
**Dashboards -> Chronos -> Chronos Logs**

## Log Labels

Alloy automatically extracts the following labels from Docker containers:

| Label | Description |
|-------|-------------|
| `container` | Container name |
| `container_id` | Docker container ID |
| `image` | Docker image name |
| `service` | Docker Compose service name |
| `project` | Docker Compose project name |
| `stream` | stdout or stderr |
| `level` | Log level (if JSON formatted) |

## Retention

| Backend | Default Retention | Config File |
|---------|-------------------|-------------|
| Loki (logs) | 30 days | `configs/loki-config.yml` -> `limits_config.retention_period` |
| Tempo (traces) | 30 days | `configs/tempo-config.yml` -> `compactor.compaction.block_retention` |
| Prometheus (metrics) | 30 days | `observability-stack.yml` -> `--storage.tsdb.retention.time` |

## Resource Estimates

| Service | Memory (idle) | Memory (active) |
|---------|--------------|-----------------|
| Alloy | ~50MB | ~150MB |
| Loki | ~100MB | ~300MB |
| Tempo | ~80MB | ~250MB |
| Prometheus | ~100MB | ~300MB |
| Grafana | ~80MB | ~200MB |
| **Total** | **~410MB** | **~1.2GB** |

## Troubleshooting

### No logs appearing in Grafana

1. Check Alloy is running: `docker compose -f observability/observability-stack.yml logs alloy`
2. Verify Alloy UI at http://localhost:12345 shows targets
3. Check Loki is receiving logs: `curl http://localhost:3100/ready`

### No traces appearing in Grafana

1. Verify Tempo is ready: `curl http://localhost:3200/ready`
2. Check Alloy UI at http://localhost:12345 — the `otelcol.receiver.otlp` component should show as healthy
3. Confirm the app has `ENABLE_TRACING=true` and `TELEMETRY_COLLECTOR_ENDPOINT` points to Alloy (e.g. `http://alloy:4318`)
4. Check Alloy logs for export errors: `docker compose -f observability/observability-stack.yml logs alloy | grep -i error`

### No metrics in Prometheus

1. Check Prometheus targets: http://localhost:9090/targets
2. If using `METRICS_PROVIDER=prometheus`, ensure the Chronos container is reachable at `chronos:3000` from the Prometheus container (they must share a Docker network)
3. If using `METRICS_PROVIDER=open_telemetry`, check Alloy is forwarding via remote write in the Alloy UI

### Alloy can't access Docker socket

Ensure the Docker socket is mounted:
```yaml
volumes:
  - /var/run/docker.sock:/var/run/docker.sock:ro
```

On some systems (SELinux), you may need:
```bash
sudo chcon -Rt svirt_sandbox_file_t /var/run/docker.sock
```

### Resetting data

To clear all stored observability data and start fresh:

```bash
cd chronos_app/docker/observability
docker compose -f observability-stack.yml down
rm -rf .alloy .loki .tempo .prometheus .grafana
docker compose -f observability-stack.yml up -d
```
