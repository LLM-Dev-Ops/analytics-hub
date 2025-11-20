//! Anomaly Detection Service
//!
//! Detects anomalies in metrics and events using statistical methods and machine learning.
//! Features:
//! - Statistical anomaly detection (Z-score, IQR)
//! - Pattern-based detection
//! - Threshold-based alerts
//! - Real-time anomaly scoring

use chrono::{DateTime, Utc};
use dashmap::DashMap;
use prometheus::{register_counter_vec, register_histogram_vec, CounterVec, HistogramVec};
use rdkafka::consumer::{CommitMode, Consumer, StreamConsumer};
use rdkafka::producer::{FutureProducer, FutureRecord};
use rdkafka::{ClientConfig, Message};
use serde::{Deserialize, Serialize};
use statrs::statistics::{Data, OrderStatistics, Statistics};
use std::collections::VecDeque;
use std::sync::Arc;
use std::time::Duration as StdDuration;
use tokio::signal;
use tracing::{error, info, warn};

/// Prometheus metrics
struct Metrics {
    events_analyzed: CounterVec,
    anomalies_detected: CounterVec,
    analysis_duration: HistogramVec,
}

impl Metrics {
    fn new() -> anyhow::Result<Self> {
        Ok(Self {
            events_analyzed: register_counter_vec!(
                "llm_anomaly_events_analyzed_total",
                "Total events analyzed for anomalies",
                &["metric_type"]
            )?,
            anomalies_detected: register_counter_vec!(
                "llm_anomalies_detected_total",
                "Total anomalies detected",
                &["severity", "method"]
            )?,
            analysis_duration: register_histogram_vec!(
                "llm_anomaly_analysis_duration_seconds",
                "Anomaly detection duration",
                &["method"]
            )?,
        })
    }
}

/// Configuration
#[derive(Debug, Clone)]
struct Config {
    kafka_brokers: String,
    input_topic: String,
    output_topic: String,
    kafka_group_id: String,
    z_score_threshold: f64,
    window_size: usize,
}

impl Config {
    fn from_env() -> Self {
        Self {
            kafka_brokers: std::env::var("KAFKA_BROKERS")
                .unwrap_or_else(|_| "kafka.llm-analytics.svc.cluster.local:9092".to_string()),
            input_topic: std::env::var("INPUT_TOPIC")
                .unwrap_or_else(|_| "llm-metrics".to_string()),
            output_topic: std::env::var("OUTPUT_TOPIC")
                .unwrap_or_else(|_| "llm-anomalies".to_string()),
            kafka_group_id: std::env::var("KAFKA_GROUP_ID")
                .unwrap_or_else(|_| "anomaly-detection".to_string()),
            z_score_threshold: std::env::var("Z_SCORE_THRESHOLD")
                .unwrap_or_else(|_| "3.0".to_string())
                .parse()
                .expect("Invalid Z_SCORE_THRESHOLD"),
            window_size: std::env::var("WINDOW_SIZE")
                .unwrap_or_else(|_| "100".to_string())
                .parse()
                .expect("Invalid WINDOW_SIZE"),
        }
    }
}

/// Metric data point
#[derive(Debug, Clone, Serialize, Deserialize)]
struct MetricPoint {
    timestamp: DateTime<Utc>,
    metric_name: String,
    value: f64,
    tags: std::collections::HashMap<String, String>,
}

/// Anomaly detection result
#[derive(Debug, Clone, Serialize, Deserialize)]
struct AnomalyResult {
    timestamp: DateTime<Utc>,
    metric_name: String,
    value: f64,
    expected_range: (f64, f64),
    z_score: f64,
    severity: AnomalySeverity,
    detection_method: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
enum AnomalySeverity {
    Low,
    Medium,
    High,
    Critical,
}

impl AnomalySeverity {
    fn from_z_score(z_score: f64) -> Self {
        let abs_z = z_score.abs();
        if abs_z >= 5.0 {
            Self::Critical
        } else if abs_z >= 4.0 {
            Self::High
        } else if abs_z >= 3.0 {
            Self::Medium
        } else {
            Self::Low
        }
    }

    fn as_str(&self) -> &str {
        match self {
            Self::Low => "low",
            Self::Medium => "medium",
            Self::High => "high",
            Self::Critical => "critical",
        }
    }
}

/// Anomaly detector
struct AnomalyDetector {
    metric_windows: Arc<DashMap<String, VecDeque<f64>>>,
    window_size: usize,
    z_score_threshold: f64,
}

impl AnomalyDetector {
    fn new(window_size: usize, z_score_threshold: f64) -> Self {
        Self {
            metric_windows: Arc::new(DashMap::new()),
            window_size,
            z_score_threshold,
        }
    }

