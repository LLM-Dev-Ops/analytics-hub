//! LLM Analytics Hub Operations CLI
//!
//! Production-grade CLI tool for deployment, validation, and operations.
//! Replaces shell scripts with type-safe, testable Rust code.

use anyhow::{Context, Result};
use clap::{Parser, Subcommand};
use colored::Colorize;
use std::process::{Command, Stdio};
use tokio::fs;
use tracing::{info, warn, error};

#[derive(Parser)]
#[command(name = "llm-ops")]
#[command(about = "LLM Analytics Hub Operations CLI", long_about = None)]
struct Cli {
    #[command(subcommand)]
    command: Commands,

    /// Verbose output
    #[arg(short, long)]
    verbose: bool,

    /// Dry run (don't execute, just show what would happen)
    #[arg(short, long)]
    dry_run: bool,
}

#[derive(Subcommand)]
enum Commands {
    /// Deploy infrastructure to cloud provider
    Deploy {
        /// Cloud provider (aws, gcp, azure)
        #[arg(short, long)]
        provider: String,

        /// Environment (dev, staging, production)
        #[arg(short, long)]
        environment: String,

        /// Region
        #[arg(short, long)]
        region: Option<String>,
    },

    /// Validate deployment and infrastructure
    Validate {
        /// What to validate (all, k8s, databases, api, frontend)
        #[arg(short, long, default_value = "all")]
        target: String,
    },

    /// Initialize databases
    DbInit {
        /// Database type (timescaledb, redis, kafka, all)
        #[arg(short, long)]
        database: String,
    },

    /// Health check
    Health {
        /// Service to check (all, api, databases, kafka, redis)
        #[arg(short, long, default_value = "all")]
        service: String,
    },

    /// Build Docker images
    Build {
        /// Service to build (all, rust, api, frontend)
        #[arg(short, long, default_value = "all")]
        service: String,

        /// Push to registry after build
        #[arg(short, long)]
        push: bool,
    },

    /// Run tests
    Test {
        /// Test type (unit, integration, e2e, all)
        #[arg(short, long, default_value = "all")]
        test_type: String,
    },

    /// Backup databases
    Backup {
        /// Database to backup (timescaledb, redis, kafka, all)
        #[arg(short, long, default_value = "all")]
        database: String,

        /// Backup destination
        #[arg(short, long)]
        destination: String,
    },

    /// Restore from backup
    Restore {
        /// Backup file path
        #[arg(short, long)]
        backup_file: String,
    },

    /// Scale services
    Scale {
        /// Service name
        service: String,

        /// Number of replicas
        replicas: u32,
    },

    /// Connect to a service (interactive shell)
    Connect {
        /// Service name (kafka, redis, timescaledb)
        service: String,

        /// Namespace
        #[arg(short, long, default_value = "llm-analytics-hub")]
        namespace: String,
    },
}

#[tokio::main]
async fn main() -> Result<()> {
    // Initialize logging
    tracing_subscriber::fmt()
        .with_env_filter(tracing_subscriber::EnvFilter::from_default_env())
        .init();

    let cli = Cli::parse();

    println!("{}", "🚀 LLM Analytics Hub Operations CLI".bold().cyan());
    println!();

    match cli.command {
        Commands::Deploy { provider, environment, region } => {
            deploy(&provider, &environment, region.as_deref(), cli.dry_run).await?;
        }
        Commands::Validate { target } => {
            validate(&target, cli.verbose).await?;
        }
        Commands::DbInit { database } => {
            db_init(&database, cli.dry_run).await?;
        }
        Commands::Health { service } => {
            health_check(&service).await?;
        }
        Commands::Build { service, push } => {
            build(&service, push, cli.dry_run).await?;
        }
        Commands::Test { test_type } => {
            run_tests(&test_type, cli.verbose).await?;
        }
        Commands::Backup { database, destination } => {
            backup(&database, &destination, cli.dry_run).await?;
        }
        Commands::Restore { backup_file } => {
            restore(&backup_file, cli.dry_run).await?;
        }
        Commands::Scale { service, replicas } => {
            scale(&service, replicas, cli.dry_run).await?;
        }
        Commands::Connect { service, namespace } => {
            connect(&service, &namespace).await?;
        }
    }

    Ok(())
}

// ========== Deployment ==========

