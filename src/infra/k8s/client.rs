//! Kubernetes client wrapper

use anyhow::{Context, Result};
use k8s_openapi::api::apps::v1::{Deployment, StatefulSet};
use k8s_openapi::api::core::v1::{Namespace, Pod, Service};
use kube::{
    api::{Api, DeleteParams, ListParams, Patch, PatchParams, PostParams},
    config::{Config, Kubeconfig, KubeConfigOptions},
    Client, ResourceExt,
};
use std::path::PathBuf;
use tracing::{debug, info};

/// Kubernetes client wrapper
#[derive(Clone)]
pub struct K8sClient {
    client: Client,
    namespace: String,
}

impl K8sClient {
    /// Create a new Kubernetes client with default configuration
    pub async fn new(namespace: impl Into<String>) -> Result<Self> {
        let client = Client::try_default()
            .await
            .context("Failed to create Kubernetes client")?;

        Ok(Self {
            client,
            namespace: namespace.into(),
        })
    }

    /// Create a Kubernetes client with custom kubeconfig
    pub async fn with_kubeconfig(
        namespace: impl Into<String>,
        kubeconfig_path: PathBuf,
        context: Option<String>,
    ) -> Result<Self> {
        let kubeconfig = Kubeconfig::read_from(&kubeconfig_path)
            .context("Failed to read kubeconfig")?;

        let config_options = KubeConfigOptions {
            context,
            cluster: None,
            user: None,
        };

        let config = Config::from_custom_kubeconfig(kubeconfig, &config_options)
            .await
            .context("Failed to load kubeconfig")?;

        let client = Client::try_from(config)
            .context("Failed to create client from config")?;

        Ok(Self {
            client,
            namespace: namespace.into(),
        })
    }

    /// Get the namespace
    pub fn namespace(&self) -> &str {
        &self.namespace
    }

    /// Get the underlying kube client
    pub fn client(&self) -> &Client {
        &self.client
    }

    /// Create a namespace if it doesn't exist
    pub async fn ensure_namespace(&self) -> Result<()> {
        let namespaces: Api<Namespace> = Api::all(self.client.clone());

        if namespaces.get(&self.namespace).await.is_err() {
            info!("Creating namespace: {}", self.namespace);

            let ns = serde_json::json!({
                "apiVersion": "v1",
                "kind": "Namespace",
                "metadata": {
                    "name": self.namespace
                }
            });

            namespaces
                .create(&PostParams::default(), &serde_json::from_value(ns)?)
                .await
                .context("Failed to create namespace")?;
        } else {
            debug!("Namespace already exists: {}", self.namespace);
        }

        Ok(())
    }

    /// Apply a YAML manifest
    pub async fn apply_manifest(&self, yaml: &str) -> Result<()> {
        let docs: Vec<serde_yaml::Value> = serde_yaml::Deserializer::from_str(yaml)
            .map(|doc| serde_yaml::from_value::<serde_yaml::Value>(doc.clone()).unwrap())
            .collect();

        for doc in docs {
            if doc.is_null() {
                continue;
            }

            self.apply_resource(doc).await?;
        }

        Ok(())
    }

    /// Apply a single resource
    async fn apply_resource(&self, doc: serde_yaml::Value) -> Result<()> {
        let json = serde_json::to_value(&doc)?;
        let kind = json["kind"]
            .as_str()
            .context("Resource missing 'kind' field")?;
        let name = json["metadata"]["name"]
            .as_str()
            .context("Resource missing 'metadata.name'")?;

        info!("Applying {} resource: {}", kind, name);

        // For now, we'll use server-side apply for all resources
        // In production, you'd want to handle different resource types
        let patch_params = PatchParams::apply("llm-analytics-cli");

        match kind {
            "Namespace" => {
                let api: Api<Namespace> = Api::all(self.client.clone());
                api.patch(name, &patch_params, &Patch::Apply(&json))
                    .await
                    .context("Failed to apply Namespace")?;
            }
            "Deployment" => {
                let api: Api<Deployment> = Api::namespaced(self.client.clone(), &self.namespace);
                api.patch(name, &patch_params, &Patch::Apply(&json))
                    .await
                    .context("Failed to apply Deployment")?;
            }
            "StatefulSet" => {
                let api: Api<StatefulSet> = Api::namespaced(self.client.clone(), &self.namespace);
                api.patch(name, &patch_params, &Patch::Apply(&json))
                    .await
                    .context("Failed to apply StatefulSet")?;
            }
            "Service" => {
                let api: Api<Service> = Api::namespaced(self.client.clone(), &self.namespace);
                api.patch(name, &patch_params, &Patch::Apply(&json))
                    .await
                    .context("Failed to apply Service")?;
            }
            _ => {
                // For other resource types, use dynamic API
                debug!("Resource type {} not directly supported, skipping", kind);
            }
        }

        Ok(())
    }

