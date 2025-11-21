//! Database Interaction Layer
//!
//! Provides high-performance database operations with connection pooling,
//! prepared statements, and transaction management for TimescaleDB.

use anyhow::{Context, Result};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::postgres::{PgPool, PgPoolOptions, PgQueryResult};
use sqlx::{query, query_as, FromRow, Row};
use std::time::Duration;
use tracing::{info, instrument, warn};
use uuid::Uuid;

pub mod queries;
pub mod schema;

use crate::schemas::events::AnalyticsEvent;
use crate::models::metrics::{StatisticalMeasures, TimeWindow};

/// Database configuration
#[derive(Debug, Clone, Deserialize)]
pub struct DatabaseConfig {
    pub host: String,
    pub port: u16,
    pub database: String,
    pub username: String,
    pub password: String,
    pub max_connections: u32,
    pub min_connections: u32,
    pub connection_timeout: u64,
    pub idle_timeout: u64,
    pub max_lifetime: u64,
}

impl Default for DatabaseConfig {
    fn default() -> Self {
        Self {
            host: "localhost".to_string(),
            port: 5432,
            database: "llm_analytics".to_string(),
            username: "postgres".to_string(),
            password: "postgres".to_string(),
            max_connections: 50,
            min_connections: 5,
            connection_timeout: 30,
            idle_timeout: 600,
            max_lifetime: 1800,
        }
    }
}

impl DatabaseConfig {
    /// Build a PostgreSQL connection string
    pub fn connection_string(&self) -> String {
        format!(
            "postgres://{}:{}@{}:{}/{}",
            self.username, self.password, self.host, self.port, self.database
        )
    }
}

/// Database client with connection pooling
pub struct Database {
    pool: PgPool,
}

impl Database {
    /// Create a new database client with connection pool
    #[instrument(skip(config))]
    pub async fn new(config: DatabaseConfig) -> Result<Self> {
        info!("Initializing database connection pool");

        let pool = PgPoolOptions::new()
            .max_connections(config.max_connections)
            .min_connections(config.min_connections)
            .acquire_timeout(Duration::from_secs(config.connection_timeout))
            .idle_timeout(Duration::from_secs(config.idle_timeout))
            .max_lifetime(Duration::from_secs(config.max_lifetime))
            .connect(&config.connection_string())
            .await
            .context("Failed to create database connection pool")?;

        // Test the connection
        sqlx::query("SELECT 1")
            .execute(&pool)
            .await
            .context("Failed to test database connection")?;

        info!("Database connection pool initialized successfully");

        Ok(Self { pool })
    }

    /// Create a new database client from a connection URL
    #[instrument(skip(url))]
    pub async fn from_url(url: &str) -> Result<Self> {
        info!("Initializing database connection pool from URL");

        let pool = PgPoolOptions::new()
            .max_connections(50)
            .min_connections(5)
            .acquire_timeout(Duration::from_secs(30))
            .idle_timeout(Duration::from_secs(600))
            .max_lifetime(Duration::from_secs(1800))
            .connect(url)
            .await
            .context("Failed to create database connection pool")?;

        // Test the connection
        sqlx::query("SELECT 1")
            .execute(&pool)
            .await
            .context("Failed to test database connection")?;

        info!("Database connection pool initialized successfully");

        Ok(Self { pool })
    }

    /// Get a reference to the connection pool
    pub fn pool(&self) -> &PgPool {
        &self.pool
    }

    /// Close the database connection pool
    pub async fn close(&self) {
        self.pool.close().await;
    }

    // ========== Event Operations ==========

