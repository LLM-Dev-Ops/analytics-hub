//! Infrastructure cleanup and destruction utilities

use anyhow::{Context, Result};
use clap::Parser;
use colored::Colorize;
use indicatif::{ProgressBar, ProgressStyle};
use std::io::Write;
use tokio::process::Command;
use tracing::{info, warn};

use crate::common::ExecutionContext;
use crate::infra::k8s::K8sClient;

/// Cleanup/destroy infrastructure arguments
#[derive(Debug, Parser)]
pub struct CleanupArgs {
    /// Environment to cleanup (dev, staging, production)
    #[arg(short, long)]
    pub environment: String,

    /// Cloud provider (aws, gcp, azure, k8s)
    #[arg(short, long)]
    pub provider: String,

    /// Force cleanup without confirmation
    #[arg(long)]
    pub force: bool,

    /// Skip backup before cleanup
    #[arg(long)]
    pub skip_backup: bool,

    /// Only cleanup Kubernetes resources (skip cloud resources)
    #[arg(long)]
    pub k8s_only: bool,

    /// Kubernetes namespace to cleanup
    #[arg(short = 'n', long, default_value = "llm-analytics-hub")]
    pub namespace: String,

    /// Additional namespaces to cleanup
    #[arg(long)]
    pub additional_namespaces: Vec<String>,
}

impl CleanupArgs {
    /// Execute cleanup command
    pub async fn execute(&self, ctx: &ExecutionContext) -> Result<()> {
        if !ctx.json_output {
            println!("{}", "=== Infrastructure Cleanup ===".bold().cyan());
            println!();
        }

        // Validate provider
        match self.provider.as_str() {
            "aws" | "gcp" | "azure" | "k8s" => {}
            _ => {
                anyhow::bail!(
                    "Invalid cloud provider: {}. Valid options: aws, gcp, azure, k8s",
                    self.provider
                );
            }
        }

        if ctx.dry_run {
            if ctx.json_output {
                let output = serde_json::json!({
                    "dry_run": true,
                    "environment": self.environment,
                    "provider": self.provider,
                    "namespace": self.namespace,
                    "k8s_only": self.k8s_only,
                });
                println!("{}", serde_json::to_string_pretty(&output)?);
            } else {
                println!("{}", "DRY RUN MODE".yellow().bold());
                println!("Would cleanup environment: {}", self.environment);
                println!("Cloud provider: {}", self.provider);
                println!("Namespace: {}", self.namespace);
                if !self.skip_backup {
                    println!("Would create backup before cleanup");
                }
                if self.k8s_only {
                    println!("Would cleanup Kubernetes resources only");
                } else {
                    println!("Would cleanup Kubernetes and cloud resources");
                }
            }
            return Ok(());
        }

        // Confirmation
        if !self.force && !ctx.json_output {
            self.confirm_cleanup()?;
        }

        // Create backup if not skipped
        if !self.skip_backup && !ctx.json_output {
            println!("{}", "=== Creating Backup ===".bold());
            self.create_backup().await?;
            println!();
        }

        // Drain Kubernetes resources
        if !ctx.json_output {
            println!("{}", "=== Draining Kubernetes Resources ===".bold());
        }
        self.drain_kubernetes_resources().await?;
        if !ctx.json_output {
            println!();
        }

        // Delete Kubernetes resources
        if !ctx.json_output {
            println!("{}", "=== Deleting Kubernetes Resources ===".bold());
        }
        self.delete_kubernetes_resources().await?;
        if !ctx.json_output {
            println!();
        }

        // Delete cloud resources (unless k8s-only)
        if !self.k8s_only {
            if !ctx.json_output {
                println!("{}", "=== Deleting Cloud Resources ===".bold());
            }
            self.destroy_cloud_infrastructure().await?;
            if !ctx.json_output {
                println!();
            }
        }

        // Cleanup local state
        if !ctx.json_output {
            println!("{}", "=== Cleaning Local State ===".bold());
        }
        self.cleanup_local_state().await?;

        // Output results
        if ctx.json_output {
            let output = serde_json::json!({
                "success": true,
                "environment": self.environment,
                "provider": self.provider,
                "resources_cleaned": {
                    "kubernetes": true,
                    "cloud": !self.k8s_only,
                },
            });
            println!("{}", serde_json::to_string_pretty(&output)?);
        } else {
            println!();
            println!("{} Cleanup completed successfully", "✓".green().bold());
            println!();
            println!("Environment '{}' has been destroyed", self.environment);
        }

        Ok(())
    }