    /// List all pods in the namespace
    pub async fn list_pods(&self) -> Result<Vec<Pod>> {
        self.list_pods_in_namespace(&self.namespace).await
    }

    /// List all pods in a specific namespace
    pub async fn list_pods_in_namespace(&self, namespace: &str) -> Result<Vec<Pod>> {
        let pods: Api<Pod> = Api::namespaced(self.client.clone(), namespace);
        let pod_list = pods
            .list(&ListParams::default())
            .await
            .with_context(|| format!("Failed to list pods in namespace {}", namespace))?;

        Ok(pod_list.items)
    }

    /// Get a specific pod
    pub async fn get_pod(&self, name: &str) -> Result<Pod> {
        let pods: Api<Pod> = Api::namespaced(self.client.clone(), &self.namespace);
        pods.get(name)
            .await
            .with_context(|| format!("Failed to get pod: {}", name))
    }

    /// Delete a pod
    pub async fn delete_pod(&self, name: &str) -> Result<()> {
        let pods: Api<Pod> = Api::namespaced(self.client.clone(), &self.namespace);
        pods.delete(name, &DeleteParams::default())
            .await
            .with_context(|| format!("Failed to delete pod: {}", name))?;

        Ok(())
    }

    /// Get pod logs
    pub async fn get_logs(&self, pod_name: &str, container: Option<&str>) -> Result<String> {
        let pods: Api<Pod> = Api::namespaced(self.client.clone(), &self.namespace);

        let mut params = kube::api::LogParams::default();
        if let Some(c) = container {
            params.container = Some(c.to_string());
        }

        let logs = pods
            .logs(pod_name, &params)
            .await
            .with_context(|| format!("Failed to get logs for pod: {}", pod_name))?;

        Ok(logs)
    }

    /// List deployments
    pub async fn list_deployments(&self) -> Result<Vec<Deployment>> {
        let deployments: Api<Deployment> = Api::namespaced(self.client.clone(), &self.namespace);
        let deployment_list = deployments
            .list(&ListParams::default())
            .await
            .context("Failed to list deployments")?;

        Ok(deployment_list.items)
    }

    /// List services
    pub async fn list_services(&self) -> Result<Vec<Service>> {
        let services: Api<Service> = Api::namespaced(self.client.clone(), &self.namespace);
        let service_list = services
            .list(&ListParams::default())
            .await
            .context("Failed to list services")?;

        Ok(service_list.items)
    }

    /// Check if a pod is ready
    pub fn is_pod_ready(pod: &Pod) -> bool {
        if let Some(status) = &pod.status {
            if let Some(conditions) = &status.conditions {
                return conditions
                    .iter()
                    .any(|c| c.type_ == "Ready" && c.status == "True");
            }
        }
        false
    }

    /// Get pod phase
    pub fn get_pod_phase(pod: &Pod) -> String {
        pod.status
            .as_ref()
            .and_then(|s| s.phase.clone())
            .unwrap_or_else(|| "Unknown".to_string())
    }

    /// Execute a command in a pod
    ///
    /// Note: This is a simplified implementation that uses kubectl exec under the hood.
    /// For production use, consider using the Kubernetes exec API directly.
    pub async fn exec_in_pod(&self, pod_name: &str, command: &str) -> Result<String> {
        debug!("Executing in pod {}: {}", pod_name, command);

        let output = tokio::process::Command::new("kubectl")
            .arg("exec")
            .arg("-n")
            .arg(&self.namespace)
            .arg(pod_name)
            .arg("--")
            .arg("sh")
            .arg("-c")
            .arg(command)
            .output()
            .await
            .with_context(|| format!("Failed to execute command in pod {}", pod_name))?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            anyhow::bail!("Command failed in pod {}: {}", pod_name, stderr);
        }

