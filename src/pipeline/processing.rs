//! Event Processing Module
//!
//! Core event processing logic including validation, enrichment, and transformation.

use crate::schemas::events::AnalyticsEvent;
use anyhow::Result;
use std::sync::Arc;
use tokio::sync::RwLock;
use tracing::{debug, info};

use super::{HealthStatus, PipelineComponent, PipelineConfig};

/// Event processor with validation and enrichment
pub struct EventProcessor {
    config: Arc<PipelineConfig>,
    stats: Arc<RwLock<ProcessingStats>>,
}

impl EventProcessor {
    /// Create a new event processor
    pub async fn new(config: &PipelineConfig) -> Result<Self> {
        Ok(Self {
            config: Arc::new(config.clone()),
            stats: Arc::new(RwLock::new(ProcessingStats::default())),
        })
    }

    /// Process a single event
    pub async fn process(&self, mut event: AnalyticsEvent) -> Result<AnalyticsEvent> {
        debug!("Processing event: {}", event.common.event_id);

        // Validate event
        self.validate(&event)?;

        // Enrich event
        self.enrich(&mut event).await?;

        // Update statistics
        let mut stats = self.stats.write().await;
        stats.events_processed += 1;

        Ok(event)
    }

    /// Process a batch of events
    pub async fn process_batch(&self, events: Vec<AnalyticsEvent>) -> Result<Vec<AnalyticsEvent>> {
        let mut processed = Vec::with_capacity(events.len());

        for event in events {
            match self.process(event).await {
                Ok(processed_event) => processed.push(processed_event),
                Err(e) => {
                    let mut stats = self.stats.write().await;
                    stats.events_failed += 1;
                    tracing::warn!("Failed to process event: {}", e);
                }
            }
        }

        Ok(processed)
    }

    /// Validate an event
    fn validate(&self, event: &AnalyticsEvent) -> Result<()> {
        // Check schema version
        if event.common.schema_version.is_empty() {
            anyhow::bail!("Schema version is required");
        }

        // Validate timestamps
        if event.common.timestamp.timestamp() <= 0 {
            anyhow::bail!("Invalid timestamp");
        }

        // Additional validation logic
        Ok(())
    }

    /// Enrich event with additional metadata
    async fn enrich(&self, event: &mut AnalyticsEvent) -> Result<()> {
        // Add processing timestamp tag
        event.common.tags.insert(
            "processed_at".to_string(),
            chrono::Utc::now().to_rfc3339(),
        );

        // Add pipeline version
        event.common.tags.insert(
            "pipeline_version".to_string(),
            env!("CARGO_PKG_VERSION").to_string(),
        );

        Ok(())
    }

    /// Get processing statistics
    pub async fn get_stats(&self) -> ProcessingStats {
        self.stats.read().await.clone()
    }
}

#[async_trait::async_trait]
impl PipelineComponent for EventProcessor {
    async fn initialize(&mut self) -> Result<()> {
        info!("Event processor initialized");
        Ok(())
    }

    async fn shutdown(&mut self) -> Result<()> {
        info!("Event processor shutting down");
        Ok(())
    }

    async fn health_check(&self) -> Result<HealthStatus> {
        Ok(HealthStatus::healthy())
    }
}

/// Processing statistics
#[derive(Debug, Clone, Default)]
pub struct ProcessingStats {
    pub events_processed: u64,
    pub events_failed: u64,
    pub avg_processing_time_ms: f64,
}