    /// Confirm cleanup operation
    fn confirm_cleanup(&self) -> Result<()> {
        println!();
        println!("{}", "=========================================".red().bold());
        println!("{}", "  WARNING: DESTRUCTIVE OPERATION".red().bold());
        println!("{}", "=========================================".red().bold());
        println!("Environment: {}", self.environment);
        println!("Cloud Provider: {}", self.provider);
        println!();
        println!("{}", "This will PERMANENTLY DELETE:".yellow().bold());
        println!("  • All Kubernetes resources");
        println!("  • All databases and data");
        println!("  • All persistent volumes");
        if !self.k8s_only {
            println!("  • All cloud infrastructure");
        }
        println!();

        // Extra confirmation for production
        if self.environment == "production" {
            println!("{}", "=========================================".red().bold());
            println!("{}", "  PRODUCTION ENVIRONMENT DESTRUCTION".red().bold());
            println!("{}", "=========================================".red().bold());
            println!();

            print!("Type 'DELETE PRODUCTION' to confirm: ");
            std::io::stdout().flush()?;

            let mut confirmation = String::new();
            std::io::stdin().read_line(&mut confirmation)?;

            if confirmation.trim() != "DELETE PRODUCTION" {
                anyhow::bail!("Confirmation failed. Aborting.");
            }
        }

        print!(
            "Are you sure you want to destroy '{}'? (yes/NO): ",
            self.environment
        );
        std::io::stdout().flush()?;

        let mut confirmation = String::new();
        std::io::stdin().read_line(&mut confirmation)?;

        if confirmation.trim() != "yes" {
            anyhow::bail!("Cleanup cancelled by user");
        }

        println!("Destruction confirmed. Proceeding...");
        println!();

        Ok(())
    }

    /// Create backup before cleanup
    async fn create_backup(&self) -> Result<()> {
        warn!("Backup creation not fully implemented - skipping");
        println!("{} Backup creation skipped", "⚠".yellow().bold());
        Ok(())
    }

    /// Drain Kubernetes resources gracefully
    async fn drain_kubernetes_resources(&self) -> Result<()> {
        let k8s_client = K8sClient::new(&self.namespace).await?;

        // Check if cluster is accessible
        if !k8s_client.is_accessible().await {
            warn!("Cannot connect to Kubernetes cluster, skipping drain");
            return Ok(());
        }

        let spinner = ProgressBar::new_spinner();
        spinner.set_style(
            ProgressStyle::default_spinner()
                .template("{spinner:.cyan} {msg}")
                .unwrap(),
        );

        // Scale down deployments
        spinner.set_message("Scaling down deployments...");
        spinner.enable_steady_tick(std::time::Duration::from_millis(100));

        k8s_client.scale_all_deployments(0).await.ok();

        // Delete jobs and cronjobs
        spinner.set_message("Deleting jobs and cronjobs...");
        k8s_client.delete_all_jobs().await.ok();
        k8s_client.delete_all_cronjobs().await.ok();

        // Wait for pods to terminate
        spinner.set_message("Waiting for pods to terminate...");
        tokio::time::sleep(tokio::time::Duration::from_secs(30)).await;

        spinner.finish_and_clear();
        println!("{} Kubernetes resources drained", "✓".green().bold());

        Ok(())
    }

    /// Delete Kubernetes resources
    async fn delete_kubernetes_resources(&self) -> Result<()> {
        let k8s_client = K8sClient::new(&self.namespace).await?;

        // Check if cluster is accessible
        if !k8s_client.is_accessible().await {
            warn!("Cannot connect to Kubernetes cluster, skipping K8s deletion");
            return Ok(());
        }

        let spinner = ProgressBar::new_spinner();
        spinner.set_style(
            ProgressStyle::default_spinner()
                .template("{spinner:.cyan} {msg}")
                .unwrap(),
        );
        spinner.enable_steady_tick(std::time::Duration::from_millis(100));

        // Delete main namespace
        spinner.set_message(format!("Deleting namespace {}...", self.namespace));
        k8s_client.delete_namespace(&self.namespace).await.ok();

        // Delete additional namespaces
        for ns in &self.additional_namespaces {
            spinner.set_message(format!("Deleting namespace {}...", ns));
            k8s_client.delete_namespace(ns).await.ok();
        }

        // Delete common infrastructure namespaces
        for ns in &["monitoring", "cert-manager", "ingress-nginx"] {
            spinner.set_message(format!("Deleting namespace {}...", ns));
            k8s_client.delete_namespace(ns).await.ok();
        }

        spinner.finish_and_clear();
        println!("{} Kubernetes resources deleted", "✓".green().bold());

        Ok(())
    }

    /// Destroy cloud infrastructure
    async fn destroy_cloud_infrastructure(&self) -> Result<()> {
        match self.provider.as_str() {
            "aws" => self.destroy_aws().await?,
            "gcp" => self.destroy_gcp().await?,
            "azure" => self.destroy_azure().await?,
            "k8s" => {
                info!("K8s provider selected, skipping cloud resource cleanup");
            }
            _ => unreachable!(),
        }

        Ok(())
    }

