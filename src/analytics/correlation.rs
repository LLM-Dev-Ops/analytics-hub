//! Correlation Engine
//!
//! Cross-module event correlation and causal analysis.

use crate::models::correlation::{
    CorrelationId, CorrelationType, EventCorrelation, EventGraph,
};
use crate::schemas::events::AnalyticsEvent;
use anyhow::Result;
use chrono::{DateTime, Duration, Utc};
use dashmap::DashMap;
use std::collections::{HashMap, HashSet};
use std::sync::Arc;
use tracing::debug;
use uuid::Uuid;

use super::AnalyticsConfig;

/// Correlation engine for event analysis
pub struct CorrelationEngine {
    config: Arc<AnalyticsConfig>,
    // Correlation ID -> Set of Event IDs
    correlations: Arc<DashMap<Uuid, HashSet<Uuid>>>,
    // Event ID -> Event data (kept for correlation window)
    events: Arc<DashMap<Uuid, AnalyticsEvent>>,
    // Temporal correlation patterns
    patterns: Arc<DashMap<String, TemporalPattern>>,
}

impl CorrelationEngine {
    /// Create a new correlation engine
    pub async fn new(config: Arc<AnalyticsConfig>) -> Result<Self> {
        Ok(Self {
            config,
            correlations: Arc::new(DashMap::new()),
            events: Arc::new(DashMap::new()),
            patterns: Arc::new(DashMap::new()),
        })
    }

    /// Add an event for correlation analysis
    pub fn add_event(&self, event: AnalyticsEvent) -> Result<()> {
        let event_id = event.common.event_id;

        // Store event
        self.events.insert(event_id, event.clone());

        // Track correlation if present
        if let Some(correlation_id) = event.common.correlation_id {
            self.correlations
                .entry(correlation_id)
                .or_insert_with(HashSet::new)
                .insert(event_id);

            debug!(
                "Added event {} to correlation {}",
                event_id, correlation_id
            );
        }

        // Find temporal correlations
        self.find_temporal_correlations(&event)?;

        Ok(())
    }

    /// Find events that are temporally correlated
    fn find_temporal_correlations(&self, event: &AnalyticsEvent) -> Result<()> {
        let correlation_window = Duration::minutes(5);
        let event_time = event.common.timestamp;

        // Find events within correlation window
        for entry in self.events.iter() {
            let other_event = entry.value();

            if other_event.common.event_id == event.common.event_id {
                continue;
            }

            let time_diff = (event_time - other_event.common.timestamp).num_seconds().abs();

            if time_diff <= correlation_window.num_seconds() {
                // Check for module correlation patterns
                let pattern_key = format!(
                    "{:?}:{:?}",
                    event.common.source_module, other_event.common.source_module
                );

                self.patterns
                    .entry(pattern_key)
                    .or_insert_with(TemporalPattern::new)
                    .add_occurrence(event_time, time_diff);
            }
        }

        Ok(())
    }

    /// Get all events in a correlation group
    pub fn get_correlated_events(&self, correlation_id: Uuid) -> Vec<AnalyticsEvent> {
        let mut events = Vec::new();

        if let Some(event_ids) = self.correlations.get(&correlation_id) {
            for event_id in event_ids.iter() {
                if let Some(event) = self.events.get(event_id) {
                    events.push(event.clone());
                }
            }
        }

        events
    }

    /// Build correlation graph
    pub fn build_correlation_graph(&self, correlation_id: Uuid) -> Option<EventGraph> {
        let events = self.get_correlated_events(correlation_id);

        if events.is_empty() {
            return None;
        }

        let mut nodes = Vec::new();
        let mut edges = Vec::new();

        // Build nodes from events
        for event in &events {
            nodes.push(crate::models::correlation::EventNode {
                event_id: event.common.event_id,
                timestamp: event.common.timestamp,
                source_module: format!("{:?}", event.common.source_module),
                event_type: format!("{:?}", event.common.event_type),
                severity: format!("{:?}", event.common.severity),
            });
        }

        // Build edges from parent relationships
        for event in &events {
            if let Some(parent_id) = event.common.parent_event_id {
                edges.push(crate::models::correlation::EventEdge {
                    from_event_id: parent_id,
                    to_event_id: event.common.event_id,
                    correlation_type: CorrelationType::Causal,
                    confidence: 1.0,
                    latency_ms: None,
                });
            }
        }

        Some(EventGraph {
            correlation_id: CorrelationId {
                id: correlation_id,
                created_at: Utc::now(),
            },
            nodes,
            edges,
            metadata: HashMap::new(),
        })
    }

    /// Analyze correlation strength between modules
    pub fn analyze_module_correlation(
        &self,
        module1: &str,
        module2: &str,
    ) -> Option<CorrelationAnalysis> {
        let pattern_key = format!("{}:{}", module1, module2);

        self.patterns.get(&pattern_key).map(|pattern| {
            let count = pattern.occurrences.len();
            let avg_time_diff = if count > 0 {
                pattern.time_diffs.iter().sum::<i64>() / count as i64
            } else {
                0
            };

            CorrelationAnalysis {
                module1: module1.to_string(),
                module2: module2.to_string(),
                correlation_count: count,
                avg_time_diff_seconds: avg_time_diff,
                confidence: Self::calculate_confidence(count),
            }
        })
    }

    /// Calculate correlation confidence based on occurrence count
    fn calculate_confidence(occurrence_count: usize) -> f64 {
        // Simple confidence calculation - can be improved with statistical methods
        let normalized = (occurrence_count as f64 / 100.0).min(1.0);
        normalized * 0.9 + 0.1 // Range: 0.1 to 1.0
    }

    /// Clean up old events outside correlation window
    pub fn cleanup_old_events(&self, retention_hours: i64) -> usize {
        let cutoff_time = Utc::now() - Duration::hours(retention_hours);
        let mut removed = 0;

        self.events.retain(|_, event| {
            let keep = event.common.timestamp > cutoff_time;
            if !keep {
                removed += 1;
            }
            keep
        });

        removed
    }

    /// Get correlation statistics
    pub fn get_stats(&self) -> CorrelationStats {
        CorrelationStats {
            total_correlations: self.correlations.len(),
            total_events: self.events.len(),
            total_patterns: self.patterns.len(),
        }
    }
}

/// Temporal correlation pattern
struct TemporalPattern {
    occurrences: Vec<DateTime<Utc>>,
    time_diffs: Vec<i64>,
}

impl TemporalPattern {
    fn new() -> Self {
        Self {
            occurrences: Vec::new(),
            time_diffs: Vec::new(),
        }
    }

    fn add_occurrence(&mut self, timestamp: DateTime<Utc>, time_diff: i64) {
        self.occurrences.push(timestamp);
        self.time_diffs.push(time_diff);
    }
}

/// Correlation analysis result
#[derive(Debug, Clone)]
pub struct CorrelationAnalysis {
    pub module1: String,
    pub module2: String,
    pub correlation_count: usize,
    pub avg_time_diff_seconds: i64,
    pub confidence: f64,
}

/// Correlation statistics
#[derive(Debug, Clone)]
pub struct CorrelationStats {
    pub total_correlations: usize,
    pub total_events: usize,
    pub total_patterns: usize,
}
