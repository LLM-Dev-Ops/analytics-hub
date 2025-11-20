//! Database Migration Tool
//!
//! Rust-based database migration tool for TimescaleDB.
//! Replaces SQL init scripts with type-safe, version-controlled migrations.

use anyhow::{Context, Result};
use clap::{Parser, Subcommand};
use colored::Colorize;
use sqlx::postgres::{PgPool, PgPoolOptions};
use std::time::Duration;
use tracing::info;

#[derive(Parser)]
#[command(name = "db-migrate")]
#[command(about = "Database Migration Tool", long_about = None)]
struct Cli {
    /// Database URL
    #[arg(short, long, env = "DATABASE_URL")]
    database_url: String,

    #[command(subcommand)]
    command: Commands,
}

#[derive(Subcommand)]
enum Commands {
    /// Run pending migrations
    Migrate,

    /// Create a new migration
    Create {
        /// Migration name
        name: String,
    },

    /// Rollback last migration
    Rollback,

    /// Show migration status
    Status,

    /// Reset database (dangerous!)
    Reset {
        /// Confirm reset
        #[arg(long)]
        confirm: bool,
    },

    /// Initialize fresh database
    Init,
}

#[tokio::main]
async fn main() -> Result<()> {
    tracing_subscriber::fmt()
        .with_env_filter(tracing_subscriber::EnvFilter::from_default_env())
        .init();

    let cli = Cli::parse();

    println!("{}", "🗄️  LLM Analytics Hub - Database Migration Tool".bold().cyan());
    println!();

    // Connect to database
    let pool = PgPoolOptions::new()
        .max_connections(5)
        .acquire_timeout(Duration::from_secs(10))
        .connect(&cli.database_url)
        .await
        .context("Failed to connect to database")?;

    match cli.command {
        Commands::Migrate => migrate(&pool).await?,
        Commands::Create { name } => create_migration(&name).await?,
        Commands::Rollback => rollback(&pool).await?,
        Commands::Status => show_status(&pool).await?,
        Commands::Reset { confirm } => reset(&pool, confirm).await?,
        Commands::Init => init_database(&pool).await?,
    }

    pool.close().await;

    Ok(())
}

async fn migrate(pool: &PgPool) -> Result<()> {
    println!("{}", "🚀 Running migrations...".bold());

    // Create migrations table if not exists
    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS _migrations (
            id SERIAL PRIMARY KEY,
            name VARCHAR(255) NOT NULL UNIQUE,
            applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
        "#,
    )
    .execute(pool)
    .await?;

    // Run all migrations
    apply_migration(pool, "001_create_events_table", CREATE_EVENTS_TABLE).await?;
    apply_migration(pool, "002_create_metrics_table", CREATE_METRICS_TABLE).await?;
    apply_migration(pool, "003_create_anomalies_table", CREATE_ANOMALIES_TABLE).await?;
    apply_migration(pool, "004_create_correlations_table", CREATE_CORRELATIONS_TABLE).await?;
    apply_migration(pool, "005_create_indexes", CREATE_INDEXES).await?;
    apply_migration(pool, "006_enable_compression", ENABLE_COMPRESSION).await?;
    apply_migration(pool, "007_retention_policies", RETENTION_POLICIES).await?;

    println!("{}", "✅ All migrations applied successfully!".bold().green());

    Ok(())
}

async fn apply_migration(pool: &PgPool, name: &str, sql: &str) -> Result<()> {
    // Check if migration already applied
    let exists: bool = sqlx::query_scalar(
        "SELECT EXISTS(SELECT 1 FROM _migrations WHERE name = $1)"
    )
    .bind(name)
    .fetch_one(pool)
    .await?;

    if exists {
        println!("  {} {}", "⏭️".yellow(), name.dimmed());
        return Ok(());
    }

    info!("Applying migration: {}", name);

    // Execute migration
    sqlx::query(sql).execute(pool).await
        .context(format!("Failed to apply migration: {}", name))?;

    // Record migration
    sqlx::query("INSERT INTO _migrations (name) VALUES ($1)")
        .bind(name)
        .execute(pool)
        .await?;

    println!("  {} {}", "✅".green(), name.green());

    Ok(())
}

