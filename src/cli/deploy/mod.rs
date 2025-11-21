//! Deployment commands

pub mod aws;
pub mod azure;
pub mod gcp;
pub mod k8s;

use anyhow::Result;
use clap::Subcommand;

use crate::common::ExecutionContext;

/// Deploy command
#[derive(Debug, Subcommand)]
pub enum DeployCommand {
    /// Deploy to Kubernetes
    K8s(k8s::K8sDeployArgs),

    /// Deploy to AWS (EKS, RDS, ElastiCache, MSK)
    Aws(aws::AwsDeployArgs),

    /// Deploy to GCP (GKE, Cloud SQL, Memorystore, Pub/Sub)
    Gcp(gcp::GcpDeployArgs),

    /// Deploy to Azure (AKS, PostgreSQL, Redis, Event Hubs)
    Azure(azure::AzureDeployArgs),
}

impl DeployCommand {
    /// Execute the deploy command
    pub async fn execute(&self, ctx: &ExecutionContext) -> Result<()> {
        match self {
            DeployCommand::K8s(args) => args.execute(ctx).await,
            DeployCommand::Aws(args) => args.execute(ctx).await,
            DeployCommand::Gcp(args) => args.execute(ctx).await,
            DeployCommand::Azure(args) => args.execute(ctx).await,
        }
    }
}