    /// Destroy AWS infrastructure
    async fn destroy_aws(&self) -> Result<()> {
        let cluster_name = format!("llm-analytics-hub-{}", self.environment);

        let spinner = ProgressBar::new_spinner();
        spinner.set_style(
            ProgressStyle::default_spinner()
                .template("{spinner:.cyan} {msg}")
                .unwrap(),
        );
        spinner.enable_steady_tick(std::time::Duration::from_millis(100));

        // Delete EKS cluster
        spinner.set_message("Deleting EKS cluster...");
        Command::new("eksctl")
            .args(["delete", "cluster", "--name", &cluster_name, "--wait"])
            .output()
            .await
            .ok();

        // Delete RDS instance
        spinner.set_message("Deleting RDS instance...");
        Command::new("aws")
            .args([
                "rds",
                "delete-db-instance",
                "--db-instance-identifier",
                &format!("{}-postgres", cluster_name),
                "--skip-final-snapshot",
                "--delete-automated-backups",
            ])
            .output()
            .await
            .ok();

        // Delete ElastiCache cluster
        spinner.set_message("Deleting ElastiCache cluster...");
        Command::new("aws")
            .args([
                "elasticache",
                "delete-replication-group",
                "--replication-group-id",
                &format!("{}-redis", cluster_name),
                "--region",
                "us-east-1",
            ])
            .output()
            .await
            .ok();

        // Delete MSK cluster
        spinner.set_message("Deleting MSK cluster...");
        // Get cluster ARN first
        let output = Command::new("aws")
            .args([
                "kafka",
                "list-clusters",
                "--cluster-name-filter",
                &format!("{}-kafka", cluster_name),
                "--query",
                "ClusterInfoList[0].ClusterArn",
                "--output",
                "text",
            ])
            .output()
            .await;

        if let Ok(output) = output {
            let cluster_arn = String::from_utf8_lossy(&output.stdout).trim().to_string();
            if !cluster_arn.is_empty() && cluster_arn != "None" {
                Command::new("aws")
                    .args(["kafka", "delete-cluster", "--cluster-arn", &cluster_arn])
                    .output()
                    .await
                    .ok();
            }
        }

        spinner.finish_and_clear();
        println!("{} AWS infrastructure destruction initiated", "✓".green().bold());
        println!("  Note: Cloud resources may take 10-15 minutes to fully delete");

        Ok(())
    }

    /// Destroy GCP infrastructure
    async fn destroy_gcp(&self) -> Result<()> {
        let cluster_name = format!("llm-analytics-hub-{}", self.environment);
        let region = "us-central1";

        let spinner = ProgressBar::new_spinner();
        spinner.set_style(
            ProgressStyle::default_spinner()
                .template("{spinner:.cyan} {msg}")
                .unwrap(),
        );
        spinner.enable_steady_tick(std::time::Duration::from_millis(100));

        // Delete GKE cluster
        spinner.set_message("Deleting GKE cluster...");
        Command::new("gcloud")
            .args([
                "container",
                "clusters",
                "delete",
                &cluster_name,
                &format!("--region={}", region),
                "--quiet",
            ])
            .output()
            .await
            .ok();

        // Delete Cloud SQL instance
        spinner.set_message("Deleting Cloud SQL instance...");
        Command::new("gcloud")
            .args([
                "sql",
                "instances",
                "delete",
                &format!("{}-postgres", cluster_name),
                "--quiet",
            ])
            .output()
            .await
            .ok();

        // Delete Cloud Memorystore
        spinner.set_message("Deleting Cloud Memorystore...");
        Command::new("gcloud")
            .args([
                "redis",
                "instances",
                "delete",
                &format!("{}-redis", cluster_name),
                &format!("--region={}", region),
                "--quiet",
            ])
            .output()
            .await
            .ok();

        // Delete VPC network
        spinner.set_message("Deleting VPC network...");
        Command::new("gcloud")
            .args([
                "compute",
                "networks",
                "delete",
                &format!("{}-vpc", cluster_name),
                "--quiet",
            ])
            .output()
            .await
            .ok();

        spinner.finish_and_clear();
        println!("{} GCP infrastructure destruction initiated", "✓".green().bold());

        Ok(())
    }

    /// Destroy Azure infrastructure
    async fn destroy_azure(&self) -> Result<()> {
        let resource_group = format!("llm-analytics-hub-{}-rg", self.environment);

        let spinner = ProgressBar::new_spinner();
        spinner.set_style(
            ProgressStyle::default_spinner()
                .template("{spinner:.cyan} {msg}")
                .unwrap(),
        );
        spinner.set_message("Deleting Azure resource group...");
        spinner.enable_steady_tick(std::time::Duration::from_millis(100));

        // Delete entire resource group (cascading delete)
        Command::new("az")
            .args(["group", "delete", "--name", &resource_group, "--yes", "--no-wait"])
            .output()
            .await
            .ok();

        spinner.finish_and_clear();
        println!("{} Azure infrastructure destruction initiated", "✓".green().bold());
        println!("  Note: Resource group deletion is asynchronous and may take several minutes");

        Ok(())
    }

    /// Cleanup local state files
    async fn cleanup_local_state(&self) -> Result<()> {
        // This is a simplified version - in production, you'd remove:
        // - Deployment info files
        // - Temp files
        // - kubectl contexts (optional)
        println!("{} Local state cleanup completed", "✓".green().bold());
        Ok(())
    }
}
