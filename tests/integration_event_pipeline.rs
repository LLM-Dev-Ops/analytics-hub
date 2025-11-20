//! Integration Tests for Event Pipeline
//!
//! These tests verify end-to-end event processing flows across the analytics hub.

use llm_analytics_hub::schemas::events::*;
use llm_analytics_hub::models::metrics::*;
use llm_analytics_hub::models::timeseries::*;
use llm_analytics_hub::models::correlation::*;
use llm_analytics_hub::models::api::*;

use chrono::{DateTime, Duration, Utc};
use std::collections::HashMap;
use uuid::Uuid;

// ============================================================================
// EVENT CREATION AND PROCESSING TESTS
// ============================================================================

#[test]
fn test_event_pipeline_telemetry_flow() {
    // Create a telemetry event
    let event = create_latency_event("gpt-4", 1523.45);

    // Verify event structure
    assert_eq!(event.common.source_module, SourceModule::LlmObservatory);
    assert_eq!(event.common.event_type, EventType::Telemetry);

    // Serialize to JSON (simulating transmission)
    let json = serde_json::to_string(&event).unwrap();
    assert!(!json.is_empty());

    // Deserialize (simulating reception)
    let received_event: AnalyticsEvent = serde_json::from_str(&json).unwrap();

    // Verify event integrity
    match received_event.payload {
        EventPayload::Telemetry(TelemetryPayload::Latency(metrics)) => {
            assert_eq!(metrics.model_id, "gpt-4");
            assert_eq!(metrics.total_latency_ms, 1523.45);
        },
        _ => panic!("Wrong payload type"),
    }
}

#[test]
fn test_event_pipeline_security_flow() {
    // Create a security event
    let event = create_threat_event(ThreatType::PromptInjection, ThreatLevel::High);

    // Verify event structure
    assert_eq!(event.common.source_module, SourceModule::LlmSentinel);
    assert_eq!(event.common.event_type, EventType::Security);
    assert_eq!(event.common.severity, Severity::Critical);

    // Serialize and deserialize
    let json = serde_json::to_string(&event).unwrap();
    let received_event: AnalyticsEvent = serde_json::from_str(&json).unwrap();

    // Verify threat details
    match received_event.payload {
        EventPayload::Security(SecurityPayload::Threat(threat)) => {
            assert_eq!(threat.threat_type, ThreatType::PromptInjection);
            assert_eq!(threat.threat_level, ThreatLevel::High);
            assert_eq!(threat.mitigation_status, MitigationStatus::Detected);
        },
        _ => panic!("Wrong payload type"),
    }
}

#[test]
fn test_event_correlation_chain() {
    // Create a correlation chain of events
    let correlation_id = Uuid::new_v4();

    // Root event: High latency detected
    let event1 = create_correlated_event(
        SourceModule::LlmObservatory,
        EventType::Telemetry,
        correlation_id,
        None,
    );

    // Child event 1: Security scan triggered
    let event2 = create_correlated_event(
        SourceModule::LlmSentinel,
        EventType::Security,
        correlation_id,
        Some(event1.common.event_id),
    );

    // Child event 2: Cost spike detected
    let event3 = create_correlated_event(
        SourceModule::LlmCostOps,
        EventType::Cost,
        correlation_id,
        Some(event1.common.event_id),
    );

    // Verify correlation
    assert_eq!(event1.common.correlation_id, Some(correlation_id));
    assert_eq!(event2.common.correlation_id, Some(correlation_id));
    assert_eq!(event3.common.correlation_id, Some(correlation_id));

    // Verify parent-child relationships
    assert_eq!(event2.common.parent_event_id, Some(event1.common.event_id));
    assert_eq!(event3.common.parent_event_id, Some(event1.common.event_id));
}

