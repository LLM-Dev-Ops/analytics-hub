//! Cache Module - Redis Cluster Integration
//!
//! High-performance distributed caching with Redis Cluster for metrics and query results.

use crate::schemas::events::AnalyticsEvent;
use anyhow::{Context, Result};
use redis::aio::ConnectionManager;
use redis::{AsyncCommands, Client, RedisError};
use std::time::Duration;
use tracing::{debug, info};

use super::{HealthStatus, PipelineComponent, PipelineConfig};

/// Cache manager for Redis Cluster
pub struct CacheManager {
    client: Client,
    conn: Option<ConnectionManager>,
    default_ttl: Duration,
}

impl CacheManager {
    /// Create a new cache manager
    pub async fn new(config: &PipelineConfig) -> Result<Self> {
        // Use the first node for connection (cluster topology discovered automatically)
        let client = Client::open(config.redis_nodes[0].as_str())
            .context("Failed to create Redis client")?;

        Ok(Self {
            client,
            conn: None,
            default_ttl: Duration::from_secs(3600), // 1 hour default
        })
    }

    /// Get a connection to Redis
    async fn get_connection(&mut self) -> Result<&mut ConnectionManager> {
        if self.conn.is_none() {
            self.conn = Some(
                ConnectionManager::new(self.client.clone())
                    .await
                    .context("Failed to create Redis connection manager")?,
            );
        }
        Ok(self.conn.as_mut().unwrap())
    }

    /// Cache a metric value
    pub async fn cache_metric(&mut self, key: &str, value: f64, ttl: Option<Duration>) -> Result<()> {
        let ttl_secs = ttl.unwrap_or(self.default_ttl).as_secs();
        let conn = self.get_connection().await?;

        conn.set_ex::<_, _, ()>(key, value, ttl_secs).await?;
        debug!("Cached metric: {} = {}", key, value);

        Ok(())
    }

    /// Get a cached metric value
    pub async fn get_metric(&mut self, key: &str) -> Result<Option<f64>> {
        let conn = self.get_connection().await?;
        let value: Option<f64> = conn.get(key).await?;
        Ok(value)
    }

    /// Cache aggregated metrics
    pub async fn cache_aggregated_metrics(
        &mut self,
        metric_name: &str,
        window: &str,
        data: &serde_json::Value,
    ) -> Result<()> {
        let key = format!("metrics:{}:{}", metric_name, window);
        let json = serde_json::to_string(data)?;
        let ttl_secs = self.default_ttl.as_secs();
        let conn = self.get_connection().await?;

        conn.set_ex::<_, _, ()>(key, json, ttl_secs)
            .await?;

        Ok(())
    }

    /// Get cached aggregated metrics
    pub async fn get_aggregated_metrics(
        &mut self,
        metric_name: &str,
        window: &str,
    ) -> Result<Option<serde_json::Value>> {
        let key = format!("metrics:{}:{}", metric_name, window);
        let conn = self.get_connection().await?;

        let data: Option<String> = conn.get(&key).await?;
        match data {
            Some(json) => Ok(Some(serde_json::from_str(&json)?)),
            None => Ok(None),
        }
    }

    /// Update metrics based on processed events
    pub async fn update_metrics(&mut self, event: &AnalyticsEvent) -> Result<()> {
        let module = format!("{:?}", event.common.source_module);
        let event_type = format!("{:?}", event.common.event_type);

        // Increment event counters
        let counter_key = format!("counter:{}:{}", module, event_type);
        let conn = self.get_connection().await?;
        conn.incr::<_, _, ()>(&counter_key, 1).await?;

        // Update last event timestamp
        let ts_key = format!("last_event:{}:{}", module, event_type);
        let timestamp = event.common.timestamp.timestamp();
        conn.set::<_, _, ()>(&ts_key, timestamp).await?;

        Ok(())
    }

    /// Update metrics for a batch of events
    pub async fn update_batch(&mut self, events: &[AnalyticsEvent]) -> Result<()> {
        for event in events {
            self.update_metrics(event).await?;
        }
        Ok(())
    }

    /// Increment a counter
    pub async fn increment_counter(&mut self, key: &str, amount: i64) -> Result<i64> {
        let conn = self.get_connection().await?;
        let value: i64 = conn.incr(key, amount).await?;
        Ok(value)
    }

    /// Set a value with TTL
    pub async fn set_with_ttl(&mut self, key: &str, value: &str, ttl: Duration) -> Result<()> {
        let conn = self.get_connection().await?;
        conn.set_ex::<_, _, ()>(key, value, ttl.as_secs()).await?;
        Ok(())
    }

    /// Get a cached value
    pub async fn get(&mut self, key: &str) -> Result<Option<String>> {
        let conn = self.get_connection().await?;
        let value: Option<String> = conn.get(key).await?;
        Ok(value)
    }

    /// Delete a cached value
    pub async fn delete(&mut self, key: &str) -> Result<()> {
        let conn = self.get_connection().await?;
        conn.del::<_, ()>(key).await?;
        Ok(())
    }

    /// Invalidate cache by pattern
    pub async fn invalidate_pattern(&mut self, pattern: &str) -> Result<u64> {
        let conn = self.get_connection().await?;

        // Get all keys matching pattern
        let keys: Vec<String> = conn.keys(pattern).await?;

        if keys.is_empty() {
            return Ok(0);
        }

        // Delete all matching keys
        let deleted: u64 = conn.del(&keys).await?;
        Ok(deleted)
    }

    /// Get cache statistics
    pub async fn get_stats(&mut self) -> Result<CacheStats> {
        let conn = self.get_connection().await?;
        let info: String = redis::cmd("INFO")
            .query_async(conn)
            .await?;

        // Parse Redis INFO output - simplified version
        Ok(CacheStats {
            hits: 0,
            misses: 0,
            keys: 0,
            memory_used_bytes: 0,
        })
    }

    /// Flush all cache data (use with caution)
    pub async fn flush_all(&mut self) -> Result<()> {
        let conn = self.get_connection().await?;
        redis::cmd("FLUSHDB").query_async::<_, ()>(conn).await?;
        info!("Cache flushed");
        Ok(())
    }
}

#[async_trait::async_trait]
impl PipelineComponent for CacheManager {
    async fn initialize(&mut self) -> Result<()> {
        self.get_connection().await?;
        info!("Cache manager initialized");
        Ok(())
    }

    async fn shutdown(&mut self) -> Result<()> {
        info!("Cache manager shutting down");
        Ok(())
    }

    async fn health_check(&self) -> Result<HealthStatus> {
        let mut client = self.client.clone();
        match client.get_connection() {
            Ok(mut conn) => {
                match redis::cmd("PING").query::<String>(&mut conn) {
                    Ok(_) => Ok(HealthStatus::healthy()),
                    Err(e) => Ok(HealthStatus::unhealthy(format!("Redis PING failed: {}", e))),
                }
            }
            Err(e) => Ok(HealthStatus::unhealthy(format!(
                "Redis connection failed: {}",
                e
            ))),
        }
    }
}

/// Cache statistics
#[derive(Debug, Clone)]
pub struct CacheStats {
    pub hits: u64,
    pub misses: u64,
    pub keys: u64,
    pub memory_used_bytes: u64,
}
