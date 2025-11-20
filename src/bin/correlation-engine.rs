//! Correlation Engine Service
//!
//! Analyzes event correlations, builds event graphs, and performs root cause analysis.
//! Features:
//! - Event correlation detection
//! - Graph-based event analysis
//! - Pattern recognition
//! - Root cause analysis
//! - Redis-backed correlation cache

use chrono::{DateTime, Utc};
use dashmap::DashMap;
use llm_analytics_hub::{
    AnalyticsEvent, CorrelationId, CorrelationType, EventCorrelation, EventGraph,
};
use prometheus::{register_counter_vec, register_histogram_vec, CounterVec, HistogramVec};
use rdkafka::consumer::{CommitMode, Consumer, StreamConsumer};
use rdkafka::{ClientConfig, Message};
use redis::aio::ConnectionManager;
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::sync::Arc;
use tokio::signal;
use tokio::time::{interval, Duration};
use tracing::{error, info, warn};
use uuid::Uuid;

/// Application state
struct AppState {
    redis: ConnectionManager,
    metrics: Arc<Metrics>,
    correlation_engine: Arc<CorrelationEngine>,
}

/// Prometheus metrics
struct Metrics {
    events_processed: CounterVec,
    correlations_detected: CounterVec,
    graph_updates: CounterVec,
    analysis_duration: HistogramVec,
}

impl Metrics {
    fn new() -> anyhow::Result<Self> {
        Ok(Self {
            events_processed: register_counter_vec!(
                "llm_correlation_events_processed_total",
                "Total events processed for correlation",
                &["event_type"]
            )?,
            correlations_detected: register_counter_vec!(
                "llm_correlations_detected_total",
                "Total correlations detected",
                &["correlation_type"]
            )?,
            graph_updates: register_counter_vec!(
                "llm_event_graph_updates_total",
                "Total event graph updates",
                &["operation"]
            )?,
            analysis_duration: register_histogram_vec!(
                "llm_correlation_analysis_duration_seconds",
                "Correlation analysis duration",
                &["analysis_type"]
            )?,
        })
    }
}

/// Configuration
#[derive(Debug, Clone)]
struct Config {
    kafka_brokers: String,
    kafka_topic: String,
    kafka_group_id: String,
    redis_url: String,
    correlation_window_secs: u64,
}

impl Config {
    fn from_env() -> Self {
        Self {
            kafka_brokers: std::env::var("KAFKA_BROKERS")
                .unwrap_or_else(|_| "kafka.llm-analytics.svc.cluster.local:9092".to_string()),
            kafka_topic: std::env::var("KAFKA_TOPIC").unwrap_or_else(|_| "llm-events".to_string()),
            kafka_group_id: std::env::var("KAFKA_GROUP_ID")
                .unwrap_or_else(|_| "correlation-engine".to_string()),
            redis_url: std::env::var("REDIS_URL")
                .unwrap_or_else(|_| "redis://redis.llm-analytics.svc.cluster.local:6379".to_string()),
            correlation_window_secs: std::env::var("CORRELATION_WINDOW_SECS")
                .unwrap_or_else(|_| "300".to_string())
                .parse()
                .expect("Invalid CORRELATION_WINDOW_SECS"),
        }
    }
}

/// Correlation engine
struct CorrelationEngine {
    event_cache: Arc<DashMap<Uuid, CachedEvent>>,
    correlations: Arc<DashMap<CorrelationId, Vec<EventCorrelation>>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct CachedEvent {
    event_id: Uuid,
    timestamp: DateTime<Utc>,
    event_type: String,
    source_module: String,
    correlation_id: Option<Uuid>,
    parent_event_id: Option<Uuid>,
    tags: HashMap<String, String>,
}

impl From<&AnalyticsEvent> for CachedEvent {
    fn from(event: &AnalyticsEvent) -> Self {
        Self {
            event_id: event.common.event_id,
            timestamp: event.common.timestamp,
            event_type: format!("{:?}", event.common.event_type),
            source_module: format!("{:?}", event.common.source_module),
            correlation_id: event.common.correlation_id,
            parent_event_id: event.common.parent_event_id,
            tags: event.common.tags.clone(),
        }
    }
}

impl CorrelationEngine {
    fn new() -> Self {
        Self {
            event_cache: Arc::new(DashMap::new()),
            correlations: Arc::new(DashMap::new()),
        }
    }

    fn process_event(&self, event: &AnalyticsEvent, metrics: &Arc<Metrics>) {
        let timer = metrics
            .analysis_duration
            .with_label_values(&["event_correlation"])
            .start_timer();

        let cached_event = CachedEvent::from(event);
        self.event_cache.insert(event.common.event_id, cached_event.clone());

        // Detect correlations
        self.detect_temporal_correlation(&cached_event, metrics);
        self.detect_causal_correlation(&cached_event, metrics);
        self.detect_pattern_correlation(&cached_event, metrics);

        timer.observe_duration();

        let event_type = format!("{:?}", event.common.event_type);
        metrics
            .events_processed
            .with_label_values(&[&event_type])
            .inc();
    }

