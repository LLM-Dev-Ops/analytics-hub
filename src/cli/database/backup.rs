//! Database backup CLI commands

use anyhow::{Context, Result};
use clap::Parser;
use colored::Colorize;
use comfy_table::{presets::UTF8_FULL, Table};
use indicatif::{ProgressBar, ProgressStyle};

use crate::common::ExecutionContext;
use crate::infra::backup::{BackupConfig, BackupType, TimescaleBackupManager};

/// Backup database arguments
#[derive(Debug, Parser)]
pub struct BackupArgs {
    /// Database name to backup
    #[arg(short, long, default_value = "llm_analytics")]
    pub database: String,

    /// Kubernetes namespace
    #[arg(short = 'n', long, default_value = "llm-analytics-hub")]
    pub namespace: String,

    /// Backup type (full, incremental)
    #[arg(short = 't', long, default_value = "full")]
    pub backup_type: String,

    /// S3 bucket name
    #[arg(long, env = "BACKUP_S3_BUCKET")]
    pub s3_bucket: Option<String>,

    /// S3 prefix/path
    #[arg(long, env = "BACKUP_S3_PREFIX", default_value = "timescaledb")]
    pub s3_prefix: String,

    /// AWS region
    #[arg(long, env = "AWS_REGION", default_value = "us-east-1")]
    pub aws_region: String,

    /// Disable encryption
    #[arg(long)]
    pub no_encryption: bool,

    /// Disable compression
    #[arg(long)]
    pub no_compression: bool,

    /// Retention days for backups
    #[arg(long, default_value = "30")]
    pub retention_days: u32,
}

impl BackupArgs {
    /// Execute backup command
    pub async fn execute(&self, ctx: &ExecutionContext) -> Result<()> {
        if !ctx.json_output {
            println!("{}", "=== Database Backup ===".bold().cyan());
            println!();
        }

        // Parse backup type
        let backup_type = match self.backup_type.to_lowercase().as_str() {
            "full" => BackupType::Full,
            "incremental" => BackupType::Incremental,
            "differential" => BackupType::Differential,
            _ => anyhow::bail!("Invalid backup type: {}", self.backup_type),
        };

        // Create backup config
        let s3_bucket = self
            .s3_bucket
            .clone()
            .unwrap_or_else(|| "llm-analytics-backups".to_string());

        let config = BackupConfig {
            s3_bucket,
            s3_prefix: self.s3_prefix.clone(),
            aws_region: self.aws_region.clone(),
            encryption: !self.no_encryption,
            compression: !self.no_compression,
            retention_days: self.retention_days,
        };

        if ctx.dry_run {
            if ctx.json_output {
                let output = serde_json::json!({
                    "dry_run": true,
                    "database": self.database,
                    "namespace": self.namespace,
                    "backup_type": format!("{:?}", backup_type),
                    "config": config,
                });
                println!("{}", serde_json::to_string_pretty(&output)?);
            } else {
                println!("{}", "DRY RUN MODE".yellow().bold());
                println!("Would create {:?} backup for database: {}", backup_type, self.database);
                println!("Namespace: {}", self.namespace);
                println!("S3 Bucket: {}", config.s3_bucket);
                println!("S3 Prefix: {}", config.s3_prefix);
                println!("Encryption: {}", config.encryption);
                println!("Compression: {}", config.compression);
            }
            return Ok(());
        }

        // Create backup manager
        let manager = TimescaleBackupManager::new(&self.namespace, config).await?;

        // Show progress
        let spinner = if !ctx.json_output {
            let pb = ProgressBar::new_spinner();
            pb.set_style(
                ProgressStyle::default_spinner()
                    .template("{spinner:.cyan} {msg}")
                    .unwrap(),
            );
            pb.set_message(format!(
                "Creating {:?} backup for database: {}",
                backup_type, self.database
            ));
            pb.enable_steady_tick(std::time::Duration::from_millis(100));
            Some(pb)
        } else {
            None
        };

        // Create backup
        let metadata = manager
            .create_backup(&self.database, backup_type)
            .await
            .context("Failed to create backup")?;

        if let Some(spinner) = spinner {
            spinner.finish_and_clear();
        }

        // Output results
        if ctx.json_output {
            println!("{}", serde_json::to_string_pretty(&metadata)?);
        } else {
            println!("{} Backup created successfully", "✓".green().bold());
            println!();

            let mut table = Table::new();
            table.load_preset(UTF8_FULL);
            table.set_header(vec!["Property", "Value"]);

            table.add_row(vec!["Backup ID", &metadata.backup_id]);
            table.add_row(vec!["Database", &metadata.database]);
            table.add_row(vec!["Type", &format!("{:?}", metadata.backup_type)]);
            table.add_row(vec!["Status", &format!("{:?}", metadata.status)]);
            table.add_row(vec![
                "Size",
                &format!("{} bytes", metadata.size_bytes),
            ]);
            table.add_row(vec!["S3 Location", &metadata.s3_location]);
            table.add_row(vec![
                "Timestamp",
                &metadata.timestamp.to_rfc3339(),
            ]);

            if let Some(checksum) = &metadata.checksum {
                table.add_row(vec!["Checksum", checksum]);
            }

            if let Some(compression) = &metadata.compression {
                table.add_row(vec!["Compression", compression]);
            }

            table.add_row(vec!["Encryption", &metadata.encryption.to_string()]);

            if let Some(wal_pos) = &metadata.wal_position {
                table.add_row(vec!["WAL Position", wal_pos]);
            }

            println!("{table}");
        }

        Ok(())
    }
}

