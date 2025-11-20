//! Aggregation Engine
//!
//! Real-time metrics aggregation with multiple time windows and statistical measures.

use crate::models::metrics::{
    AggregatedMetric, MetricValues, StatisticalMeasures, TimeWindow,
};
use anyhow::Result;
use chrono::{DateTime, Utc};
use dashmap::DashMap;
use std::collections::HashMap;
use std::sync::Arc;
use tracing::debug;

use super::AnalyticsConfig;

/// Real-time aggregation engine
pub struct AggregationEngine {
    config: Arc<AnalyticsConfig>,
    // Window -> Metric Name -> Aggregation State
    aggregations: Arc<DashMap<TimeWindow, DashMap<String, AggregationState>>>,
}

impl AggregationEngine {
    /// Create a new aggregation engine
    pub async fn new(config: Arc<AnalyticsConfig>) -> Result<Self> {
        let aggregations = Arc::new(DashMap::new());

        // Initialize aggregation windows
        for &window_secs in &config.aggregation_windows {
            let window = Self::seconds_to_window(window_secs);
            aggregations.insert(window, DashMap::new());
        }

        Ok(Self {
            config,
            aggregations,
        })
    }

    /// Convert seconds to TimeWindow enum
    fn seconds_to_window(seconds: u64) -> TimeWindow {
        match seconds {
            60 => TimeWindow::OneMinute,
            300 => TimeWindow::FiveMinutes,
            900 => TimeWindow::FifteenMinutes,
            3600 => TimeWindow::OneHour,
            21600 => TimeWindow::SixHours,
            86400 => TimeWindow::OneDay,
            604800 => TimeWindow::OneWeek,
            2592000 => TimeWindow::OneMonth,
            _ => TimeWindow::FiveMinutes, // default
        }
    }

    /// Add a data point to aggregation
    pub fn add_point(
        &self,
        metric_name: &str,
        value: f64,
        timestamp: DateTime<Utc>,
        tags: HashMap<String, String>,
    ) -> Result<()> {
        for window_map in self.aggregations.iter() {
            let window = *window_map.key();
            let metrics = window_map.value();

            metrics
                .entry(metric_name.to_string())
                .or_insert_with(AggregationState::new)
                .add_value(value, timestamp);
        }

        debug!(
            "Added data point: {} = {} at {}",
            metric_name, value, timestamp
        );
        Ok(())
    }

    /// Get aggregated metrics for a time window
    pub fn get_aggregated(
        &self,
        metric_name: &str,
        window: TimeWindow,
    ) -> Option<AggregatedMetric> {
        let window_map = self.aggregations.get(&window)?;
        let state = window_map.get(metric_name)?;

        let stats = state.calculate_statistics();
        let (window_start, window_end) = state.get_time_bounds();

        Some(AggregatedMetric {
            name: metric_name.to_string(),
            window,
            window_start,
            window_end,
            values: MetricValues::Stats(stats),
            tags: HashMap::new(),
        })
    }

    /// Get all aggregated metrics for a window
    pub fn get_all_aggregated(&self, window: TimeWindow) -> Vec<AggregatedMetric> {
        let mut results = Vec::new();

        if let Some(window_map) = self.aggregations.get(&window) {
            for entry in window_map.iter() {
                let metric_name = entry.key();
                if let Some(metric) = self.get_aggregated(metric_name, window) {
                    results.push(metric);
                }
            }
        }

        results
    }

    /// Reset aggregation state for a metric
    pub fn reset_metric(&self, metric_name: &str) {
        for window_map in self.aggregations.iter() {
            window_map.value().remove(metric_name);
        }
    }

    /// Clear all aggregation data
    pub fn clear_all(&self) {
        for window_map in self.aggregations.iter() {
            window_map.value().clear();
        }
    }

    /// Get aggregation statistics
    pub fn get_stats(&self) -> AggregationStats {
        let mut total_metrics = 0;
        let mut total_data_points = 0;

        for window_map in self.aggregations.iter() {
            total_metrics += window_map.value().len();
            for state_entry in window_map.value().iter() {
                total_data_points += state_entry.value().values.len();
            }
        }

        AggregationStats {
            total_metrics,
            total_data_points,
            active_windows: self.aggregations.len(),
        }
    }
}

/// Aggregation state for a single metric
struct AggregationState {
    values: Vec<f64>,
    timestamps: Vec<DateTime<Utc>>,
    min_timestamp: Option<DateTime<Utc>>,
    max_timestamp: Option<DateTime<Utc>>,
}

impl AggregationState {
    fn new() -> Self {
        Self {
            values: Vec::new(),
            timestamps: Vec::new(),
            min_timestamp: None,
            max_timestamp: None,
        }
    }

    fn add_value(&mut self, value: f64, timestamp: DateTime<Utc>) {
        self.values.push(value);
        self.timestamps.push(timestamp);

        if self.min_timestamp.is_none() || timestamp < self.min_timestamp.unwrap() {
            self.min_timestamp = Some(timestamp);
        }
        if self.max_timestamp.is_none() || timestamp > self.max_timestamp.unwrap() {
            self.max_timestamp = Some(timestamp);
        }
    }

    fn calculate_statistics(&self) -> StatisticalMeasures {
        if self.values.is_empty() {
            return StatisticalMeasures::default();
        }

        let count = self.values.len() as u64;
        let sum: f64 = self.values.iter().sum();
        let avg = sum / count as f64;

        let mut sorted = self.values.clone();
        sorted.sort_by(|a, b| a.partial_cmp(b).unwrap());

        let min = sorted[0];
        let max = sorted[sorted.len() - 1];

        let p50_idx = (count as f64 * 0.50) as usize;
        let p95_idx = (count as f64 * 0.95) as usize;
        let p99_idx = (count as f64 * 0.99) as usize;

        let p50 = sorted[p50_idx.min(sorted.len() - 1)];
        let p95 = sorted[p95_idx.min(sorted.len() - 1)];
        let p99 = sorted[p99_idx.min(sorted.len() - 1)];

        // Calculate standard deviation
        let variance: f64 = self
            .values
            .iter()
            .map(|v| {
                let diff = v - avg;
                diff * diff
            })
            .sum::<f64>()
            / count as f64;
        let stddev = variance.sqrt();

        StatisticalMeasures {
            avg,
            min,
            max,
            p50,
            p95,
            p99,
            stddev: Some(stddev),
            count,
            sum,
        }
    }

    fn get_time_bounds(&self) -> (DateTime<Utc>, DateTime<Utc>) {
        (
            self.min_timestamp.unwrap_or_else(Utc::now),
            self.max_timestamp.unwrap_or_else(Utc::now),
        )
    }
}

/// Aggregation statistics
#[derive(Debug, Clone)]
pub struct AggregationStats {
    pub total_metrics: usize,
    pub total_data_points: usize,
    pub active_windows: usize,
}