#[test]
fn test_multi_module_event_aggregation() {
    // Simulate events from multiple modules
    let events = vec![
        create_simple_event(SourceModule::LlmObservatory, EventType::Telemetry),
        create_simple_event(SourceModule::LlmSentinel, EventType::Security),
        create_simple_event(SourceModule::LlmCostOps, EventType::Cost),
        create_simple_event(SourceModule::LlmGovernanceDashboard, EventType::Governance),
    ];

    // Group by module
    let mut by_module: HashMap<SourceModule, Vec<AnalyticsEvent>> = HashMap::new();
    for event in events {
        by_module.entry(event.common.source_module.clone())
            .or_insert_with(Vec::new)
            .push(event);
    }

    // Verify aggregation
    assert_eq!(by_module.len(), 4);
    assert!(by_module.contains_key(&SourceModule::LlmObservatory));
    assert!(by_module.contains_key(&SourceModule::LlmSentinel));
    assert!(by_module.contains_key(&SourceModule::LlmCostOps));
    assert!(by_module.contains_key(&SourceModule::LlmGovernanceDashboard));
}

// ============================================================================
// EVENT BATCH PROCESSING TESTS
// ============================================================================

#[test]
fn test_batch_event_processing() {
    // Create a batch of events
    let batch_size = 1000;
    let mut events = Vec::with_capacity(batch_size);

    for i in 0..batch_size {
        let event = create_latency_event(
            &format!("model-{}", i % 10),
            100.0 + (i as f64),
        );
        events.push(event);
    }

    assert_eq!(events.len(), batch_size);

    // Simulate batch processing: group by model
    let mut by_model: HashMap<String, Vec<f64>> = HashMap::new();
    for event in &events {
        if let EventPayload::Telemetry(TelemetryPayload::Latency(metrics)) = &event.payload {
            by_model.entry(metrics.model_id.clone())
                .or_insert_with(Vec::new)
                .push(metrics.total_latency_ms);
        }
    }

    // Verify batch processing
    assert_eq!(by_model.len(), 10); // 10 unique models

    // Calculate aggregate statistics per model
    for (model_id, latencies) in &by_model {
        let avg = latencies.iter().sum::<f64>() / latencies.len() as f64;
        assert!(avg > 0.0, "Model {} should have positive average latency", model_id);
    }
}

#[test]
fn test_event_filtering_and_routing() {
    // Create mixed events with different severities
    let events = vec![
        create_event_with_severity(Severity::Debug),
        create_event_with_severity(Severity::Info),
        create_event_with_severity(Severity::Warning),
        create_event_with_severity(Severity::Error),
        create_event_with_severity(Severity::Critical),
    ];

    // Filter critical events (would trigger alerts)
    let critical_events: Vec<_> = events.iter()
        .filter(|e| e.common.severity == Severity::Critical)
        .collect();

    // Filter error and above (would be logged)
    let error_plus_events: Vec<_> = events.iter()
        .filter(|e| e.common.severity >= Severity::Error)
        .collect();

    assert_eq!(critical_events.len(), 1);
    assert_eq!(error_plus_events.len(), 2); // Error + Critical
}

// ============================================================================
// TIME-SERIES INTEGRATION TESTS
// ============================================================================

#[test]
fn test_event_to_timeseries_conversion() {
    // Create telemetry event
    let event = create_latency_event("gpt-4", 1523.45);

    // Convert to time-series point
    let ts_point = event_to_timeseries_point(&event);

    assert_eq!(ts_point.measurement, "llm_latency");
    assert_eq!(ts_point.tags.source_module, "llm-observatory");

    match ts_point.fields {
        FieldSet::Performance(perf) => {
            assert_eq!(perf.latency_ms, Some(1523.45));
        },
        _ => panic!("Wrong field set type"),
    }
}

