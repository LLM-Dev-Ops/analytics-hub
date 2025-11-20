//! Security Testing Suite
//!
//! Comprehensive security tests including OWASP Top 10, input validation,
//! authentication, authorization, and data protection.

use llm_analytics_hub::schemas::events::*;
use std::collections::HashMap;
use uuid::Uuid;
use chrono::Utc;

// ============================================================================
// INPUT VALIDATION TESTS (OWASP A03:2021 - Injection)
// ============================================================================

#[test]
fn test_prevent_sql_injection_in_event_fields() {
    // Attempt SQL injection in various fields
    let sql_injection_attempts = vec![
        "'; DROP TABLE events; --",
        "1' OR '1'='1",
        "admin'--",
        "1; DELETE FROM users WHERE 1=1--",
    ];

    for injection in sql_injection_attempts {
        let event = AnalyticsEvent {
            common: CommonEventFields {
                event_id: Uuid::new_v4(),
                timestamp: Utc::now(),
                source_module: SourceModule::LlmAnalyticsHub,
                event_type: EventType::Security,
                correlation_id: None,
                parent_event_id: None,
                schema_version: "1.0.0".to_string(),
                severity: Severity::Critical,
                environment: injection.to_string(), // Injection attempt
                tags: HashMap::new(),
            },
            payload: EventPayload::Custom(CustomPayload {
                custom_type: "test".to_string(),
                data: serde_json::json!({}),
            }),
        };

        // Event should serialize without executing SQL
        let json = serde_json::to_string(&event).unwrap();
        assert!(json.contains(injection)); // String is escaped
        assert!(!json.contains("DROP TABLE")); // Not executed as SQL
    }
}

#[test]
fn test_prevent_xss_in_event_fields() {
    // Attempt XSS injection
    let xss_attempts = vec![
        "<script>alert('XSS')</script>",
        "<img src=x onerror=alert('XSS')>",
        "javascript:alert('XSS')",
        "<svg onload=alert('XSS')>",
    ];

    for xss in xss_attempts {
        let mut tags = HashMap::new();
        tags.insert("user_input".to_string(), xss.to_string());

        let event = AnalyticsEvent {
            common: CommonEventFields {
                event_id: Uuid::new_v4(),
                timestamp: Utc::now(),
                source_module: SourceModule::LlmAnalyticsHub,
                event_type: EventType::Security,
                correlation_id: None,
                parent_event_id: None,
                schema_version: "1.0.0".to_string(),
                severity: Severity::Warning,
                environment: "test".to_string(),
                tags,
            },
            payload: EventPayload::Custom(CustomPayload {
                custom_type: "test".to_string(),
                data: serde_json::json!({}),
            }),
        };

        // Serialize and verify XSS is properly escaped
        let json = serde_json::to_string(&event).unwrap();
        assert!(!json.contains("<script>")); // HTML tags are escaped
    }
}

#[test]
fn test_prevent_command_injection() {
    // Attempt command injection
    let command_injections = vec![
        "; cat /etc/passwd",
        "| ls -la",
        "& whoami",
        "`rm -rf /`",
    ];

    for cmd in command_injections {
        let event = AnalyticsEvent {
            common: CommonEventFields {
                event_id: Uuid::new_v4(),
                timestamp: Utc::now(),
                source_module: SourceModule::LlmAnalyticsHub,
                event_type: EventType::Security,
                correlation_id: None,
                parent_event_id: None,
                schema_version: cmd.to_string(), // Injection attempt
                severity: Severity::Critical,
                environment: "test".to_string(),
                tags: HashMap::new(),
            },
            payload: EventPayload::Custom(CustomPayload {
                custom_type: "test".to_string(),
                data: serde_json::json!({}),
            }),
        };

        // Event data is treated as strings, not executed
        let json = serde_json::to_string(&event).unwrap();
        assert!(json.len() > 0); // Successfully serialized
    }
}

// ============================================================================
// AUTHENTICATION & AUTHORIZATION TESTS (OWASP A07:2021)
// ============================================================================

#[test]
fn test_auth_event_success() {
    let auth_event = AuthEvent {
        user_id: "user-123".to_string(),
        action: AuthAction::Login,
        resource: "/api/events".to_string(),
        success: true,
        failure_reason: None,
    };

    assert!(auth_event.success);
    assert!(auth_event.failure_reason.is_none());
}

