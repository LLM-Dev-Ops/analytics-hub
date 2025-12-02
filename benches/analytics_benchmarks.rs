//! Analytics Hub Benchmark Adapters
//!
//! This module provides benchmark adapters for Analytics Hub operations,
//! wrapping existing functionality without modifying core logic.

use criterion::{black_box, criterion_group, criterion_main, Criterion, BenchmarkId};
use chrono::Utc;
use std::sync::Arc;
use std::time::{Duration, Instant};
use llm_analytics_hub::analytics::{
    AggregationEngine,
    PredictionEngine,
    AnomalyDetector,
    CorrelationEngine,
    AnalyticsConfig,
};
use llm_analytics_hub::database::Database;
use llm_analytics_hub::models::metrics::TimeWindow;
use llm_analytics_hub::schemas::events::AnalyticsEvent;
use uuid::Uuid;

// ============================================================================
// BENCHMARK TRAIT DEFINITION
// ============================================================================

/// Result of a benchmark run
#[derive(Debug, Clone)]
pub struct BenchmarkResult {
    pub target_name: String,
    pub operation: String,
    pub duration: Duration,
    pub operations_count: usize,
    pub throughput_ops_per_sec: f64,
    pub avg_latency_ms: f64,
    pub p50_latency_ms: f64,
    pub p95_latency_ms: f64,
    pub p99_latency_ms: f64,
    pub success_rate: f64,
    pub metadata: BenchmarkMetadata,
}

/// Metadata for benchmark runs
#[derive(Debug, Clone)]
pub struct BenchmarkMetadata {
    pub timestamp: chrono::DateTime<Utc>,
    pub system_info: String,
    pub dataset_size: usize,
    pub concurrency: usize,
    pub custom_fields: std::collections::HashMap<String, String>,
}

/// Trait for benchmark targets
pub trait BenchTarget: Send + Sync {
    /// Name of the benchmark target
    fn name(&self) -> &'static str;

    /// Description of what this benchmark tests
    fn description(&self) -> &'static str;

    /// Run the benchmark and return results
    fn run_benchmark(&self) -> BenchmarkResult;

    /// Optional setup before benchmarking
    fn setup(&mut self) -> Result<(), anyhow::Error> {
        Ok(())
    }

    /// Optional teardown after benchmarking
    fn teardown(&mut self) -> Result<(), anyhow::Error> {
        Ok(())
    }
}

// ============================================================================
// METRICS AGGREGATION BENCHMARK ADAPTERS
// ============================================================================

/// Adapter for metrics aggregation benchmarks
pub struct MetricsAggregationBenchAdapter {
    config: AnalyticsConfig,
    sample_count: usize,
}

impl MetricsAggregationBenchAdapter {
    pub fn new(sample_count: usize) -> Self {
        Self {
            config: AnalyticsConfig::default(),
            sample_count,
        }
    }

    fn generate_test_event(value: f64) -> AnalyticsEvent {
        AnalyticsEvent {
            common: llm_analytics_hub::schemas::events::CommonEventFields {
                event_id: Uuid::new_v4(),
                event_type: "metric_sample".to_string(),
                timestamp: Utc::now(),
                source_module: "benchmark".to_string(),
                correlation_id: Some(Uuid::new_v4()),
                tags: std::collections::HashMap::new(),
            },
            payload: serde_json::json!({
                "latency": value,
                "tokens": value * 10.0,
                "cost": value * 0.001,
            }),
        }
    }
}

impl BenchTarget for MetricsAggregationBenchAdapter {
    fn name(&self) -> &'static str {
        "metrics_aggregation"
    }

    fn description(&self) -> &'static str {
        "Benchmark for time-series metrics aggregation across multiple windows"
    }

    fn run_benchmark(&self) -> BenchmarkResult {
        // Create a mock database (this is a simplified adapter)
        // In real scenario, you'd use actual DB connection
        let rt = tokio::runtime::Runtime::new().unwrap();
        let engine = rt.block_on(async {
            // Note: This requires Database::new() to be available
            // For this adapter, we'll measure the computational part only
            let db = Arc::new(Database::new().await.expect("Failed to create database"));
            AggregationEngine::new(db)
        });

        let mut timings = Vec::new();
        let mut successes = 0;

        for i in 0..self.sample_count {
            let event = Self::generate_test_event((i % 100) as f64);
            let start = Instant::now();

            let result = rt.block_on(async {
                engine.process_event(&event).await
            });

            let elapsed = start.elapsed();
            timings.push(elapsed);

            if result.is_ok() {
                successes += 1;
            }
        }

        self.compute_result("process_event", &timings, successes)
    }
}

