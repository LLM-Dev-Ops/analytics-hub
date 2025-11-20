//! Event Processing Pipeline
//!
//! Core pipeline for ingesting, processing, and storing analytics events.
//! Implements event-driven architecture with CQRS pattern.

pub mod ingestion;
pub mod processing;
pub mod storage;
pub mod cache;
pub mod stream;

pub use ingestion::EventIngester;
pub use processing::EventProcessor;
pub use storage::StorageManager;
pub use cache::CacheManager;
pub use stream::StreamManager;

use crate::schemas::events::AnalyticsEvent;
use anyhow::Result;
use async_trait::async_trait;

/// Pipeline configuration
#[derive(Debug, Clone)]
pub struct PipelineConfig {
    /// Kafka bootstrap servers
    pub kafka_brokers: Vec<String>,

    /// TimescaleDB connection string
    pub timescaledb_url: String,

    /// Redis cluster nodes
    pub redis_nodes: Vec<String>,

    /// Batch size for event processing
    pub batch_size: usize,

    /// Processing parallelism
    pub num_workers: usize,

    /// Buffer size for event queue
    pub buffer_size: usize,

    /// Enable compression
    pub enable_compression: bool,
}

impl Default for PipelineConfig {
    fn default() -> Self {
        Self {
            kafka_brokers: vec!["localhost:9092".to_string()],
            timescaledb_url: "postgresql://localhost/llm_analytics".to_string(),
            redis_nodes: vec!["redis://localhost:6379".to_string()],
            batch_size: 1000,
            num_workers: 4,
            buffer_size: 10000,
            enable_compression: true,
        }
    }
}

/// Main pipeline orchestrator
pub struct Pipeline {
    config: PipelineConfig,
    ingester: EventIngester,
    processor: EventProcessor,
    storage: StorageManager,
    cache: CacheManager,
    stream: StreamManager,
}

impl Pipeline {
    /// Create a new pipeline instance
    pub async fn new(config: PipelineConfig) -> Result<Self> {
        let ingester = EventIngester::new(&config).await?;
        let processor = EventProcessor::new(&config).await?;
        let storage = StorageManager::new(&config).await?;
        let cache = CacheManager::new(&config).await?;
        let stream = StreamManager::new(&config).await?;

        Ok(Self {
            config,
            ingester,
            processor,
            storage,
            cache,
            stream,
        })
    }

    /// Start the pipeline
    pub async fn start(&mut self) -> Result<()> {
        tracing::info!("Starting LLM Analytics Hub pipeline");

        // Initialize all components
        self.storage.initialize().await?;
        self.cache.initialize().await?;
        self.stream.initialize().await?;

        tracing::info!("Pipeline started successfully");
        Ok(())
    }

    /// Process a single event
    pub async fn process_event(&self, event: AnalyticsEvent) -> Result<()> {
        // Process the event
        let processed = self.processor.process(event).await?;

        // Store in database
        self.storage.store_event(&processed).await?;

        // Update cache
        self.cache.update_metrics(&processed).await?;

        // Publish to stream for real-time consumers
        self.stream.publish(&processed).await?;

        Ok(())
    }

    /// Process a batch of events
    pub async fn process_batch(&self, events: Vec<AnalyticsEvent>) -> Result<()> {
        let processed = self.processor.process_batch(events).await?;

        self.storage.store_batch(&processed).await?;
        self.cache.update_batch(&processed).await?;
        self.stream.publish_batch(&processed).await?;

        Ok(())
    }

    /// Shutdown the pipeline gracefully
    pub async fn shutdown(&mut self) -> Result<()> {
        tracing::info!("Shutting down pipeline");

        self.ingester.shutdown().await?;
        self.processor.shutdown().await?;
        self.storage.shutdown().await?;
        self.cache.shutdown().await?;
        self.stream.shutdown().await?;

        tracing::info!("Pipeline shutdown complete");
        Ok(())
    }
}

/// Trait for pipeline components
#[async_trait]
pub trait PipelineComponent {
    async fn initialize(&mut self) -> Result<()>;
    async fn shutdown(&mut self) -> Result<()>;
    async fn health_check(&self) -> Result<HealthStatus>;
}

/// Health status for components
#[derive(Debug, Clone)]
pub struct HealthStatus {
    pub healthy: bool,
    pub message: String,
    pub details: serde_json::Value,
}

impl HealthStatus {
    pub fn healthy() -> Self {
        Self {
            healthy: true,
            message: "OK".to_string(),
            details: serde_json::json!({}),
        }
    }

    pub fn unhealthy(message: String) -> Self {
        Self {
            healthy: false,
            message,
            details: serde_json::json!({}),
        }
    }
}