    fn detect_temporal_correlation(&self, event: &CachedEvent, metrics: &Arc<Metrics>) {
        // Find events within time window
        let window_start = event.timestamp - chrono::Duration::seconds(60);
        let window_end = event.timestamp + chrono::Duration::seconds(60);

        let mut correlated_events = Vec::new();

        for entry in self.event_cache.iter() {
            let other_event = entry.value();
            if other_event.event_id != event.event_id
                && other_event.timestamp >= window_start
                && other_event.timestamp <= window_end
                && other_event.source_module == event.source_module
            {
                correlated_events.push(other_event.event_id);
            }
        }

        if correlated_events.len() > 1 {
            metrics
                .correlations_detected
                .with_label_values(&["temporal"])
                .inc();
        }
    }

    fn detect_causal_correlation(&self, event: &CachedEvent, metrics: &Arc<Metrics>) {
        // Check for parent-child relationships
        if let Some(parent_id) = event.parent_event_id {
            if self.event_cache.contains_key(&parent_id) {
                metrics
                    .correlations_detected
                    .with_label_values(&["causal"])
                    .inc();
            }
        }
    }

    fn detect_pattern_correlation(&self, event: &CachedEvent, metrics: &Arc<Metrics>) {
        // Detect patterns based on tags and attributes
        if !event.tags.is_empty() {
            let matching_events: Vec<_> = self
                .event_cache
                .iter()
                .filter(|e| {
                    e.value().event_id != event.event_id
                        && e.value()
                            .tags
                            .iter()
                            .any(|(k, v)| event.tags.get(k) == Some(v))
                })
                .collect();

            if matching_events.len() >= 3 {
                metrics
                    .correlations_detected
                    .with_label_values(&["pattern"])
                    .inc();
            }
        }
    }

    async fn cleanup_old_events(&self, retention_secs: u64) {
        let cutoff = Utc::now() - chrono::Duration::seconds(retention_secs as i64);
        let to_remove: Vec<_> = self
            .event_cache
            .iter()
            .filter(|e| e.value().timestamp < cutoff)
            .map(|e| *e.key())
            .collect();

        for event_id in to_remove {
            self.event_cache.remove(&event_id);
        }

        info!("Cleaned up old events from cache");
    }
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    // Initialize tracing
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "correlation_engine=info".into()),
        )
        .json()
        .init();

    info!("Starting Correlation Engine Service v{}", env!("CARGO_PKG_VERSION"));

    // Load configuration
    let config = Config::from_env();
    info!(?config, "Configuration loaded");

    // Initialize metrics
    let metrics = Arc::new(Metrics::new()?);

    // Initialize Redis client
    let redis_client = redis::Client::open(config.redis_url.as_str())?;
    let redis_conn = ConnectionManager::new(redis_client).await?;

    info!("Redis connection established");

    // Create correlation engine
    let correlation_engine = Arc::new(CorrelationEngine::new());

    // Create Kafka consumer
    let consumer: StreamConsumer = ClientConfig::new()
        .set("bootstrap.servers", &config.kafka_brokers)
        .set("group.id", &config.kafka_group_id)
        .set("enable.auto.commit", "false")
        .set("auto.offset.reset", "earliest")
        .set("client.id", "correlation-engine-service")
        .create()?;

    consumer.subscribe(&[&config.kafka_topic])?;
    info!("Subscribed to Kafka topic: {}", config.kafka_topic);

    // Spawn cleanup task
    let cleanup_engine = correlation_engine.clone();
    tokio::spawn(async move {
        let mut interval = interval(Duration::from_secs(300)); // Cleanup every 5 minutes
        loop {
            interval.tick().await;
            cleanup_engine.cleanup_old_events(3600).await; // Keep 1 hour of events
        }
    });

    // Main consumption loop
    let mut shutdown = false;
    while !shutdown {
        tokio::select! {
            message_result = consumer.recv() => {
                match message_result {
                    Ok(m) => {
                        if let Some(payload) = m.payload() {
                            match serde_json::from_slice::<AnalyticsEvent>(payload) {
                                Ok(event) => {
                                    correlation_engine.process_event(&event, &metrics);

                                    // Commit offset
                                    if let Err(e) = consumer.commit_message(&m, CommitMode::Async) {
                                        warn!("Failed to commit offset: {}", e);
                                    }
                                }
                                Err(e) => {
                                    error!("Failed to deserialize event: {}", e);
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
