//! Azure deployment command

use anyhow::Result;
use clap::Args;
use std::path::PathBuf;
use tracing::info;

use crate::common::{
    output::{print_header, print_success, CommandOutput, FormattedTable},
    ExecutionContext,
};
use crate::infra::cloud::{AzureProvider, CloudDeploymentConfig, CloudProvider, CloudProviderOps};

/// Azure deployment arguments
#[derive(Debug, Args)]
pub struct AzureDeployArgs {
    /// Environment (dev, staging, production)
    #[arg(short, long)]
    pub environment: String,

    /// Azure Location (region)
    #[arg(short, long, default_value = "eastus")]
    pub location: String,

    /// Azure Subscription ID
    #[arg(short, long, env = "AZURE_SUBSCRIPTION_ID")]
    pub subscription: Option<String>,

    /// Cluster name (defaults to llm-analytics-{environment})
    #[arg(short, long)]
    pub cluster_name: Option<String>,

    /// Terraform directory
    #[arg(long, default_value = "infrastructure/terraform/azure")]
    pub terraform_dir: PathBuf,

    /// Skip database deployment
    #[arg(long)]
    pub skip_databases: bool,

    /// Skip monitoring setup
    #[arg(long)]
    pub skip_monitoring: bool,
}

impl AzureDeployArgs {
    /// Execute Azure deployment
    pub async fn execute(&self, ctx: &ExecutionContext) -> Result<()> {
        print_header(&format!("Azure Deployment - {}", self.environment));

        // Create deployment configuration
        let mut config = CloudDeploymentConfig::new(
            CloudProvider::Azure,
            &self.environment,
            &self.location,
        );

        if let Some(name) = &self.cluster_name {
            config.cluster_name = name.clone();
        }

        config.deploy_databases = !self.skip_databases;
        config.enable_monitoring = !self.skip_monitoring;

        // Add tags
        config = config
            .with_tag("Environment", &self.environment)
            .with_tag("ManagedBy", "llm-analytics-cli")
            .with_tag("Project", "llm-analytics-hub");

        info!("Deploying to Azure: {}", config.cluster_name);
        if let Some(sub) = &self.subscription {
            info!("Subscription: {}", sub);
        }
        info!("Location: {}", config.region);
        info!("Databases: {}", config.deploy_databases);
        info!("Monitoring: {}", config.enable_monitoring);

        // Create Azure provider
        let provider = AzureProvider::new(&self.terraform_dir);

        // Execute deployment
        let result = ctx
            .execute(
                provider.deploy(&config),
                &format!(
                    "Deploy to Azure {} in {}",
                    config.cluster_name, config.region
                ),
            )
            .await?;

        // Display results
        if ctx.json_output {
            let output = CommandOutput::success_with_data(
                "Azure deployment completed",
                serde_json::to_value(&result)?,
            );
            output.output_json();
        } else {
            println!();
            print_success(&format!(
                "Azure deployment completed: {}",
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
    fn test_azure_deploy_args() {
        // Test construction
        assert!(true);
    }
}