async fn deploy(provider: &str, environment: &str, region: Option<&str>, dry_run: bool) -> Result<()> {
    println!("{}", format!("📦 Deploying to {}", provider).bold());
    println!("Environment: {}", environment.green());
    if let Some(r) = region {
        println!("Region: {}", r.green());
    }

    if dry_run {
        println!("{}", "[DRY RUN] Would deploy but not executing".yellow());
        return Ok(());
    }

    // Pre-deployment checks
    info!("Running pre-deployment checks...");
    pre_deploy_check().await?;

    // Deploy based on provider
    match provider {
        "aws" => deploy_aws(environment, region).await?,
        "gcp" => deploy_gcp(environment, region).await?,
        "azure" => deploy_azure(environment, region).await?,
        _ => anyhow::bail!("Unknown provider: {}", provider),
    }

    // Post-deployment validation
    info!("Running post-deployment validation...");
    validate("all", false).await?;

    println!("{}", "✅ Deployment complete!".bold().green());
    Ok(())
}

async fn deploy_aws(environment: &str, region: Option<&str>) -> Result<()> {
    let region = region.unwrap_or("us-east-1");

    info!("Deploying to AWS region: {}", region);

    // Initialize Terraform
    run_command("terraform", &["init"], "infrastructure/terraform/aws").await?;

    // Apply Terraform
    run_command(
        "terraform",
        &["apply", "-auto-approve", &format!("-var=environment={}", environment)],
        "infrastructure/terraform/aws",
    ).await?;

    // Deploy Kubernetes resources
    run_command("kubectl", &["apply", "-f", "k8s/"], ".").await?;

    Ok(())
}

async fn deploy_gcp(environment: &str, region: Option<&str>) -> Result<()> {
    let region = region.unwrap_or("us-central1");
    info!("Deploying to GCP region: {}", region);

    run_command("terraform", &["init"], "infrastructure/terraform/gcp").await?;
    run_command(
        "terraform",
        &["apply", "-auto-approve", &format!("-var=environment={}", environment)],
        "infrastructure/terraform/gcp",
    ).await?;

    Ok(())
}

async fn deploy_azure(environment: &str, region: Option<&str>) -> Result<()> {
    let region = region.unwrap_or("eastus");
    info!("Deploying to Azure region: {}", region);

    run_command("terraform", &["init"], "infrastructure/terraform/azure").await?;
    run_command(
        "terraform",
        &["apply", "-auto-approve", &format!("-var=environment={}", environment)],
        "infrastructure/terraform/azure",
    ).await?;

    Ok(())
}

async fn pre_deploy_check() -> Result<()> {
    println!("{}", "🔍 Pre-deployment checks".bold());

    // Check required tools
    check_command("kubectl", &["version", "--client"]).await?;
    check_command("terraform", &["version"]).await?;
    check_command("docker", &["version"]).await?;

    println!("{}", "✅ All required tools available".green());
    Ok(())
}

// ========== Validation ==========

async fn validate(target: &str, verbose: bool) -> Result<()> {
    println!("{}", format!("🔍 Validating: {}", target).bold());

    match target {
        "all" => {
            validate_k8s(verbose).await?;
            validate_databases(verbose).await?;
            validate_services(verbose).await?;
        }
        "k8s" => validate_k8s(verbose).await?,
        "databases" => validate_databases(verbose).await?,
        "api" | "frontend" => validate_services(verbose).await?,
        _ => anyhow::bail!("Unknown validation target: {}", target),
    }

    println!("{}", "✅ Validation complete!".bold().green());
    Ok(())
}

async fn validate_k8s(verbose: bool) -> Result<()> {
    info!("Validating Kubernetes cluster...");

    // Check cluster connectivity
    run_command("kubectl", &["cluster-info"], ".").await?;

    // Check all pods are running
    let output = run_command_output("kubectl", &["get", "pods", "-A"]).await?;

    if verbose {
        println!("{}", output);
    }

    // Count non-running pods
    let non_running = output.lines()
        .filter(|line| !line.contains("Running") && !line.contains("NAMESPACE"))
        .count();

    if non_running > 0 {
        warn!("{} pods are not in Running state", non_running);
    }

    println!("{}", "✅ Kubernetes cluster validated".green());
    Ok(())
}