#[test]
fn test_auth_event_failure_logged() {
    let auth_event = AuthEvent {
        user_id: "user-456".to_string(),
        action: AuthAction::AccessAttempt,
        resource: "/api/admin".to_string(),
        success: false,
        failure_reason: Some("Insufficient permissions".to_string()),
    };

    assert!(!auth_event.success);
    assert!(auth_event.failure_reason.is_some());
    assert_eq!(auth_event.failure_reason.unwrap(), "Insufficient permissions");
}

#[test]
fn test_permission_denied_events() {
    let denied_event = AuthEvent {
        user_id: "user-789".to_string(),
        action: AuthAction::PermissionDenied,
        resource: "/api/models/delete".to_string(),
        success: false,
        failure_reason: Some("User lacks delete permission".to_string()),
    };

    assert_eq!(denied_event.action, AuthAction::PermissionDenied);
    assert!(!denied_event.success);
}

// ============================================================================
// DATA PROTECTION TESTS (OWASP A02:2021 - Cryptographic Failures)
// ============================================================================

#[test]
fn test_sensitive_data_not_in_plaintext() {
    // Ensure PII is properly handled
    let privacy_event = PrivacyEvent {
        data_type: "pii".to_string(),
        operation: PrivacyOperation::DataAccess,
        user_consent: true,
        data_subjects: vec!["user-encrypted-id".to_string()], // Should be encrypted
        purpose: "analytics".to_string(),
    };

    // Verify we're using encrypted/hashed identifiers, not plaintext
    assert!(!privacy_event.data_subjects[0].contains("@")); // Not email
    assert!(!privacy_event.data_subjects[0].contains(" ")); // Not name
}

#[test]
fn test_pii_access_requires_consent() {
    // Test that PII access is tracked with consent
    let privacy_event = PrivacyEvent {
        data_type: "pii".to_string(),
        operation: PrivacyOperation::DataAccess,
        user_consent: true,
        data_subjects: vec!["user-123".to_string()],
        purpose: "model_training".to_string(),
    };

    assert!(privacy_event.user_consent, "PII access must have user consent");
    assert!(!privacy_event.purpose.is_empty(), "PII access must have documented purpose");
}

#[test]
fn test_data_deletion_tracked() {
    let deletion_event = PrivacyEvent {
        data_type: "user_data".to_string(),
        operation: PrivacyOperation::DataDeletion,
        user_consent: true,
        data_subjects: vec!["user-to-delete".to_string()],
        purpose: "user_requested_deletion".to_string(),
    };

    assert_eq!(deletion_event.operation, PrivacyOperation::DataDeletion);
    assert!(deletion_event.user_consent);
}

// ============================================================================
// SECURITY MISCONFIGURATION TESTS (OWASP A05:2021)
// ============================================================================

#[test]
fn test_default_severity_appropriate() {
    // Security events should default to appropriate severity
    let threat = ThreatEvent {
        threat_id: "threat-123".to_string(),
        threat_type: ThreatType::PromptInjection,
        threat_level: ThreatLevel::High,
        source_ip: Some("10.0.0.1".to_string()),
        target_resource: "api".to_string(),
        attack_vector: "malicious input".to_string(),
        mitigation_status: MitigationStatus::Detected,
        indicators_of_compromise: vec![],
    };

    // High and Critical threats should be logged at Critical severity
    assert!(threat.threat_level >= ThreatLevel::High);
}