    /// Insert a single analytics event
    #[instrument(skip(self, event))]
    pub async fn insert_event(&self, event: &AnalyticsEvent) -> Result<Uuid> {
        let event_json = serde_json::to_value(event)
            .context("Failed to serialize event")?;

        let row = sqlx::query(
            r#"
            INSERT INTO events (
                event_id, timestamp, source_module, event_type,
                correlation_id, parent_event_id, schema_version,
                severity, environment, tags, payload
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
            RETURNING event_id
            "#
        )
        .bind(event.common.event_id)
        .bind(event.common.timestamp)
        .bind(serde_json::to_value(&event.common.source_module)?)
        .bind(serde_json::to_value(&event.common.event_type)?)
        .bind(event.common.correlation_id)
        .bind(event.common.parent_event_id)
        .bind(&event.common.schema_version)
        .bind(serde_json::to_value(&event.common.severity)?)
        .bind(&event.common.environment)
        .bind(serde_json::to_value(&event.common.tags)?)
        .bind(event_json)
        .fetch_one(&self.pool)
        .await
        .context("Failed to insert event")?;

        Ok(row.try_get("event_id")?)
    }

    /// Batch insert analytics events for high throughput
    #[instrument(skip(self, events))]
    pub async fn insert_events_batch(&self, events: &[AnalyticsEvent]) -> Result<u64> {
        if events.is_empty() {
            return Ok(0);
        }

        let mut tx = self.pool.begin().await?;
        let mut inserted = 0u64;

        // Use COPY for maximum performance with large batches
        if events.len() > 100 {
            // Build bulk insert query
            let mut query_builder = sqlx::QueryBuilder::new(
                "INSERT INTO events (event_id, timestamp, source_module, event_type, \
                 correlation_id, parent_event_id, schema_version, severity, environment, \
                 tags, payload) "
            );

            query_builder.push_values(events, |mut b, event| {
                let event_json = serde_json::to_value(event).unwrap();
                b.push_bind(event.common.event_id)
                    .push_bind(event.common.timestamp)
                    .push_bind(serde_json::to_value(&event.common.source_module).unwrap())
                    .push_bind(serde_json::to_value(&event.common.event_type).unwrap())
                    .push_bind(event.common.correlation_id)
                    .push_bind(event.common.parent_event_id)
                    .push_bind(&event.common.schema_version)
                    .push_bind(serde_json::to_value(&event.common.severity).unwrap())
                    .push_bind(&event.common.environment)
                    .push_bind(serde_json::to_value(&event.common.tags).unwrap())
                    .push_bind(event_json);
            });

            let result = query_builder.build().execute(&mut *tx).await?;
            inserted = result.rows_affected();
        } else {
            // Use individual inserts for smaller batches
            for event in events {
                self.insert_event(event).await?;
                inserted += 1;
            }
        }

        tx.commit().await?;
        Ok(inserted)
    }

    /// Query events by time range
    #[instrument(skip(self))]
    pub async fn query_events(
        &self,
        start: DateTime<Utc>,
        end: DateTime<Utc>,
        limit: Option<i64>,
    ) -> Result<Vec<AnalyticsEvent>> {
        let limit = limit.unwrap_or(1000);

        let rows = sqlx::query(
            r#"
            SELECT payload
            FROM events
            WHERE timestamp >= $1 AND timestamp < $2
            ORDER BY timestamp DESC
            LIMIT $3
            "#
        )
        .bind(start)
        .bind(end)
        .bind(limit)
        .fetch_all(&self.pool)
        .await
        .context("Failed to query events")?;

        let events: Vec<AnalyticsEvent> = rows
            .into_iter()
            .filter_map(|row| {
                let payload: serde_json::Value = row.try_get("payload").ok()?;
                serde_json::from_value(payload).ok()
            })
            .collect();

        Ok(events)
    }

    /// Query events by correlation ID
    #[instrument(skip(self))]
    pub async fn query_events_by_correlation(
        &self,
        correlation_id: Uuid,
    ) -> Result<Vec<AnalyticsEvent>> {
        let rows = sqlx::query(
            r#"
            SELECT payload
            FROM events
            WHERE correlation_id = $1
            ORDER BY timestamp ASC
            "#
        )
        .bind(correlation_id)
        .fetch_all(&self.pool)
        .await
        .context("Failed to query events by correlation")?;

        let events: Vec<AnalyticsEvent> = rows
            .into_iter()
            .filter_map(|row| {
                let payload: serde_json::Value = row.try_get("payload").ok()?;
                serde_json::from_value(payload).ok()
            })
            .collect();

        Ok(events)
    }

    // ========== Metrics Operations ==========

    /// Store aggregated metrics
    #[instrument(skip(self))]
    pub async fn store_aggregated_metric(
        &self,
        metric_name: &str,
        time_window: TimeWindow,
        window_start: DateTime<Utc>,
        tags: &serde_json::Value,
        measures: &StatisticalMeasures,
    ) -> Result<()> {
        sqlx::query(
            r#"
            INSERT INTO aggregated_metrics (
                metric_name, time_window, window_start, tags,
                avg, min, max, p50, p95, p99, stddev, count, sum
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
            ON CONFLICT (metric_name, time_window, window_start, tags)
            DO UPDATE SET
                avg = EXCLUDED.avg,
                min = EXCLUDED.min,
                max = EXCLUDED.max,
                p50 = EXCLUDED.p50,
                p95 = EXCLUDED.p95,
                p99 = EXCLUDED.p99,
                stddev = EXCLUDED.stddev,
                count = EXCLUDED.count,
                sum = EXCLUDED.sum
            "#
        )
        .bind(metric_name)
        .bind(time_window.as_str())
        .bind(window_start)
        .bind(tags)
        .bind(measures.avg)
        .bind(measures.min)
        .bind(measures.max)
        .bind(measures.p50)
        .bind(measures.p95)
        .bind(measures.p99)
        .bind(measures.stddev)
        .bind(measures.count as i64)
        .bind(measures.sum)
        .execute(&self.pool)
        .await
        .context("Failed to store aggregated metric")?;

        Ok(())
    }

    /// Query aggregated metrics
    #[instrument(skip(self))]
    pub async fn query_aggregated_metrics(
        &self,
        metric_name: &str,
        time_window: TimeWindow,
        start: DateTime<Utc>,
        end: DateTime<Utc>,
    ) -> Result<Vec<AggregatedMetricRow>> {
        let rows = sqlx::query_as::<_, AggregatedMetricRow>(
            r#"
            SELECT
                metric_name, time_window, window_start, tags,
                avg, min, max, p50, p95, p99, stddev, count, sum
            FROM aggregated_metrics
            WHERE metric_name = $1
              AND time_window = $2
              AND window_start >= $3
              AND window_start < $4
            ORDER BY window_start ASC
            "#
        )
        .bind(metric_name)
        .bind(time_window.as_str())
        .bind(start)
        .bind(end)
        .fetch_all(&self.pool)
        .await
        .context("Failed to query aggregated metrics")?;

        Ok(rows)
    }

    // ========== Anomaly Operations ==========

    /// Store detected anomaly
    #[instrument(skip(self))]
    pub async fn store_anomaly(
        &self,
        anomaly_id: Uuid,
        detected_at: DateTime<Utc>,
        metric_name: &str,
        anomaly_type: &str,
        severity: &str,
        value: f64,
        expected_value: Option<f64>,
        confidence_score: f64,
        context: &serde_json::Value,
    ) -> Result<Uuid> {
        let result = sqlx::query(
            r#"
            INSERT INTO anomalies (
                anomaly_id, detected_at, metric_name, anomaly_type,
                severity, value, expected_value, confidence_score, context
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            RETURNING anomaly_id
            "#
        )
        .bind(anomaly_id)
        .bind(detected_at)
        .bind(metric_name)
        .bind(anomaly_type)
        .bind(severity)
        .bind(value)
        .bind(expected_value)
        .bind(confidence_score)
        .bind(context)
        .fetch_one(&self.pool)
        .await
        .context("Failed to store anomaly")?;

        Ok(result.try_get("anomaly_id")?)
    }

    /// Query recent anomalies
    #[instrument(skip(self))]
    pub async fn query_recent_anomalies(
        &self,
        since: DateTime<Utc>,
        limit: Option<i64>,
    ) -> Result<Vec<AnomalyRow>> {
        let limit = limit.unwrap_or(100);

        let rows = sqlx::query_as::<_, AnomalyRow>(
            r#"
            SELECT
                anomaly_id, detected_at, metric_name, anomaly_type,
                severity, value, expected_value, confidence_score, context
            FROM anomalies
            WHERE detected_at >= $1
            ORDER BY detected_at DESC
            LIMIT $2
            "#
        )
        .bind(since)
        .bind(limit)
        .fetch_all(&self.pool)
        .await
        .context("Failed to query anomalies")?;

        Ok(rows)
    }

    // ========== Correlation Operations ==========

    /// Store event correlation
    #[instrument(skip(self))]
    pub async fn store_correlation(
        &self,
        correlation_id: Uuid,
        correlation_type: &str,
        source_event_id: Uuid,
        target_event_id: Uuid,
        strength: f64,
        metadata: &serde_json::Value,
    ) -> Result<Uuid> {
        let result = sqlx::query(
            r#"
            INSERT INTO correlations (
                correlation_id, correlation_type, source_event_id,
                target_event_id, strength, metadata, created_at
            )
            VALUES ($1, $2, $3, $4, $5, $6, NOW())
            RETURNING correlation_id
            "#
        )
        .bind(correlation_id)
        .bind(correlation_type)
        .bind(source_event_id)
        .bind(target_event_id)
        .bind(strength)
        .bind(metadata)
        .fetch_one(&self.pool)
        .await
        .context("Failed to store correlation")?;

        Ok(result.try_get("correlation_id")?)
    }

    // ========== Health Check ==========

    /// Check database health
    pub async fn health_check(&self) -> Result<DatabaseHealth> {
        let result = sqlx::query(
            r#"
            SELECT
                (SELECT COUNT(*) FROM pg_stat_activity WHERE state = 'active') as active_connections,
                (SELECT COUNT(*) FROM events WHERE timestamp > NOW() - INTERVAL '1 minute') as recent_events,
                (SELECT pg_database_size(current_database())) as database_size
            "#
        )
        .fetch_one(&self.pool)
        .await?;

        Ok(DatabaseHealth {
            active_connections: result.try_get::<Option<i64>, _>("active_connections")?.unwrap_or(0),
            recent_events: result.try_get::<Option<i64>, _>("recent_events")?.unwrap_or(0),
            database_size_bytes: result.try_get::<Option<i64>, _>("database_size")?.unwrap_or(0),
        })
    }
}

// ========== Database Types ==========

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct AggregatedMetricRow {
    pub metric_name: String,
    pub time_window: String,
    pub window_start: DateTime<Utc>,
    pub tags: serde_json::Value,
    pub avg: f64,
    pub min: f64,
    pub max: f64,
    pub p50: f64,
    pub p95: f64,
    pub p99: f64,
    pub stddev: Option<f64>,
    pub count: i64,
    pub sum: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct AnomalyRow {
    pub anomaly_id: Uuid,
    pub detected_at: DateTime<Utc>,
    pub metric_name: String,
    pub anomaly_type: String,
    pub severity: String,
    pub value: f64,
    pub expected_value: Option<f64>,
    pub confidence_score: f64,
    pub context: serde_json::Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DatabaseHealth {
    pub active_connections: i64,
    pub recent_events: i64,
    pub database_size_bytes: i64,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_database_config_connection_string() {
        let config = DatabaseConfig::default();
        let conn_str = config.connection_string();
        assert!(conn_str.contains("postgres://"));
        assert!(conn_str.contains("localhost:5432"));
    }
}
