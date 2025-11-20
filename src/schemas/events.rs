//! Analytics Event Schema
//!
//! Unified event schema that accommodates telemetry, security, cost, and governance events
//! from all modules in the LLM ecosystem.

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use uuid::Uuid;

/// Schema version for event compatibility and migration
pub const SCHEMA_VERSION: &str = "1.0.0";

/// Common fields present in all analytics events
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct CommonEventFields {
    /// Unique identifier for this event
    #[serde(default = "Uuid::new_v4")]
    pub event_id: Uuid,

    /// ISO 8601 timestamp when the event occurred
    pub timestamp: DateTime<Utc>,

    /// Source module that generated this event
    pub source_module: SourceModule,

    /// Type of event being reported
    pub event_type: EventType,

    /// Correlation ID for tracing related events across modules
    #[serde(skip_serializing_if = "Option::is_none")]
    pub correlation_id: Option<Uuid>,

    /// Parent event ID for hierarchical event relationships
    #[serde(skip_serializing_if = "Option::is_none")]
    pub parent_event_id: Option<Uuid>,

    /// Schema version for backward compatibility
    #[serde(default = "default_schema_version")]
    pub schema_version: String,

    /// Severity level of the event
    pub severity: Severity,

    /// Environment where the event occurred
    pub environment: String,

    /// Additional custom tags for filtering and grouping
    #[serde(default)]
    pub tags: HashMap<String, String>,
}

fn default_schema_version() -> String {
    SCHEMA_VERSION.to_string()
}

/// Source modules in the LLM ecosystem
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Hash)]
#[serde(rename_all = "kebab-case")]
pub enum SourceModule {
    /// LLM-Observatory: Performance and telemetry monitoring
    LlmObservatory,

    /// LLM-Sentinel: Security monitoring and threat detection
    LlmSentinel,

    /// LLM-CostOps: Cost tracking and optimization
    LlmCostOps,

    /// LLM-Governance-Dashboard: Policy and compliance monitoring
    LlmGovernanceDashboard,

    /// LLM-Registry: Asset and model registry
    LlmRegistry,

    /// LLM-Policy-Engine: Policy evaluation and enforcement
    LlmPolicyEngine,

    /// LLM-Analytics-Hub: Self-monitoring events
    LlmAnalyticsHub,
}

/// High-level event type classification
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum EventType {
    /// Telemetry and performance events
    Telemetry,

    /// Security-related events
    Security,

    /// Cost and resource consumption events
    Cost,

    /// Governance and compliance events
    Governance,

    /// System lifecycle events
    Lifecycle,

    /// Audit trail events
    Audit,

    /// Alert and notification events
    Alert,
}

/// Event severity levels
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, PartialOrd, Ord)]
#[serde(rename_all = "lowercase")]
pub enum Severity {
    Debug,
    Info,
    Warning,
    Error,
    Critical,
}

/// Unified analytics event containing common fields and module-specific payload
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AnalyticsEvent {
    /// Common fields shared by all events
    #[serde(flatten)]
    pub common: CommonEventFields,

    /// Module-specific event payload
    pub payload: EventPayload,
}

/// Module-specific event payloads
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "payload_type", content = "data")]
pub enum EventPayload {
    /// Telemetry events from LLM-Observatory
    #[serde(rename = "telemetry")]
    Telemetry(TelemetryPayload),

    /// Security events from LLM-Sentinel
    #[serde(rename = "security")]
    Security(SecurityPayload),

    /// Cost events from LLM-CostOps
    #[serde(rename = "cost")]
    Cost(CostPayload),

    /// Governance events from LLM-Governance-Dashboard
    #[serde(rename = "governance")]
    Governance(GovernancePayload),

    /// Generic custom payload
    #[serde(rename = "custom")]
    Custom(CustomPayload),
}

// ============================================================================
// TELEMETRY PAYLOADS (LLM-Observatory)
// ============================================================================

/// Telemetry event payload from LLM-Observatory
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "telemetry_type")]
pub enum TelemetryPayload {
    /// Request latency measurement
    #[serde(rename = "latency")]
    Latency(LatencyMetrics),

    /// Throughput measurement
    #[serde(rename = "throughput")]
    Throughput(ThroughputMetrics),

    /// Error rate tracking
    #[serde(rename = "error_rate")]
    ErrorRate(ErrorRateMetrics),

    /// Token usage statistics
    #[serde(rename = "token_usage")]
    TokenUsage(TokenUsageMetrics),