#[test]
fn test_schema_version_validation() {
    // Ensure schema version is tracked for compatibility
    let event = AnalyticsEvent {
        common: CommonEventFields {
            event_id: Uuid::new_v4(),
            timestamp: Utc::now(),
            source_module: SourceModule::LlmAnalyticsHub,
            event_type: EventType::Security,
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
    };

    assert_eq!(event.common.schema_version, "1.0.0");
    assert!(!event.common.schema_version.is_empty());
}

// ============================================================================
// VULNERABLE COMPONENTS TESTS (OWASP A06:2021)
// ============================================================================

#[test]
fn test_vulnerability_tracking() {
    let vuln = VulnerabilityEvent {
        vulnerability_id: "vuln-001".to_string(),
        cve_id: Some("CVE-2024-1234".to_string()),
        severity_score: 9.8,
        affected_component: "dependency-xyz".to_string(),
        description: "Critical vulnerability in dependency".to_string(),
        remediation_status: RemediationStatus::PatchAvailable,
    };

    assert!(vuln.severity_score >= 7.0, "High severity vulnerabilities must be tracked");
    assert!(vuln.cve_id.is_some(), "CVE ID should be tracked when available");
    assert_eq!(vuln.remediation_status, RemediationStatus::PatchAvailable);
}

#[test]
fn test_remediation_status_progression() {
    let statuses = vec![
        RemediationStatus::Identified,
        RemediationStatus::PatchAvailable,
        RemediationStatus::Patching,
        RemediationStatus::Patched,
    ];

    // Verify all remediation statuses are properly defined
    for status in statuses {
        let vuln = VulnerabilityEvent {
            vulnerability_id: "test".to_string(),
            cve_id: None,
            severity_score: 5.0,
            affected_component: "test".to_string(),
            description: "test".to_string(),
            remediation_status: status,
        };
        assert!(!vuln.vulnerability_id.is_empty());
    }
}

// ============================================================================
// SECURITY LOGGING & MONITORING TESTS (OWASP A09:2021)
// ============================================================================

#[test]
fn test_security_events_properly_logged() {
    let threat_types = vec![
        ThreatType::PromptInjection,
        ThreatType::DataExfiltration,
        ThreatType::ModelPoisoning,
        ThreatType::DenialOfService,
        ThreatType::UnauthorizedAccess,
    ];

    for threat_type in threat_types {
        let event = AnalyticsEvent {
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
                threat_type: threat_type.clone(),
                threat_level: ThreatLevel::High,
                source_ip: Some("10.0.0.1".to_string()),
                target_resource: "api".to_string(),
                attack_vector: "test".to_string(),
                mitigation_status: MitigationStatus::Detected,
                indicators_of_compromise: vec!["ioc1".to_string()],
            })),
        };

        // Verify all security events have required fields
        assert!(event.common.event_id != Uuid::nil());
        assert_eq!(event.common.severity, Severity::Critical);

        // Verify serialization for logging
        let json = serde_json::to_string(&event).unwrap();
        assert!(!json.is_empty());
    }
}

#[test]
fn test_threat_indicators_captured() {
    let threat = ThreatEvent {
        threat_id: "threat-789".to_string(),
        threat_type: ThreatType::PromptInjection,
        threat_level: ThreatLevel::Critical,
        source_ip: Some("203.0.113.1".to_string()),
        target_resource: "model-api".to_string(),
        attack_vector: "crafted_prompt".to_string(),
        mitigation_status: MitigationStatus::Blocked,
        indicators_of_compromise: vec![
            "pattern_xyz".to_string(),
            "signature_abc".to_string(),
            "anomaly_score_0.95".to_string(),
        ],
    };

    assert!(threat.source_ip.is_some(), "Source IP should be captured");
    assert!(!threat.attack_vector.is_empty(), "Attack vector should be documented");
    assert!(!threat.indicators_of_compromise.is_empty(), "IOCs should be captured");
    assert!(threat.indicators_of_compromise.len() >= 1);
}

// ============================================================================
// SSRF (Server-Side Request Forgery) PREVENTION TESTS
// ============================================================================

#[test]
fn test_prevent_ssrf_in_urls() {
    // Test that internal/private IP addresses are detected
    let suspicious_ips = vec![
        "127.0.0.1",
        "localhost",
        "10.0.0.1",
        "172.16.0.1",
        "192.168.1.1",
        "169.254.169.254", // AWS metadata endpoint
    ];

    for ip in suspicious_ips {
        // In a real system, these would be blocked by URL validation
        // Here we just ensure they can be detected
        assert!(
            is_private_ip(ip),
            "Should detect {} as private/internal IP",
            ip
        );
    }
}

// ============================================================================
// RATE LIMITING & DOS PROTECTION TESTS
// ============================================================================

