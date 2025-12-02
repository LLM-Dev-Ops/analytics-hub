# Analytics Hub Benchmarks - Quick Start Guide

## Overview

This guide helps you quickly run benchmarks for Analytics Hub operations.

## Available Benchmarks

### 1. Metrics Aggregation
- **What**: Process events and aggregate across time windows
- **Adapters**: 2 (1K and 10K events)
- **Measures**: Event processing throughput, aggregation latency

### 2. Timeseries Rollup
- **What**: Query aggregated data across different time windows
- **Adapters**: 3 (1m, 5m, 1h windows)
- **Measures**: Query latency, data retrieval speed

### 3. Multi-Source Fusion
- **What**: Correlate events from multiple sources
- **Adapters**: 2 (5 sources, 10 sources)
- **Measures**: Correlation tracking speed, retrieval latency

### 4. Forecast Generation
- **What**: Generate forecasts using ARIMA and exponential smoothing
- **Adapters**: 3 (ARIMA 10-step, 50-step, Exp. Smoothing)
- **Measures**: Forecast generation time

### 5. Anomaly Detection
- **What**: Detect anomalies using z-score method
- **Adapters**: 2 (1K points, 10K points)
- **Measures**: Detection latency, detection accuracy

### 6. Query Latency
- **What**: Measure query performance across complexity levels
- **Adapters**: 3 (Simple, Medium, Complex)
- **Measures**: Query execution time

## Quick Commands

### List All Benchmarks
```bash
llm-analytics benchmark list
```

### List with Details
```bash
llm-analytics benchmark list --verbose
```

### Run All Benchmarks
```bash
llm-analytics benchmark run
```

### Run Specific Category
```bash
# Anomaly detection only
llm-analytics benchmark run --filter anomaly

# Forecasting only
llm-analytics benchmark run --filter forecast

# Query latency only
llm-analytics benchmark run --filter query
```

### Run with Multiple Iterations
```bash
llm-analytics benchmark run --iterations 10
```

### Save Results to File
```bash
llm-analytics benchmark run --output results.json
```

### JSON Output
```bash
llm-analytics benchmark run --json
```

### Combined Options
```bash
llm-analytics benchmark run \
  --filter anomaly \
  --iterations 5 \
  --output anomaly_results.json \
  --json
```

## Using Criterion (Statistical Benchmarks)

### Run All Benchmarks
```bash
cargo bench --bench analytics_benchmarks
```

### Run Specific Benchmark
```bash
cargo bench --bench analytics_benchmarks -- metrics_aggregation
cargo bench --bench analytics_benchmarks -- forecast_generation
cargo bench --bench analytics_benchmarks -- anomaly_detection
```

### Save Baseline
```bash
cargo bench --bench analytics_benchmarks --save-baseline main
```

### Compare Against Baseline
```bash
cargo bench --bench analytics_benchmarks --baseline main
```

### View HTML Reports
```bash
# After running benchmarks
open target/criterion/report/index.html
```

## Understanding Results

### Key Metrics

1. **Throughput**: Operations per second
   - Higher is better
   - Target: >50,000 ops/sec for ingestion

2. **Latency (p50)**: Median response time
   - Lower is better
   - Typical value for most operations

3. **Latency (p95)**: 95th percentile response time
   - Lower is better
   - Target: <200ms for queries

4. **Latency (p99)**: 99th percentile response time
   - Lower is better
   - Target: <100ms for production

5. **Success Rate**: Percentage of successful operations
   - Should be 100% or very close

### Sample Output

```
Running benchmark: anomaly_detection - Benchmark for statistical anomaly detection

  ✓ 1000 ops in 2.50s (400 ops/sec, avg: 2.50ms, p95: 4.10ms)
```

This means:
- Processed 1,000 data points
- Took 2.50 seconds total
- Achieved 400 operations per second
- Average latency: 2.50ms per operation
- 95% of operations completed in under 4.10ms

## Troubleshooting

### Database Connection Required

Some benchmarks require a database connection:

```bash
# Start TimescaleDB
docker-compose up -d timescaledb

# Set connection string
export DATABASE_URL="postgres://postgres:postgres@localhost:5432/analytics"
```

### Missing Dependencies

```bash
# Install Criterion
cargo add --dev criterion --features html_reports,async_tokio
```

### Compilation Errors

```bash
# Check benchmark compilation
cargo check --benches

# Build benchmarks
cargo build --benches
```

## Performance Targets

### MVP (Current)
- Event Ingestion: 50,000 events/sec
- Query Latency (p95): <200ms
- Anomaly Detection: >85% accuracy

### Production (Goal)
- Event Ingestion: 100,000 events/sec
- Query Latency (p99): <100ms
- Anomaly Detection: >90% accuracy

## File Locations

- **Benchmark Code**: `/workspaces/analytics-hub/benches/analytics_benchmarks.rs`
- **CLI Command**: `/workspaces/analytics-hub/src/cli/benchmark.rs`
- **Full Report**: `/workspaces/analytics-hub/BENCHMARK_ADAPTERS_REPORT.md`

## Next Steps

1. **Run Initial Benchmarks**
   ```bash
   llm-analytics benchmark run --output baseline.json
   ```

2. **Review Results**
   ```bash
   cat baseline.json | jq '.benchmarks[] | {name, throughput_ops_per_sec, p95_latency_ms}'
   ```

3. **Compare Over Time**
   ```bash
   # After code changes
   llm-analytics benchmark run --output current.json

   # Compare
   diff baseline.json current.json
   ```

4. **Run Statistical Analysis**
   ```bash
   cargo bench --bench analytics_benchmarks --save-baseline initial

   # After optimizations
   cargo bench --bench analytics_benchmarks --baseline initial
   ```

## Additional Resources

- Full documentation: `BENCHMARK_ADAPTERS_REPORT.md`
- Criterion guide: https://bheisler.github.io/criterion.rs/book/
- Analytics code: `src/analytics/`

## Support

For issues or questions:
1. Check `BENCHMARK_ADAPTERS_REPORT.md`
2. Review benchmark code comments
3. Run `llm-analytics benchmark list --verbose`
