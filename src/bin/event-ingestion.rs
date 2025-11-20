//! Event Ingestion Service
//!
//! High-performance HTTP service for ingesting LLM analytics events.
//! Features:
//! - HTTP/2 support with Axum framework
//! - Request validation and sanitization
//! - Kafka producer for event streaming
//! - Prometheus metrics export
//! - Structured logging
//! - Graceful shutdown
//! - Health checks

use axum::{
    extract::{Json, State},
    http::StatusCode,
    response::{IntoResponse, Response},
    routing::{get, post},
    Router,
};
use llm_analytics_hub::{AnalyticsEvent, ApiError, ApiResponse};
use prometheus::{
    register_counter_vec, register_histogram_vec, register_int_gauge, CounterVec, Encoder,
    HistogramVec, IntGauge, TextEncoder,
};
use rdkafka::producer::{FutureProducer, FutureRecord};
use rdkafka::ClientConfig;
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use std::time::Duration;
use tokio::signal;
use tower_http::trace::TraceLayer;
use tracing::{error, info, warn};

/// Application state shared across handlers
#[derive(Clone)]
struct AppState {
    kafka_producer: Arc<FutureProducer>,
    metrics: Arc<Metrics>,
}

/// Prometheus metrics
struct Metrics {
    events_received: CounterVec,
    events_published: CounterVec,
    events_failed: CounterVec,
    publish_duration: HistogramVec,
    active_connections: IntGauge,
}

impl Metrics {
    fn new() -> anyhow::Result<Self> {
        Ok(Self {
            events_received: register_counter_vec!(
                "llm_events_received_total",
                "Total number of events received",
                &["event_type", "source_module"]
            )?,
            events_published: register_counter_vec!(
                "llm_events_published_total",
                "Total number of events published to Kafka",
                &["topic"]
            )?,
            events_failed: register_counter_vec!(
                "llm_events_failed_total",
                "Total number of failed event ingestions",
                &["error_type"]
            )?,
            publish_duration: register_histogram_vec!(
                "llm_event_publish_duration_seconds",
                "Duration of event publishing to Kafka",
                &["topic"]
            )?,
            active_connections: register_int_gauge!(
                "llm_active_connections",
                "Number of active HTTP connections"
            )?,
        })
    }
}

/// Configuration from environment variables
#[derive(Debug, Clone)]
struct Config {
    kafka_brokers: String,
    kafka_topic: String,
    http_port: u16,
    max_payload_size: usize,
}

impl Config {
    fn from_env() -> Self {
        Self {
            kafka_brokers: std::env::var("KAFKA_BROKERS")
                .unwrap_or_else(|_| "kafka.llm-analytics.svc.cluster.local:9092".to_string()),
            kafka_topic: std::env::var("KAFKA_TOPIC").unwrap_or_else(|_| "llm-events".to_string()),
            http_port: std::env::var("HTTP_PORT")
                .unwrap_or_else(|_| "8080".to_string())
                .parse()
                .expect("Invalid HTTP_PORT"),
            max_payload_size: std::env::var("MAX_PAYLOAD_SIZE")
                .unwrap_or_else(|_| "10485760".to_string()) // 10MB default
                .parse()
                .expect("Invalid MAX_PAYLOAD_SIZE"),
        }
    }
}

/// Health check response
#[derive(Debug, Serialize)]
struct HealthResponse {
    status: String,
    version: String,
    uptime_seconds: u64,
}

/// Readiness check response
#[derive(Debug, Serialize)]
struct ReadinessResponse {
    ready: bool,
    checks: ReadinessChecks,
}

#[derive(Debug, Serialize)]
struct ReadinessChecks {
    kafka: bool,
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    // Initialize tracing
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "event_ingestion=info,tower_http=debug".into()),
        )
        .json()
        .init();

    info!("Starting Event Ingestion Service v{}", env!("CARGO_PKG_VERSION"));

    // Load configuration
    let config = Config::from_env();
    info!(?config, "Configuration loaded");

    // Initialize metrics
    let metrics = Arc::new(Metrics::new()?);

    // Create Kafka producer
    let kafka_producer: FutureProducer = ClientConfig::new()
        .set("bootstrap.servers", &config.kafka_brokers)
        .set("message.timeout.ms", "5000")
        .set("compression.type", "lz4")
        .set("batch.size", "16384")
        .set("linger.ms", "10")
        .set("acks", "1")
        .set("client.id", "event-ingestion-service")
        .create()?;

    info!("Kafka producer initialized");

    // Create application state
    let state = AppState {
        kafka_producer: Arc::new(kafka_producer),
        metrics,
    };

    // Build router
    let app = Router::new()
        .route("/api/v1/events", post(ingest_event))
        .route("/api/v1/events/batch", post(ingest_batch))
        .route("/health", get(health_check))
        .route("/ready", get(readiness_check))
        .route("/metrics", get(metrics_handler))
        .layer(TraceLayer::new_for_http())
        .with_state(state);

    // Start server
    let addr = format!("0.0.0.0:{}", config.http_port);
    info!("Listening on {}", addr);

    let listener = tokio::net::TcpListener::bind(&addr).await?;

    axum::serve(listener, app)
        .with_graceful_shutdown(shutdown_signal())
        .await?;

    info!("Service shutdown complete");
    Ok(())
}