// ============================================================================
// TIMESERIES ROLLUP BENCHMARK ADAPTERS
// ============================================================================

/// Adapter for timeseries rollup benchmarks
pub struct TimeseriesRollupBenchAdapter {
    window: TimeWindow,
    data_points: usize,
}

impl TimeseriesRollupBenchAdapter {
    pub fn new(window: TimeWindow, data_points: usize) -> Self {
        Self {
            window,
            data_points,
        }
    }
}

impl BenchTarget for TimeseriesRollupBenchAdapter {
    fn name(&self) -> &'static str {
        "timeseries_rollup"
    }

    fn description(&self) -> &'static str {
        "Benchmark for rolling up timeseries data across different time windows"
    }

    fn run_benchmark(&self) -> BenchmarkResult {
        let rt = tokio::runtime::Runtime::new().unwrap();
        let db = rt.block_on(async {
            Arc::new(Database::new().await.expect("Failed to create database"))
        });
        let engine = AggregationEngine::new(db);

        let mut timings = Vec::new();
        let mut successes = 0;

        let start_time = Utc::now() - chrono::Duration::hours(24);
        let end_time = Utc::now();

        // Benchmark getting aggregated stats for different windows
        for _ in 0..self.data_points {
            let start = Instant::now();

            let result = rt.block_on(async {
                engine.get_aggregated_stats(
                    "test_metric",
                    self.window,
                    start_time,
                    end_time,
                ).await
            });

            let elapsed = start.elapsed();
            timings.push(elapsed);

            if result.is_ok() {
                successes += 1;
            }
        }

        self.compute_result("get_aggregated_stats", &timings, successes)
    }
}

// ============================================================================
// MULTI-SOURCE FUSION BENCHMARK ADAPTERS
// ============================================================================

/// Adapter for multi-source data fusion benchmarks
pub struct MultiSourceFusionBenchAdapter {
    source_count: usize,
    events_per_source: usize,
}

impl MultiSourceFusionBenchAdapter {
    pub fn new(source_count: usize, events_per_source: usize) -> Self {
        Self {
            source_count,
            events_per_source,
        }
    }
}

impl BenchTarget for MultiSourceFusionBenchAdapter {
    fn name(&self) -> &'static str {
        "multi_source_fusion"
    }

    fn description(&self) -> &'static str {
        "Benchmark for fusing data from multiple sources via correlation engine"
    }

    fn run_benchmark(&self) -> BenchmarkResult {
        let engine = CorrelationEngine::new();
        let mut timings = Vec::new();
        let correlation_id = Uuid::new_v4();

        // Benchmark tracking correlations across multiple sources
        for source_idx in 0..self.source_count {
            for event_idx in 0..self.events_per_source {
                let event_id = Uuid::new_v4();
                let start = Instant::now();

                engine.track_correlation(correlation_id, event_id);

                let elapsed = start.elapsed();
                timings.push(elapsed);
            }
        }

        // Benchmark retrieving correlated events
        for _ in 0..10 {
            let start = Instant::now();
            let _ = engine.find_correlated_events(correlation_id);
            let elapsed = start.elapsed();
            timings.push(elapsed);
        }

        let total_ops = self.source_count * self.events_per_source + 10;
        self.compute_result("correlation_tracking", &timings, total_ops)
    }
}

// ============================================================================
// FORECAST GENERATION BENCHMARK ADAPTERS
// ============================================================================

/// Adapter for forecast generation benchmarks
pub struct ForecastGenerationBenchAdapter {
    forecast_method: ForecastMethod,
    history_size: usize,
    forecast_steps: usize,
}

#[derive(Debug, Clone)]
pub enum ForecastMethod {
    ARIMA,
    ExponentialSmoothing,
}

impl ForecastGenerationBenchAdapter {
    pub fn new(method: ForecastMethod, history_size: usize, forecast_steps: usize) -> Self {
        Self {
            forecast_method: method,
            history_size,
            forecast_steps,
        }
    }
}