#[test]
fn test_timeseries_batch_creation() {
    // Create multiple events
    let events: Vec<_> = (0..100).map(|i| {
        create_latency_event("gpt-4", 100.0 + i as f64)
    }).collect();

    // Convert to time-series points
    let points: Vec<_> = events.iter()
        .map(|e| event_to_timeseries_point(e))
        .collect();

    // Create batch
    let batch = TimeSeriesBatch {
        batch_id: Uuid::new_v4().to_string(),
        measurement: "llm_latency".to_string(),
        points,
        created_at: Utc::now(),
    };

    assert_eq!(batch.points.len(), 100);
}

// ============================================================================
// CORRELATION DETECTION TESTS
// ============================================================================

#[test]
fn test_anomaly_correlation_detection() {
    // Simulate anomaly detection scenario
    let baseline_latency = 100.0;
    let spike_latency = 5000.0; // 50x increase

    // Create normal and anomalous events
    let normal_event = create_latency_event("gpt-4", baseline_latency);
    let anomaly_event = create_latency_event("gpt-4", spike_latency);

    // Detect anomaly
    let deviation = (spike_latency - baseline_latency) / baseline_latency;
    assert!(deviation > 10.0, "Should detect significant spike");

    // Create anomaly correlation
    let anomaly = AnomalyEvent {
        event_id: anomaly_event.common.event_id,
        source_module: SourceModule::LlmObservatory,
        anomaly_type: AnomalyType::Spike,
        anomaly_score: 0.95,
        baseline: baseline_latency,
        observed: spike_latency,
        deviation,
        timestamp: Utc::now(),
        metric: "latency_ms".to_string(),
    };

    assert_eq!(anomaly.anomaly_type, AnomalyType::Spike);
    assert!(anomaly.anomaly_score > 0.9);
}

// ============================================================================
// API RESPONSE INTEGRATION TESTS
// ============================================================================

#[test]
fn test_api_response_success_flow() {
    // Create event query result
    let events = vec![
        create_simple_event(SourceModule::LlmObservatory, EventType::Telemetry),
        create_simple_event(SourceModule::LlmSentinel, EventType::Security),
    ];

    // Wrap in API response
    let response = ApiResponse::success(events.clone());

    assert_eq!(response.status, ResponseStatus::Success);
    assert!(response.data.is_some());
    assert!(response.error.is_none());
    assert_eq!(response.data.unwrap().len(), 2);
}

#[test]
fn test_paginated_event_response() {
    // Create large event set
    let total_events = 250;
    let events: Vec<_> = (0..total_events)
        .map(|_| create_simple_event(SourceModule::LlmObservatory, EventType::Telemetry))
        .collect();

    // Paginate (page 2, 50 per page)
    let page = 2;
    let per_page = 50;
    let start_idx = (page - 1) * per_page;
    let end_idx = std::cmp::min(start_idx + per_page, total_events);
    let page_events = events[start_idx..end_idx].to_vec();

    // Create paginated response
    let pagination = PaginationMetadata::new(page, per_page, total_events as u64);
    let response = PaginatedResponse {
        status: ResponseStatus::Success,
        data: Some(page_events),
        pagination,
        error: None,
        meta: ResponseMetadata::default(),
    };

    assert_eq!(response.pagination.page, 2);
    assert_eq!(response.pagination.total_pages, 5);
    assert!(response.pagination.has_next);
    assert!(response.pagination.has_previous);
}

#[test]
fn test_query_result_with_metrics() {
    // Create query result
    let events = vec![
        create_simple_event(SourceModule::LlmObservatory, EventType::Telemetry),
    ];

    let query_result = QueryResult {
        query_id: Uuid::new_v4(),
        status: QueryStatus::Success,
        data: Some(events),
        metrics: QueryMetrics {
            execution_time_ms: 45,
            records_scanned: 1000,
            records_returned: 1,
            bytes_processed: 102400,
            from_cache: false,
            cache_ttl: None,
        },
        warnings: vec![],
    };

    assert_eq!(query_result.status, QueryStatus::Success);
    assert_eq!(query_result.metrics.records_returned, 1);
    assert_eq!(query_result.metrics.execution_time_ms, 45);
}