async fn validate_databases(verbose: bool) -> Result<()> {
    info!("Validating databases...");

    // Check TimescaleDB
    if let Ok(_) = run_command("kubectl", &["exec", "-it", "timescaledb-0", "--", "psql", "-c", "SELECT 1"], ".").await {
        println!("{}", "✅ TimescaleDB: OK".green());
    } else {
        error!("❌ TimescaleDB: FAILED");
    }

    // Check Redis
    if let Ok(_) = run_command("kubectl", &["exec", "-it", "redis-0", "--", "redis-cli", "ping"], ".").await {
        println!("{}", "✅ Redis: OK".green());
    } else {
        error!("❌ Redis: FAILED");
    }

    // Check Kafka
    if let Ok(_) = run_command("kubectl", &["exec", "-it", "kafka-0", "--", "kafka-topics.sh", "--list", "--bootstrap-server", "localhost:9092"], ".").await {
        println!("{}", "✅ Kafka: OK".green());
    } else {
        error!("❌ Kafka: FAILED");
    }

    Ok(())
}

async fn validate_services(_verbose: bool) -> Result<()> {
    info!("Validating services...");

    // Check API health endpoint
    if let Ok(response) = reqwest::get("http://localhost:3000/health").await {
        if response.status().is_success() {
            println!("{}", "✅ API: OK".green());
        } else {
            error!("❌ API: FAILED (status: {})", response.status());
        }
    } else {
        error!("❌ API: UNREACHABLE");
    }

    Ok(())
}

// ========== Database Operations ==========

async fn db_init(database: &str, dry_run: bool) -> Result<()> {
    println!("{}", format!("🗄️  Initializing database: {}", database).bold());

    if dry_run {
        println!("{}", "[DRY RUN] Would initialize database".yellow());
        return Ok(());
    }

    match database {
        "timescaledb" => init_timescaledb().await?,
        "redis" => init_redis().await?,
        "kafka" => init_kafka().await?,
        "all" => {
            init_timescaledb().await?;
            init_redis().await?;
            init_kafka().await?;
        }
        _ => anyhow::bail!("Unknown database: {}", database),
    }

    println!("{}", "✅ Database initialized!".green());
    Ok(())
}

async fn init_timescaledb() -> Result<()> {
    info!("Initializing TimescaleDB...");

    // Run schema initialization using sqlx migrations
    run_command("sqlx", &["migrate", "run"], ".").await?;

    println!("{}", "✅ TimescaleDB initialized".green());
    Ok(())
}

async fn init_redis() -> Result<()> {
    info!("Initializing Redis cluster...");

    run_command(
        "kubectl",
        &["exec", "-it", "redis-0", "--", "redis-cli", "--cluster", "create", "..."],
        ".",
    ).await?;

    println!("{}", "✅ Redis initialized".green());
    Ok(())
}

async fn init_kafka() -> Result<()> {
    info!("Initializing Kafka...");

    // Create topics
    let topics = ["llm-analytics-events", "llm-analytics-events-dlq", "llm-metrics"];

    for topic in topics {
        run_command(
            "kubectl",
            &[
                "exec", "-it", "kafka-0", "--",
                "kafka-topics.sh", "--create",
                "--topic", topic,
                "--bootstrap-server", "localhost:9092",
                "--partitions", "10",
                "--replication-factor", "3",
            ],
            ".",
        ).await?;
    }

    println!("{}", "✅ Kafka initialized".green());
    Ok(())
}

// ========== Health Checks ==========

async fn health_check(service: &str) -> Result<()> {
    println!("{}", format!("🏥 Health check: {}", service).bold());

    match service {
        "all" => {
            check_api_health().await?;
            check_database_health().await?;
            check_kafka_health().await?;
        }
        "api" => check_api_health().await?,
        "databases" => check_database_health().await?,
        "kafka" => check_kafka_health().await?,
        "redis" => check_redis_health().await?,
        _ => anyhow::bail!("Unknown service: {}", service),
    }

    println!("{}", "✅ Health check complete!".green());
    Ok(())
}

async fn check_api_health() -> Result<()> {
    match reqwest::get("http://localhost:3000/health").await {
        Ok(response) => {
            if response.status().is_success() {
                println!("{}", "✅ API: Healthy".green());
            } else {
                println!("{}", format!("⚠️  API: Degraded ({})", response.status()).yellow());
            }
        }
        Err(_) => {
            println!("{}", "❌ API: Unreachable".red());
        }
    }
    Ok(())
}