async fn create_migration(name: &str) -> Result<()> {
    let timestamp = chrono::Utc::now().format("%Y%m%d%H%M%S");
    let filename = format!("migrations/{}_{}.sql", timestamp, name);

    let template = format!(
        r#"-- Migration: {}
-- Created: {}

-- Up Migration
BEGIN;

-- Add your migration SQL here

COMMIT;

-- Down Migration (for rollback)
BEGIN;

-- Add rollback SQL here

COMMIT;
"#,
        name,
        chrono::Utc::now().format("%Y-%m-%d %H:%M:%S")
    );

    tokio::fs::write(&filename, template).await?;

    println!("{}", format!("✅ Created migration: {}", filename).green());

    Ok(())
}

async fn rollback(pool: &PgPool) -> Result<()> {
    println!("{}", "⏪ Rolling back last migration...".bold().yellow());

    let last_migration: Option<(i32, String)> = sqlx::query_as(
        "SELECT id, name FROM _migrations ORDER BY id DESC LIMIT 1"
    )
    .fetch_optional(pool)
    .await?;

    if let Some((id, name)) = last_migration {
        sqlx::query("DELETE FROM _migrations WHERE id = $1")
            .bind(id)
            .execute(pool)
            .await?;

        println!("{}", format!("✅ Rolled back: {}", name).green());
    } else {
        println!("{}", "No migrations to rollback".yellow());
    }

    Ok(())
}

async fn show_status(pool: &PgPool) -> Result<()> {
    println!("{}", "📊 Migration Status".bold());
    println!();

    let migrations: Vec<(String, String)> = sqlx::query_as(
        "SELECT name, applied_at::TEXT FROM _migrations ORDER BY id"
    )
    .fetch_all(pool)
    .await?;

    if migrations.is_empty() {
        println!("{}", "No migrations applied yet".yellow());
    } else {
        for (name, applied_at) in migrations {
            println!("  {} {} ({})", "✅".green(), name, applied_at.dimmed());
        }
    }

    Ok(())
}

async fn reset(pool: &PgPool, confirm: bool) -> Result<()> {
    if !confirm {
        println!("{}", "⚠️  This will DELETE ALL DATA!".red().bold());
        println!("Add --confirm flag to proceed");
        return Ok(());
    }

    println!("{}", "🗑️  Resetting database...".red().bold());

    // Drop all tables
    sqlx::query("DROP TABLE IF EXISTS events CASCADE").execute(pool).await?;
    sqlx::query("DROP TABLE IF EXISTS aggregated_metrics CASCADE").execute(pool).await?;
    sqlx::query("DROP TABLE IF EXISTS anomalies CASCADE").execute(pool).await?;
    sqlx::query("DROP TABLE IF EXISTS correlations CASCADE").execute(pool).await?;
    sqlx::query("DROP TABLE IF EXISTS _migrations CASCADE").execute(pool).await?;

    println!("{}", "✅ Database reset complete".green());

    Ok(())
}

async fn init_database(pool: &PgPool) -> Result<()> {
    println!("{}", "🔧 Initializing database...".bold());

    // Install TimescaleDB extension
    sqlx::query("CREATE EXTENSION IF NOT EXISTS timescaledb CASCADE")
        .execute(pool)
        .await?;

    println!("{}", "  ✅ TimescaleDB extension installed".green());

    // Run migrations
    migrate(pool).await?;

    println!("{}", "✅ Database initialized!".bold().green());

    Ok(())
}

// ========== Migration SQL ==========