impl BenchTarget for ForecastGenerationBenchAdapter {
    fn name(&self) -> &'static str {
        "forecast_generation"
    }

    fn description(&self) -> &'static str {
        "Benchmark for generating forecasts using ARIMA and exponential smoothing"
    }

    fn run_benchmark(&self) -> BenchmarkResult {
        let rt = tokio::runtime::Runtime::new().unwrap();
        let config = Arc::new(AnalyticsConfig {
            prediction_history_size: self.history_size,
            ..Default::default()
        });

        let engine = rt.block_on(async {
            PredictionEngine::new(config).await.expect("Failed to create prediction engine")
        });

        // Populate with historical data
        let metric_name = "test_forecast_metric";
        for i in 0..self.history_size {
            let value = 100.0 + (i as f64 * 0.5).sin() * 20.0; // Simulated pattern
            let timestamp = Utc::now() - chrono::Duration::minutes((self.history_size - i) as i64);
            engine.add_data_point(metric_name, value, timestamp).unwrap();
        }

        let mut timings = Vec::new();
        let mut successes = 0;

        // Benchmark forecast generation
        for _ in 0..100 {
            let start = Instant::now();

            let result = match self.forecast_method {
                ForecastMethod::ARIMA => {
                    engine.predict_arima(metric_name, self.forecast_steps)
                }
                ForecastMethod::ExponentialSmoothing => {
                    engine.predict_exponential_smoothing(metric_name, self.forecast_steps, 0.3)
                }
            };

            let elapsed = start.elapsed();
            timings.push(elapsed);

            if result.is_ok() {
                successes += 1;
            }
        }

        let method_name = format!("predict_{:?}", self.forecast_method);
        self.compute_result(&method_name, &timings, successes)
    }
}

// ============================================================================
// ANOMALY DETECTION BENCHMARK ADAPTERS
// ============================================================================

/// Adapter for anomaly detection benchmarks
pub struct AnomalyDetectionBenchAdapter {
    data_points: usize,
    anomaly_rate: f64, // Percentage of anomalies to inject
}

impl AnomalyDetectionBenchAdapter {
    pub fn new(data_points: usize, anomaly_rate: f64) -> Self {
        Self {
            data_points,
            anomaly_rate,
        }
    }
}

impl BenchTarget for AnomalyDetectionBenchAdapter {
    fn name(&self) -> &'static str {
        "anomaly_detection"
    }

    fn description(&self) -> &'static str {
        "Benchmark for statistical anomaly detection using z-score method"
    }

    fn run_benchmark(&self) -> BenchmarkResult {
        let rt = tokio::runtime::Runtime::new().unwrap();
        let config = Arc::new(AnalyticsConfig::default());

        let detector = rt.block_on(async {
            AnomalyDetector::new(config).await.expect("Failed to create anomaly detector")
        });

        let metric_name = "test_anomaly_metric";
        let mut timings = Vec::new();
        let mut detected_anomalies = 0;

        for i in 0..self.data_points {
            // Generate normal data with occasional anomalies
            let is_anomaly = (i as f64 / self.data_points as f64) < self.anomaly_rate;
            let value = if is_anomaly {
                100.0 + 200.0 // Anomalous spike
            } else {
                100.0 + ((i % 20) as f64 - 10.0) // Normal variation
            };

            let timestamp = Utc::now() - chrono::Duration::seconds((self.data_points - i) as i64);
            let start = Instant::now();

            let result = detector.check_anomaly(metric_name, value, timestamp);

            let elapsed = start.elapsed();
            timings.push(elapsed);

            if let Ok(Some(_anomaly)) = result {
                detected_anomalies += 1;
            }
        }

        let mut result = self.compute_result("check_anomaly", &timings, self.data_points);

        // Add custom metadata about detection rate
        result.metadata.custom_fields.insert(
            "detected_anomalies".to_string(),
            detected_anomalies.to_string(),
        );
        result.metadata.custom_fields.insert(
            "detection_rate".to_string(),
            format!("{:.2}%", (detected_anomalies as f64 / self.data_points as f64) * 100.0),
        );

        result
    }
}

// ============================================================================
// QUERY LATENCY BENCHMARK ADAPTERS
// ============================================================================

/// Adapter for query latency benchmarks
pub struct QueryLatencyBenchAdapter {
    query_count: usize,
    query_complexity: QueryComplexity,
}

#[derive(Debug, Clone)]
pub enum QueryComplexity {
    Simple,      // Single metric, single window
    Medium,      // Multiple metrics, single window
    Complex,     // Multiple metrics, multiple windows with joins
}

impl QueryLatencyBenchAdapter {
    pub fn new(query_count: usize, complexity: QueryComplexity) -> Self {
        Self {
            query_count,
            query_complexity: complexity,
        }
    }
}

