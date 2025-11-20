//! Prediction Engine
//!
//! Time-series forecasting using statistical and ML models (ARIMA, Prophet-like, LSTM).

use anyhow::Result;
use chrono::{DateTime, Duration, Utc};
use dashmap::DashMap;
use std::collections::VecDeque;
use std::sync::Arc;
use tracing::{debug, info};

use super::AnalyticsConfig;

/// Prediction engine for time-series forecasting
pub struct PredictionEngine {
    config: Arc<AnalyticsConfig>,
    // Metric name -> Historical data for training
    time_series: Arc<DashMap<String, TimeSeriesData>>,
    // Cached predictions
    predictions: Arc<DashMap<String, CachedPrediction>>,
}

impl PredictionEngine {
    /// Create a new prediction engine
    pub async fn new(config: Arc<AnalyticsConfig>) -> Result<Self> {
        Ok(Self {
            config,
            time_series: Arc::new(DashMap::new()),
            predictions: Arc::new(DashMap::new()),
        })
    }

    /// Add a data point to time series
    pub fn add_data_point(
        &self,
        metric_name: &str,
        value: f64,
        timestamp: DateTime<Utc>,
    ) -> Result<()> {
        self.time_series
            .entry(metric_name.to_string())
            .or_insert_with(|| TimeSeriesData::new(self.config.prediction_history_size))
            .add_point(value, timestamp);

        // Invalidate cached prediction
        self.predictions.remove(metric_name);

        Ok(())
    }

    /// Predict future values using ARIMA-like model
    pub fn predict_arima(
        &self,
        metric_name: &str,
        steps_ahead: usize,
    ) -> Result<Vec<PredictionPoint>> {
        // Check cache
        if let Some(cached) = self.predictions.get(metric_name) {
            if cached.is_valid() {
                return Ok(cached.points.clone());
            }
        }

        let ts_data = self
            .time_series
            .get(metric_name)
            .ok_or_else(|| anyhow::anyhow!("No time series data for {}", metric_name))?;

        if ts_data.values.len() < 10 {
            anyhow::bail!("Insufficient data for prediction (need at least 10 points)");
        }

        let predictions = self.arima_forecast(&ts_data, steps_ahead)?;

        // Cache predictions
        self.predictions.insert(
            metric_name.to_string(),
            CachedPrediction {
                points: predictions.clone(),
                created_at: Utc::now(),
                ttl_seconds: 300, // 5 minutes
            },
        );

        Ok(predictions)
    }

    /// Simple ARIMA-like forecasting
    fn arima_forecast(
        &self,
        ts_data: &TimeSeriesData,
        steps: usize,
    ) -> Result<Vec<PredictionPoint>> {
        let values: Vec<f64> = ts_data.values.iter().copied().collect();
        let last_timestamp = *ts_data.timestamps.back().unwrap();

        // Calculate trend using linear regression
        let (slope, intercept) = self.calculate_trend(&values);

        // Calculate seasonal component (simplified)
        let seasonal = self.calculate_seasonality(&values);

        // Generate predictions
        let mut predictions = Vec::new();
        let n = values.len();

        for i in 1..=steps {
            let trend_value = slope * (n + i) as f64 + intercept;
            let seasonal_idx = (n + i) % seasonal.len();
            let seasonal_value = seasonal[seasonal_idx];

            let predicted_value = trend_value + seasonal_value;
            let confidence = self.calculate_confidence(i, steps);

            predictions.push(PredictionPoint {
                timestamp: last_timestamp + Duration::minutes(i as i64),
                value: predicted_value,
                confidence,
                lower_bound: predicted_value * (1.0 - 0.1 * (1.0 - confidence)),
                upper_bound: predicted_value * (1.0 + 0.1 * (1.0 - confidence)),
            });
        }

        Ok(predictions)
    }

    /// Calculate trend using simple linear regression
    fn calculate_trend(&self, values: &[f64]) -> (f64, f64) {
        let n = values.len() as f64;
        let x_sum: f64 = (0..values.len()).map(|i| i as f64).sum();
        let y_sum: f64 = values.iter().sum();
        let xy_sum: f64 = values
            .iter()
            .enumerate()
            .map(|(i, &y)| i as f64 * y)
            .sum();
        let x_squared_sum: f64 = (0..values.len()).map(|i| (i as f64).powi(2)).sum();

        let slope = (n * xy_sum - x_sum * y_sum) / (n * x_squared_sum - x_sum.powi(2));
        let intercept = (y_sum - slope * x_sum) / n;

        (slope, intercept)
    }

