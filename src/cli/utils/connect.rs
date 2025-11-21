//! Interactive database connection utilities

use anyhow::{Context, Result};
use clap::{Parser, ValueEnum};
use colored::Colorize;
use tokio::process::Command;
use tracing::info;

use crate::common::ExecutionContext;
use crate::infra::k8s::K8sClient;

/// Database type for connection
#[derive(Debug, Clone, Copy, ValueEnum)]
pub enum DatabaseType {
    /// TimescaleDB (PostgreSQL)
    Timescaledb,
    /// Redis
    Redis,
    /// Kafka
    Kafka,
}

/// Connect to database arguments
#[derive(Debug, Parser)]
pub struct ConnectArgs {
    /// Database type to connect to
    #[arg(value_enum)]
    pub database: DatabaseType,

    /// Kubernetes namespace
    #[arg(short = 'n', long, default_value = "llm-analytics-hub")]
    pub namespace: String,

    /// Pod name (optional, will auto-detect if not specified)
    #[arg(short, long)]
    pub pod: Option<String>,

    /// Database name (for TimescaleDB)
    #[arg(short = 'd', long)]
    pub db_name: Option<String>,

    /// Database user (for TimescaleDB)
    #[arg(short, long)]
    pub user: Option<String>,
}

impl ConnectArgs {
    /// Execute connect command
    pub async fn execute(&self, ctx: &ExecutionContext) -> Result<()> {
        if ctx.json_output {
            anyhow::bail!("Interactive connection not supported in JSON mode");
        }

        if ctx.dry_run {
            println!("{}", "DRY RUN MODE".yellow().bold());
            println!("Would connect to: {:?}", self.database);
            println!("Namespace: {}", self.namespace);
            if let Some(pod) = &self.pod {
                println!("Pod: {}", pod);
            }
            return Ok(());
        }

        // Create K8s client
        let k8s_client = K8sClient::new(&self.namespace).await?;

        // Determine pod name
        let pod_name = if let Some(pod) = &self.pod {
            pod.clone()
        } else {
            self.find_pod(&k8s_client).await?
        };

        // Connect based on database type
        match self.database {
            DatabaseType::Timescaledb => self.connect_timescaledb(&pod_name).await?,
            DatabaseType::Redis => self.connect_redis(&pod_name).await?,
            DatabaseType::Kafka => self.connect_kafka(&pod_name).await?,
        }

        Ok(())
    }

    /// Find pod for the database type
    async fn find_pod(&self, k8s_client: &K8sClient) -> Result<String> {
        info!("Auto-detecting pod for {:?}...", self.database);

        let pods = k8s_client.list_pods_in_namespace(&self.namespace).await?;

        let pod_prefix = match self.database {
            DatabaseType::Timescaledb => "timescaledb",
            DatabaseType::Redis => "redis",
            DatabaseType::Kafka => "kafka",
        };

        for pod in pods {
            if let Some(name) = pod.metadata.name {
                if name.starts_with(pod_prefix) {
                    info!("Found pod: {}", name);
                    return Ok(name);
                }
            }
        }

        anyhow::bail!(
            "No pod found for {:?}. Specify pod name with --pod",
            self.database
        )
    }

    /// Connect to TimescaleDB
    async fn connect_timescaledb(&self, pod_name: &str) -> Result<()> {
        let database = self.db_name.as_deref().unwrap_or("llm_analytics");
        let user = self.user.as_deref().unwrap_or("postgres");

        println!("{}", "=== Connecting to TimescaleDB ===".bold().cyan());
        println!("Pod: {}", pod_name);
        println!("Database: {}", database);
        println!("User: {}", user);
        println!();

        let status = Command::new("kubectl")
            .args([
                "exec",
                "-it",
                "-n",
                &self.namespace,
                pod_name,
                "--",
                "psql",
                "-U",
                user,
                "-d",
                database,
            ])
            .status()
            .await
            .context("Failed to execute kubectl exec")?;

        if !status.success() {
            anyhow::bail!("Connection to TimescaleDB failed");
        }

        Ok(())
    }

    /// Connect to Redis
    async fn connect_redis(&self, pod_name: &str) -> Result<()> {
        println!("{}", "=== Connecting to Redis ===".bold().cyan());
        println!("Pod: {}", pod_name);
        println!();

        // Get Redis password from secret
        let password_output = Command::new("kubectl")
            .args([
                "get",
                "secret",
                "analytics-hub-secrets",
                "-n",
                &self.namespace,
                "-o",
                "jsonpath={.data.REDIS_PASSWORD}",
            ])
            .output()
            .await
            .context("Failed to get Redis password from secret")?;

        if !password_output.status.success() {
            println!(
                "{} Could not retrieve Redis password from secret",
                "⚠".yellow().bold()
            );
            println!("  Attempting connection without password...");

            // Try without password
            let status = Command::new("kubectl")
                .args([
                    "exec",
                    "-it",
                    "-n",
                    &self.namespace,
                    pod_name,
                    "--",
                    "redis-cli",
                ])
                .status()
                .await
                .context("Failed to execute kubectl exec")?;

            if !status.success() {
                anyhow::bail!("Connection to Redis failed");
            }

            return Ok(());
        }

        // Decode base64 password using bash and base64
        let encoded_password = String::from_utf8_lossy(&password_output.stdout).trim().to_string();
        let password_decode = Command::new("bash")
            .arg("-c")
            .arg(format!("echo {} | base64 -d", encoded_password))
            .output()
            .await;

        let password = if let Ok(output) = password_decode {
            if output.status.success() {
                String::from_utf8_lossy(&output.stdout).trim().to_string()
            } else {
                // Fallback: use encoded password as-is
                encoded_password
            }
        } else {
            // Fallback: use encoded password as-is
            encoded_password
        };

        // Connect with password
        let status = Command::new("kubectl")
            .args([
                "exec",
                "-it",
                "-n",
                &self.namespace,
                pod_name,
                "--",
                "redis-cli",
                "--pass",
                password.as_ref(),
            ])
            .status()
            .await
            .context("Failed to execute kubectl exec")?;

        if !status.success() {
            anyhow::bail!("Connection to Redis failed");
        }

        Ok(())
    }

    /// Connect to Kafka
    async fn connect_kafka(&self, pod_name: &str) -> Result<()> {
        println!("{}", "=== Connecting to Kafka ===".bold().cyan());
        println!("Pod: {}", pod_name);
        println!();
        println!(
            "You will be dropped into a shell in the Kafka pod."
        );
        println!("Useful commands:");
        println!("  kafka-topics.sh --list --bootstrap-server localhost:9092");
        println!("  kafka-console-consumer.sh --bootstrap-server localhost:9092 --topic <topic>");
        println!("  kafka-console-producer.sh --bootstrap-server localhost:9092 --topic <topic>");
        println!();

        let status = Command::new("kubectl")
            .args(["exec", "-it", "-n", &self.namespace, pod_name, "--", "/bin/bash"])
            .status()
            .await
            .context("Failed to execute kubectl exec")?;

        if !status.success() {
            anyhow::bail!("Connection to Kafka failed");
        }

        Ok(())
    }
}