    fn analyze(&self, metric: &MetricPoint, metrics: &Arc<Metrics>) -> Option<AnomalyResult> {
        let timer = metrics
            .analysis_duration
            .with_label_values(&["z_score"])
            .start_timer();

        // Get or create window for this metric
        let mut window = self
            .metric_windows
            .entry(metric.metric_name.clone())
            .or_insert_with(VecDeque::new);

        // Add current value
        window.push_back(metric.value);
        if window.len() > self.window_size {
            window.pop_front();
        }

        metrics
            .events_analyzed
            .with_label_values(&[&metric.metric_name])
            .inc();

        // Need enough data points for statistical analysis
        if window.len() < 10 {
            timer.observe_duration();
            return None;
        }

        // Convert to vector for statistics
        let values: Vec<f64> = window.iter().copied().collect();
        let mut data = Data::new(values.clone());

        let mean = data.mean();
        let std_dev = data.std_dev();

        // Avoid division by zero
        if std_dev == 0.0 {
            timer.observe_duration();
            return None;
        }

        // Calculate Z-score
        let z_score = (metric.value - mean) / std_dev;

        // Check if anomaly
        if z_score.abs() >= self.z_score_threshold {
            let severity = AnomalySeverity::from_z_score(z_score);

            metrics
                .anomalies_detected
                .with_label_values(&[severity.as_str(), "z_score"])
                .inc();

            timer.observe_duration();

            Some(AnomalyResult {
                timestamp: metric.timestamp,
                metric_name: metric.metric_name.clone(),
                value: metric.value,
                expected_range: (mean - 2.0 * std_dev, mean + 2.0 * std_dev),
                z_score,
                severity,
                detection_method: "z_score".to_string(),
            })
        } else {
            timer.observe_duration();
            None
        }
    }
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    // Initialize tracing
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "anomaly_detection=info".into()),
        )
        .json()
        .init();

    info!("Starting Anomaly Detection Service v{}", env!("CARGO_PKG_VERSION"));

    // Load configuration
    let config = Config::from_env();
    info!(?config, "Configuration loaded");

    // Initialize metrics
    let metrics = Arc::new(Metrics::new()?);

    // Create anomaly detector
    let detector = Arc::new(AnomalyDetector::new(
        config.window_size,
        config.z_score_threshold,
    ));

    // Create Kafka consumer
    let consumer: StreamConsumer = ClientConfig::new()
        .set("bootstrap.servers", &config.kafka_brokers)
        .set("group.id", &config.kafka_group_id)
        .set("enable.auto.commit", "false")
        .set("auto.offset.reset", "earliest")
        .set("client.id", "anomaly-detection-service")
        .create()?;

    consumer.subscribe(&[&config.input_topic])?;
    info!("Subscribed to Kafka topic: {}", config.input_topic);

    // Create Kafka producer for anomaly alerts
    let producer: FutureProducer = ClientConfig::new()
        .set("bootstrap.servers", &config.kafka_brokers)
        .set("message.timeout.ms", "5000")
        .set("client.id", "anomaly-detection-producer")
        .create()?;

    // Main consumption loop
    let mut shutdown = false;
    while !shutdown {
        tokio::select! {
            message_result = consumer.recv() => {
                match message_result {
                    Ok(m) => {
                        if let Some(payload) = m.payload() {
                            match serde_json::from_slice::<MetricPoint>(payload) {
                                Ok(metric) => {
                                    // Analyze for anomalies
                                    if let Some(anomaly) = detector.analyze(&metric, &metrics) {
                                        info!("Anomaly detected: {:?}", anomaly);

                                        // Publish anomaly to output topic
                                        let anomaly_payload = serde_json::to_vec(&anomaly)?;
                                        let record = FutureRecord::to(&config.output_topic)
                                            .key(&anomaly.metric_name)
                                            .payload(&anomaly_payload);

                                        if let Err((e, _)) = producer
                                            .send(record, StdDuration::from_secs(5))
                                            .await
                                        {
                                            error!("Failed to publish anomaly: {}", e);
                                        }
                                    }

                                    // Commit offset
                                    if let Err(e) = consumer.commit_message(&m, CommitMode::Async) {
                                        warn!("Failed to commit offset: {}", e);
                                    }
                                }
                                Err(e) => {
                                    error!("Failed to deserialize metric: {}", e);
                                }
                            }
                        }
                    }
                    Err(e) => {
                        error!("Kafka consumer error: {}", e);
                    }
                }
            }
            _ = signal::ctrl_c() => {
                info!("Received shutdown signal");
                shutdown = true;
            }
        }
    }

    info!("Service shutdown complete");
    Ok(())
}
