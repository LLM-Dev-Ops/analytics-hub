//! Storage Module - TimescaleDB Integration
//!
//! High-performance time-series storage with TimescaleDB (PostgreSQL extension).

use crate::schemas::events::AnalyticsEvent;
use anyhow::{Context, Result};
use sqlx::postgres::{PgPool, PgPoolOptions};
use sqlx::Row;
use tracing::info;

use super::{HealthStatus, PipelineComponent, PipelineConfig};

/// Storage manager for TimescaleDB
pub struct StorageManager {
    pool: PgPool,
}

impl StorageManager {
    /// Create a new storage manager
    pub async fn new(config: &PipelineConfig) -> Result<Self> {
        let pool = PgPoolOptions::new()
            .max_connections(20)
            .min_connections(5)
            .acquire_timeout(std::time::Duration::from_secs(30))
            .connect(&config.timescaledb_url)
            .await
            .context("Failed to connect to TimescaleDB")?;

        info!("Connected to TimescaleDB");

        Ok(Self { pool })
    }

    /// Initialize database schema
    pub async fn initialize_schema(&self) -> Result<()> {
        info!("Initializing TimescaleDB schema");

        // Create main events table
        sqlx::query(
            r#"
            CREATE TABLE IF NOT EXISTS analytics_events (
                event_id UUID PRIMARY KEY,
                timestamp TIMESTAMPTZ NOT NULL,
                source_module VARCHAR(100) NOT NULL,
                event_type VARCHAR(50) NOT NULL,
                correlation_id UUID,
                parent_event_id UUID,
                schema_version VARCHAR(20) NOT NULL,
                severity VARCHAR(20) NOT NULL,
                environment VARCHAR(50) NOT NULL,
                tags JSONB,
                payload JSONB NOT NULL,
                created_at TIMESTAMPTZ DEFAULT NOW()
            )
            "#,
        )
        .execute(&self.pool)
        .await?;

        // Convert to hypertable for time-series optimization
        sqlx::query(
            r#"
            SELECT create_hypertable('analytics_events', 'timestamp',
                if_not_exists => TRUE,
                chunk_time_interval => INTERVAL '1 day'
            )
            "#,
        )
        .execute(&self.pool)
        .await
        .ok(); // Ignore error if already exists

        // Create indexes
        self.create_indexes().await?;

        // Create metrics tables
        self.create_metrics_tables().await?;

        info!("Schema initialization complete");
        Ok(())
    }

    /// Create optimized indexes
    async fn create_indexes(&self) -> Result<()> {
        let indexes = vec![
            "CREATE INDEX IF NOT EXISTS idx_events_source_module ON analytics_events(source_module, timestamp DESC)",
            "CREATE INDEX IF NOT EXISTS idx_events_event_type ON analytics_events(event_type, timestamp DESC)",
            "CREATE INDEX IF NOT EXISTS idx_events_correlation_id ON analytics_events(correlation_id) WHERE correlation_id IS NOT NULL",
            "CREATE INDEX IF NOT EXISTS idx_events_severity ON analytics_events(severity, timestamp DESC)",
            "CREATE INDEX IF NOT EXISTS idx_events_tags ON analytics_events USING GIN(tags)",
        ];

        for index_sql in indexes {
            sqlx::query(index_sql).execute(&self.pool).await?;
        }

        Ok(())
    }

    /// Create metrics aggregation tables
    async fn create_metrics_tables(&self) -> Result<()> {
        // Aggregated metrics table
        sqlx::query(
            r#"
            CREATE TABLE IF NOT EXISTS aggregated_metrics (
                id BIGSERIAL,
                metric_name VARCHAR(255) NOT NULL,
                timestamp TIMESTAMPTZ NOT NULL,
                window_size VARCHAR(10) NOT NULL,
                tags JSONB,
                value_avg DOUBLE PRECISION,
                value_min DOUBLE PRECISION,
                value_max DOUBLE PRECISION,
                value_p50 DOUBLE PRECISION,
                value_p95 DOUBLE PRECISION,
                value_p99 DOUBLE PRECISION,
                value_stddev DOUBLE PRECISION,
                value_count BIGINT,
                value_sum DOUBLE PRECISION,
                PRIMARY KEY (timestamp, metric_name, window_size)
            )
            "#,
        )
        .execute(&self.pool)
        .await?;

        // Convert to hypertable
        sqlx::query(
            r#"
            SELECT create_hypertable('aggregated_metrics', 'timestamp',
                if_not_exists => TRUE,
                chunk_time_interval => INTERVAL '1 day'
            )
            "#,
        )
        .execute(&self.pool)
        .await
        .ok();

        // Create continuous aggregates for common time windows
        self.create_continuous_aggregates().await?;

        Ok(())
    }