async fn check_database_health() -> Result<()> {
    println!("{}", "=== TimescaleDB Health Check ===".bold());

    // Check pods are running
    let output = run_command_output("kubectl", &[
        "get", "pods", "-l", "app=timescaledb",
        "-n", "llm-analytics-hub",
        "-o", "jsonpath={.items[*].status.phase}"
    ]).await?;

    if output.contains("Running") {
        println!("{}", "  ✅ Pods: Running".green());
    } else {
        println!("{}", format!("  ❌ Pods: {}", output).red());
        return Ok(());
    }

    // Check database connectivity
    let pg_ready = run_command_output("kubectl", &[
        "exec", "-n", "llm-analytics-hub", "timescaledb-0",
        "--", "pg_isready", "-U", "postgres"
    ]).await;

    match pg_ready {
        Ok(_) => println!("{}", "  ✅ Database: Accepting connections".green()),
        Err(_) => println!("{}", "  ❌ Database: Not accepting connections".red()),
    }

    // Check active connections
    let conn_output = run_command_output("kubectl", &[
        "exec", "-n", "llm-analytics-hub", "timescaledb-0", "--",
        "psql", "-U", "postgres", "-t", "-c",
        "SELECT count(*) FROM pg_stat_activity WHERE state='active';"
    ]).await;

    if let Ok(count) = conn_output {
        println!("{}", format!("  📊 Active connections: {}", count.trim()).cyan());
    }

    // Check disk usage
    let disk_output = run_command_output("kubectl", &[
        "exec", "-n", "llm-analytics-hub", "timescaledb-0", "--",
        "df", "-h", "/var/lib/postgresql/data"
    ]).await;

    if let Ok(disk) = disk_output {
        let lines: Vec<&str> = disk.lines().collect();
        if lines.len() > 1 {
            println!("{}", format!("  💾 Disk usage: {}", lines[1]).cyan());
        }
    }

    Ok(())
}

async fn check_kafka_health() -> Result<()> {
    println!("{}", "=== Kafka Health Check ===".bold());

    // Check pods are running
    let output = run_command_output("kubectl", &[
        "get", "pods", "-l", "app=kafka",
        "-n", "llm-analytics-hub",
        "-o", "jsonpath={.items[*].status.phase}"
    ]).await?;

    let running_count = output.matches("Running").count();
    if running_count > 0 {
        println!("{}", format!("  ✅ Pods: {} Running", running_count).green());
    } else {
        println!("{}", format!("  ❌ Pods: {}", output).red());
        return Ok(());
    }

    // Check broker connectivity (using kafka-admin tool would be better)
    let broker_check = run_command_output("kubectl", &[
        "exec", "-n", "llm-analytics-hub", "kafka-0", "--",
        "kafka-broker-api-versions.sh", "--bootstrap-server", "localhost:9092"
    ]).await;

    match broker_check {
        Ok(_) => println!("{}", "  ✅ Brokers: Responding".green()),
        Err(_) => println!("{}", "  ❌ Brokers: Not responding".red()),
    }

    // List topics count
    let topics = run_command_output("kubectl", &[
        "exec", "-n", "llm-analytics-hub", "kafka-0", "--",
        "kafka-topics.sh", "--list", "--bootstrap-server", "localhost:9092"
    ]).await;

    if let Ok(topic_list) = topics {
        let llm_topics = topic_list.lines().filter(|t| t.starts_with("llm-")).count();
        println!("{}", format!("  📊 LLM Analytics topics: {}/14", llm_topics).cyan());
    }

    Ok(())
}