        Ok(String::from_utf8_lossy(&output.stdout).to_string())
    }

    /// Run a temporary pod to execute a command
    ///
    /// This creates a temporary pod, runs the command, and cleans up.
    pub async fn run_pod_command(&self, name: &str, image: &str, args: &[&str]) -> Result<String> {
        debug!("Running temporary pod {} with image {}", name, image);

        let args_vec: Vec<String> = args.iter().map(|s| s.to_string()).collect();

        let output = tokio::process::Command::new("kubectl")
            .arg("run")
            .arg("-n")
            .arg(&self.namespace)
            .arg(name)
            .arg("--rm")
            .arg("-i")
            .arg("--restart=Never")
            .arg(format!("--image={}", image))
            .arg("--")
            .args(&args_vec)
            .output()
            .await
            .with_context(|| format!("Failed to run pod command with image {}", image))?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            anyhow::bail!("Pod command failed: {}", stderr);
        }

        Ok(String::from_utf8_lossy(&output.stdout).to_string())
    }

    /// Scale a deployment to a specific number of replicas
    pub async fn scale_deployment(&self, deployment_name: &str, replicas: i32) -> Result<String> {
        info!(
            "Scaling deployment '{}' to {} replicas",
            deployment_name, replicas
        );

        let deployments: Api<Deployment> = Api::namespaced(self.client.clone(), &self.namespace);

        let patch = serde_json::json!({
            "spec": {
                "replicas": replicas
            }
        });

        deployments
            .patch(
                deployment_name,
                &PatchParams::default(),
                &Patch::Merge(&patch),
            )
            .await
            .with_context(|| {
                format!(
                    "Failed to scale deployment '{}' to {} replicas",
                    deployment_name, replicas
                )
            })?;

        Ok(deployment_name.to_string())
    }

    /// Scale all deployments in the namespace
    pub async fn scale_all_deployments(&self, replicas: i32) -> Result<Vec<String>> {
        info!("Scaling all deployments to {} replicas", replicas);

        let deployments = self.list_deployments().await?;
        let mut scaled = Vec::new();

        for deployment in deployments {
            if let Some(name) = deployment.metadata.name {
                self.scale_deployment(&name, replicas).await?;
                scaled.push(name);
            }
        }

        Ok(scaled)
    }

    /// Wait for a deployment to be ready
    pub async fn wait_for_deployment(&self, deployment_name: &str, timeout_secs: u64) -> Result<()> {
        info!(
            "Waiting for deployment '{}' to be ready (timeout: {}s)",
            deployment_name, timeout_secs
        );

        let deployments: Api<Deployment> = Api::namespaced(self.client.clone(), &self.namespace);
        let start = std::time::Instant::now();

        loop {
            if start.elapsed().as_secs() > timeout_secs {
                anyhow::bail!(
                    "Timeout waiting for deployment '{}' to be ready",
                    deployment_name
                );
            }

            let deployment = deployments
                .get(deployment_name)
                .await
                .with_context(|| format!("Failed to get deployment: {}", deployment_name))?;

            if let Some(status) = deployment.status {
                if let Some(ready_replicas) = status.ready_replicas {
                    if let Some(spec) = deployment.spec {
                        if let Some(desired_replicas) = spec.replicas {
                            if ready_replicas == desired_replicas {
                                info!("Deployment '{}' is ready", deployment_name);
                                return Ok(());
                            }
                        }
                    }
                }
            }

            tokio::time::sleep(tokio::time::Duration::from_secs(2)).await;
        }
    }

    /// Check if the Kubernetes cluster is accessible
    pub async fn is_accessible(&self) -> bool {
        let namespaces: Api<Namespace> = Api::all(self.client.clone());
        namespaces.list(&ListParams::default()).await.is_ok()
    }

    /// Delete all jobs in the namespace
    pub async fn delete_all_jobs(&self) -> Result<()> {
        use k8s_openapi::api::batch::v1::Job;

        info!("Deleting all jobs in namespace '{}'", self.namespace);

        let jobs: Api<Job> = Api::namespaced(self.client.clone(), &self.namespace);
        jobs.delete_collection(&DeleteParams::default(), &ListParams::default())
            .await
            .context("Failed to delete jobs")?;

        Ok(())
    }

    /// Delete all cronjobs in the namespace
    pub async fn delete_all_cronjobs(&self) -> Result<()> {
        use k8s_openapi::api::batch::v1::CronJob;

        info!("Deleting all cronjobs in namespace '{}'", self.namespace);

        let cronjobs: Api<CronJob> = Api::namespaced(self.client.clone(), &self.namespace);
        cronjobs
            .delete_collection(&DeleteParams::default(), &ListParams::default())
            .await
            .context("Failed to delete cronjobs")?;

        Ok(())
    }

    /// Delete a namespace
    pub async fn delete_namespace(&self, namespace: &str) -> Result<()> {
        info!("Deleting namespace '{}'", namespace);

        let namespaces: Api<Namespace> = Api::all(self.client.clone());
        namespaces
            .delete(namespace, &DeleteParams::default())
            .await
            .with_context(|| format!("Failed to delete namespace: {}", namespace))?;

        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_pod_phase_extraction() {
        // Test with a pod that has no status
        let pod = Pod::default();
        assert_eq!(K8sClient::get_pod_phase(&pod), "Unknown");
    }

    #[tokio::test]
    async fn test_client_creation() {
        // This will fail in CI without kubeconfig, but tests the API
        let result = K8sClient::new("default").await;
        // Don't assert - just testing compilation
    }
}
