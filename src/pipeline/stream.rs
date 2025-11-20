//! Stream Module - Real-time Event Streaming
//!
//! Manages real-time event streaming for downstream consumers.

use crate::schemas::events::AnalyticsEvent;
use anyhow::Result;
use tokio::sync::broadcast;
use tracing::info;

use super::{HealthStatus, PipelineComponent, PipelineConfig};

/// Stream manager for real-time event distribution
pub struct StreamManager {
    event_tx: broadcast::Sender<AnalyticsEvent>,
    buffer_size: usize,
}

impl StreamManager {
    /// Create a new stream manager
    pub async fn new(config: &PipelineConfig) -> Result<Self> {
        let (event_tx, _) = broadcast::channel(config.buffer_size);

        Ok(Self {
            event_tx,
            buffer_size: config.buffer_size,
        })
    }

    /// Publish an event to all subscribers
    pub async fn publish(&self, event: &AnalyticsEvent) -> Result<()> {
        // Clone and send - ignore if no subscribers
        self.event_tx.send(event.clone()).ok();
        Ok(())
    }

    /// Publish a batch of events
    pub async fn publish_batch(&self, events: &[AnalyticsEvent]) -> Result<()> {
        for event in events {
            self.publish(event).await?;
        }
        Ok(())
    }

    /// Subscribe to event stream
    pub fn subscribe(&self) -> broadcast::Receiver<AnalyticsEvent> {
        self.event_tx.subscribe()
    }

    /// Get subscriber count
    pub fn subscriber_count(&self) -> usize {
        self.event_tx.receiver_count()
    }
}

#[async_trait::async_trait]
impl PipelineComponent for StreamManager {
    async fn initialize(&mut self) -> Result<()> {
        info!("Stream manager initialized");
        Ok(())
    }

    async fn shutdown(&mut self) -> Result<()> {
        info!("Stream manager shutting down");
        Ok(())
    }

    async fn health_check(&self) -> Result<HealthStatus> {
        Ok(HealthStatus::healthy())
    }
}
