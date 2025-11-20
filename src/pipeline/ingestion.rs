//! Event Ingestion Module
//!
//! High-performance event ingestion from Kafka with support for 100k+ events/sec.

use crate::schemas::events::AnalyticsEvent;
use anyhow::{Context, Result};
use rdkafka::config::ClientConfig;
use rdkafka::consumer::{Consumer, StreamConsumer};
use rdkafka::message::Message;
use rdkafka::producer::{FutureProducer, FutureRecord};
use std::time::Duration;
use tokio::sync::mpsc;
use tracing::{error, info, warn};

use super::{HealthStatus, PipelineComponent, PipelineConfig};

/// Event ingester for Kafka integration
pub struct EventIngester {
    consumer: StreamConsumer,
    producer: FutureProducer,
    event_tx: mpsc::Sender<AnalyticsEvent>,
    event_rx: Option<mpsc::Receiver<AnalyticsEvent>>,
    topic: String,
    batch_size: usize,
}

impl EventIngester {
    /// Create a new event ingester
    pub async fn new(config: &PipelineConfig) -> Result<Self> {
        let consumer: StreamConsumer = ClientConfig::new()
            .set("group.id", "llm-analytics-hub")
            .set("bootstrap.servers", config.kafka_brokers.join(","))
            .set("enable.partition.eof", "false")
            .set("session.timeout.ms", "6000")
            .set("enable.auto.commit", "true")
            .set("auto.offset.reset", "earliest")
            .set("compression.type", "snappy")
            .set("fetch.min.bytes", "1048576") // 1MB
            .set("fetch.wait.max.ms", "500")
            .create()
            .context("Failed to create Kafka consumer")?;

        let producer: FutureProducer = ClientConfig::new()
            .set("bootstrap.servers", config.kafka_brokers.join(","))
            .set("message.timeout.ms", "5000")
            .set("compression.type", "snappy")
            .set("batch.size", "1000000") // 1MB
            .set("linger.ms", "100")
            .set("acks", "1")
            .create()
            .context("Failed to create Kafka producer")?;

        let (event_tx, event_rx) = mpsc::channel(config.buffer_size);

        Ok(Self {
            consumer,
            producer,
            event_tx,
            event_rx: Some(event_rx),
            topic: "llm-analytics-events".to_string(),
            batch_size: config.batch_size,
        })
    }

    /// Subscribe to Kafka topics
    pub async fn subscribe(&self, topics: &[&str]) -> Result<()> {
        self.consumer
            .subscribe(topics)
            .context("Failed to subscribe to topics")?;
        info!("Subscribed to topics: {:?}", topics);
        Ok(())
    }

    /// Start consuming events from Kafka
    pub async fn start_consuming(&mut self) -> Result<()> {
        self.subscribe(&[&self.topic]).await?;

        let tx = self.event_tx.clone();
        let consumer = self.consumer.clone();

        tokio::spawn(async move {
            info!("Starting Kafka consumer loop");
            let mut message_count = 0u64;
            let mut batch = Vec::new();

            loop {
                match consumer.recv().await {
                    Ok(m) => {
                        message_count += 1;

                        if let Some(payload) = m.payload() {
                            match serde_json::from_slice::<AnalyticsEvent>(payload) {
                                Ok(event) => {
                                    batch.push(event);

                                    if batch.len() >= 1000 {
                                        // Process batch
                                        for event in batch.drain(..) {
                                            if tx.send(event).await.is_err() {
                                                error!("Failed to send event to processing queue");
                                                break;
                                            }
                                        }
                                    }
                                }
                                Err(e) => {
                                    warn!("Failed to deserialize event: {}", e);
                                }
                            }
                        }

                        if message_count % 10000 == 0 {
                            info!("Processed {} messages", message_count);
                        }
                    }
                    Err(e) => {
                        error!("Kafka consumer error: {}", e);
                        tokio::time::sleep(Duration::from_secs(1)).await;
                    }
                }
            }
        });

        Ok(())
    }

    /// Publish an event to Kafka
    pub async fn publish(&self, event: &AnalyticsEvent) -> Result<()> {
        let payload = serde_json::to_vec(event)?;
        let key = event.common.event_id.to_string();

        let record = FutureRecord::to(&self.topic)
            .payload(&payload)
            .key(&key);

        self.producer
            .send(record, Duration::from_secs(5))
            .await
            .map_err(|(err, _)| anyhow::anyhow!("Failed to send to Kafka: {}", err))?;

        Ok(())
    }

    /// Publish a batch of events
    pub async fn publish_batch(&self, events: &[AnalyticsEvent]) -> Result<()> {
        let mut futures = Vec::new();

        for event in events {
            let payload = serde_json::to_vec(event)?;
            let key = event.common.event_id.to_string();

            let record = FutureRecord::to(&self.topic)
                .payload(&payload)
                .key(&key);

            futures.push(self.producer.send(record, Duration::from_secs(5)));
        }

        // Wait for all sends to complete
        for future in futures {
            future
                .await
                .map_err(|(err, _)| anyhow::anyhow!("Batch send failed: {}", err))?;
        }

        Ok(())
    }

    /// Get the event receiver channel
    pub fn take_receiver(&mut self) -> Option<mpsc::Receiver<AnalyticsEvent>> {
        self.event_rx.take()
    }

    /// Get ingestion statistics
    pub async fn get_stats(&self) -> IngestionStats {
        IngestionStats {
            events_received: 0, // TODO: implement metrics tracking
            events_processed: 0,
            events_failed: 0,
            avg_throughput: 0.0,
        }
    }
}

#[async_trait::async_trait]
impl PipelineComponent for EventIngester {
    async fn initialize(&mut self) -> Result<()> {
        self.start_consuming().await?;
        Ok(())
    }

    async fn shutdown(&mut self) -> Result<()> {
        info!("Shutting down event ingester");
        Ok(())
    }

    async fn health_check(&self) -> Result<HealthStatus> {
        // TODO: Implement proper health check
        Ok(HealthStatus::healthy())
    }
}

/// Ingestion statistics
#[derive(Debug, Clone)]
pub struct IngestionStats {
    pub events_received: u64,
    pub events_processed: u64,
    pub events_failed: u64,
    pub avg_throughput: f64,
}
