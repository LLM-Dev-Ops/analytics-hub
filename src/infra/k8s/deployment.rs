//! Kubernetes deployment management

use super::client::K8sClient;
use anyhow::{Context, Result};
use k8s_openapi::api::apps::v1::{Deployment, StatefulSet};
use kube::{api::ListParams, Api, ResourceExt};
use std::time::Duration;
use tokio::time::{sleep, timeout};
use tracing::{debug, info};

/// Deployment options
#[derive(Debug, Clone)]
pub struct DeploymentOptions {
    /// Wait for rollout to complete
    pub wait: bool,

    /// Timeout for waiting (seconds)
    pub timeout: u64,

    /// Force update even if no changes
    pub force: bool,
}

impl Default for DeploymentOptions {
    fn default() -> Self {
        Self {
            wait: true,
            timeout: 300,
            force: false,
        }
    }
}

/// Deployment manager
pub struct DeploymentManager {
    client: K8sClient,
}

impl DeploymentManager {
    /// Create a new deployment manager
    pub fn new(client: K8sClient) -> Self {
        Self { client }
    }

    /// Deploy from YAML manifest
    pub async fn deploy_manifest(
        &self,
        yaml: &str,
        options: &DeploymentOptions,
    ) -> Result<()> {
        info!("Applying manifest to namespace: {}", self.client.namespace());

        self.client
            .apply_manifest(yaml)
            .await
            .context("Failed to apply manifest")?;

        if options.wait {
            self.wait_for_rollout(options.timeout).await?;
        }

        Ok(())
    }

    /// Wait for all deployments to be ready
    pub async fn wait_for_rollout(&self, timeout_secs: u64) -> Result<()> {
        info!("Waiting for deployments to be ready (timeout: {}s)", timeout_secs);

        timeout(
            Duration::from_secs(timeout_secs),
            self.wait_for_all_deployments(),
        )
        .await
        .context("Timeout waiting for deployments")??;

        Ok(())
    }

    /// Wait for all deployments in the namespace
    async fn wait_for_all_deployments(&self) -> Result<()> {
        let deployments: Api<Deployment> =
            Api::namespaced(self.client.client().clone(), self.client.namespace());

        loop {
            let deployment_list = deployments
                .list(&ListParams::default())
                .await
                .context("Failed to list deployments")?;

            if deployment_list.items.is_empty() {
                debug!("No deployments found, checking StatefulSets");
                // Also check StatefulSets
                return self.wait_for_all_statefulsets().await;
            }

            let mut all_ready = true;
            for deployment in &deployment_list.items {
                let name = deployment.name_any();

                if let Some(status) = &deployment.status {
                    let desired = deployment
                        .spec
                        .as_ref()
                        .and_then(|s| s.replicas)
                        .unwrap_or(1);
                    let ready = status.ready_replicas.unwrap_or(0);

                    if ready < desired {
                        debug!(
                            "Deployment {} not ready: {}/{} replicas",
                            name, ready, desired
                        );
                        all_ready = false;
                    } else {
                        debug!("Deployment {} is ready: {}/{}", name, ready, desired);
                    }
                } else {
                    all_ready = false;
                }
            }

            if all_ready {
                info!("All deployments are ready");
                // Also check StatefulSets
                return self.wait_for_all_statefulsets().await;
            }

            sleep(Duration::from_secs(2)).await;
        }
    }

    /// Wait for all StatefulSets in the namespace
    async fn wait_for_all_statefulsets(&self) -> Result<()> {
        let statefulsets: Api<StatefulSet> =
            Api::namespaced(self.client.client().clone(), self.client.namespace());

        loop {
            let statefulset_list = statefulsets
                .list(&ListParams::default())
                .await
                .context("Failed to list statefulsets")?;

            if statefulset_list.items.is_empty() {
                debug!("No StatefulSets found");
                return Ok(());
            }

            let mut all_ready = true;
            for sts in &statefulset_list.items {
                let name = sts.name_any();

                if let Some(status) = &sts.status {
                    let desired = sts.spec.as_ref().and_then(|s| s.replicas).unwrap_or(1);
                    let ready = status.ready_replicas.unwrap_or(0);

                    if ready < desired {
                        debug!(
                            "StatefulSet {} not ready: {}/{} replicas",
                            name, ready, desired
                        );
                        all_ready = false;
                    } else {
                        debug!("StatefulSet {} is ready: {}/{}", name, ready, desired);
                    }
                } else {
                    all_ready = false;
                }
            }

            if all_ready {
                info!("All StatefulSets are ready");
                return Ok(());
            }

            sleep(Duration::from_secs(2)).await;
        }
    }

    /// Scale a deployment
    pub async fn scale_deployment(&self, name: &str, replicas: i32) -> Result<()> {
        info!("Scaling deployment {} to {} replicas", name, replicas);

        let deployments: Api<Deployment> =
            Api::namespaced(self.client.client().clone(), self.client.namespace());

        let mut deployment = deployments
            .get(name)
            .await
            .with_context(|| format!("Failed to get deployment: {}", name))?;

        if let Some(spec) = &mut deployment.spec {
            spec.replicas = Some(replicas);
        }

        deployments
            .replace(name, &kube::api::PostParams::default(), &deployment)
            .await
            .with_context(|| format!("Failed to scale deployment: {}", name))?;

        info!("Deployment {} scaled to {} replicas", name, replicas);

        Ok(())
    }

    /// Restart a deployment (by updating annotation)
    pub async fn restart_deployment(&self, name: &str) -> Result<()> {
        info!("Restarting deployment: {}", name);

        let deployments: Api<Deployment> =
            Api::namespaced(self.client.client().clone(), self.client.namespace());

        let mut deployment = deployments
            .get(name)
            .await
            .with_context(|| format!("Failed to get deployment: {}", name))?;

        // Add restart annotation
        let restart_time = chrono::Utc::now().to_rfc3339();
        if let Some(spec) = &mut deployment.spec {
            if let template = &mut spec.template {
                if let Some(metadata) = &mut template.metadata {
                    if metadata.annotations.is_none() {
                        metadata.annotations = Some(std::collections::BTreeMap::new());
                    }
                    if let Some(annotations) = &mut metadata.annotations {
                        annotations.insert(
                            "kubectl.kubernetes.io/restartedAt".to_string(),
                            restart_time,
                        );
                    }
                }
            }
        }

        deployments
            .replace(name, &kube::api::PostParams::default(), &deployment)
            .await
            .with_context(|| format!("Failed to restart deployment: {}", name))?;

        info!("Deployment {} restarted", name);

        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_deployment_options_default() {
        let options = DeploymentOptions::default();
        assert!(options.wait);
        assert_eq!(options.timeout, 300);
        assert!(!options.force);
    }
}