impl BenchTarget for QueryLatencyBenchAdapter {
    fn name(&self) -> &'static str {
        "query_latency"
    }

    fn description(&self) -> &'static str {
        "Benchmark for query latency across different complexity levels"
    }

    fn run_benchmark(&self) -> BenchmarkResult {
        let rt = tokio::runtime::Runtime::new().unwrap();
        let db = rt.block_on(async {
            Arc::new(Database::new().await.expect("Failed to create database"))
        });
        let engine = AggregationEngine::new(db);

        let mut timings = Vec::new();
        let mut successes = 0;

        let start_time = Utc::now() - chrono::Duration::hours(1);
        let end_time = Utc::now();

        for _ in 0..self.query_count {
            let start = Instant::now();

            let result = match self.query_complexity {
                QueryComplexity::Simple => {
                    rt.block_on(async {
                        engine.get_aggregated_stats(
                            "latency",
                            TimeWindow::OneMinute,
                            start_time,
                            end_time,
                        ).await
                    })
                }
                QueryComplexity::Medium => {
                    rt.block_on(async {
                        // Query multiple metrics
                        let mut results = Vec::new();
                        for metric in &["latency", "tokens", "cost"] {
                            results.push(
                                engine.get_aggregated_stats(
                                    metric,
                                    TimeWindow::FiveMinutes,
                                    start_time,
                                    end_time,
                                ).await
                            );
                        }
                        Ok(results.into_iter().filter_map(|r| r.ok()).collect::<Vec<_>>())
                    })
                }
                QueryComplexity::Complex => {
                    rt.block_on(async {
                        // Query multiple metrics across multiple windows
                        let mut results = Vec::new();
                        for metric in &["latency", "tokens", "cost"] {
                            for window in &[TimeWindow::OneMinute, TimeWindow::FiveMinutes, TimeWindow::OneHour] {
                                results.push(
                                    engine.get_aggregated_stats(
                                        metric,
                                        *window,
                                        start_time,
                                        end_time,
                                    ).await
                                );
                            }
                        }
                        Ok(results.into_iter().filter_map(|r| r.ok()).collect::<Vec<_>>())
                    })
                }
            };

            let elapsed = start.elapsed();
            timings.push(elapsed);

            if result.is_ok() {
                successes += 1;
            }
        }

        let complexity_str = format!("query_{:?}", self.query_complexity);
        self.compute_result(&complexity_str, &timings, successes)
    }
}

// ============================================================================
// HELPER TRAIT IMPLEMENTATION
// ============================================================================

/// Helper trait for computing benchmark results
trait BenchmarkResultComputer {
    fn compute_result(&self, operation: &str, timings: &[Duration], successes: usize) -> BenchmarkResult;
}

impl<T: BenchTarget + ?Sized> BenchmarkResultComputer for T {
    fn compute_result(&self, operation: &str, timings: &[Duration], successes: usize) -> BenchmarkResult {
        let total_duration: Duration = timings.iter().sum();
        let operations_count = timings.len();

        let mut sorted_ms: Vec<f64> = timings
            .iter()
            .map(|d| d.as_secs_f64() * 1000.0)
            .collect();
        sorted_ms.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));

        let avg_latency_ms = if !sorted_ms.is_empty() {
            sorted_ms.iter().sum::<f64>() / sorted_ms.len() as f64
        } else {
            0.0
        };

        let p50_latency_ms = percentile(&sorted_ms, 50.0);
        let p95_latency_ms = percentile(&sorted_ms, 95.0);
        let p99_latency_ms = percentile(&sorted_ms, 99.0);

        let throughput_ops_per_sec = if total_duration.as_secs_f64() > 0.0 {
            operations_count as f64 / total_duration.as_secs_f64()
        } else {
            0.0
        };

        let success_rate = if operations_count > 0 {
            (successes as f64 / operations_count as f64) * 100.0
        } else {
            0.0
        };

        BenchmarkResult {
            target_name: self.name().to_string(),
            operation: operation.to_string(),
            duration: total_duration,
            operations_count,
            throughput_ops_per_sec,
            avg_latency_ms,
            p50_latency_ms,
            p95_latency_ms,
            p99_latency_ms,
            success_rate,
            metadata: BenchmarkMetadata {
                timestamp: Utc::now(),
                system_info: format!("{} {}", std::env::consts::OS, std::env::consts::ARCH),
                dataset_size: operations_count,
                concurrency: 1,
                custom_fields: std::collections::HashMap::new(),
            },
        }
    }
}

fn percentile(sorted_data: &[f64], p: f64) -> f64 {
    if sorted_data.is_empty() {
        return 0.0;
    }
    let index = ((p / 100.0) * (sorted_data.len() - 1) as f64).round() as usize;
    sorted_data[index.min(sorted_data.len() - 1)]
}

// ============================================================================
// ALL TARGETS REGISTRY
// ============================================================================