    /// Create continuous aggregates for real-time rollups
    async fn create_continuous_aggregates(&self) -> Result<()> {
        // 1-minute aggregation
        sqlx::query(
            r#"
            CREATE MATERIALIZED VIEW IF NOT EXISTS metrics_1m
            WITH (timescaledb.continuous) AS
            SELECT
                time_bucket('1 minute', timestamp) AS bucket,
                source_module,
                event_type,
                COUNT(*) as event_count
            FROM analytics_events
            GROUP BY bucket, source_module, event_type
            WITH NO DATA
            "#,
        )
        .execute(&self.pool)
        .await
        .ok();

        // Add refresh policy
        sqlx::query(
            r#"
            SELECT add_continuous_aggregate_policy('metrics_1m',
                start_offset => INTERVAL '1 hour',
                end_offset => INTERVAL '1 minute',
                schedule_interval => INTERVAL '1 minute',
                if_not_exists => TRUE
            )
            "#,
        )
        .execute(&self.pool)
        .await
        .ok();

        Ok(())
    }

    /// Store a single event
    pub async fn store_event(&self, event: &AnalyticsEvent) -> Result<()> {
        sqlx::query(
            r#"
            INSERT INTO analytics_events
            (event_id, timestamp, source_module, event_type, correlation_id,
             parent_event_id, schema_version, severity, environment, tags, payload)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
            ON CONFLICT (event_id) DO NOTHING
            "#,
        )
        .bind(&event.common.event_id)
        .bind(&event.common.timestamp)
        .bind(serde_json::to_string(&event.common.source_module)?)
        .bind(serde_json::to_string(&event.common.event_type)?)
        .bind(&event.common.correlation_id)
        .bind(&event.common.parent_event_id)
        .bind(&event.common.schema_version)
        .bind(serde_json::to_string(&event.common.severity)?)
        .bind(&event.common.environment)
        .bind(serde_json::to_value(&event.common.tags)?)
        .bind(serde_json::to_value(&event.payload)?)
        .execute(&self.pool)
        .await?;

        Ok(())
    }

    /// Store a batch of events
    pub async fn store_batch(&self, events: &[AnalyticsEvent]) -> Result<()> {
        let mut tx = self.pool.begin().await?;

        for event in events {
            sqlx::query(
                r#"
                INSERT INTO analytics_events
                (event_id, timestamp, source_module, event_type, correlation_id,
                 parent_event_id, schema_version, severity, environment, tags, payload)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
                ON CONFLICT (event_id) DO NOTHING
                "#,
            )
            .bind(&event.common.event_id)
            .bind(&event.common.timestamp)
            .bind(serde_json::to_string(&event.common.source_module)?)
            .bind(serde_json::to_string(&event.common.event_type)?)
            .bind(&event.common.correlation_id)
            .bind(&event.common.parent_event_id)
            .bind(&event.common.schema_version)
            .bind(serde_json::to_string(&event.common.severity)?)
            .bind(&event.common.environment)
            .bind(serde_json::to_value(&event.common.tags)?)
            .bind(serde_json::to_value(&event.payload)?)
            .execute(&mut *tx)
            .await?;
        }

        tx.commit().await?;
        Ok(())
    }

    /// Query events by time range
    pub async fn query_events(
        &self,
        start_time: chrono::DateTime<chrono::Utc>,
        end_time: chrono::DateTime<chrono::Utc>,
        limit: i64,
    ) -> Result<Vec<AnalyticsEvent>> {
        let rows = sqlx::query(
            r#"
            SELECT event_id, timestamp, source_module, event_type, correlation_id,
                   parent_event_id, schema_version, severity, environment, tags, payload
            FROM analytics_events
            WHERE timestamp >= $1 AND timestamp <= $2
            ORDER BY timestamp DESC
            LIMIT $3
            "#,
        )
        .bind(start_time)
        .bind(end_time)
        .bind(limit)
        .fetch_all(&self.pool)
        .await?;

        let events = Vec::new();
        for row in rows {
            // Parse the row data - this is simplified, actual implementation would need proper deserialization
            let payload: serde_json::Value = row.try_get("payload")?;
            // TODO: Properly reconstruct AnalyticsEvent from row data
        }

        Ok(events)
    }

    /// Get event count by source module
    pub async fn get_event_count_by_module(&self) -> Result<Vec<(String, i64)>> {
        let rows = sqlx::query(
            r#"
            SELECT source_module, COUNT(*) as count
            FROM analytics_events
            WHERE timestamp > NOW() - INTERVAL '24 hours'
            GROUP BY source_module
            "#,
        )
        .fetch_all(&self.pool)
        .await?;

        let mut counts = Vec::new();
        for row in rows {
            let module: String = row.try_get("source_module")?;
            let count: i64 = row.try_get("count")?;
            counts.push((module, count));
        }

        Ok(counts)
    }
}

#[async_trait::async_trait]
impl PipelineComponent for StorageManager {
    async fn initialize(&mut self) -> Result<()> {
        self.initialize_schema().await?;
        Ok(())
    }

    async fn shutdown(&mut self) -> Result<()> {
        info!("Closing database connections");
        self.pool.close().await;
        Ok(())
    }

    async fn health_check(&self) -> Result<HealthStatus> {
        match sqlx::query("SELECT 1").fetch_one(&self.pool).await {
            Ok(_) => Ok(HealthStatus::healthy()),
            Err(e) => Ok(HealthStatus::unhealthy(format!(
                "Database health check failed: {}",
                e
            ))),
        }
    }
}