/// List backups arguments
#[derive(Debug, Parser)]
pub struct ListBackupsArgs {
    /// Database name
    #[arg(short, long, default_value = "llm_analytics")]
    pub database: String,

    /// S3 bucket name
    #[arg(long, env = "BACKUP_S3_BUCKET")]
    pub s3_bucket: Option<String>,

    /// S3 prefix/path
    #[arg(long, env = "BACKUP_S3_PREFIX", default_value = "timescaledb")]
    pub s3_prefix: String,

    /// AWS region
    #[arg(long, env = "AWS_REGION", default_value = "us-east-1")]
    pub aws_region: String,

    /// Limit number of backups to show
    #[arg(short, long)]
    pub limit: Option<usize>,
}

impl ListBackupsArgs {
    /// Execute list backups command
    pub async fn execute(&self, ctx: &ExecutionContext) -> Result<()> {
        if !ctx.json_output {
            println!("{}", "=== List Backups ===".bold().cyan());
            println!();
        }

        // Create backup config
        let s3_bucket = self
            .s3_bucket
            .clone()
            .unwrap_or_else(|| "llm-analytics-backups".to_string());

        let config = BackupConfig {
            s3_bucket,
            s3_prefix: self.s3_prefix.clone(),
            aws_region: self.aws_region.clone(),
            encryption: true,
            compression: true,
            retention_days: 30,
        };

        // Create S3 storage
        let storage = crate::infra::backup::S3BackupStorage::new(config).await?;

        // List backups
        let mut backups = storage.list_backups(&self.database).await?;

        // Apply limit
        if let Some(limit) = self.limit {
            backups.truncate(limit);
        }

        // Output results
        if ctx.json_output {
            let output = serde_json::json!({
                "database": self.database,
                "total_backups": backups.len(),
                "backups": backups,
            });
            println!("{}", serde_json::to_string_pretty(&output)?);
        } else {
            if backups.is_empty() {
                println!("No backups found for database: {}", self.database);
                return Ok(());
            }

            println!(
                "Found {} backups for database: {}",
                backups.len(),
                self.database
            );
            println!();

            let mut table = Table::new();
            table.load_preset(UTF8_FULL);
            table.set_header(vec!["Backup ID", "Type", "Size", "Age (days)", "Status"]);

            for backup in &backups {
                table.add_row(vec![
                    backup.backup_id.clone(),
                    format!("{:?}", backup.backup_type),
                    format_size(backup.size_bytes),
                    backup.age_days.to_string(),
                    format!("{:?}", backup.status),
                ]);
            }

            println!("{table}");
        }

        Ok(())
    }
}

/// Format size in human-readable format
fn format_size(bytes: u64) -> String {
    const UNITS: &[&str] = &["B", "KB", "MB", "GB", "TB"];
    let mut size = bytes as f64;
    let mut unit_idx = 0;

    while size >= 1024.0 && unit_idx < UNITS.len() - 1 {
        size /= 1024.0;
        unit_idx += 1;
    }

    format!("{:.2} {}", size, UNITS[unit_idx])
}
