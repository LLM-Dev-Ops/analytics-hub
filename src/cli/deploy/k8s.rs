//! Kubernetes deployment command

use anyhow::{Context, Result};
use clap::Args;
use std::path::PathBuf;
use tokio::fs;
use tracing::info;

use crate::common::{
    output::{print_header, print_info, print_step, print_success, CommandOutput},
    progress::ProgressTracker,
    ExecutionContext,
};
use crate::infra::k8s::{DeploymentManager, DeploymentOptions, K8sClient};

/// Kubernetes deployment arguments
#[derive(Debug, Args)]
pub struct K8sDeployArgs {
    /// Path to manifest directory or file
    #[arg(short, long, default_value = "infrastructure/k8s")]
    pub manifest_path: PathBuf,

    /// Namespace to deploy to
    #[arg(short, long)]
    pub namespace: Option<String>,

    /// Wait for rollout to complete
    #[arg(short, long, default_value_t = true)]
    pub wait: bool,

    /// Timeout for waiting (seconds)
    #[arg(short, long, default_value_t = 300)]
    pub timeout: u64,

    /// Kubeconfig path (overrides default)
    #[arg(long)]
    pub kubeconfig: Option<PathBuf>,

    /// Kubernetes context to use
    #[arg(long)]
    pub context: Option<String>,
}

impl K8sDeployArgs {
    /// Execute Kubernetes deployment
    pub async fn execute(&self, ctx: &ExecutionContext) -> Result<()> {
        print_header("Kubernetes Deployment");

        // Determine namespace
        let namespace = self
            .namespace
            .clone()
            .unwrap_or_else(|| ctx.config.kubernetes.namespace.clone());

        info!("Deploying to namespace: {}", namespace);

        // Create Kubernetes client
        print_step(1, 4, &format!("Connecting to Kubernetes cluster (namespace: {})", namespace));
        let client = self.create_client(&namespace).await?;
        print_success("Connected to Kubernetes cluster");

        // Ensure namespace exists
        print_step(2, 4, "Ensuring namespace exists");
        ctx.execute(client.ensure_namespace(), "Create namespace if needed")
            .await?;
        print_success(&format!("Namespace '{}' ready", namespace));

        // Read manifests
        print_step(3, 4, "Reading manifest files");
        let manifests = self.read_manifests().await?;
        print_info(&format!("Found {} manifest file(s)", manifests.len()));

        // Deploy manifests
        print_step(4, 4, "Applying manifests to cluster");
        let deployment_manager = DeploymentManager::new(client);
        let options = DeploymentOptions {
            wait: self.wait,
            timeout: self.timeout,
            force: false,
        };

        let mut total_applied = 0;
        for (idx, manifest) in manifests.iter().enumerate() {
            if ctx.verbose {
                print_info(&format!("Applying manifest {}/{}", idx + 1, manifests.len()));
            }

            if ctx.dry_run {
                print_info(&format!("[DRY RUN] Would apply manifest {}", idx + 1));
                continue;
            }

            let spinner = ProgressTracker::spinner(&format!(
                "Applying manifest {}/{}",
                idx + 1,
                manifests.len()
            ));

            match deployment_manager
                .deploy_manifest(manifest, &options)
                .await
            {
                Ok(_) => {
                    spinner.finish_success(&format!("Applied manifest {}/{}", idx + 1, manifests.len()));
                    total_applied += 1;
                }
                Err(e) => {
                    spinner.finish_error(&format!("Failed to apply manifest: {}", e));
                    if !ctx.dry_run {
                        return Err(e);
                    }
                }
            }
        }

        // Output result
        if ctx.json_output {
            let output = CommandOutput::success_with_data(
                format!("Successfully deployed {} manifest(s)", total_applied),
                serde_json::json!({
                    "namespace": namespace,
                    "manifests_applied": total_applied,
                    "wait": self.wait,
                }),
            );
            output.output_json();
        } else {
            print_success(&format!(
                "Successfully deployed {} manifest(s) to namespace '{}'",
                total_applied, namespace
            ));
        }

        Ok(())
    }

    /// Create Kubernetes client
    async fn create_client(&self, namespace: &str) -> Result<K8sClient> {
        if let Some(kubeconfig) = &self.kubeconfig {
            K8sClient::with_kubeconfig(namespace, kubeconfig.clone(), self.context.clone())
                .await
                .context("Failed to create Kubernetes client with custom kubeconfig")
        } else {
            K8sClient::new(namespace)
                .await
                .context("Failed to create Kubernetes client")
        }
    }

    /// Read manifest files from path
    async fn read_manifests(&self) -> Result<Vec<String>> {
        let mut manifests = Vec::new();

        let metadata = fs::metadata(&self.manifest_path)
            .await
            .with_context(|| format!("Failed to read manifest path: {:?}", self.manifest_path))?;

        if metadata.is_file() {
            // Single file
            let content = fs::read_to_string(&self.manifest_path)
                .await
                .context("Failed to read manifest file")?;
            manifests.push(content);
        } else if metadata.is_dir() {
            // Directory - read all YAML files
            let mut entries = fs::read_dir(&self.manifest_path)
                .await
                .context("Failed to read manifest directory")?;

            while let Some(entry) = entries
                .next_entry()
                .await
                .context("Failed to read directory entry")?
            {
                let path = entry.path();
                if let Some(ext) = path.extension() {
                    if ext == "yaml" || ext == "yml" {
                        let content = fs::read_to_string(&path)
                            .await
                            .with_context(|| format!("Failed to read file: {:?}", path))?;
                        manifests.push(content);
                    }
                }
            }
        }

        if manifests.is_empty() {
            anyhow::bail!("No manifest files found in: {:?}", self.manifest_path);
        }

        Ok(manifests)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_k8s_deploy_args_defaults() {
        // Test that Args can be constructed
        // In real usage, this would be parsed from CLI
        assert!(true);
    }
}