    /// Model performance metrics
    #[serde(rename = "model_performance")]
    ModelPerformance(ModelPerformanceMetrics),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LatencyMetrics {
    /// Model or service identifier
    pub model_id: String,

    /// Request identifier
    pub request_id: String,

    /// Total latency in milliseconds
    pub total_latency_ms: f64,

    /// Time to first token (TTFT) in milliseconds
    #[serde(skip_serializing_if = "Option::is_none")]
    pub ttft_ms: Option<f64>,

    /// Tokens per second
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tokens_per_second: Option<f64>,

    /// Latency breakdown by component
    #[serde(skip_serializing_if = "Option::is_none")]
    pub breakdown: Option<LatencyBreakdown>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LatencyBreakdown {
    pub queue_time_ms: f64,
    pub processing_time_ms: f64,
    pub network_time_ms: f64,
    pub other_ms: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ThroughputMetrics {
    pub model_id: String,
    pub requests_per_second: f64,
    pub tokens_per_second: f64,
    pub concurrent_requests: u32,
    pub window_duration_seconds: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ErrorRateMetrics {
    pub model_id: String,
    pub total_requests: u64,
    pub failed_requests: u64,
    pub error_rate_percent: f64,
    pub error_breakdown: HashMap<String, u64>,
    pub window_duration_seconds: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TokenUsageMetrics {
    pub model_id: String,
    pub request_id: String,
    pub prompt_tokens: u32,
    pub completion_tokens: u32,
    pub total_tokens: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModelPerformanceMetrics {
    pub model_id: String,
    pub accuracy: Option<f64>,
    pub quality_score: Option<f64>,
    pub user_satisfaction: Option<f64>,
    pub custom_metrics: HashMap<String, f64>,
}

// ============================================================================
// SECURITY PAYLOADS (LLM-Sentinel)
// ============================================================================

/// Security event payload from LLM-Sentinel
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "security_type")]
pub enum SecurityPayload {
    /// Threat detection event
    #[serde(rename = "threat")]
    Threat(ThreatEvent),

    /// Vulnerability detection
    #[serde(rename = "vulnerability")]
    Vulnerability(VulnerabilityEvent),

    /// Compliance violation
    #[serde(rename = "compliance_violation")]
    ComplianceViolation(ComplianceViolationEvent),

    /// Authentication/Authorization event
    #[serde(rename = "auth")]
    Auth(AuthEvent),

    /// Data privacy event
    #[serde(rename = "privacy")]
    Privacy(PrivacyEvent),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ThreatEvent {
    pub threat_id: String,
    pub threat_type: ThreatType,
    pub threat_level: ThreatLevel,
    pub source_ip: Option<String>,
    pub target_resource: String,
    pub attack_vector: String,
    pub mitigation_status: MitigationStatus,
    pub indicators_of_compromise: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ThreatType {
    PromptInjection,
    DataExfiltration,
    ModelPoisoning,
    DenialOfService,
    UnauthorizedAccess,
    MaliciousInput,
    Other(String),
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, PartialOrd, Ord)]
#[serde(rename_all = "lowercase")]
pub enum ThreatLevel {
    Low,
    Medium,
    High,
    Critical,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum MitigationStatus {
    Detected,
    Blocked,
    Mitigated,
    Investigating,
    Resolved,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VulnerabilityEvent {
    pub vulnerability_id: String,
    pub cve_id: Option<String>,
    pub severity_score: f64,
    pub affected_component: String,
    pub description: String,
    pub remediation_status: RemediationStatus,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum RemediationStatus {
    Identified,
    PatchAvailable,
    Patching,
    Patched,
    Accepted,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ComplianceViolationEvent {
    pub violation_id: String,
    pub regulation: String,
    pub requirement: String,
    pub violation_description: String,
    pub affected_data_types: Vec<String>,
    pub remediation_required: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuthEvent {
    pub user_id: String,
    pub action: AuthAction,
    pub resource: String,
    pub success: bool,
    pub failure_reason: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum AuthAction {
    Login,
    Logout,
    AccessAttempt,
    PermissionDenied,
    TokenGenerated,
    TokenRevoked,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PrivacyEvent {
    pub data_type: String,
    pub operation: PrivacyOperation,
    pub user_consent: bool,
    pub data_subjects: Vec<String>,
    pub purpose: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum PrivacyOperation {
    DataAccess,
    DataCollection,
    DataSharing,
    DataDeletion,
    ConsentUpdate,
}

// ============================================================================
// COST PAYLOADS (LLM-CostOps)
// ============================================================================

/// Cost event payload from LLM-CostOps
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "cost_type")]
pub enum CostPayload {
    /// Token usage cost
    #[serde(rename = "token_cost")]
    TokenCost(TokenCostEvent),

    /// API cost tracking
    #[serde(rename = "api_cost")]
    ApiCost(ApiCostEvent),

    /// Resource consumption
    #[serde(rename = "resource_consumption")]
    ResourceConsumption(ResourceConsumptionEvent),

    /// Budget alert
    #[serde(rename = "budget_alert")]
    BudgetAlert(BudgetAlertEvent),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TokenCostEvent {
    pub model_id: String,
    pub request_id: String,
    pub prompt_tokens: u32,
    pub completion_tokens: u32,
    pub total_tokens: u32,
    pub cost_per_prompt_token: f64,
    pub cost_per_completion_token: f64,
    pub total_cost_usd: f64,
    pub currency: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ApiCostEvent {
    pub provider: String,
    pub api_endpoint: String,
    pub request_count: u64,
    pub cost_per_request: f64,
    pub total_cost_usd: f64,
    pub billing_period: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ResourceConsumptionEvent {
    pub resource_type: ResourceType,
    pub resource_id: String,
    pub quantity: f64,
    pub unit: String,
    pub cost_usd: f64,
    pub utilization_percent: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ResourceType {
    Compute,
    Storage,
    Network,
    Memory,
    Gpu,
    Other(String),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BudgetAlertEvent {
    pub budget_id: String,
    pub budget_name: String,
    pub budget_limit_usd: f64,
    pub current_spend_usd: f64,
    pub threshold_percent: f64,
    pub alert_type: BudgetAlertType,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum BudgetAlertType {
    Warning,
    Critical,
    Exceeded,
}

// ============================================================================
// GOVERNANCE PAYLOADS (LLM-Governance-Dashboard)
// ============================================================================

/// Governance event payload from LLM-Governance-Dashboard
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "governance_type")]
pub enum GovernancePayload {
    /// Policy violation event
    #[serde(rename = "policy_violation")]
    PolicyViolation(PolicyViolationEvent),

    /// Audit trail event
    #[serde(rename = "audit_trail")]
    AuditTrail(AuditTrailEvent),

    /// Compliance check result
    #[serde(rename = "compliance_check")]
    ComplianceCheck(ComplianceCheckEvent),

    /// Data lineage tracking
    #[serde(rename = "data_lineage")]
    DataLineage(DataLineageEvent),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PolicyViolationEvent {
    pub policy_id: String,
    pub policy_name: String,
    pub violation_description: String,
    pub violated_rules: Vec<String>,
    pub resource_id: String,
    pub user_id: Option<String>,
    pub severity: PolicyViolationSeverity,
    pub auto_remediated: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, PartialOrd, Ord)]
#[serde(rename_all = "lowercase")]
pub enum PolicyViolationSeverity {
    Low,
    Medium,
    High,
    Critical,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuditTrailEvent {
    pub action: String,
    pub actor: String,
    pub resource_type: String,
    pub resource_id: String,
    pub changes: HashMap<String, serde_json::Value>,
    pub ip_address: Option<String>,
    pub user_agent: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ComplianceCheckEvent {
    pub check_id: String,
    pub framework: String,
    pub controls_checked: Vec<String>,
    pub passed: bool,
    pub findings: Vec<ComplianceFinding>,
    pub score: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ComplianceFinding {
    pub control_id: String,
    pub status: ComplianceStatus,
    pub description: String,
    pub evidence: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ComplianceStatus {
    Pass,
    Fail,
    NotApplicable,
    Manual,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DataLineageEvent {
    pub data_asset_id: String,
    pub operation: DataOperation,
    pub source: Option<String>,
    pub destination: Option<String>,
    pub transformation: Option<String>,
    pub lineage_path: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum DataOperation {
    Create,
    Read,
    Update,
    Delete,
    Transform,
    Aggregate,
}

// ============================================================================
// CUSTOM PAYLOAD
// ============================================================================

/// Custom payload for extensibility
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CustomPayload {
    pub custom_type: String,
    pub data: serde_json::Value,
}

#[cfg(test)]
mod tests {
    use super::*;
    use pretty_assertions::assert_eq;

    // ============================================================================
    // COMMON EVENT FIELDS TESTS
    // ============================================================================

    #[test]
    fn test_common_event_fields_default_values() {
        let common = CommonEventFields {
            event_id: Uuid::new_v4(),
            timestamp: Utc::now(),
            source_module: SourceModule::LlmAnalyticsHub,
            event_type: EventType::Telemetry,
            correlation_id: None,
            parent_event_id: None,
            schema_version: SCHEMA_VERSION.to_string(),
            severity: Severity::Info,
            environment: "test".to_string(),
            tags: HashMap::new(),
        };

        assert_eq!(common.schema_version, "1.0.0");
        assert!(common.correlation_id.is_none());
        assert!(common.parent_event_id.is_none());
        assert!(common.tags.is_empty());
    }

    #[test]
    fn test_severity_ordering() {
        assert!(Severity::Critical > Severity::Error);
        assert!(Severity::Error > Severity::Warning);
        assert!(Severity::Warning > Severity::Info);
        assert!(Severity::Info > Severity::Debug);
    }

    #[test]
    fn test_source_module_serialization() {
        let modules = vec![
            SourceModule::LlmObservatory,
            SourceModule::LlmSentinel,
            SourceModule::LlmCostOps,
            SourceModule::LlmGovernanceDashboard,
        ];

        for module in modules {
            let json = serde_json::to_string(&module).unwrap();
            let deserialized: SourceModule = serde_json::from_str(&json).unwrap();
            assert_eq!(module, deserialized);
        }
    }

    // ============================================================================
    // TELEMETRY PAYLOAD TESTS
    // ============================================================================

    #[test]
    fn test_latency_metrics_complete() {
        let latency = LatencyMetrics {
            model_id: "gpt-4".to_string(),
            request_id: "req-123".to_string(),
            total_latency_ms: 1523.45,
            ttft_ms: Some(234.12),
            tokens_per_second: Some(45.6),
            breakdown: Some(LatencyBreakdown {
                queue_time_ms: 100.0,
                processing_time_ms: 1200.0,
                network_time_ms: 200.0,
                other_ms: 23.45,
            }),
        };

        let json = serde_json::to_string(&latency).unwrap();
        let deserialized: LatencyMetrics = serde_json::from_str(&json).unwrap();

        assert_eq!(deserialized.model_id, "gpt-4");
        assert_eq!(deserialized.total_latency_ms, 1523.45);
        assert!(deserialized.breakdown.is_some());
    }

    #[test]
    fn test_throughput_metrics() {
        let throughput = ThroughputMetrics {
            model_id: "claude-3".to_string(),
            requests_per_second: 100.5,
            tokens_per_second: 5000.0,
            concurrent_requests: 25,
            window_duration_seconds: 60,
        };

        let json = serde_json::to_string(&throughput).unwrap();
        assert!(json.contains("claude-3"));
        assert!(json.contains("100.5"));
    }

    #[test]
    fn test_error_rate_metrics() {
        let mut error_breakdown = HashMap::new();
        error_breakdown.insert("timeout".to_string(), 5);
        error_breakdown.insert("rate_limit".to_string(), 3);

        let error_rate = ErrorRateMetrics {
            model_id: "gpt-4".to_string(),
            total_requests: 1000,
            failed_requests: 8,
            error_rate_percent: 0.8,
            error_breakdown,
            window_duration_seconds: 300,
        };

        assert_eq!(error_rate.error_rate_percent, 0.8);
        assert_eq!(error_rate.failed_requests, 8);
    }

    #[test]
    fn test_token_usage_metrics() {
        let token_usage = TokenUsageMetrics {
            model_id: "gpt-4".to_string(),
            request_id: "req-456".to_string(),
            prompt_tokens: 100,
            completion_tokens: 200,
            total_tokens: 300,
        };

        assert_eq!(token_usage.total_tokens, token_usage.prompt_tokens + token_usage.completion_tokens);
    }

    #[test]
    fn test_telemetry_event_serialization() {
        let event = AnalyticsEvent {
            common: CommonEventFields {
                event_id: Uuid::new_v4(),
                timestamp: Utc::now(),
                source_module: SourceModule::LlmObservatory,
                event_type: EventType::Telemetry,
                correlation_id: Some(Uuid::new_v4()),
                parent_event_id: None,
                schema_version: SCHEMA_VERSION.to_string(),
                severity: Severity::Info,
                environment: "production".to_string(),
                tags: HashMap::new(),
            },
            payload: EventPayload::Telemetry(TelemetryPayload::Latency(LatencyMetrics {
                model_id: "gpt-4".to_string(),
                request_id: "req-123".to_string(),
                total_latency_ms: 1523.45,
                ttft_ms: Some(234.12),
                tokens_per_second: Some(45.6),
                breakdown: None,
            })),
        };

        let json = serde_json::to_string_pretty(&event).unwrap();
        assert!(json.contains("telemetry"));
        assert!(json.contains("gpt-4"));

        // Test deserialization round-trip
        let deserialized: AnalyticsEvent = serde_json::from_str(&json).unwrap();
        match deserialized.payload {
            EventPayload::Telemetry(TelemetryPayload::Latency(metrics)) => {
                assert_eq!(metrics.model_id, "gpt-4");
            },
            _ => panic!("Wrong payload type"),
        }
    }

    // ============================================================================
    // SECURITY PAYLOAD TESTS
    // ============================================================================

    #[test]
    fn test_threat_event_all_types() {
        let threat_types = vec![
            ThreatType::PromptInjection,
            ThreatType::DataExfiltration,
            ThreatType::ModelPoisoning,
            ThreatType::DenialOfService,
            ThreatType::UnauthorizedAccess,
            ThreatType::MaliciousInput,
        ];

        for threat_type in threat_types {
            let threat = ThreatEvent {
                threat_id: format!("threat-{:?}", threat_type),
                threat_type: threat_type.clone(),
                threat_level: ThreatLevel::High,
                source_ip: Some("192.168.1.1".to_string()),
                target_resource: "test-resource".to_string(),
                attack_vector: "test-vector".to_string(),
                mitigation_status: MitigationStatus::Detected,
                indicators_of_compromise: vec![],
            };

            let json = serde_json::to_string(&threat).unwrap();
            let deserialized: ThreatEvent = serde_json::from_str(&json).unwrap();
            assert_eq!(deserialized.threat_type, threat_type);
        }
    }

    #[test]
    fn test_threat_level_ordering() {
        assert!(ThreatLevel::Critical > ThreatLevel::High);
        assert!(ThreatLevel::High > ThreatLevel::Medium);
        assert!(ThreatLevel::Medium > ThreatLevel::Low);
    }

    #[test]
    fn test_vulnerability_event() {
        let vuln = VulnerabilityEvent {
            vulnerability_id: "vuln-123".to_string(),
            cve_id: Some("CVE-2024-1234".to_string()),
            severity_score: 7.5,
            affected_component: "llm-model".to_string(),
            description: "SQL injection vulnerability".to_string(),
            remediation_status: RemediationStatus::PatchAvailable,
        };

        let json = serde_json::to_string(&vuln).unwrap();
        assert!(json.contains("CVE-2024-1234"));
        assert!(json.contains("7.5"));
    }

    #[test]
    fn test_auth_event() {
        let auth = AuthEvent {
            user_id: "user-123".to_string(),
            action: AuthAction::Login,
            resource: "/api/models".to_string(),
            success: true,
            failure_reason: None,
        };

        assert!(auth.success);
        assert!(auth.failure_reason.is_none());
    }

    #[test]
    fn test_privacy_event() {
        let privacy = PrivacyEvent {
            data_type: "pii".to_string(),
            operation: PrivacyOperation::DataAccess,
            user_consent: true,
            data_subjects: vec!["user-1".to_string(), "user-2".to_string()],
            purpose: "analytics".to_string(),
        };

        assert_eq!(privacy.data_subjects.len(), 2);
        assert!(privacy.user_consent);
    }

    #[test]
    fn test_security_event_serialization() {
        let event = AnalyticsEvent {
            common: CommonEventFields {
                event_id: Uuid::new_v4(),
                timestamp: Utc::now(),
                source_module: SourceModule::LlmSentinel,
                event_type: EventType::Security,
                correlation_id: None,
                parent_event_id: None,
                schema_version: SCHEMA_VERSION.to_string(),
                severity: Severity::Critical,
                environment: "production".to_string(),
                tags: HashMap::new(),
            },
            payload: EventPayload::Security(SecurityPayload::Threat(ThreatEvent {
                threat_id: "threat-456".to_string(),
                threat_type: ThreatType::PromptInjection,
                threat_level: ThreatLevel::High,
                source_ip: Some("192.168.1.1".to_string()),
                target_resource: "model-endpoint-1".to_string(),
                attack_vector: "malicious prompt".to_string(),
                mitigation_status: MitigationStatus::Blocked,
                indicators_of_compromise: vec!["ioc1".to_string(), "ioc2".to_string()],
            })),
        };

        let json = serde_json::to_string_pretty(&event).unwrap();
        assert!(json.contains("security"));
        assert!(json.contains("prompt_injection"));
    }

    // ============================================================================
    // COST PAYLOAD TESTS
    // ============================================================================

    #[test]
    fn test_token_cost_event() {
        let cost = TokenCostEvent {
            model_id: "gpt-4".to_string(),
            request_id: "req-123".to_string(),
            prompt_tokens: 100,
            completion_tokens: 200,
            total_tokens: 300,
            cost_per_prompt_token: 0.00003,
            cost_per_completion_token: 0.00006,
            total_cost_usd: 0.015,
            currency: "USD".to_string(),
        };

        let calculated_cost = (100.0 * 0.00003) + (200.0 * 0.00006);
        assert!((cost.total_cost_usd - calculated_cost).abs() < 0.001);
    }

    #[test]
    fn test_budget_alert_event() {
        let alert = BudgetAlertEvent {
            budget_id: "budget-123".to_string(),
            budget_name: "Q1 LLM Budget".to_string(),
            budget_limit_usd: 10000.0,
            current_spend_usd: 9500.0,
            threshold_percent: 95.0,
            alert_type: BudgetAlertType::Critical,
        };

        assert_eq!(alert.alert_type, BudgetAlertType::Critical);
        assert!(alert.current_spend_usd > alert.budget_limit_usd * 0.9);
    }

    #[test]
    fn test_resource_consumption_event() {
        let resource = ResourceConsumptionEvent {
            resource_type: ResourceType::Gpu,
            resource_id: "gpu-1".to_string(),
            quantity: 8.0,
            unit: "hours".to_string(),
            cost_usd: 24.0,
            utilization_percent: 85.0,
        };

        assert_eq!(resource.resource_type, ResourceType::Gpu);
        assert_eq!(resource.cost_usd, 24.0);
    }

    // ============================================================================
    // GOVERNANCE PAYLOAD TESTS
    // ============================================================================

    #[test]
    fn test_policy_violation_event() {
        let violation = PolicyViolationEvent {
            policy_id: "pol-123".to_string(),
            policy_name: "Data Retention Policy".to_string(),
            violation_description: "Data retained beyond allowed period".to_string(),
            violated_rules: vec!["rule-1".to_string(), "rule-2".to_string()],
            resource_id: "dataset-456".to_string(),
            user_id: Some("user-789".to_string()),
            severity: PolicyViolationSeverity::High,
            auto_remediated: false,
        };

        assert_eq!(violation.violated_rules.len(), 2);
        assert!(!violation.auto_remediated);
    }

    #[test]
    fn test_audit_trail_event() {
        let mut changes = HashMap::new();
        changes.insert("field1".to_string(), serde_json::json!("old_value"));

        let audit = AuditTrailEvent {
            action: "update".to_string(),
            actor: "user-123".to_string(),
            resource_type: "model".to_string(),
            resource_id: "model-456".to_string(),
            changes,
            ip_address: Some("10.0.0.1".to_string()),
            user_agent: Some("Mozilla/5.0".to_string()),
        };

        assert_eq!(audit.action, "update");
        assert!(audit.changes.len() > 0);
    }

    #[test]
    fn test_compliance_check_event() {
        let findings = vec![
            ComplianceFinding {
                control_id: "SOC2-CC6.1".to_string(),
                status: ComplianceStatus::Pass,
                description: "Logical access controls implemented".to_string(),
                evidence: Some("IAM policies configured".to_string()),
            },
            ComplianceFinding {
                control_id: "SOC2-CC6.2".to_string(),
                status: ComplianceStatus::Fail,
                description: "MFA not enabled for all users".to_string(),
                evidence: None,
            },
        ];

        let check = ComplianceCheckEvent {
            check_id: "check-123".to_string(),
            framework: "SOC2".to_string(),
            controls_checked: vec!["CC6.1".to_string(), "CC6.2".to_string()],
            passed: false,
            findings,
            score: 0.5,
        };

        assert!(!check.passed);
        assert_eq!(check.findings.len(), 2);
    }

    #[test]
    fn test_data_lineage_event() {
        let lineage = DataLineageEvent {
            data_asset_id: "asset-123".to_string(),
            operation: DataOperation::Transform,
            source: Some("raw_data".to_string()),
            destination: Some("processed_data".to_string()),
            transformation: Some("anonymization".to_string()),
            lineage_path: vec!["raw".to_string(), "cleaned".to_string(), "anonymized".to_string()],
        };

        assert_eq!(lineage.operation, DataOperation::Transform);
        assert_eq!(lineage.lineage_path.len(), 3);
    }

    // ============================================================================
    // CUSTOM PAYLOAD TESTS
    // ============================================================================

    #[test]
    fn test_custom_payload() {
        let custom_data = serde_json::json!({
            "custom_field": "custom_value",
            "nested": {
                "field": 123
            }
        });

        let custom = CustomPayload {
            custom_type: "test_custom".to_string(),
            data: custom_data,
        };

        let json = serde_json::to_string(&custom).unwrap();
        assert!(json.contains("test_custom"));
        assert!(json.contains("custom_field"));
    }

    // ============================================================================
    // EVENT HIERARCHY TESTS
    // ============================================================================

    #[test]
    fn test_event_with_correlation() {
        let correlation_id = Uuid::new_v4();
        let parent_id = Uuid::new_v4();

        let event = AnalyticsEvent {
            common: CommonEventFields {
                event_id: Uuid::new_v4(),
                timestamp: Utc::now(),
                source_module: SourceModule::LlmAnalyticsHub,
                event_type: EventType::Audit,
                correlation_id: Some(correlation_id),
                parent_event_id: Some(parent_id),
                schema_version: SCHEMA_VERSION.to_string(),
                severity: Severity::Info,
                environment: "test".to_string(),
                tags: HashMap::new(),
            },
            payload: EventPayload::Custom(CustomPayload {
                custom_type: "test".to_string(),
                data: serde_json::json!({}),
            }),
        };

        assert_eq!(event.common.correlation_id, Some(correlation_id));
        assert_eq!(event.common.parent_event_id, Some(parent_id));
    }

    #[test]
    fn test_event_with_tags() {
        let mut tags = HashMap::new();
        tags.insert("environment".to_string(), "production".to_string());
        tags.insert("region".to_string(), "us-east-1".to_string());
        tags.insert("version".to_string(), "1.0.0".to_string());

        let event = AnalyticsEvent {
            common: CommonEventFields {
                event_id: Uuid::new_v4(),
                timestamp: Utc::now(),
                source_module: SourceModule::LlmAnalyticsHub,
                event_type: EventType::Telemetry,
                correlation_id: None,
                parent_event_id: None,
                schema_version: SCHEMA_VERSION.to_string(),
                severity: Severity::Info,
                environment: "production".to_string(),
                tags: tags.clone(),
            },
            payload: EventPayload::Custom(CustomPayload {
                custom_type: "test".to_string(),
                data: serde_json::json!({}),
            }),
        };

        assert_eq!(event.common.tags.len(), 3);
        assert_eq!(event.common.tags.get("region"), Some(&"us-east-1".to_string()));
    }

    // ============================================================================
    // ROUND-TRIP SERIALIZATION TESTS
    // ============================================================================

    #[test]
    fn test_all_event_types_round_trip() {
        let event_types = vec![
            EventType::Telemetry,
            EventType::Security,
            EventType::Cost,
            EventType::Governance,
            EventType::Lifecycle,
            EventType::Audit,
            EventType::Alert,
        ];

        for event_type in event_types {
            let json = serde_json::to_string(&event_type).unwrap();
            let deserialized: EventType = serde_json::from_str(&json).unwrap();
            assert_eq!(event_type, deserialized);
        }
    }

    #[test]
    fn test_schema_version_compatibility() {
        assert_eq!(SCHEMA_VERSION, "1.0.0");

        let common = CommonEventFields {
            event_id: Uuid::new_v4(),
            timestamp: Utc::now(),
            source_module: SourceModule::LlmAnalyticsHub,
            event_type: EventType::Telemetry,
            correlation_id: None,
            parent_event_id: None,
            schema_version: "1.0.0".to_string(),
            severity: Severity::Info,
            environment: "test".to_string(),
            tags: HashMap::new(),
        };

        assert_eq!(common.schema_version, SCHEMA_VERSION);
    }
}