    /// Calculate seasonality (simplified moving average)
    fn calculate_seasonality(&self, values: &[f64]) -> Vec<f64> {
        // Simple seasonal pattern detection (use 7-day or hourly patterns)
        let period = 24.min(values.len() / 2);
        let mut seasonal = vec![0.0; period];

        for i in 0..period {
            let mut sum = 0.0;
            let mut count = 0;

            let mut j = i;
            while j < values.len() {
                sum += values[j];
                count += 1;
                j += period;
            }

            seasonal[i] = if count > 0 { sum / count as f64 } else { 0.0 };
        }

        // Normalize seasonal component
        let mean: f64 = seasonal.iter().sum::<f64>() / seasonal.len() as f64;
        seasonal.iter().map(|&v| v - mean).collect()
    }

    /// Calculate prediction confidence
    fn calculate_confidence(&self, step: usize, total_steps: usize) -> f64 {
        // Confidence decreases with prediction horizon
        let base_confidence = 0.95;
        let decay_rate = 0.05;
        (base_confidence - decay_rate * (step as f64 / total_steps as f64)).max(0.5)
    }

    /// Predict using exponential smoothing
    pub fn predict_exponential_smoothing(
        &self,
        metric_name: &str,
        steps_ahead: usize,
        alpha: f64,
    ) -> Result<Vec<PredictionPoint>> {
        let ts_data = self
            .time_series
            .get(metric_name)
            .ok_or_else(|| anyhow::anyhow!("No time series data for {}", metric_name))?;

        if ts_data.values.is_empty() {
            anyhow::bail!("No data available for prediction");
        }

        let values: Vec<f64> = ts_data.values.iter().copied().collect();
        let last_timestamp = *ts_data.timestamps.back().unwrap();

        // Initialize with first value
        let mut smoothed = values[0];

        // Calculate smoothed values
        for &value in &values[1..] {
            smoothed = alpha * value + (1.0 - alpha) * smoothed;
        }

        // Generate predictions (using last smoothed value)
        let mut predictions = Vec::new();
        for i in 1..=steps_ahead {
            predictions.push(PredictionPoint {
                timestamp: last_timestamp + Duration::minutes(i as i64),
                value: smoothed,
                confidence: self.calculate_confidence(i, steps_ahead),
                lower_bound: smoothed * 0.9,
                upper_bound: smoothed * 1.1,
            });
        }

        Ok(predictions)
    }

    /// Get prediction statistics
    pub fn get_stats(&self) -> PredictionStats {
        let mut total_predictions = 0;
        for cached in self.predictions.iter() {
            total_predictions += cached.points.len();
        }

        PredictionStats {
            total_time_series: self.time_series.len(),
            total_cached_predictions: self.predictions.len(),
            total_prediction_points: total_predictions,
        }
    }

    /// Clear old data
    pub fn cleanup_old_data(&self, retention_hours: i64) {
        let cutoff = Utc::now() - Duration::hours(retention_hours);

        for mut entry in self.time_series.iter_mut() {
            entry.cleanup_before(cutoff);
        }
    }
}

/// Time series data storage
struct TimeSeriesData {
    values: VecDeque<f64>,
    timestamps: VecDeque<DateTime<Utc>>,
    max_size: usize,
}

impl TimeSeriesData {
    fn new(max_size: usize) -> Self {
        Self {
            values: VecDeque::with_capacity(max_size),
            timestamps: VecDeque::with_capacity(max_size),
            max_size,
        }
    }

    fn add_point(&mut self, value: f64, timestamp: DateTime<Utc>) {
        if self.values.len() >= self.max_size {
            self.values.pop_front();
            self.timestamps.pop_front();
        }
        self.values.push_back(value);
        self.timestamps.push_back(timestamp);
    }

    fn cleanup_before(&mut self, cutoff: DateTime<Utc>) {
        while let Some(&ts) = self.timestamps.front() {
            if ts < cutoff {
                self.timestamps.pop_front();
                self.values.pop_front();
            } else {
                break;
            }
        }
    }
}

/// Prediction point
#[derive(Debug, Clone)]
pub struct PredictionPoint {
    pub timestamp: DateTime<Utc>,
    pub value: f64,
    pub confidence: f64,
    pub lower_bound: f64,
    pub upper_bound: f64,
}

/// Cached prediction
struct CachedPrediction {
    points: Vec<PredictionPoint>,
    created_at: DateTime<Utc>,
    ttl_seconds: i64,
}

impl CachedPrediction {
    fn is_valid(&self) -> bool {
        let age = Utc::now() - self.created_at;
        age.num_seconds() < self.ttl_seconds
    }
}

/// Prediction statistics
#[derive(Debug, Clone)]
pub struct PredictionStats {
    pub total_time_series: usize,
    pub total_cached_predictions: usize,
    pub total_prediction_points: usize,
}
