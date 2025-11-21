//! Database restore CLI commands

use anyhow::{Context, Result};
use chrono::{DateTime, Utc};
use clap::Parser;
use colored::Colorize;
use comfy_table::{presets::UTF8_FULL, Table};
use indicatif::{ProgressBar, ProgressStyle};

use crate::common::ExecutionContext;
use crate::infra::backup::{BackupConfig, RestoreConfig, TimescaleBackupManager};

/// Restore database arguments
#[derive(Debug, Parser)]
pub struct RestoreArgs {
    /// Backup ID to restore from
    #[arg(short, long)]
    pub backup_id: String,

    /// Target namespace for restore
    #[arg(short = 'n', long, default_value = "llm-analytics-hub")]
    pub target_namespace: String,

    /// Point-in-time recovery target (RFC3339 timestamp)
    #[arg(long)]
    pub pitr_target: Option<String>,

    /// Restore to different database name
    #[arg(long)]
    pub target_database: Option<String>,

    /// Skip data validation after restore
    #[arg(long)]
    pub skip_validation: bool,

    /// S3 bucket name
    #[arg(long, env = "BACKUP_S3_BUCKET")]
    pub s3_bucket: Option<String>,

    /// S3 prefix/path
    #[arg(long, env = "BACKUP_S3_PREFIX", default_value = "timescaledb")]
    pub s3_prefix: String,

    /// AWS region
    #[arg(long, env = "AWS_REGION", default_value = "us-east-1")]
    pub aws_region: String,

    /// Force restore (skip confirmation)
    #[arg(short, long)]
    pub force: bool,
}

impl RestoreArgs {
    /// Execute restore command
    pub async fn execute(&self, ctx: &ExecutionContext) -> Result<()> {
        if !ctx.json_output {
            println!("{}", "=== Database Restore ===".bold().cyan());
            println!();
        }

        // Parse PITR target if provided
        let pitr_target = if let Some(target_str) = &self.pitr_target {
            let dt = DateTime::parse_from_rfc3339(target_str)
                .context("Invalid PITR target timestamp (use RFC3339 format)")?;
            Some(dt.with_timezone(&Utc))
        } else {
            None
        };

        // Create restore config
        let restore_config = RestoreConfig {
            backup_id: self.backup_id.clone(),
            target_namespace: self.target_namespace.clone(),
            pitr_target,
            target_database: self.target_database.clone(),
            skip_validation: self.skip_validation,
        };

        if ctx.dry_run {
            if ctx.json_output {
                let output = serde_json::json!({
                    "dry_run": true,
                    "restore_config": restore_config,
                });
                println!("{}", serde_json::to_string_pretty(&output)?);
            } else {
                println!("{}", "DRY RUN MODE".yellow().bold());
                println!("Would restore backup: {}", self.backup_id);
                println!("Target namespace: {}", self.target_namespace);
                if let Some(db) = &self.target_database {
                    println!("Target database: {}", db);
                }
                if let Some(pitr) = &pitr_target {
                    println!("PITR target: {}", pitr.to_rfc3339());
                }
            }
            return Ok(());
        }

        // Confirm restore (unless forced)
        if !self.force && !ctx.json_output {
            println!(
                "{}",
                "WARNING: This will restore a backup, potentially overwriting existing data!"
                    .yellow()
                    .bold()
            );
            println!("Backup ID: {}", self.backup_id);
            println!("Target namespace: {}", self.target_namespace);
            if let Some(pitr) = &pitr_target {
                println!("PITR target: {}", pitr.to_rfc3339());
            }
            println!();

            println!("Continue? (yes/no): ");
            let mut input = String::new();
            std::io::stdin()
                .read_line(&mut input)
                .context("Failed to read user input")?;

            if input.trim().to_lowercase() != "yes" {
                println!("Restore cancelled");
                return Ok(());
            }
        }

        // Create backup config
        let s3_bucket = self
            .s3_bucket
            .clone()
            .unwrap_or_else(|| "llm-analytics-backups".to_string());

        let backup_config = BackupConfig {
            s3_bucket,
            s3_prefix: self.s3_prefix.clone(),
            aws_region: self.aws_region.clone(),
            encryption: true,
            compression: true,
            retention_days: 30,
        };

        // Create backup manager
        let manager = TimescaleBackupManager::new(&self.target_namespace, backup_config).await?;

        // Show progress
        let spinner = if !ctx.json_output {
            let pb = ProgressBar::new_spinner();
            pb.set_style(
                ProgressStyle::default_spinner()
                    .template("{spinner:.cyan} {msg}")
                    .unwrap(),
            );
            pb.set_message(format!("Restoring backup: {}", self.backup_id));
            pb.enable_steady_tick(std::time::Duration::from_millis(100));
            Some(pb)
        } else {
            None
        };

        // Restore backup
        let result = manager
            .restore_backup(&restore_config)
            .await
            .context("Failed to restore backup")?;

        if let Some(spinner) = spinner {
            spinner.finish_and_clear();
        }

        // Output results
        if ctx.json_output {
            println!("{}", serde_json::to_string_pretty(&result)?);
        } else {
            if result.success {
                println!("{} Restore completed successfully", "✓".green().bold());
            } else {
                println!("{} Restore failed", "✗".red().bold());
            }
            println!();

            let mut table = Table::new();
            table.load_preset(UTF8_FULL);
            table.set_header(vec!["Property", "Value"]);

            table.add_row(vec!["Success", &result.success.to_string()]);
            table.add_row(vec![
                "Duration",
                &format!("{} seconds", result.duration_seconds),
            ]);
            table.add_row(vec![
                "Restored Size",
                &format_size(result.restored_size_bytes),
            ]);
            table.add_row(vec![
                "Tables Restored",
                &result.tables_restored.to_string(),
            ]);

            println!("{table}");

            if !result.messages.is_empty() {
                println!();
                println!("{}", "=== Restore Messages ===".bold());
                for msg in &result.messages {
                    println!("  • {}", msg);
                }
            }
        }

        Ok(())
    }
}

