//! Kubernetes resource management utilities

use super::client::K8sClient;
use anyhow::{Context, Result};
use k8s_openapi::api::core::v1::Pod;
use kube::ResourceExt;
use serde::{Deserialize, Serialize};

/// Resource information
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ResourceInfo {
    pub name: String,
    pub kind: String,
    pub namespace: String,
    pub status: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub age: Option<String>,
}

/// Resource manager
pub struct ResourceManager {
    client: K8sClient,
}

impl ResourceManager {
    /// Create a new resource manager
    pub fn new(client: K8sClient) -> Self {
        Self { client }
    }

    /// Get all resources summary
    pub async fn get_resources_summary(&self) -> Result<Vec<ResourceInfo>> {
        let mut resources = Vec::new();

        // Get pods
        let pods = self
            .client
            .list_pods()
            .await
            .context("Failed to list pods")?;

        for pod in pods {
            resources.push(self.pod_to_resource_info(&pod));
        }

        // Get deployments
        let deployments = self
            .client
            .list_deployments()
            .await
            .context("Failed to list deployments")?;

        for deployment in deployments {
            let name = deployment.name_any();
            let status = if let Some(s) = &deployment.status {
                let desired = deployment
                    .spec
                    .as_ref()
                    .and_then(|spec| spec.replicas)
                    .unwrap_or(1);
                let ready = s.ready_replicas.unwrap_or(0);
                format!("{}/{} ready", ready, desired)
            } else {
                "Unknown".to_string()
            };

            resources.push(ResourceInfo {
                name,
                kind: "Deployment".to_string(),
                namespace: self.client.namespace().to_string(),
                status,
                age: None,
            });
        }

        // Get services
        let services = self
            .client
            .list_services()
            .await
            .context("Failed to list services")?;

        for service in services {
            let name = service.name_any();
            let status = if let Some(spec) = &service.spec {
                format!("Type: {:?}", spec.type_)
            } else {
                "Unknown".to_string()
            };

            resources.push(ResourceInfo {
                name,
                kind: "Service".to_string(),
                namespace: self.client.namespace().to_string(),
                status,
                age: None,
            });
        }

        Ok(resources)
    }

    /// Convert pod to resource info
    fn pod_to_resource_info(&self, pod: &Pod) -> ResourceInfo {
        let name = pod.name_any();
        let status = K8sClient::get_pod_phase(pod);
        let age = self.calculate_age(pod);

        ResourceInfo {
            name,
            kind: "Pod".to_string(),
            namespace: self.client.namespace().to_string(),
            status,
            age: Some(age),
        }
    }

    /// Calculate age of a resource
    fn calculate_age(&self, pod: &Pod) -> String {
        if let metadata = &pod.metadata {
            if let Some(creation_timestamp) = &metadata.creation_timestamp {
                let created = creation_timestamp.0;
                let now = chrono::Utc::now();
                let duration = now.signed_duration_since(created);

                if duration.num_days() > 0 {
                    format!("{}d", duration.num_days())
                } else if duration.num_hours() > 0 {
                    format!("{}h", duration.num_hours())
                } else if duration.num_minutes() > 0 {
                    format!("{}m", duration.num_minutes())
                } else {
                    format!("{}s", duration.num_seconds())
                }
            } else {
                "Unknown".to_string()
            }
        } else {
            "Unknown".to_string()
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_resource_info_creation() {
        let info = ResourceInfo {
            name: "test-pod".to_string(),
            kind: "Pod".to_string(),
            namespace: "default".to_string(),
            status: "Running".to_string(),
            age: Some("5m".to_string()),
        };

        assert_eq!(info.name, "test-pod");
        assert_eq!(info.kind, "Pod");
    }
}