const CREATE_EVENTS_TABLE: &str = r#"
CREATE TABLE IF NOT EXISTS events (
    event_id UUID PRIMARY KEY,
    timestamp TIMESTAMPTZ NOT NULL,
    source_module JSONB NOT NULL,
    event_type JSONB NOT NULL,
    correlation_id UUID,
    parent_event_id UUID,
    schema_version TEXT NOT NULL,
    severity JSONB NOT NULL,
    environment TEXT NOT NULL,
    tags JSONB NOT NULL DEFAULT '{}',
    payload JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

SELECT create_hypertable('events', 'timestamp', if_not_exists => TRUE);
"#;

const CREATE_METRICS_TABLE: &str = r#"
CREATE TABLE IF NOT EXISTS aggregated_metrics (
    id BIGSERIAL,
    metric_name TEXT NOT NULL,
    time_window TEXT NOT NULL,
    window_start TIMESTAMPTZ NOT NULL,
    tags JSONB NOT NULL DEFAULT '{}',
    avg DOUBLE PRECISION NOT NULL,
    min DOUBLE PRECISION NOT NULL,
    max DOUBLE PRECISION NOT NULL,
    p50 DOUBLE PRECISION NOT NULL,
    p95 DOUBLE PRECISION NOT NULL,
    p99 DOUBLE PRECISION NOT NULL,
    stddev DOUBLE PRECISION,
    count BIGINT NOT NULL,
    sum DOUBLE PRECISION NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (metric_name, time_window, window_start, tags)
);

SELECT create_hypertable('aggregated_metrics', 'window_start', if_not_exists => TRUE);
"#;

const CREATE_ANOMALIES_TABLE: &str = r#"
CREATE TABLE IF NOT EXISTS anomalies (
    anomaly_id UUID PRIMARY KEY,
    detected_at TIMESTAMPTZ NOT NULL,
    metric_name TEXT NOT NULL,
    anomaly_type TEXT NOT NULL,
    severity TEXT NOT NULL,
    value DOUBLE PRECISION NOT NULL,
    expected_value DOUBLE PRECISION,
    confidence_score DOUBLE PRECISION NOT NULL,
    context JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

SELECT create_hypertable('anomalies', 'detected_at', if_not_exists => TRUE);
"#;

const CREATE_CORRELATIONS_TABLE: &str = r#"
CREATE TABLE IF NOT EXISTS correlations (
    correlation_id UUID PRIMARY KEY,
    correlation_type TEXT NOT NULL,
    source_event_id UUID NOT NULL,
    target_event_id UUID NOT NULL,
    strength DOUBLE PRECISION NOT NULL,
    metadata JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
"#;

const CREATE_INDEXES: &str = r#"
CREATE INDEX IF NOT EXISTS idx_events_timestamp ON events (timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_events_correlation_id ON events (correlation_id) WHERE correlation_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_events_source_module ON events ((source_module->>'type'));
CREATE INDEX IF NOT EXISTS idx_events_tags ON events USING GIN (tags);

CREATE INDEX IF NOT EXISTS idx_metrics_metric_window ON aggregated_metrics (metric_name, time_window, window_start DESC);
CREATE INDEX IF NOT EXISTS idx_metrics_tags ON aggregated_metrics USING GIN (tags);

CREATE INDEX IF NOT EXISTS idx_anomalies_detected_at ON anomalies (detected_at DESC);
CREATE INDEX IF NOT EXISTS idx_anomalies_metric_name ON anomalies (metric_name);

CREATE INDEX IF NOT EXISTS idx_correlations_source ON correlations (source_event_id);
CREATE INDEX IF NOT EXISTS idx_correlations_target ON correlations (target_event_id);
"#;

const ENABLE_COMPRESSION: &str = r#"
ALTER TABLE events SET (
    timescaledb.compress,
    timescaledb.compress_segmentby = 'source_module, event_type',
    timescaledb.compress_orderby = 'timestamp DESC'
);

ALTER TABLE aggregated_metrics SET (
    timescaledb.compress,
    timescaledb.compress_segmentby = 'metric_name, time_window',
    timescaledb.compress_orderby = 'window_start DESC'
);

SELECT add_compression_policy('events', INTERVAL '7 days', if_not_exists => TRUE);
SELECT add_compression_policy('aggregated_metrics', INTERVAL '30 days', if_not_exists => TRUE);
"#;

const RETENTION_POLICIES: &str = r#"
SELECT add_retention_policy('events', INTERVAL '30 days', if_not_exists => TRUE);
SELECT add_retention_policy('aggregated_metrics', INTERVAL '365 days', if_not_exists => TRUE);
SELECT add_retention_policy('anomalies', INTERVAL '90 days', if_not_exists => TRUE);
"#;
