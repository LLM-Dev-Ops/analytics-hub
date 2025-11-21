//! GCP deployment command

use anyhow::Result;
use clap::Args;
use std::path::PathBuf;
use tracing::info;

use crate::common::{
    output::{print_header, print_success, CommandOutput, FormattedTable},
    ExecutionContext,
};
use crate::infra::cloud::{CloudDeploymentConfig, CloudProvider, CloudProviderOps, GcpProvider};

/// GCP deployment arguments
#[derive(Debug, Args)]
pub struct GcpDeployArgs {
    /// Environment (dev, staging, production)
    #[arg(short, long)]
    pub environment: String,

    /// GCP Region
    #[arg(short, long, default_value = "us-central1")]
    pub region: String,

    /// GCP Project ID
    #[arg(short, long, env = "GCP_PROJECT")]
    pub project: Option<String>,

    /// Cluster name (defaults to llm-analytics-{environment})
    #[arg(short, long)]
    pub cluster_name: Option<String>,

    /// Terraform directory
    #[arg(long, default_value = "infrastructure/terraform/gcp")]
    pub terraform_dir: PathBuf,

    /// Skip database deployment
    #[arg(long)]
    pub skip_databases: bool,

    /// Skip monitoring setup
    #[arg(long)]
    pub skip_monitoring: bool,
}

impl GcpDeployArgs {
    /// Execute GCP deployment
    pub async fn execute(&self, ctx: &ExecutionContext) -> Result<()> {
        print_header(&format!("GCP Deployment - {}", self.environment));

        // Verify project is set
        if self.project.is_none() {
            anyhow::bail!("GCP project ID required. Set --project or GCP_PROJECT environment variable");
        }

        // Create deployment configuration
        let mut config = CloudDeploymentConfig::new(
            CloudProvider::GCP,
            &self.environment,
            &self.region,
        );

        if let Some(name) = &self.cluster_name {
            config.cluster_name = name.clone();
        }

        config.deploy_databases = !self.skip_databases;
        config.enable_monitoring = !self.skip_monitoring;

        // Add labels (GCP uses labels instead of tags)
        config = config
            .with_tag("environment", &self.environment)
            .with_tag("managed-by", "llm-analytics-cli")
            .with_tag("project", "llm-analytics-hub");

        info!("Deploying to GCP: {}", config.cluster_name);
        info!("Project: {}", self.project.as_ref().unwrap());
        info!("Region: {}", config.region);
        info!("Databases: {}", config.deploy_databases);
        info!("Monitoring: {}", config.enable_monitoring);

        // Create GCP provider
        let provider = GcpProvider::new(&self.terraform_dir);

        // Execute deployment
        let result = ctx
            .execute(
                provider.deploy(&config),
                &format!("Deploy to GCP {} in {}", config.cluster_name, config.region),
            )
            .await?;

        // Display results
        if ctx.json_output {
            let output = CommandOutput::success_with_data(
                "GCP deployment completed",
                serde_json::to_value(&result)?,
            );
            output.output_json();
        } else {
            println!();
            print_success(&format!(
                "GCP deployment completed: {}",
                config.cluster_name
            ));

            if let Some(endpoint) = &result.cluster_endpoint {
                println!("\nCluster Endpoint: {}", endpoint);
            }

            println!("\n=== Deployed Resources ===");
            let mut table = FormattedTable::new(vec!["Type", "Name", "ID", "Endpoint"]);

            for resource in &result.resources {
                table.add_row(vec![
                    resource.resource_type.clone(),
                    resource.name.clone(),
                    resource.id.clone(),
                    resource
                        .endpoint
                        .clone()
                        .unwrap_or_else(|| "N/A".to_string()),
                ]);
            }

            table.print();

            println!("\nNext steps:");
            println!("  1. Verify cluster: kubectl get nodes");
            println!("  2. Deploy applications: llm-analytics deploy k8s");
            println!("  3. Validate: llm-analytics validate all");
        }

        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_gcp_deploy_args() {
        // Test construction
        assert!(true);
    }
}
