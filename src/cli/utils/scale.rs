//! Scaling utilities for deployments

use anyhow::{Context, Result};
use clap::Parser;
use colored::Colorize;
use comfy_table::{presets::UTF8_FULL, Table};
use indicatif::{ProgressBar, ProgressStyle};

use crate::common::ExecutionContext;
use crate::infra::k8s::K8sClient;

/// Scale deployment arguments
#[derive(Debug, Parser)]
pub struct ScaleArgs {
    /// Deployment name to scale
    #[arg(short, long)]
    pub deployment: String,

    /// Number of replicas
    #[arg(short, long)]
    pub replicas: i32,

    /// Kubernetes namespace
    #[arg(short = 'n', long, default_value = "llm-analytics-hub")]
    pub namespace: String,

    /// Wait for scaling to complete
    #[arg(short, long)]
    pub wait: bool,

    /// Timeout in seconds (when waiting)
    #[arg(long, default_value = "300")]
    pub timeout: u64,

    /// Scale all deployments in namespace
    #[arg(long)]
    pub all: bool,
}

impl ScaleArgs {
    /// Execute scale command
    pub async fn execute(&self, ctx: &ExecutionContext) -> Result<()> {
        if !ctx.json_output {
            println!("{}", "=== Scale Deployments ===".bold().cyan());
            println!();
        }

        // Validate replicas
        if self.replicas < 0 {
            anyhow::bail!("Replicas must be non-negative, got: {}", self.replicas);
        }

        if ctx.dry_run {
            if ctx.json_output {
                let output = serde_json::json!({
                    "dry_run": true,
                    "deployment": self.deployment,
                    "namespace": self.namespace,
                    "replicas": self.replicas,
                    "all": self.all,
                });
                println!("{}", serde_json::to_string_pretty(&output)?);
            } else {
                println!("{}", "DRY RUN MODE".yellow().bold());
                if self.all {
                    println!("Would scale all deployments to {} replicas", self.replicas);
                } else {
                    println!(
                        "Would scale deployment '{}' to {} replicas",
                        self.deployment, self.replicas
                    );
                }
                println!("Namespace: {}", self.namespace);
            }
            return Ok(());
        }

        // Create K8s client
        let k8s_client = K8sClient::new(&self.namespace).await?;

        // Show progress
        let spinner = if !ctx.json_output {
            let pb = ProgressBar::new_spinner();
            pb.set_style(
                ProgressStyle::default_spinner()
                    .template("{spinner:.cyan} {msg}")
                    .unwrap(),
            );
            if self.all {
                pb.set_message("Scaling all deployments...");
            } else {
                pb.set_message(format!("Scaling deployment '{}'...", self.deployment));
            }
            pb.enable_steady_tick(std::time::Duration::from_millis(100));
            Some(pb)
        } else {
            None
        };

        // Scale deployments
        let results = if self.all {
            k8s_client.scale_all_deployments(self.replicas).await?
        } else {
            let result = k8s_client
                .scale_deployment(&self.deployment, self.replicas)
                .await?;
            vec![result]
        };

        // Wait for scaling if requested
        if self.wait {
            if let Some(ref spinner) = spinner {
                spinner.set_message("Waiting for scaling to complete...");
            }

            for deployment_name in &results {
                k8s_client
                    .wait_for_deployment(deployment_name, self.timeout)
                    .await?;
            }
        }

        if let Some(spinner) = spinner {
            spinner.finish_and_clear();
        }

        // Output results
        if ctx.json_output {
            let output = serde_json::json!({
                "success": true,
                "deployments_scaled": results,
                "replicas": self.replicas,
                "namespace": self.namespace,
            });
            println!("{}", serde_json::to_string_pretty(&output)?);
        } else {
            println!("{} Scaling completed successfully", "✓".green().bold());
            println!();

            let mut table = Table::new();
            table.load_preset(UTF8_FULL);
            table.set_header(vec!["Deployment", "Replicas", "Status"]);

            for deployment in &results {
                table.add_row(vec![
                    deployment.clone(),
                    self.replicas.to_string(),
                    if self.wait { "Ready" } else { "Scaling" }.to_string(),
                ]);
            }

            println!("{table}");
        }

        Ok(())
    }
}