/// Ingest single event
async fn ingest_event(
    State(state): State<AppState>,
    Json(event): Json<AnalyticsEvent>,
) -> Result<Json<ApiResponse<()>>, AppError> {
    let event_type = format!("{:?}", event.common.event_type);
    let source = format!("{:?}", event.common.source_module);

    state
        .metrics
        .events_received
        .with_label_values(&[&event_type, &source])
        .inc();

    // Validate event
    if event.common.schema_version != llm_analytics_hub::SCHEMA_VERSION {
        warn!("Schema version mismatch: {}", event.common.schema_version);
        state
            .metrics
            .events_failed
            .with_label_values(&["schema_mismatch"])
            .inc();
        return Err(AppError::ValidationError(
            "Schema version mismatch".to_string(),
        ));
    }

    // Serialize event
    let payload = serde_json::to_vec(&event).map_err(|e| {
        error!("Serialization error: {}", e);
        state
            .metrics
            .events_failed
            .with_label_values(&["serialization"])
            .inc();
        AppError::InternalError(e.to_string())
    })?;

    // Publish to Kafka
    let timer = state
        .metrics
        .publish_duration
        .with_label_values(&["llm-events"])
        .start_timer();

    let record = FutureRecord::to("llm-events")
        .key(&event.common.event_id.to_string())
        .payload(&payload);

    state
        .kafka_producer
        .send(record, Duration::from_secs(5))
        .await
        .map_err(|(e, _)| {
            error!("Kafka publish error: {}", e);
            state
                .metrics
                .events_failed
                .with_label_values(&["kafka_publish"])
                .inc();
            AppError::InternalError(format!("Failed to publish event: {}", e))
        })?;

    timer.observe_duration();
    state
        .metrics
        .events_published
        .with_label_values(&["llm-events"])
        .inc();

    Ok(Json(ApiResponse {
        success: true,
        data: Some(()),
        error: None,
        metadata: None,
    }))
}

/// Ingest batch of events
async fn ingest_batch(
    State(state): State<AppState>,
    Json(events): Json<Vec<AnalyticsEvent>>,
) -> Result<Json<ApiResponse<BatchResponse>>, AppError> {
    let mut successful = 0;
    let mut failed = 0;

    for event in events {
        match publish_event(&state, event).await {
            Ok(_) => successful += 1,
            Err(e) => {
                warn!("Failed to publish event in batch: {}", e);
                failed += 1;
            }
        }
    }

    Ok(Json(ApiResponse {
        success: failed == 0,
        data: Some(BatchResponse {
            successful,
            failed,
            total: successful + failed,
        }),
        error: None,
        metadata: None,
    }))
}

#[derive(Debug, Serialize)]
struct BatchResponse {
    successful: usize,
    failed: usize,
    total: usize,
}

async fn publish_event(state: &AppState, event: AnalyticsEvent) -> anyhow::Result<()> {
    let payload = serde_json::to_vec(&event)?;
    let record = FutureRecord::to("llm-events")
        .key(&event.common.event_id.to_string())
        .payload(&payload);

    state
        .kafka_producer
        .send(record, Duration::from_secs(5))
        .await
        .map_err(|(e, _)| anyhow::anyhow!("Kafka error: {}", e))?;

    Ok(())
}

/// Health check endpoint
async fn health_check() -> Json<HealthResponse> {
    Json(HealthResponse {
        status: "healthy".to_string(),
        version: env!("CARGO_PKG_VERSION").to_string(),
        uptime_seconds: 0, // TODO: track actual uptime
    })
}

/// Readiness check endpoint
async fn readiness_check(State(state): State<AppState>) -> Json<ReadinessResponse> {
    // Check Kafka connectivity
    let kafka_ready = true; // TODO: implement actual check

    Json(ReadinessResponse {
        ready: kafka_ready,
        checks: ReadinessChecks { kafka: kafka_ready },
    })
}

/// Prometheus metrics endpoint
async fn metrics_handler() -> Response {
    let encoder = TextEncoder::new();
    let metric_families = prometheus::gather();
    let mut buffer = vec![];
    encoder.encode(&metric_families, &mut buffer).unwrap();

    Response::builder()
        .status(StatusCode::OK)
        .header("Content-Type", "text/plain; version=0.0.4")
        .body(buffer.into())
        .unwrap()
        .into_response()
}

/// Graceful shutdown signal handler
async fn shutdown_signal() {
    let ctrl_c = async {
        signal::ctrl_c()
            .await
            .expect("failed to install Ctrl+C handler");
    };

    #[cfg(unix)]
    let terminate = async {
        signal::unix::signal(signal::unix::SignalKind::terminate())
            .expect("failed to install signal handler")
            .recv()
            .await;
    };

    #[cfg(not(unix))]
    let terminate = std::future::pending::<()>();

    tokio::select! {
        _ = ctrl_c => {},
        _ = terminate => {},
    }

    info!("Shutdown signal received, starting graceful shutdown");
}

/// Application error types
#[derive(Debug)]
enum AppError {
    ValidationError(String),
    InternalError(String),
}

impl IntoResponse for AppError {
    fn into_response(self) -> Response {
        let (status, error_message) = match self {
            AppError::ValidationError(msg) => (StatusCode::BAD_REQUEST, msg),
            AppError::InternalError(msg) => (StatusCode::INTERNAL_SERVER_ERROR, msg),
        };

        let body = serde_json::json!({
            "success": false,
            "error": error_message
        });

        (status, Json(body)).into_response()
    }
}

impl std::fmt::Display for AppError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            AppError::ValidationError(msg) => write!(f, "Validation error: {}", msg),
            AppError::InternalError(msg) => write!(f, "Internal error: {}", msg),
        }
    }
}

impl std::error::Error for AppError {}