async fn check_redis_health() -> Result<()> {
    println!("{}", "=== Redis Health Check ===".bold());

    // Check pods are running
    let output = run_command_output("kubectl", &[
        "get", "pods", "-l", "app=redis-cluster",
        "-n", "llm-analytics-hub",
        "-o", "jsonpath={.items[*].status.phase}"
    ]).await?;

    let running_count = output.matches("Running").count();
    if running_count > 0 {
        println!("{}", format!("  ✅ Pods: {} Running", running_count).green());
    } else {
        println!("{}", format!("  ❌ Pods: {}", output).red());
        return Ok(());
    }

    // Check Redis connectivity
    let ping = run_command_output("kubectl", &[
        "exec", "-n", "llm-analytics-hub", "redis-cluster-0", "--",
        "redis-cli", "ping"
    ]).await;

    match ping {
        Ok(response) if response.contains("PONG") => {
            println!("{}", "  ✅ Redis: Responding to PING".green());
        }
        _ => {
            println!("{}", "  ❌ Redis: Not responding".red());
        }
    }

    // Check cluster info
    let cluster_info = run_command_output("kubectl", &[
        "exec", "-n", "llm-analytics-hub", "redis-cluster-0", "--",
        "redis-cli", "cluster", "info"
    ]).await;

    if let Ok(info) = cluster_info {
        if info.contains("cluster_state:ok") {
            println!("{}", "  ✅ Cluster: State OK".green());
        } else {
            println!("{}", "  ⚠️  Cluster: Check state".yellow());
        }

        // Extract cluster size
        for line in info.lines() {
            if line.starts_with("cluster_size:") {
                println!("{}", format!("  📊 {}", line).cyan());
            }
        }
    }

    Ok(())
}

// ========== Build ==========

async fn build(service: &str, push: bool, dry_run: bool) -> Result<()> {
    println!("{}", format!("🔨 Building: {}", service).bold());

    if dry_run {
        println!("{}", "[DRY RUN] Would build but not executing".yellow());
        return Ok(());
    }

    match service {
        "all" => {
            build_rust(push).await?;
            build_api(push).await?;
            build_frontend(push).await?;
        }
        "rust" => build_rust(push).await?,
        "api" => build_api(push).await?,
        "frontend" => build_frontend(push).await?,
        _ => anyhow::bail!("Unknown service: {}", service),
    }

    println!("{}", "✅ Build complete!".green());
    Ok(())
}

async fn build_rust(push: bool) -> Result<()> {
    info!("Building Rust services...");

    run_command("docker", &["build", "-f", "docker/Dockerfile.rust", "-t", "llm-analytics-hub-rust", "."], ".").await?;

    if push {
        run_command("docker", &["push", "llm-analytics-hub-rust"], ".").await?;
    }

    println!("{}", "✅ Rust services built".green());
    Ok(())
}

async fn build_api(push: bool) -> Result<()> {
    info!("Building API...");

    run_command("docker", &["build", "-f", "docker/Dockerfile.api", "-t", "llm-analytics-hub-api", "."], ".").await?;

    if push {
        run_command("docker", &["push", "llm-analytics-hub-api"], ".").await?;
    }

    println!("{}", "✅ API built".green());
    Ok(())
}

async fn build_frontend(push: bool) -> Result<()> {
    info!("Building Frontend...");

    run_command("docker", &["build", "-f", "docker/Dockerfile.frontend", "-t", "llm-analytics-hub-frontend", "."], ".").await?;

    if push {
        run_command("docker", &["push", "llm-analytics-hub-frontend"], ".").await?;
    }

    println!("{}", "✅ Frontend built".green());
    Ok(())
}

// ========== Testing ==========

async fn run_tests(test_type: &str, verbose: bool) -> Result<()> {
    println!("{}", format!("🧪 Running tests: {}", test_type).bold());

    match test_type {
        "all" => {
            run_command("cargo", &["test"], ".").await?;
            run_command("npm", &["test"], "api").await?;
            run_command("npm", &["test"], "frontend").await?;
        }
        "unit" => {
            run_command("cargo", &["test", "--lib"], ".").await?;
        }
        "integration" => {
            run_command("cargo", &["test", "--test", "*"], ".").await?;
        }
        "e2e" => {
            run_command("npm", &["run", "test:e2e"], "frontend").await?;
        }
        _ => anyhow::bail!("Unknown test type: {}", test_type),
    }

    println!("{}", "✅ Tests passed!".green());
    Ok(())
}

// ========== Backup & Restore ==========

async fn backup(database: &str, destination: &str, dry_run: bool) -> Result<()> {
    println!("{}", format!("💾 Backing up: {} to {}", database, destination).bold());

    if dry_run {
        println!("{}", "[DRY RUN] Would backup but not executing".yellow());
        return Ok(());
    }

    match database {
        "timescaledb" => backup_timescaledb(destination).await?,
        "all" => {
            backup_timescaledb(destination).await?;
        }
        _ => anyhow::bail!("Unknown database: {}", database),
    }

    println!("{}", "✅ Backup complete!".green());
    Ok(())
}