// ============================================================================
// COMPLIANCE AND AUDIT TRAIL TESTS
// ============================================================================

#[test]
fn test_audit_trail_completeness() {
    // Create series of audit events
    let mut changes = HashMap::new();
    changes.insert("status".to_string(), serde_json::json!("active"));

    let audit_event = AnalyticsEvent {
        common: CommonEventFields {
            event_id: Uuid::new_v4(),
            timestamp: Utc::now(),
            source_module: SourceModule::LlmGovernanceDashboard,
            event_type: EventType::Audit,
            correlation_id: None,
            parent_event_id: None,
            schema_version: "1.0.0".to_string(),
            severity: Severity::Info,
            environment: "production".to_string(),
            tags: HashMap::new(),
        },
        payload: EventPayload::Governance(GovernancePayload::AuditTrail(AuditTrailEvent {
            action: "model_update".to_string(),
            actor: "user-123".to_string(),
            resource_type: "model".to_string(),
            resource_id: "gpt-4".to_string(),
            changes,
            ip_address: Some("10.0.0.1".to_string()),
            user_agent: Some("LLM-Client/1.0".to_string()),
        })),
    };

    // Verify audit trail has all required fields
    match audit_event.payload {
        EventPayload::Governance(GovernancePayload::AuditTrail(audit)) => {
            assert!(!audit.action.is_empty());
            assert!(!audit.actor.is_empty());
            assert!(!audit.resource_type.is_empty());
            assert!(!audit.resource_id.is_empty());
            assert!(audit.ip_address.is_some());
        },
        _ => panic!("Wrong payload type"),
    }
}