/// Verify backup arguments
#[derive(Debug, Parser)]
pub struct VerifyBackupArgs {
    /// Backup ID to verify
    #[arg(short, long)]
    pub backup_id: String,

    /// Test restorability (perform actual restore test)
    #[arg(long)]
    pub test_restore: bool,

    /// Test namespace for restore testing
    #[arg(long, default_value = "backup-test")]
    pub test_namespace: String,

    /// S3 bucket name
    #[arg(long, env = "BACKUP_S3_BUCKET")]
    pub s3_bucket: Option<String>,

    /// S3 prefix/path
    #[arg(long, env = "BACKUP_S3_PREFIX", default_value = "timescaledb")]
    pub s3_prefix: String,

    /// AWS region
    #[arg(long, env = "AWS_REGION", default_value = "us-east-1")]
    pub aws_region: String,

    /// Namespace for backup operations
    #[arg(short = 'n', long, default_value = "llm-analytics-hub")]
    pub namespace: String,
}

impl VerifyBackupArgs {
    /// Execute verify backup command
    pub async fn execute(&self, ctx: &ExecutionContext) -> Result<()> {
        if !ctx.json_output {
            println!("{}", "=== Verify Backup ===".bold().cyan());
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

        // Create S3 storage and verifier
        let storage = crate::infra::backup::S3BackupStorage::new(config.clone()).await?;
        let verifier = crate::infra::backup::BackupVerifier::new(storage).await?;

        // Verify backup
        let result = verifier.verify_backup(&self.backup_id).await?;

        // Test restore if requested
        let restore_test_result = if self.test_restore {
            let manager = TimescaleBackupManager::new(&self.namespace, config).await?;
            Some(
                verifier
                    .test_restore(&manager, &self.backup_id, &self.test_namespace)
                    .await?,
            )
        } else {
            None
        };

        // Output results
        if ctx.json_output {
            let output = serde_json::json!({
                "backup_id": self.backup_id,
                "verification": result,
                "restore_test": restore_test_result,
            });
            println!("{}", serde_json::to_string_pretty(&output)?);
        } else {
            println!(
                "{} Backup verification: {}",
                if result.valid {
                    "✓".green().bold()
                } else {
                    "✗".red().bold()
                },
                if result.valid {
                    "VALID".green().bold()
                } else {
                    "INVALID".red().bold()
                }
            );
            println!();

            let mut table = Table::new();
            table.load_preset(UTF8_FULL);
            table.set_header(vec!["Check", "Status", "Message"]);

            for check in &result.checks {
                let status = if check.passed {
                    "✓".green().to_string()
                } else {
                    "✗".red().to_string()
                };
                table.add_row(vec![&check.name, &status, &check.message]);
            }

            println!("{table}");

            if let Some(restore_result) = restore_test_result {
                println!();
                println!(
                    "{} Restore test: {}",
                    if restore_result.valid {
                        "✓".green().bold()
                    } else {
                        "✗".red().bold()
                    },
                    if restore_result.valid {
                        "PASSED".green().bold()
                    } else {
                        "FAILED".red().bold()
                    }
                );

                if !restore_result.checks.is_empty() {
                    println!();
                    let mut restore_table = Table::new();
                    restore_table.load_preset(UTF8_FULL);
                    restore_table.set_header(vec!["Check", "Status", "Message"]);

                    for check in &restore_result.checks {
                        let status = if check.passed {
                            "✓".green().to_string()
                        } else {
                            "✗".red().to_string()
                        };
                        restore_table.add_row(vec![&check.name, &status, &check.message]);
                    }

                    println!("{restore_table}");
                }
            }
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
