//! LLM Analytics Hub - Unified CLI
//!
//! Production-grade CLI tool for deployment, validation, and operations.
//! Replaces shell scripts with type-safe, testable Rust code.

use anyhow::Result;
use clap::{Parser, Subcommand};
use colored::Colorize;
use tracing_subscriber::EnvFilter;

use llm_analytics_hub::cli::{
    BenchmarkCommand, DatabaseCommand, DeployCommand, HealthCommand, KafkaCommand, RedisCommand, UtilsCommand, ValidateCommand,
};
use llm_analytics_hub::common::ExecutionContext;

#[derive(Parser)]
#[command(name = "llm-analytics")]
#[command(about = "LLM Analytics Hub - Unified Operations CLI", long_about = None)]
#[command(version, author)]
struct Cli {
    /// Verbose output
    #[arg(short, long, global = true)]
    verbose: bool,

    /// Dry run (don't execute, show what would happen)
    #[arg(short, long, global = true)]
    dry_run: bool,

    /// Output in JSON format
    #[arg(short, long, global = true)]
    json: bool,

    /// Configuration file path
    #[arg(short, long, global = true, env = "LLM_ANALYTICS_CONFIG")]
    config: Option<String>,

    #[command(subcommand)]
    command: Commands,
}

#[derive(Subcommand)]
enum Commands {
    /// Deploy infrastructure to cloud provider or Kubernetes
    Deploy {
        #[command(subcommand)]
        command: DeployCommand,
    },

    /// Database operations
    Database {
        #[command(subcommand)]
        command: DatabaseCommand,
    },

    /// Kafka operations
    Kafka {
        #[command(subcommand)]
        command: KafkaCommand,
    },

    /// Redis operations
    Redis {
        #[command(subcommand)]
        command: RedisCommand,
    },

    /// Validate deployment and infrastructure
    Validate {
        #[command(subcommand)]
        command: ValidateCommand,
    },

    /// Health checks
    Health {
        #[command(subcommand)]
        command: HealthCommand,
    },

    /// Utility commands
    Utils {
        #[command(subcommand)]
        command: UtilsCommand,
    },

    /// Run performance benchmarks
    Benchmark {
        #[command(subcommand)]
        command: BenchmarkCommand,
    },
}

#[tokio::main]
async fn main() -> Result<()> {
    // Parse CLI arguments
    let cli = Cli::parse();

    // Set up logging
    let log_level = if cli.verbose { "debug" } else { "info" };
    tracing_subscriber::fmt()
        .with_env_filter(
            EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new(log_level)),
        )
        .with_target(false)
        .without_time()
        .init();

    // Print header (unless JSON output)
    if !cli.json {
        println!(
            "{}\n",
            "LLM Analytics Hub - Operations CLI".bold().cyan()
        );
    }

    // Create execution context
    let ctx = ExecutionContext::new(cli.dry_run, cli.verbose, cli.json)?;

    // Execute command
    let result = match cli.command {
        Commands::Deploy { command } => command.execute(&ctx).await,
        Commands::Database { command } => command.execute(&ctx).await,
        Commands::Kafka { command } => command.execute(&ctx).await,
        Commands::Redis { command } => command.execute(&ctx).await,
        Commands::Validate { command } => command.execute(&ctx).await,
        Commands::Health { command } => command.execute(&ctx).await,
        Commands::Utils { command } => command.execute(&ctx).await,
        Commands::Benchmark { command } => command.execute().await,
    };

    // Handle result
    match result {
        Ok(_) => {
            if !cli.json {
                println!();
            }
            Ok(())
        }
        Err(e) => {
            if !cli.json {
                eprintln!("{} {}", "✗".red().bold(), format!("Error: {}", e).red());
                eprintln!("\n{}", "Command failed".red().bold());
            } else {
                // Output JSON error
                let error_output = serde_json::json!({
                    "success": false,
                    "error": e.to_string(),
                });
                println!("{}", serde_json::to_string_pretty(&error_output)?);
            }
            std::process::exit(1);
        }
    }
}