#[test]
fn test_gdpr_compliance_validation() {
    // Create privacy event
    let privacy_event = AnalyticsEvent {
        common: CommonEventFields {
            event_id: Uuid::new_v4(),
            timestamp: Utc::now(),
            source_module: SourceModule::LlmSentinel,
            event_type: EventType::Security,
            correlation_id: None,
            parent_event_id: None,
            schema_version: "1.0.0".to_string(),
            severity: Severity::Info,
            environment: "production".to_string(),
            tags: HashMap::new(),
        },
        payload: EventPayload::Security(SecurityPayload::Privacy(PrivacyEvent {
            data_type: "pii".to_string(),
            operation: PrivacyOperation::DataAccess,
            user_consent: true,
            data_subjects: vec!["user-456".to_string()],
            purpose: "model_training".to_string(),
        })),
    };

    // Validate GDPR requirements
    match privacy_event.payload {
        EventPayload::Security(SecurityPayload::Privacy(privacy)) => {
            // Must have user consent for PII
            assert!(privacy.user_consent, "GDPR requires consent for PII processing");
            // Must have documented purpose
            assert!(!privacy.purpose.is_empty(), "GDPR requires documented purpose");
            // Must track data subjects
            assert!(!privacy.data_subjects.is_empty(), "GDPR requires subject tracking");
        },
        _ => panic!("Wrong payload type"),
    }
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

fn create_latency_event(model_id: &str, latency_ms: f64) -> AnalyticsEvent {
    AnalyticsEvent {
        common: CommonEventFields {
            event_id: Uuid::new_v4(),
            timestamp: Utc::now(),
            source_module: SourceModule::LlmObservatory,
            event_type: EventType::Telemetry,
            correlation_id: None,
            parent_event_id: None,
            schema_version: "1.0.0".to_string(),
            severity: Severity::Info,
            environment: "test".to_string(),
            tags: HashMap::new(),
        },
        payload: EventPayload::Telemetry(TelemetryPayload::Latency(LatencyMetrics {
            model_id: model_id.to_string(),
            request_id: Uuid::new_v4().to_string(),
            total_latency_ms: latency_ms,
            ttft_ms: Some(latency_ms * 0.2),
            tokens_per_second: Some(50.0),
            breakdown: None,
        })),
    }
}

fn create_threat_event(threat_type: ThreatType, threat_level: ThreatLevel) -> AnalyticsEvent {
    AnalyticsEvent {
        common: CommonEventFields {
            event_id: Uuid::new_v4(),
            timestamp: Utc::now(),
            source_module: SourceModule::LlmSentinel,
            event_type: EventType::Security,
            correlation_id: None,
            parent_event_id: None,
            schema_version: "1.0.0".to_string(),
            severity: Severity::Critical,
            environment: "test".to_string(),
            tags: HashMap::new(),
        },
        payload: EventPayload::Security(SecurityPayload::Threat(ThreatEvent {
            threat_id: Uuid::new_v4().to_string(),
            threat_type,
            threat_level,
            source_ip: Some("192.168.1.100".to_string()),
            target_resource: "model-endpoint".to_string(),
            attack_vector: "test-vector".to_string(),
            mitigation_status: MitigationStatus::Detected,
            indicators_of_compromise: vec![],
        })),
    }
}

fn create_correlated_event(
    source_module: SourceModule,
    event_type: EventType,
    correlation_id: Uuid,
    parent_id: Option<Uuid>,
) -> AnalyticsEvent {
    AnalyticsEvent {
        common: CommonEventFields {
            event_id: Uuid::new_v4(),
            timestamp: Utc::now(),
            source_module,
            event_type,
            correlation_id: Some(correlation_id),
            parent_event_id: parent_id,
            schema_version: "1.0.0".to_string(),
            severity: Severity::Info,
            environment: "test".to_string(),
            tags: HashMap::new(),
        },
        payload: EventPayload::Custom(CustomPayload {
            custom_type: "test".to_string(),
            data: serde_json::json!({}),
        }),
    }
}

fn create_simple_event(source_module: SourceModule, event_type: EventType) -> AnalyticsEvent {
    AnalyticsEvent {
        common: CommonEventFields {
            event_id: Uuid::new_v4(),
            timestamp: Utc::now(),
            source_module,
            event_type,
            correlation_id: None,
            parent_event_id: None,
            schema_version: "1.0.0".to_string(),
            severity: Severity::Info,
            environment: "test".to_string(),
            tags: HashMap::new(),
        },
        payload: EventPayload::Custom(CustomPayload {
            custom_type: "test".to_string(),
            data: serde_json::json!({}),
        }),
    }
}

fn create_event_with_severity(severity: Severity) -> AnalyticsEvent {
    AnalyticsEvent {
        common: CommonEventFields {
            event_id: Uuid::new_v4(),
            timestamp: Utc::now(),
            source_module: SourceModule::LlmAnalyticsHub,
            event_type: EventType::Alert,
            correlation_id: None,
            parent_event_id: None,
            schema_version: "1.0.0".to_string(),
            severity,
            environment: "test".to_string(),
            tags: HashMap::new(),
        },
        payload: EventPayload::Custom(CustomPayload {
            custom_type: "test".to_string(),
            data: serde_json::json!({}),
        }),
    }
}

fn event_to_timeseries_point(event: &AnalyticsEvent) -> TimeSeriesPoint {
    let mut tags = TagSet::default();
    tags.source_module = format!("{:?}", event.common.source_module).to_lowercase();
    tags.environment = event.common.environment.clone();

    let fields = match &event.payload {
        EventPayload::Telemetry(TelemetryPayload::Latency(metrics)) => {
            FieldSet::Performance(PerformanceFields {
                latency_ms: Some(metrics.total_latency_ms),
                throughput: None,
                error_count: None,
                success_count: Some(1),
                token_count: None,
                custom: HashMap::new(),
            })
        },
        _ => FieldSet::Generic(HashMap::new()),
    };

    TimeSeriesPoint {
        measurement: "llm_latency".to_string(),
        timestamp: event.common.timestamp,
        tags,
        fields,
        metadata: None,
    }
}