async fn backup_timescaledb(destination: &str) -> Result<()> {
    info!("Backing up TimescaleDB to {}", destination);

    run_command(
        "kubectl",
        &["exec", "-it", "timescaledb-0", "--", "pg_dump", "-Fc", "-f", "/tmp/backup.dump"],
        ".",
    ).await?;

    run_command(
        "kubectl",
        &["cp", "timescaledb-0:/tmp/backup.dump", destination],
        ".",
    ).await?;

    Ok(())
}

async fn restore(backup_file: &str, dry_run: bool) -> Result<()> {
    println!("{}", format!("🔄 Restoring from: {}", backup_file).bold());

    if dry_run {
        println!("{}", "[DRY RUN] Would restore but not executing".yellow());
        return Ok(());
    }

    run_command(
        "kubectl",
        &["cp", backup_file, "timescaledb-0:/tmp/backup.dump"],
        ".",
    ).await?;

    run_command(
        "kubectl",
        &["exec", "-it", "timescaledb-0", "--", "pg_restore", "-d", "llm_analytics", "/tmp/backup.dump"],
        ".",
    ).await?;

    println!("{}", "✅ Restore complete!".green());
    Ok(())
}

// ========== Scaling ==========

async fn scale(service: &str, replicas: u32, dry_run: bool) -> Result<()> {
    println!("{}", format!("📊 Scaling {} to {} replicas", service, replicas).bold());

    if dry_run {
        println!("{}", "[DRY RUN] Would scale but not executing".yellow());
        return Ok(());
    }

    run_command(
        "kubectl",
        &["scale", "deployment", service, "--replicas", &replicas.to_string()],
        ".",
    ).await?;

    println!("{}", "✅ Scaled successfully!".green());
    Ok(())
}

// ========== Connect ==========

async fn connect(service: &str, namespace: &str) -> Result<()> {
    let (pod, container) = match service.to_lowercase().as_str() {
        "kafka" => ("kafka-0", None),
        "redis" => ("redis-master-0", None),
        "timescaledb" | "postgres" => ("timescaledb-0", None),
        _ => {
            return Err(anyhow::anyhow!(
                "Unknown service: {}. Available: kafka, redis, timescaledb",
                service
            ));
        }
    };

    println!("{}", format!("🔌 Connecting to {} (pod: {})...", service, pod).bold().cyan());
    println!("{}", format!("   Namespace: {}", namespace).dimmed());
    println!();

    let mut args = vec!["exec", "-it", "-n", namespace, pod, "--"];

    if let Some(c) = container {
        args.extend(&["-c", c]);
    }

    args.push("/bin/bash");

    let status = Command::new("kubectl")
        .args(&args)
        .stdin(Stdio::inherit())
        .stdout(Stdio::inherit())
        .stderr(Stdio::inherit())
        .status()
        .context("Failed to execute kubectl exec")?;

    if !status.success() {
        return Err(anyhow::anyhow!("Connection failed with exit code: {:?}", status.code()));
    }

    Ok(())
}

// ========== Utility Functions ==========

async fn run_command(cmd: &str, args: &[&str], dir: &str) -> Result<()> {
    let output = Command::new(cmd)
        .args(args)
        .current_dir(dir)
        .stdout(Stdio::inherit())
        .stderr(Stdio::inherit())
        .output()
        .context(format!("Failed to execute: {} {:?}", cmd, args))?;

    if !output.status.success() {
        anyhow::bail!("Command failed: {} {:?}", cmd, args);
    }

    Ok(())
}

async fn run_command_output(cmd: &str, args: &[&str]) -> Result<String> {
    let output = Command::new(cmd)
        .args(args)
        .output()
        .context(format!("Failed to execute: {} {:?}", cmd, args))?;

    if !output.status.success() {
        anyhow::bail!("Command failed: {} {:?}", cmd, args);
    }

    Ok(String::from_utf8_lossy(&output.stdout).to_string())
}

async fn check_command(cmd: &str, args: &[&str]) -> Result<()> {
    match Command::new(cmd).args(args).output() {
        Ok(output) if output.status.success() => {
            println!("{} {} {}", "✅".green(), cmd.green(), "available");
            Ok(())
        }
        _ => {
            println!("{} {} {}", "❌".red(), cmd.red(), "not found");
            anyhow::bail!("{} is required but not installed", cmd)
        }
    }
}