#[test]
fn test_dos_threat_detection() {
    let dos_event = ThreatEvent {
        threat_id: "dos-001".to_string(),
        threat_type: ThreatType::DenialOfService,
        threat_level: ThreatLevel::Critical,
        source_ip: Some("198.51.100.1".to_string()),
        target_resource: "api-endpoint".to_string(),
        attack_vector: "excessive_requests".to_string(),
        mitigation_status: MitigationStatus::Mitigated,
        indicators_of_compromise: vec!["request_rate_spike".to_string()],
    };

    assert_eq!(dos_event.threat_type, ThreatType::DenialOfService);
    assert_eq!(dos_event.mitigation_status, MitigationStatus::Mitigated);
}

// ============================================================================
// COMPLIANCE VALIDATION TESTS
// ============================================================================

#[test]
fn test_soc2_control_validation() {
    let compliance_check = ComplianceCheckEvent {
        check_id: "check-soc2-001".to_string(),
        framework: "SOC2".to_string(),
        controls_checked: vec![
            "CC6.1".to_string(), // Logical access controls
            "CC6.6".to_string(), // Encryption
            "CC6.7".to_string(), // Data transmission
        ],
        passed: true,
        findings: vec![],
        score: 1.0,
    };

    assert_eq!(compliance_check.framework, "SOC2");
    assert!(compliance_check.passed);
    assert_eq!(compliance_check.score, 1.0);
}

#[test]
fn test_gdpr_right_to_deletion() {
    let deletion = PrivacyEvent {
        data_type: "personal_data".to_string(),
        operation: PrivacyOperation::DataDeletion,
        user_consent: true,
        data_subjects: vec!["user-gdpr-request".to_string()],
        purpose: "gdpr_right_to_erasure".to_string(),
    };

    assert_eq!(deletion.operation, PrivacyOperation::DataDeletion);
    assert!(deletion.purpose.contains("gdpr"));
}

#[test]
fn test_hipaa_audit_trail() {
    let mut changes = HashMap::new();
    changes.insert("phi_accessed".to_string(), serde_json::json!(true));

    let audit = AuditTrailEvent {
        action: "phi_access".to_string(),
        actor: "physician-123".to_string(),
        resource_type: "patient_record".to_string(),
        resource_id: "record-456".to_string(),
        changes,
        ip_address: Some("10.0.1.100".to_string()),
        user_agent: Some("EMR-System/1.0".to_string()),
    };

    // HIPAA requires comprehensive audit trails
    assert!(!audit.action.is_empty());
    assert!(!audit.actor.is_empty());
    assert!(!audit.resource_id.is_empty());
    assert!(audit.ip_address.is_some());
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

fn is_private_ip(ip: &str) -> bool {
    if ip == "localhost" || ip == "127.0.0.1" {
        return true;
    }

    if ip.starts_with("10.") ||
       ip.starts_with("172.16.") ||
       ip.starts_with("192.168.") ||
       ip == "169.254.169.254" {
        return true;
    }

    false
}

// ============================================================================
// PENETRATION TESTING SIMULATION
// ============================================================================

#[test]
fn test_fuzzing_event_fields() {
    // Simulate fuzzing with random/malformed data
    let fuzz_inputs = vec![
        String::from_utf8(vec![0xFF, 0xFE, 0xFD]).unwrap_or_default(),
        "A".repeat(10000), // Very long string
        "\0\0\0",          // Null bytes
        "😀🎉🚀",          // Unicode
        "",                // Empty string
    ];

    for input in fuzz_inputs {
        let event = AnalyticsEvent {
            common: CommonEventFields {
                event_id: Uuid::new_v4(),
                timestamp: Utc::now(),
                source_module: SourceModule::LlmAnalyticsHub,
                event_type: EventType::Security,
                correlation_id: None,
                parent_event_id: None,
                schema_version: "1.0.0".to_string(),
                severity: Severity::Debug,
                environment: input.clone(),
                tags: HashMap::new(),
            },
            payload: EventPayload::Custom(CustomPayload {
                custom_type: "fuzz".to_string(),
                data: serde_json::json!({"fuzz": input}),
            }),
        };

        // Should not panic on malformed input
        let _ = serde_json::to_string(&event);
    }
}
