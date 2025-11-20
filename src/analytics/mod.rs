//! Analytics Engine
//!
//! Core analytics capabilities including aggregation, correlation, and prediction.

pub mod aggregation;
pub mod correlation;
pub mod anomaly;
pub mod prediction;

pub use aggregation::AggregationEngine;
pub use correlation::CorrelationEngine;
pub use anomaly::AnomalyDetector;
pub use prediction::PredictionEngine;

use anyhow::Result;
use std::sync::Arc;

/// Analytics configuration
#[derive(Debug, Clone)]
pub struct AnalyticsConfig {
    /// Enable real-time aggregation
    pub enable_realtime_aggregation: bool,

    /// Enable anomaly detection
    pub enable_anomaly_detection: bool,

    /// Enable predictive analytics
    pub enable_prediction: bool,

    /// Aggregation window sizes (in seconds)
    pub aggregation_windows: Vec<u64>,

    /// Anomaly detection sensitivity (0.0 - 1.0)
    pub anomaly_sensitivity: f64,

    /// Number of historical data points for prediction
    pub prediction_history_size: usize,
}

impl Default for AnalyticsConfig {
    fn default() -> Self {
        Self {
            enable_realtime_aggregation: true,
            enable_anomaly_detection: true,
            enable_prediction: true,
            aggregation_windows: vec![60, 300, 900, 3600], // 1m, 5m, 15m, 1h
            anomaly_sensitivity: 0.95,
            prediction_history_size: 100,
        }
    }
}

/// Main analytics engine orchestrator
pub struct AnalyticsEngine {
    config: Arc<AnalyticsConfig>,
    aggregation: AggregationEngine,
    correlation: CorrelationEngine,
    anomaly: AnomalyDetector,
    prediction: PredictionEngine,
}

impl AnalyticsEngine {
    /// Create a new analytics engine
    pub async fn new(config: AnalyticsConfig) -> Result<Self> {
        let config = Arc::new(config);

        let aggregation = AggregationEngine::new(config.clone()).await?;
        let correlation = CorrelationEngine::new(config.clone()).await?;
        let anomaly = AnomalyDetector::new(config.clone()).await?;
        let prediction = PredictionEngine::new(config.clone()).await?;

        Ok(Self {
            config,
            aggregation,
            correlation,
            anomaly,
            prediction,
        })
    }

    /// Get aggregation engine
    pub fn aggregation(&self) -> &AggregationEngine {
        &self.aggregation
    }

    /// Get correlation engine
    pub fn correlation(&self) -> &CorrelationEngine {
        &self.correlation
    }

    /// Get anomaly detector
    pub fn anomaly(&self) -> &AnomalyDetector {
        &self.anomaly
    }

    /// Get prediction engine
    pub fn prediction(&self) -> &PredictionEngine {
        &self.prediction
    }
}
