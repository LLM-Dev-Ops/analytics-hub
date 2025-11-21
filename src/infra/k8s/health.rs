//! Kubernetes health checking

use super::client::K8sClient;
use anyhow::Result;
use serde::{Deserialize, Serialize};
use tracing::debug;

/// Health check result
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HealthCheckResult {
    pub healthy: bool,
    pub checks: Vec<HealthCheck>,
}

impl HealthCheckResult {
    pub fn new() -> Self {
        Self {
            healthy: true,
            checks: Vec::new(),
        }
    }

    pub fn add_check(&mut self, check: HealthCheck) {
        if !check.passed {
            self.healthy = false;
        }
        self.checks.push(check);
    }
}

/// Individual health check
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HealthCheck {
    pub name: String,
    pub passed: bool,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub details: Option<serde_json::Value>,
}

impl HealthCheck {
    pub fn passed(name: impl Into<String>, message: impl Into<String>) -> Self {
        Self {
            name: name.into(),
            passed: true,
            message: message.into(),
            details: None,
        }
    }

    pub fn failed(name: impl Into<String>, message: impl Into<String>) -> Self {
        Self {
            name: name.into(),
            passed: false,
            message: message.into(),
            details: None,
        }
    }

    pub fn with_details(mut self, details: serde_json::Value) -> Self {
        self.details = Some(details);
        self
    }
}

/// Health checker for Kubernetes resources
pub struct HealthChecker {
    client: K8sClient,
}

impl HealthChecker {
    /// Create a new health checker
    pub fn new(client: K8sClient) -> Self {
        Self { client }
    }

    /// Run all health checks
    pub async fn check_all(&self) -> Result<HealthCheckResult> {
        let mut result = HealthCheckResult::new();

        // Check namespace exists
        result.add_check(self.check_namespace().await);

        // Check pods
        result.add_check(self.check_pods().await);

        // Check deployments
        result.add_check(self.check_deployments().await);

        // Check services
        result.add_check(self.check_services().await);

        Ok(result)
    }

    /// Check if namespace exists
    async fn check_namespace(&self) -> HealthCheck {
        debug!("Checking namespace: {}", self.client.namespace());

        match self.client.ensure_namespace().await {
            Ok(_) => HealthCheck::passed(
                "namespace",
                format!("Namespace '{}' exists", self.client.namespace()),
            ),
            Err(e) => HealthCheck::failed(
                "namespace",
                format!("Namespace check failed: {}", e),
            ),
        }
    }

    /// Check pod health
    async fn check_pods(&self) -> HealthCheck {
        debug!("Checking pods in namespace: {}", self.client.namespace());

        match self.client.list_pods().await {
            Ok(pods) => {
                let total = pods.len();
                let ready = pods
                    .iter()
                    .filter(|p| K8sClient::is_pod_ready(p))
                    .count();

                let running = pods
                    .iter()
                    .filter(|p| K8sClient::get_pod_phase(p) == "Running")
                    .count();

                let details = serde_json::json!({
                    "total": total,
                    "ready": ready,
                    "running": running,
                });

                if ready == total && total > 0 {
                    HealthCheck::passed(
                        "pods",
                        format!("All {} pods are ready", total),
                    )
                    .with_details(details)
                } else if total == 0 {
                    HealthCheck::passed("pods", "No pods found (may be expected)")
                        .with_details(details)
                } else {
                    HealthCheck::failed(
                        "pods",
                        format!("Only {}/{} pods are ready", ready, total),
                    )
                    .with_details(details)
                }
            }
            Err(e) => HealthCheck::failed("pods", format!("Failed to list pods: {}", e)),
        }
    }

    /// Check deployment health
    async fn check_deployments(&self) -> HealthCheck {
        debug!("Checking deployments in namespace: {}", self.client.namespace());

        match self.client.list_deployments().await {
            Ok(deployments) => {
                let total = deployments.len();
                let ready = deployments
                    .iter()
                    .filter(|d| {
                        if let Some(status) = &d.status {
                            let desired = d.spec.as_ref().and_then(|s| s.replicas).unwrap_or(1);
                            let ready_replicas = status.ready_replicas.unwrap_or(0);
                            ready_replicas >= desired
                        } else {
                            false
                        }
                    })
                    .count();

                let details = serde_json::json!({
                    "total": total,
                    "ready": ready,
                });

                if ready == total && total > 0 {
                    HealthCheck::passed(
                        "deployments",
                        format!("All {} deployments are ready", total),
                    )
                    .with_details(details)
                } else if total == 0 {
                    HealthCheck::passed("deployments", "No deployments found (may be expected)")
                        .with_details(details)
                } else {
                    HealthCheck::failed(
                        "deployments",
                        format!("Only {}/{} deployments are ready", ready, total),
                    )
                    .with_details(details)
                }
            }
            Err(e) => HealthCheck::failed("deployments", format!("Failed to list deployments: {}", e)),
        }
    }

    /// Check service health
    async fn check_services(&self) -> HealthCheck {
        debug!("Checking services in namespace: {}", self.client.namespace());

        match self.client.list_services().await {
            Ok(services) => {
                let total = services.len();

                let details = serde_json::json!({
                    "total": total,
                });

                if total > 0 {
                    HealthCheck::passed(
                        "services",
                        format!("Found {} services", total),
                    )
                    .with_details(details)
                } else {
                    HealthCheck::passed("services", "No services found (may be expected)")
                        .with_details(details)
                }
            }
            Err(e) => HealthCheck::failed("services", format!("Failed to list services: {}", e)),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_health_check_passed() {
        let check = HealthCheck::passed("test", "Test passed");
        assert!(check.passed);
        assert_eq!(check.name, "test");
    }

    #[test]
    fn test_health_check_failed() {
        let check = HealthCheck::failed("test", "Test failed");
        assert!(!check.passed);
    }

    #[test]
    fn test_health_check_result() {
        let mut result = HealthCheckResult::new();
        assert!(result.healthy);

        result.add_check(HealthCheck::passed("test1", "Passed"));
        assert!(result.healthy);

        result.add_check(HealthCheck::failed("test2", "Failed"));
        assert!(!result.healthy);
    }
}
