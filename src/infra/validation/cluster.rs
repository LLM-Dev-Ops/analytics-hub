//! Cluster health validation
//!
//! Validates Kubernetes cluster health, nodes, and system components

use anyhow::{Context, Result};
use k8s_openapi::api::core::v1::Node;
use kube::{api::ListParams, Api};
use tracing::debug;

use crate::infra::k8s::K8sClient;
use super::types::{CheckSeverity, ValidationCheck, ValidationResults};

/// Cluster validator
pub struct ClusterValidator {
    client: K8sClient,
}

impl ClusterValidator {
    /// Create new cluster validator
    pub fn new(client: K8sClient) -> Self {
        Self { client }
    }

    /// Run all cluster validation checks
    pub async fn validate(&self) -> Result<ValidationResults> {
        let mut results = ValidationResults::new("Cluster Health");

        // Check nodes
        results.add_check(self.check_nodes().await?);

        // Check node resource pressure
        results.add_check(self.check_node_pressure().await?);

        // Check system pods
        results.add_check(self.check_system_pods().await?);

        // Check namespaces
        results.add_check(self.check_namespace_exists().await?);

        Ok(results)
    }

    /// Check node status
    async fn check_nodes(&self) -> Result<ValidationCheck> {
        let check = ValidationCheck::new("nodes-ready", "Cluster Health", CheckSeverity::Critical);

        let nodes_api: Api<Node> = Api::all(self.client.client().clone());
        let nodes = nodes_api
            .list(&ListParams::default())
            .await
            .context("Failed to list nodes")?;

        let total_nodes = nodes.items.len();
        if total_nodes == 0 {
            return Ok(check.fail("No nodes found in cluster"));
        }

        let ready_nodes = nodes
            .items
            .iter()
            .filter(|node| {
                node.status
                    .as_ref()
                    .and_then(|s| s.conditions.as_ref())
                    .map(|conditions| {
                        conditions.iter().any(|c| {
                            c.type_ == "Ready" && c.status == "True"
                        })
                    })
                    .unwrap_or(false)
            })
            .count();

        debug!("Nodes: {}/{} ready", ready_nodes, total_nodes);

        if ready_nodes == total_nodes {
            Ok(check.pass(format!("All nodes ready ({}/{})", ready_nodes, total_nodes)))
        } else if ready_nodes > 0 {
            Ok(check.warn(format!("Some nodes not ready ({}/{})", ready_nodes, total_nodes)))
        } else {
            Ok(check.fail("No nodes ready"))
        }
    }

    /// Check for node resource pressure
    async fn check_node_pressure(&self) -> Result<ValidationCheck> {
        let check = ValidationCheck::new("node-pressure", "Cluster Health", CheckSeverity::Important);

        let nodes_api: Api<Node> = Api::all(self.client.client().clone());
        let nodes = nodes_api
            .list(&ListParams::default())
            .await
            .context("Failed to list nodes")?;

        let pressure_types = vec!["MemoryPressure", "DiskPressure", "PIDPressure"];
        let mut nodes_with_pressure = 0;

        for node in &nodes.items {
            if let Some(status) = &node.status {
                if let Some(conditions) = &status.conditions {
                    let has_pressure = conditions.iter().any(|c| {
                        pressure_types.contains(&c.type_.as_str()) && c.status == "True"
                    });

                    if has_pressure {
                        nodes_with_pressure += 1;
                        if let metadata = &node.metadata {
                            debug!("Node {} under resource pressure", metadata.name.as_ref().unwrap_or(&"unknown".to_string()));
                        }
                    }
                }
            }
        }

        if nodes_with_pressure == 0 {
            Ok(check.pass("No nodes under resource pressure"))
        } else {
            Ok(check.warn(format!("{} node(s) under resource pressure", nodes_with_pressure)))
        }
    }

    /// Check system pods
    async fn check_system_pods(&self) -> Result<ValidationCheck> {
        let check = ValidationCheck::new("system-pods", "Cluster Health", CheckSeverity::Important);

        let pods = self
            .client
            .list_pods_in_namespace("kube-system")
            .await
            .context("Failed to list system pods")?;

        let total_pods = pods.len();
        if total_pods == 0 {
            return Ok(check.warn("No system pods found"));
        }

        let running_pods = pods
            .iter()
            .filter(|pod| {
                pod.status
                    .as_ref()
                    .and_then(|s| s.phase.as_deref())
                    .unwrap_or("") == "Running"
            })
            .count();

        debug!("System pods: {}/{} running", running_pods, total_pods);

        if running_pods == total_pods {
            Ok(check.pass(format!("All system pods running ({}/{})", running_pods, total_pods)))
        } else if running_pods > total_pods * 8 / 10 {
            // More than 80% running
            Ok(check.warn(format!("Some system pods not running ({}/{})", running_pods, total_pods)))
        } else {
            Ok(check.fail(format!("Many system pods not running ({}/{})", running_pods, total_pods)))
        }
    }

    /// Check namespace exists
    async fn check_namespace_exists(&self) -> Result<ValidationCheck> {
        let check = ValidationCheck::new("namespace-exists", "Cluster Health", CheckSeverity::Critical);

        match self.client.ensure_namespace().await {
            Ok(_) => Ok(check.pass(format!("Namespace '{}' exists", self.client.namespace()))),
            Err(e) => {
                debug!("Namespace check error: {}", e);
                Ok(check.fail(format!("Namespace '{}' does not exist", self.client.namespace())))
            }
        }
    }
}
