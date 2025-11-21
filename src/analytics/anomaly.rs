//! Anomaly Detection Module
//!
//! Statistical and machine learning-based anomaly detection.

use anyhow::Result;
use chrono::{DateTime, Utc};
use dashmap::DashMap;
use std::collections::VecDeque;
use std::sync::Arc;
use tracing::debug;

use super::AnalyticsConfig;

/// Anomaly detector
pub struct AnomalyDetector {
    config: Arc<AnalyticsConfig>,
    // Metric name -> Historical data
    baselines: Arc<DashMap<String, MetricBaseline>>,
    // Detected anomalies
    anomalies: Arc<DashMap<String, Vec<Anomaly>>>,
}

impl AnomalyDetector {
    /// Create a new anomaly detector
    pub async fn new(config: Arc<AnalyticsConfig>) -> Result<Self> {
        Ok(Self {
            config,
            baselines: Arc::new(DashMap::new()),
            anomalies: Arc::new(DashMap::new()),
        })
    }

    /// Add a data point and check for anomalies
    pub fn check_anomaly(
        &self,
        metric_name: &str,
        value: f64,
        timestamp: DateTime<Utc>,
    ) -> Result<Option<Anomaly>> {
        // Get or create baseline
        let mut baseline = self
            .baselines
            .entry(metric_name.to_string())
            .or_insert_with(|| MetricBaseline::new(100));

        // Add value to baseline
        baseline.add_value(value, timestamp);

        // Check if we have enough data
        if baseline.values.len() < 10 {
            return Ok(None);
        }

        // Calculate statistics
        let mean = baseline.calculate_mean();
        let stddev = baseline.calculate_stddev(mean);

        // Z-score method for anomaly detection
        let z_score = (value - mean).abs() / stddev;
        let threshold = self.get_threshold_for_sensitivity();

        if z_score > threshold {
            let anomaly = Anomaly {
                metric_name: metric_name.to_string(),
                timestamp,
                value,
                expected_value: mean,
                deviation: z_score,
                anomaly_type: self.classify_anomaly(value, mean, &baseline),
                severity: self.calculate_severity(z_score),
            };

            debug!(
                "Anomaly detected in {}: value={}, expected={}, z-score={}",
                metric_name, value, mean, z_score
            );

            // Store anomaly
            self.anomalies
                .entry(metric_name.to_string())
                .or_insert_with(Vec::new)
                .push(anomaly.clone());

            return Ok(Some(anomaly));
        }

        Ok(None)
    }

    /// Get threshold based on sensitivity configuration
    fn get_threshold_for_sensitivity(&self) -> f64 {
        // Convert sensitivity (0.0-1.0) to z-score threshold
        // Higher sensitivity = lower threshold
        let sensitivity = self.config.anomaly_sensitivity;
        3.0 - (sensitivity * 2.0) // Range: 1.0 to 3.0
    }

    /// Classify type of anomaly
    fn classify_anomaly(&self, value: f64, mean: f64, baseline: &MetricBaseline) -> AnomalyType {
        if value > mean {
            // Check if it's a spike (sudden increase)
            if let Some(&last_value) = baseline.values.back() {
                if value > last_value * 1.5 {
                    return AnomalyType::Spike;
                }
            }
            AnomalyType::HighValue
        } else {
            // Check if it's a drop (sudden decrease)
            if let Some(&last_value) = baseline.values.back() {
                if value < last_value * 0.5 {
                    return AnomalyType::Drop;
                }
            }
            AnomalyType::LowValue
        }
    }

    /// Calculate anomaly severity
    fn calculate_severity(&self, z_score: f64) -> AnomalySeverity {
        match z_score {
            z if z > 5.0 => AnomalySeverity::Critical,
            z if z > 4.0 => AnomalySeverity::High,
            z if z > 3.0 => AnomalySeverity::Medium,
            _ => AnomalySeverity::Low,
        }
    }

    /// Get recent anomalies for a metric
    pub fn get_anomalies(&self, metric_name: &str, limit: usize) -> Vec<Anomaly> {
        self.anomalies
            .get(metric_name)
            .map(|anomalies| {
                anomalies
                    .iter()
                    .rev()
                    .take(limit)
                    .cloned()
                    .collect()
            })
            .unwrap_or_default()
    }

    /// Get all anomalies across all metrics
    pub fn get_all_anomalies(&self, limit: usize) -> Vec<Anomaly> {
        let mut all_anomalies = Vec::new();

        for entry in self.anomalies.iter() {
            all_anomalies.extend(entry.value().iter().cloned());
        }

        // Sort by timestamp descending
        all_anomalies.sort_by(|a, b| b.timestamp.cmp(&a.timestamp));
        all_anomalies.truncate(limit);

        all_anomalies
    }

    /// Reset baseline for a metric
    pub fn reset_baseline(&self, metric_name: &str) {
        self.baselines.remove(metric_name);
    }

    /// Get detector statistics
    pub fn get_stats(&self) -> DetectorStats {
        let total_anomalies = self
            .anomalies
            .iter()
            .map(|entry| entry.value().len())
            .sum();

        DetectorStats {
            total_metrics: self.baselines.len(),
            total_anomalies,
            active_baselines: self.baselines.len(),
        }
    }
}

/// Metric baseline for anomaly detection
struct MetricBaseline {
    values: VecDeque<f64>,
    timestamps: VecDeque<DateTime<Utc>>,
    max_size: usize,
}

impl MetricBaseline {
    fn new(max_size: usize) -> Self {
        Self {
            values: VecDeque::with_capacity(max_size),
            timestamps: VecDeque::with_capacity(max_size),
            max_size,
        }
    }

    fn add_value(&mut self, value: f64, timestamp: DateTime<Utc>) {
        if self.values.len() >= self.max_size {
            self.values.pop_front();
            self.timestamps.pop_front();
        }
        self.values.push_back(value);
        self.timestamps.push_back(timestamp);
    }

    fn calculate_mean(&self) -> f64 {
        if self.values.is_empty() {
            return 0.0;
        }
        self.values.iter().sum::<f64>() / self.values.len() as f64
    }

    fn calculate_stddev(&self, mean: f64) -> f64 {
        if self.values.len() < 2 {
            return 1.0; // Avoid division by zero
        }

        let variance = self
            .values
            .iter()
            .map(|v| {
                let diff = v - mean;
                diff * diff
            })
            .sum::<f64>()
            / (self.values.len() - 1) as f64;

        variance.sqrt().max(0.0001) // Avoid zero stddev
    }
}

/// Detected anomaly
#[derive(Debug, Clone)]
pub struct Anomaly {
    pub metric_name: String,
    pub timestamp: DateTime<Utc>,
    pub value: f64,
    pub expected_value: f64,
    pub deviation: f64,
    pub anomaly_type: AnomalyType,
    pub severity: AnomalySeverity,
}

/// Type of anomaly
#[derive(Debug, Clone, PartialEq)]
pub enum AnomalyType {
    Spike,
    Drop,
    HighValue,
    LowValue,
    Pattern,
}

/// Anomaly severity
#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord)]
pub enum AnomalySeverity {
    Low,
    Medium,
    High,
    Critical,
}

/// Detector statistics
#[derive(Debug, Clone)]
pub struct DetectorStats {
    pub total_metrics: usize,
    pub total_anomalies: usize,
    pub active_baselines: usize,
}
