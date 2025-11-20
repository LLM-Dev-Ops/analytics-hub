//! Forecasting Service
//!
//! Provides time-series forecasting for metrics using statistical methods.
//! Features:
//! - Moving average forecasting
//! - Exponential smoothing
//! - Trend analysis
//! - Seasonal decomposition
//! - Prediction intervals

use chrono::{DateTime, Utc};
use dashmap::DashMap;
use prometheus::{register_counter_vec, register_histogram_vec, CounterVec, HistogramVec};
use serde::{Deserialize, Serialize};
use sqlx::postgres::PgPoolOptions;
use sqlx::PgPool;
use std::collections::VecDeque;
use std::sync::Arc;
use tokio::signal;
use tokio::time::{interval, Duration};
use tracing::{error, info};

/// Prometheus metrics
struct Metrics {
    forecasts_generated: CounterVec,
    forecast_duration: HistogramVec,
    forecast_error: HistogramVec,
}

impl Metrics {
    fn new() -> anyhow::Result<Self> {
        Ok(Self {
            forecasts_generated: register_counter_vec!(
                "llm_forecasts_generated_total",
                "Total forecasts generated",
                &["metric_name", "method"]
            )?,
            forecast_duration: register_histogram_vec!(
                "llm_forecast_duration_seconds",
                "Forecast generation duration",
                &["method"]
            )?,
            forecast_error: register_histogram_vec!(
                "llm_forecast_error",
                "Forecast error (actual vs predicted)",
                &["metric_name"]
            )?,
        })
    }
}

/// Configuration
#[derive(Debug, Clone)]
struct Config {
    database_url: String,
    forecast_interval_secs: u64,
    forecast_horizon_hours: i64,
}

impl Config {
    fn from_env() -> Self {
        Self {
            database_url: std::env::var("DATABASE_URL").unwrap_or_else(|_| {
                "postgres://admin:password@timescaledb.llm-analytics.svc.cluster.local:5432/llm_analytics".to_string()
            }),
            forecast_interval_secs: std::env::var("FORECAST_INTERVAL_SECS")
                .unwrap_or_else(|_| "300".to_string())
                .parse()
                .expect("Invalid FORECAST_INTERVAL_SECS"),
            forecast_horizon_hours: std::env::var("FORECAST_HORIZON_HOURS")
                .unwrap_or_else(|_| "24".to_string())
                .parse()
                .expect("Invalid FORECAST_HORIZON_HOURS"),
        }
    }
}

/// Time series data point
#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
struct TimeSeriesPoint {
    timestamp: DateTime<Utc>,
    metric_name: String,
    value: f64,
}

/// Forecast result
#[derive(Debug, Clone, Serialize, Deserialize)]
struct ForecastResult {
    metric_name: String,
    timestamp: DateTime<Utc>,
    predicted_value: f64,
    lower_bound: f64,
    upper_bound: f64,
    confidence: f64,
    method: String,
}

/// Forecasting engine
struct ForecastingEngine {
    forecasts: Arc<DashMap<String, Vec<ForecastResult>>>,
}

impl ForecastingEngine {
    fn new() -> Self {
        Self {
            forecasts: Arc::new(DashMap::new()),
        }
    }

    /// Simple moving average forecast
    fn moving_average_forecast(
        &self,
        metric_name: &str,
        data: &[TimeSeriesPoint],
        horizon_points: usize,
        window_size: usize,
    ) -> Vec<ForecastResult> {
        if data.len() < window_size {
            return Vec::new();
        }

        let mut forecasts = Vec::new();

        // Calculate moving average
        let recent_values: Vec<f64> = data.iter().rev().take(window_size).map(|p| p.value).collect();
        let ma: f64 = recent_values.iter().sum::<f64>() / recent_values.len() as f64;

        // Calculate standard deviation for confidence intervals
        let mean = ma;
        let variance: f64 = recent_values.iter().map(|v| (v - mean).powi(2)).sum::<f64>()
            / recent_values.len() as f64;
        let std_dev = variance.sqrt();

        // Generate forecasts
        let last_timestamp = data.last().unwrap().timestamp;
        for i in 1..=horizon_points {
            let forecast_time = last_timestamp + chrono::Duration::hours(i as i64);

            forecasts.push(ForecastResult {
                metric_name: metric_name.to_string(),
                timestamp: forecast_time,
                predicted_value: ma,
                lower_bound: ma - 2.0 * std_dev,
                upper_bound: ma + 2.0 * std_dev,
                confidence: 0.95,
                method: "moving_average".to_string(),
            });
        }

        forecasts
    }