/// Returns all benchmark targets for analytics operations
pub fn all_targets() -> Vec<Box<dyn BenchTarget>> {
    vec![
        // Metrics aggregation benchmarks
        Box::new(MetricsAggregationBenchAdapter::new(1000)),
        Box::new(MetricsAggregationBenchAdapter::new(10000)),

        // Timeseries rollup benchmarks
        Box::new(TimeseriesRollupBenchAdapter::new(TimeWindow::OneMinute, 100)),
        Box::new(TimeseriesRollupBenchAdapter::new(TimeWindow::FiveMinutes, 100)),
        Box::new(TimeseriesRollupBenchAdapter::new(TimeWindow::OneHour, 100)),

        // Multi-source fusion benchmarks
        Box::new(MultiSourceFusionBenchAdapter::new(5, 100)),
        Box::new(MultiSourceFusionBenchAdapter::new(10, 1000)),

        // Forecast generation benchmarks
        Box::new(ForecastGenerationBenchAdapter::new(ForecastMethod::ARIMA, 100, 10)),
        Box::new(ForecastGenerationBenchAdapter::new(ForecastMethod::ARIMA, 100, 50)),
        Box::new(ForecastGenerationBenchAdapter::new(ForecastMethod::ExponentialSmoothing, 100, 10)),

        // Anomaly detection benchmarks
        Box::new(AnomalyDetectionBenchAdapter::new(1000, 0.05)),
        Box::new(AnomalyDetectionBenchAdapter::new(10000, 0.02)),

        // Query latency benchmarks
        Box::new(QueryLatencyBenchAdapter::new(100, QueryComplexity::Simple)),
        Box::new(QueryLatencyBenchAdapter::new(100, QueryComplexity::Medium)),
        Box::new(QueryLatencyBenchAdapter::new(50, QueryComplexity::Complex)),
    ]
}

/// Run all benchmarks and return results
pub fn run_all_benchmarks() -> Vec<BenchmarkResult> {
    let targets = all_targets();
    let mut results = Vec::new();

    for mut target in targets {
        println!("Running benchmark: {} - {}", target.name(), target.description());

        if let Err(e) = target.setup() {
            eprintln!("Setup failed for {}: {}", target.name(), e);
            continue;
        }

        let result = target.run_benchmark();
        println!(
            "  ✓ {} ops in {:.2}s ({:.0} ops/sec, avg: {:.2}ms, p95: {:.2}ms)",
            result.operations_count,
            result.duration.as_secs_f64(),
            result.throughput_ops_per_sec,
            result.avg_latency_ms,
            result.p95_latency_ms
        );

        results.push(result);

        if let Err(e) = target.teardown() {
            eprintln!("Teardown failed for {}: {}", target.name(), e);
        }
    }

    results
}

// ============================================================================
// CRITERION BENCHMARK GROUPS
// ============================================================================

fn bench_metrics_aggregation(c: &mut Criterion) {
    let adapter = MetricsAggregationBenchAdapter::new(100);
    c.bench_function("metrics_aggregation_100", |b| {
        b.iter(|| {
            adapter.run_benchmark()
        })
    });
}

fn bench_forecast_generation(c: &mut Criterion) {
    let mut group = c.benchmark_group("forecast_generation");

    for &steps in &[10, 20, 50] {
        group.bench_with_input(
            BenchmarkId::new("ARIMA", steps),
            &steps,
            |b, &steps| {
                let adapter = ForecastGenerationBenchAdapter::new(
                    ForecastMethod::ARIMA,
                    100,
                    steps,
                );
                b.iter(|| adapter.run_benchmark())
            },
        );
    }

    group.finish();
}

fn bench_anomaly_detection(c: &mut Criterion) {
    let adapter = AnomalyDetectionBenchAdapter::new(1000, 0.05);
    c.bench_function("anomaly_detection_1000", |b| {
        b.iter(|| {
            adapter.run_benchmark()
        })
    });
}

fn bench_query_latency(c: &mut Criterion) {
    let mut group = c.benchmark_group("query_latency");

    for complexity in &[QueryComplexity::Simple, QueryComplexity::Medium, QueryComplexity::Complex] {
        group.bench_with_input(
            BenchmarkId::new("query", format!("{:?}", complexity)),
            complexity,
            |b, complexity| {
                let adapter = QueryLatencyBenchAdapter::new(10, complexity.clone());
                b.iter(|| adapter.run_benchmark())
            },
        );
    }

    group.finish();
}

criterion_group!(
    analytics_benches,
    bench_metrics_aggregation,
    bench_forecast_generation,
    bench_anomaly_detection,
    bench_query_latency
);

criterion_main!(analytics_benches);
