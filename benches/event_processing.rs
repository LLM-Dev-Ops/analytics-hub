//! Event Processing Performance Benchmarks
//!
//! Target: 100,000+ events/second throughput

use criterion::{black_box, criterion_group, criterion_main, Criterion, BenchmarkId, Throughput};
use llm_analytics_hub::schemas::events::*;
use chrono::Utc;
use std::collections::HashMap;
use uuid::Uuid;

// ============================================================================
// EVENT CREATION BENCHMARKS
// ============================================================================

fn bench_create_telemetry_event(c: &mut Criterion) {
    c.bench_function("create_telemetry_event", |b| {
        b.iter(|| {
            black_box(AnalyticsEvent {
                common: CommonEventFields {
                    event_id: Uuid::new_v4(),
                    timestamp: Utc::now(),
                    source_module: SourceModule::LlmObservatory,
                    event_type: EventType::Telemetry,
                    correlation_id: None,
                    parent_event_id: None,
                    schema_version: "1.0.0".to_string(),
                    severity: Severity::Info,
                    environment: "production".to_string(),
                    tags: HashMap::new(),
                },
                payload: EventPayload::Telemetry(TelemetryPayload::Latency(LatencyMetrics {
                    model_id: "gpt-4".to_string(),
                    request_id: Uuid::new_v4().to_string(),
                    total_latency_ms: 1523.45,
                    ttft_ms: Some(234.12),
                    tokens_per_second: Some(45.6),
                    breakdown: None,
                })),
            })
        });
    });
}

fn bench_create_security_event(c: &mut Criterion) {
    c.bench_function("create_security_event", |b| {
        b.iter(|| {
            black_box(AnalyticsEvent {
                common: CommonEventFields {
                    event_id: Uuid::new_v4(),
                    timestamp: Utc::now(),
                    source_module: SourceModule::LlmSentinel,
                    event_type: EventType::Security,
                    correlation_id: None,
                    parent_event_id: None,
                    schema_version: "1.0.0".to_string(),
                    severity: Severity::Critical,
                    environment: "production".to_string(),
                    tags: HashMap::new(),
                },
                payload: EventPayload::Security(SecurityPayload::Threat(ThreatEvent {
                    threat_id: Uuid::new_v4().to_string(),
                    threat_type: ThreatType::PromptInjection,
                    threat_level: ThreatLevel::High,
                    source_ip: Some("192.168.1.1".to_string()),
                    target_resource: "model-endpoint-1".to_string(),
                    attack_vector: "malicious prompt".to_string(),
                    mitigation_status: MitigationStatus::Blocked,
                    indicators_of_compromise: vec!["ioc1".to_string()],
                })),
            })
        });
    });
}

// ============================================================================
// SERIALIZATION BENCHMARKS
// ============================================================================

fn bench_serialize_event(c: &mut Criterion) {
    let event = create_test_event();

    c.bench_function("serialize_event_json", |b| {
        b.iter(|| {
            black_box(serde_json::to_string(&event).unwrap())
        });
    });
}

fn bench_deserialize_event(c: &mut Criterion) {
    let event = create_test_event();
    let json = serde_json::to_string(&event).unwrap();

    c.bench_function("deserialize_event_json", |b| {
        b.iter(|| {
            black_box(serde_json::from_str::<AnalyticsEvent>(&json).unwrap())
        });
    });
}

fn bench_serialize_msgpack(c: &mut Criterion) {
    let event = create_test_event();

    c.bench_function("serialize_event_msgpack", |b| {
        b.iter(|| {
            black_box(rmp_serde::to_vec(&event).unwrap())
        });
    });
}

fn bench_deserialize_msgpack(c: &mut Criterion) {
    let event = create_test_event();
    let msgpack = rmp_serde::to_vec(&event).unwrap();

    c.bench_function("deserialize_event_msgpack", |b| {
        b.iter(|| {
            black_box(rmp_serde::from_slice::<AnalyticsEvent>(&msgpack).unwrap())
        });
    });
}

// ============================================================================
// BATCH PROCESSING BENCHMARKS
// ============================================================================

fn bench_batch_processing(c: &mut Criterion) {
    let mut group = c.benchmark_group("batch_processing");

    for size in [100, 1_000, 10_000, 100_000].iter() {
        group.throughput(Throughput::Elements(*size as u64));
        group.bench_with_input(BenchmarkId::from_parameter(size), size, |b, &size| {
            b.iter(|| {
                let events: Vec<_> = (0..size)
                    .map(|_| create_test_event())
                    .collect();
                black_box(events)
            });
        });
    }
    group.finish();
}

fn bench_batch_serialization(c: &mut Criterion) {
    let mut group = c.benchmark_group("batch_serialization");

    for size in [100, 1_000, 10_000].iter() {
        let events: Vec<_> = (0..*size).map(|_| create_test_event()).collect();

        group.throughput(Throughput::Elements(*size as u64));
        group.bench_with_input(BenchmarkId::from_parameter(size), &events, |b, events| {
            b.iter(|| {
                for event in events {
                    black_box(serde_json::to_string(event).unwrap());
                }
            });
        });
    }
    group.finish();
}