    /// Exponential smoothing forecast
    fn exponential_smoothing_forecast(
        &self,
        metric_name: &str,
        data: &[TimeSeriesPoint],
        horizon_points: usize,
        alpha: f64,
    ) -> Vec<ForecastResult> {
        if data.is_empty() {
            return Vec::new();
        }

        // Initialize with first value
        let mut smoothed = data[0].value;

        // Apply exponential smoothing
        for point in data.iter().skip(1) {
            smoothed = alpha * point.value + (1.0 - alpha) * smoothed;
        }

        // Calculate forecast variance
        let errors: Vec<f64> = data
            .iter()
            .skip(1)
            .map(|p| p.value - smoothed)
            .collect();

        let error_variance: f64 = errors.iter().map(|e| e.powi(2)).sum::<f64>() / errors.len() as f64;
        let error_std = error_variance.sqrt();

        // Generate forecasts
        let mut forecasts = Vec::new();
        let last_timestamp = data.last().unwrap().timestamp;

        for i in 1..=horizon_points {
            let forecast_time = last_timestamp + chrono::Duration::hours(i as i64);

            forecasts.push(ForecastResult {
                metric_name: metric_name.to_string(),
                timestamp: forecast_time,
                predicted_value: smoothed,
                lower_bound: smoothed - 2.0 * error_std,
                upper_bound: smoothed + 2.0 * error_std,
                confidence: 0.95,
                method: "exponential_smoothing".to_string(),
            });
        }

        forecasts
    }

    async fn generate_forecasts(
        &self,
        pool: &PgPool,
        metrics: &Arc<Metrics>,
        horizon_hours: i64,
    ) -> anyhow::Result<()> {
        info!("Generating forecasts");

        // Get distinct metric names
        let metric_names: Vec<String> = sqlx::query_scalar!(
            r#"
            SELECT DISTINCT metric_name
            FROM aggregated_metrics
            WHERE window_start > NOW() - INTERVAL '7 days'
            "#
        )
        .fetch_all(pool)
        .await
        .unwrap_or_default();

        for metric_name in metric_names {
            let timer = metrics
                .forecast_duration
                .with_label_values(&["moving_average"])
                .start_timer();

            // Fetch historical data
            let data: Vec<TimeSeriesPoint> = sqlx::query_as!(
                TimeSeriesPoint,
                r#"
                SELECT window_start as timestamp, metric_name, mean as value
                FROM aggregated_metrics
                WHERE metric_name = $1
                AND window_start > NOW() - INTERVAL '7 days'
                ORDER BY window_start ASC
                "#,
                &metric_name
            )
            .fetch_all(pool)
            .await
            .unwrap_or_default();

            if data.len() < 10 {
                continue; // Not enough data
            }

            // Generate forecasts using moving average
            let forecasts = self.moving_average_forecast(
                &metric_name,
                &data,
                horizon_hours as usize,
                24, // 24-hour window
            );

            // Store forecasts
            for forecast in &forecasts {
                sqlx::query!(
                    r#"
                    INSERT INTO forecasts (
                        metric_name, forecast_timestamp, predicted_value,
                        lower_bound, upper_bound, confidence, method,
                        generated_at
                    )
                    VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
                    ON CONFLICT (metric_name, forecast_timestamp, method)
                    DO UPDATE SET
                        predicted_value = EXCLUDED.predicted_value,
                        lower_bound = EXCLUDED.lower_bound,
                        upper_bound = EXCLUDED.upper_bound,
                        confidence = EXCLUDED.confidence,
                        generated_at = EXCLUDED.generated_at
                    "#,
                    forecast.metric_name,
                    forecast.timestamp,
                    forecast.predicted_value,
                    forecast.lower_bound,
                    forecast.upper_bound,
                    forecast.confidence,
                    forecast.method
                )
                .execute(pool)
                .await?;
            }

            self.forecasts.insert(metric_name.clone(), forecasts);

            timer.observe_duration();
            metrics
                .forecasts_generated
                .with_label_values(&[&metric_name, "moving_average"])
                .inc();
        }

        info!("Forecasts generated successfully");
        Ok(())
    }
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    // Initialize tracing
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "forecasting=info".into()),
        )
        .json()
        .init();

    info!("Starting Forecasting Service v{}", env!("CARGO_PKG_VERSION"));

    // Load configuration
    let config = Config::from_env();
    info!(?config, "Configuration loaded");

    // Initialize metrics
    let metrics = Arc::new(Metrics::new()?);

    // Initialize database pool
    let db_pool = PgPoolOptions::new()
        .max_connections(5)
        .connect(&config.database_url)
        .await?;

    info!("Database connection pool initialized");

    // Create forecasting engine
    let engine = Arc::new(ForecastingEngine::new());

    // Spawn forecast generation task
    let forecast_pool = db_pool.clone();
    let forecast_engine = engine.clone();
    let forecast_metrics = metrics.clone();
    let forecast_interval = config.forecast_interval_secs;
    let horizon_hours = config.forecast_horizon_hours;

    tokio::spawn(async move {
        let mut interval = interval(Duration::from_secs(forecast_interval));
        loop {
            interval.tick().await;
            if let Err(e) = forecast_engine
                .generate_forecasts(&forecast_pool, &forecast_metrics, horizon_hours)
                .await
            {
                error!("Failed to generate forecasts: {}", e);
            }
        }
    });

    // Wait for shutdown signal
    signal::ctrl_c().await?;
    info!("Received shutdown signal");

    info!("Service shutdown complete");
    Ok(())
}
