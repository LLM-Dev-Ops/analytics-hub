//! LLM Analytics Hub
//!
//! Centralized analytics hub for the LLM ecosystem, providing comprehensive
//! data models and schemas for telemetry, security, cost, and governance monitoring.
//!
//! # Overview
//!
//! This crate provides:
//! - **Event Schemas**: Unified event schema for telemetry, security, cost, and governance
//! - **Metrics Models**: Time-window aggregations with statistical measures
//! - **Time-Series Models**: Tag-based organization for efficient querying
//! - **Correlation Schemas**: Cross-module event correlation and anomaly detection
//! - **Metadata Schemas**: Asset, policy, dashboard, and user preference models
//! - **API Models**: Response formats, pagination, error handling, and streaming
//!
//! # Example
//!
//! ```rust
//! use llm_analytics_hub::schemas::events::{AnalyticsEvent, CommonEventFields, EventPayload};
//! use llm_analytics_hub::models::metrics::{MetricType, CounterMetric};
//! use chrono::Utc;
//!
//! // Create a telemetry event
//! let event = AnalyticsEvent {
//!     common: CommonEventFields {
//!         event_id: uuid::Uuid::new_v4(),
//!         timestamp: Utc::now(),
//!         source_module: llm_analytics_hub::schemas::events::SourceModule::LlmObservatory,
//!         event_type: llm_analytics_hub::schemas::events::EventType::Telemetry,
//!         correlation_id: None,
//!         parent_event_id: None,
//!         schema_version: "1.0.0".to_string(),
//!         severity: llm_analytics_hub::schemas::events::Severity::Info,
//!         environment: "production".to_string(),
//!         tags: std::collections::HashMap::new(),
//!     },
//!     payload: EventPayload::Custom(llm_analytics_hub::schemas::events::CustomPayload {
//!         custom_type: "example".to_string(),
//!         data: serde_json::json!({"key": "value"}),
//!     }),
//! };
//! ```

pub mod schemas {
    //! Schema definitions for events and metadata

    pub mod events;
    pub mod metadata;
}

pub mod models {
    //! Data models for metrics, time-series, correlation, and API responses

    pub mod metrics;
    pub mod timeseries;
    pub mod correlation;
    pub mod api;
}

pub mod database;
pub mod pipeline;
pub mod analytics;
pub mod resilience;

// CLI and infrastructure modules
pub mod cli;
pub mod common;
pub mod infra;

// LLM-Dev-Ops Ecosystem Adapters (Phase 2B)
pub mod adapters;

// Re-export commonly used types at the crate root
pub use database::Database;
pub use pipeline::ingestion::{EventIngester, IngestionConfig, IngestionStats};
pub use analytics::anomaly::{AnomalyDetector, Anomaly, AnomalyType, AnomalySeverity};
pub use analytics::{CorrelationEngine, AggregationEngine};
pub use schemas::events::{
    AnalyticsEvent, CommonEventFields, EventPayload, EventType, Severity, SourceModule,
};

pub use models::metrics::{
    AggregatedMetric, CounterMetric, GaugeMetric, HistogramMetric, MetricType,
    StatisticalMeasures, TimeWindow,
};

pub use models::timeseries::{
    FieldSet, IndexConfig, RetentionPolicy, TagSet, TimeSeriesPoint, TimeSeriesQuery,
};

pub use models::correlation::{
    AnomalyCorrelation, CorrelationId, CorrelationType, EventCorrelation, EventGraph,
    RootCauseAnalysis,
};

pub use models::api::{
    ApiError, ApiResponse, PaginatedResponse, PaginationMetadata, QueryResult, StreamEvent,
};

// Re-export ecosystem adapters
pub use adapters::{
    AdapterHealth, AdapterManager, EcosystemAdapter,
    observatory::ObservatoryAdapter,
    costops::CostOpsAdapter,
    memory_graph::MemoryGraphAdapter,
    registry::RegistryAdapter,
    config_manager::ConfigManagerAdapter,
};

/// Version information
pub const VERSION: &str = env!("CARGO_PKG_VERSION");

/// Schema version for data compatibility
pub const SCHEMA_VERSION: &str = "1.0.0";

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_version_constants() {
        assert!(!VERSION.is_empty());
        assert_eq!(SCHEMA_VERSION, "1.0.0");
    }
}