// ============================================================================
// EVENT FILTERING BENCHMARKS
// ============================================================================

fn bench_filter_by_severity(c: &mut Criterion) {
    let events: Vec<_> = (0..10_000).map(|i| {
        let severity = match i % 5 {
            0 => Severity::Debug,
            1 => Severity::Info,
            2 => Severity::Warning,
            3 => Severity::Error,
            4 => Severity::Critical,
            _ => Severity::Info,
        };
        create_event_with_severity(severity)
    }).collect();

    c.bench_function("filter_critical_events", |b| {
        b.iter(|| {
            let critical: Vec<_> = events.iter()
                .filter(|e| e.common.severity == Severity::Critical)
                .collect();
            black_box(critical)
        });
    });
}

fn bench_filter_by_module(c: &mut Criterion) {
    let events: Vec<_> = (0..10_000).map(|i| {
        let module = match i % 4 {
            0 => SourceModule::LlmObservatory,
            1 => SourceModule::LlmSentinel,
            2 => SourceModule::LlmCostOps,
            3 => SourceModule::LlmGovernanceDashboard,
            _ => SourceModule::LlmAnalyticsHub,
        };
        create_event_with_module(module)
    }).collect();

    c.bench_function("filter_by_source_module", |b| {
        b.iter(|| {
            let observatory: Vec<_> = events.iter()
                .filter(|e| e.common.source_module == SourceModule::LlmObservatory)
                .collect();
            black_box(observatory)
        });
    });
}

// ============================================================================
// EVENT AGGREGATION BENCHMARKS
// ============================================================================

fn bench_aggregate_by_module(c: &mut Criterion) {
    let events: Vec<_> = (0..10_000).map(|i| {
        let module = match i % 4 {
            0 => SourceModule::LlmObservatory,
            1 => SourceModule::LlmSentinel,
            2 => SourceModule::LlmCostOps,
            3 => SourceModule::LlmGovernanceDashboard,
            _ => SourceModule::LlmAnalyticsHub,
        };
        create_event_with_module(module)
    }).collect();

    c.bench_function("aggregate_events_by_module", |b| {
        b.iter(|| {
            let mut by_module: HashMap<SourceModule, Vec<&AnalyticsEvent>> = HashMap::new();
            for event in &events {
                by_module.entry(event.common.source_module.clone())
                    .or_insert_with(Vec::new)
                    .push(event);
            }
            black_box(by_module)
        });
    });
}

// ============================================================================
// THROUGHPUT BENCHMARK (TARGET: 100k+ events/sec)
// ============================================================================

fn bench_throughput_target(c: &mut Criterion) {
    let mut group = c.benchmark_group("throughput_target");
    group.throughput(Throughput::Elements(100_000));

    group.bench_function("process_100k_events", |b| {
        b.iter(|| {
            let events: Vec<_> = (0..100_000)
                .map(|_| {
                    let event = create_test_event();
                    // Simulate minimal processing: serialize and deserialize
                    let json = serde_json::to_string(&event).unwrap();
                    serde_json::from_str::<AnalyticsEvent>(&json).unwrap()
                })
                .collect();
            black_box(events)
        });
    });

    group.finish();
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

fn create_test_event() -> AnalyticsEvent {
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
            environment: "production".to_string(),
            tags: HashMap::new(),
        },
        payload: EventPayload::Telemetry(TelemetryPayload::Latency(LatencyMetrics {
            model_id: "gpt-4".to_string(),
            request_id: Uuid::new_v4().to_string(),
            total_latency_ms: 1523.45,
            ttft_ms: Some(234.12),
            tokens_per_second: Some(45.6),
            breakdown: None,
        })),
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
            environment: "production".to_string(),
            tags: HashMap::new(),
        },
        payload: EventPayload::Custom(CustomPayload {
            custom_type: "test".to_string(),
            data: serde_json::json!({}),
        }),
    }
}

fn create_event_with_module(module: SourceModule) -> AnalyticsEvent {
    AnalyticsEvent {
        common: CommonEventFields {
            event_id: Uuid::new_v4(),
            timestamp: Utc::now(),
            source_module: module,
            event_type: EventType::Telemetry,
            correlation_id: None,
            parent_event_id: None,
            schema_version: "1.0.0".to_string(),
            severity: Severity::Info,
            environment: "production".to_string(),
            tags: HashMap::new(),
        },
        payload: EventPayload::Custom(CustomPayload {
            custom_type: "test".to_string(),
            data: serde_json::json!({}),
        }),
    }
}

criterion_group!(
    benches,
    bench_create_telemetry_event,
    bench_create_security_event,
    bench_serialize_event,
    bench_deserialize_event,
    bench_serialize_msgpack,
    bench_deserialize_msgpack,
    bench_batch_processing,
    bench_batch_serialization,
    bench_filter_by_severity,
    bench_filter_by_module,
    bench_aggregate_by_module,
    bench_throughput_target,
);

criterion_main!(benches);
