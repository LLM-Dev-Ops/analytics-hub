//! TimescaleDB backup and restore operations

use anyhow::{Context, Result};
use chrono::Utc;
use std::path::{Path, PathBuf};
use tokio::process::Command;
use tracing::{debug, info, warn};
use uuid::Uuid;

use crate::infra::k8s::K8sClient;

use super::s3::S3BackupStorage;
use super::types::{BackupConfig, BackupMetadata, BackupType, RestoreConfig, RestoreResult};

/// TimescaleDB backup manager
pub struct TimescaleBackupManager {
    k8s_client: K8sClient,
    s3_storage: S3BackupStorage,
    namespace: String,
}

impl TimescaleBackupManager {
    /// Create new TimescaleDB backup manager
    pub async fn new(namespace: impl Into<String>, config: BackupConfig) -> Result<Self> {
        let namespace_str = namespace.into();
        let k8s_client = K8sClient::new(&namespace_str).await?;
        let s3_storage = S3BackupStorage::new(config).await?;

        Ok(Self {
            k8s_client,
            s3_storage,
            namespace: namespace_str,
        })
    }

    /// Create a full backup of TimescaleDB
    pub async fn create_backup(
        &self,
        database: &str,
        backup_type: BackupType,
    ) -> Result<BackupMetadata> {
        let backup_id = format!("backup-{}-{}", database, Uuid::new_v4());
        info!(
            "Creating {:?} backup for database: {} (ID: {})",
            backup_type, database, backup_id
        );

        let mut metadata = BackupMetadata::new(&backup_id, database);
        metadata.backup_type = backup_type;

        // Find TimescaleDB pod
        let pod_name = self.find_timescaledb_pod().await?;
        info!("Using pod: {}", pod_name);

        // Create backup directory
        let backup_dir = format!("/tmp/backups/{}", backup_id);
        let backup_file = format!("{}/backup.tar.gz", backup_dir);

        // Create backup using pg_basebackup
        match backup_type {
            BackupType::Full => {
                self.create_full_backup(&pod_name, database, &backup_dir, &backup_file)
                    .await?;
            }
            BackupType::Incremental => {
                self.create_incremental_backup(&pod_name, database, &backup_dir, &backup_file)
                    .await?;
            }
            BackupType::Differential => {
                warn!("Differential backups not fully implemented, falling back to incremental");
                self.create_incremental_backup(&pod_name, database, &backup_dir, &backup_file)
                    .await?;
            }
        }

        // Get WAL position for PITR
        let wal_position = self.get_wal_position(&pod_name, database).await?;
        metadata.wal_position = Some(wal_position);

        // Calculate checksum
        let checksum = self.calculate_checksum(&pod_name, &backup_file).await?;
        metadata.checksum = Some(checksum);

        // Get backup size
        let size_bytes = self.get_file_size(&pod_name, &backup_file).await?;

        // Download backup from pod to local
        let local_backup_path = PathBuf::from(format!("/tmp/{}.tar.gz", backup_id));
        self.download_from_pod(&pod_name, &backup_file, &local_backup_path)
            .await?;

        // Upload to S3
        let s3_location = self.s3_storage.upload_backup(&local_backup_path, &metadata).await?;

        // Clean up local files
        tokio::fs::remove_file(&local_backup_path)
            .await
            .context("Failed to remove local backup file")?;

        // Clean up pod backup directory
        self.cleanup_pod_backup(&pod_name, &backup_dir).await?;

        // Mark as completed
        metadata.complete(size_bytes, s3_location);

        info!("Backup created successfully: {}", backup_id);

        Ok(metadata)
    }

    /// Restore a backup
    pub async fn restore_backup(&self, config: &RestoreConfig) -> Result<RestoreResult> {
        let mut result = RestoreResult::new();
        let start = std::time::Instant::now();

        info!("Starting restore operation for backup: {}", config.backup_id);
        result.add_message(format!("Starting restore of backup: {}", config.backup_id));

        // Get backup metadata
        let backup_metadata = self
            .s3_storage
            .get_backup_metadata(&format!(
                "s3://backups/{}/{}",
                config.backup_id, config.backup_id
            ))
            .await?;

        result.add_message(format!(
            "Backup size: {} bytes",
            backup_metadata.size_bytes
        ));

        // Download backup from S3
        let local_backup_path = PathBuf::from(format!("/tmp/{}.tar.gz", config.backup_id));
        self.s3_storage
            .download_backup(&backup_metadata.s3_location, &local_backup_path)
            .await?;

        result.add_message("Backup downloaded from S3");

        // Find or create target pod
        let pod_name = if let Some(target_ns) = config.target_namespace.strip_prefix("new:") {
            // Create new namespace and pod
            self.create_restore_namespace(target_ns).await?;
            result.add_message(format!("Created namespace: {}", target_ns));
            self.create_restore_pod(target_ns, &config.backup_id).await?
        } else {
            // Use existing pod
            self.find_timescaledb_pod().await?
        };

        result.add_message(format!("Using pod: {}", pod_name));

        // Upload backup to pod
        let pod_backup_path = format!("/tmp/{}.tar.gz", config.backup_id);
        self.upload_to_pod(&pod_name, &local_backup_path, &pod_backup_path)
            .await?;

        result.add_message("Backup uploaded to pod");

        // Stop database if running
        self.stop_database(&pod_name).await.ok(); // Ignore errors

        // Restore backup
        let target_db = config
            .target_database
            .as_deref()
            .unwrap_or(&backup_metadata.database);

        self.restore_from_backup(&pod_name, target_db, &pod_backup_path)
            .await?;

        result.add_message("Database restored from backup");

        // Apply PITR if requested
        if let Some(pitr_target) = config.pitr_target {
            if let Some(wal_pos) = &backup_metadata.wal_position {
                self.apply_pitr(&pod_name, target_db, wal_pos, &pitr_target)
                    .await?;
                result.add_message(format!(
                    "Applied PITR to timestamp: {}",
                    pitr_target.to_rfc3339()
                ));
            } else {
                warn!("PITR requested but no WAL position available");
                result.add_message("Warning: PITR requested but no WAL position available");
            }
        }

        // Verify restore (unless skipped)
        if !config.skip_validation {
            let table_count = self.verify_restore(&pod_name, target_db).await?;
            result.tables_restored = table_count;
            result.add_message(format!("Verified: {} tables restored", table_count));
        }

        // Get restored database size
        let restored_size = self.get_database_size(&pod_name, target_db).await?;
        result.restored_size_bytes = restored_size;

        // Clean up
        tokio::fs::remove_file(&local_backup_path)
            .await
            .context("Failed to remove local backup file")?;

        self.cleanup_pod_backup(&pod_name, &pod_backup_path)
            .await?;

        // Mark as successful
        result.success = true;
        result.duration_seconds = start.elapsed().as_secs();
        result.add_message("Restore completed successfully");

        info!(
            "Restore completed successfully in {} seconds",
            result.duration_seconds
        );

        Ok(result)
    }

    /// Create full backup using pg_basebackup
    async fn create_full_backup(
        &self,
        pod_name: &str,
        database: &str,
        backup_dir: &str,
        backup_file: &str,
    ) -> Result<()> {
        info!("Creating full backup");

        // Create backup directory
        let cmd = format!("mkdir -p {}", backup_dir);
        self.k8s_client.exec_in_pod(pod_name, &cmd).await?;

        // Run pg_basebackup
        let cmd = format!(
            "pg_basebackup -h localhost -U postgres -D {}/data -Ft -z -P",
            backup_dir
        );
        self.k8s_client.exec_in_pod(pod_name, &cmd).await?;

        // Create tarball
        let cmd = format!(
            "cd {} && tar czf {} data/",
            backup_dir, backup_file
        );
        self.k8s_client.exec_in_pod(pod_name, &cmd).await?;

        info!("Full backup created");

        Ok(())
    }

    /// Create incremental backup using WAL archiving
    async fn create_incremental_backup(
        &self,
        pod_name: &str,
        database: &str,
        backup_dir: &str,
        backup_file: &str,
    ) -> Result<()> {
        info!("Creating incremental backup");

        // Create backup directory
        let cmd = format!("mkdir -p {}", backup_dir);
        self.k8s_client.exec_in_pod(pod_name, &cmd).await?;

        // Force WAL switch and archive
        let cmd = format!(
            "psql -U postgres -d {} -c \"SELECT pg_switch_wal();\"",
            database
        );
        self.k8s_client.exec_in_pod(pod_name, &cmd).await?;

        // Archive WAL files
        let cmd = format!(
            "cp -r /var/lib/postgresql/data/pg_wal {}/wal",
            backup_dir
        );
        self.k8s_client.exec_in_pod(pod_name, &cmd).await?;

        // Create tarball
        let cmd = format!("cd {} && tar czf {} wal/", backup_dir, backup_file);
        self.k8s_client.exec_in_pod(pod_name, &cmd).await?;

        info!("Incremental backup created");

        Ok(())
    }

    /// Get current WAL position
    async fn get_wal_position(&self, pod_name: &str, database: &str) -> Result<String> {
        let cmd = format!(
            "psql -U postgres -d {} -t -c \"SELECT pg_current_wal_lsn();\"",
            database
        );
        let output = self.k8s_client.exec_in_pod(pod_name, &cmd).await?;
        Ok(output.trim().to_string())
    }

    /// Calculate SHA256 checksum
    async fn calculate_checksum(&self, pod_name: &str, file_path: &str) -> Result<String> {
        let cmd = format!("sha256sum {} | awk '{{print $1}}'", file_path);
        let output = self.k8s_client.exec_in_pod(pod_name, &cmd).await?;
        Ok(output.trim().to_string())
    }

    /// Get file size
    async fn get_file_size(&self, pod_name: &str, file_path: &str) -> Result<u64> {
        let cmd = format!("stat -c%s {}", file_path);
        let output = self.k8s_client.exec_in_pod(pod_name, &cmd).await?;
        output
            .trim()
            .parse()
            .context("Failed to parse file size")
    }

    /// Find TimescaleDB pod
    async fn find_timescaledb_pod(&self) -> Result<String> {
        let pods = self.k8s_client.list_pods_in_namespace(&self.namespace).await?;

        for pod in pods {
            if let Some(name) = pod.metadata.name {
                if name.contains("timescaledb") || name.contains("postgresql") {
                    return Ok(name);
                }
            }
        }

        anyhow::bail!("No TimescaleDB pod found in namespace {}", self.namespace)
    }

    /// Download file from pod
    async fn download_from_pod(
        &self,
        pod_name: &str,
        pod_path: &str,
        local_path: &Path,
    ) -> Result<()> {
        debug!(
            "Downloading {} from pod {} to {:?}",
            pod_path, pod_name, local_path
        );

        let output = Command::new("kubectl")
            .args([
                "cp",
                &format!("{}/{}:{}", self.namespace, pod_name, pod_path),
                local_path.to_str().unwrap(),
            ])
            .output()
            .await
            .context("Failed to execute kubectl cp")?;

        if !output.status.success() {
            anyhow::bail!(
                "kubectl cp failed: {}",
                String::from_utf8_lossy(&output.stderr)
            );
        }

        Ok(())
    }

    /// Upload file to pod
    async fn upload_to_pod(
        &self,
        pod_name: &str,
        local_path: &Path,
        pod_path: &str,
    ) -> Result<()> {
        debug!(
            "Uploading {:?} to pod {} at {}",
            local_path, pod_name, pod_path
        );

        let output = Command::new("kubectl")
            .args([
                "cp",
                local_path.to_str().unwrap(),
                &format!("{}/{}:{}", self.namespace, pod_name, pod_path),
            ])
            .output()
            .await
            .context("Failed to execute kubectl cp")?;

        if !output.status.success() {
            anyhow::bail!(
                "kubectl cp failed: {}",
                String::from_utf8_lossy(&output.stderr)
            );
        }

        Ok(())
    }

    /// Clean up backup files in pod
    async fn cleanup_pod_backup(&self, pod_name: &str, path: &str) -> Result<()> {
        let cmd = format!("rm -rf {}", path);
        self.k8s_client
            .exec_in_pod(pod_name, &cmd)
            .await
            .ok(); // Ignore errors
        Ok(())
    }

    /// Create restore namespace
    async fn create_restore_namespace(&self, namespace: &str) -> Result<()> {
        let output = Command::new("kubectl")
            .args(["create", "namespace", namespace])
            .output()
            .await
            .context("Failed to create namespace")?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            if !stderr.contains("already exists") {
                anyhow::bail!("Failed to create namespace: {}", stderr);
            }
        }

        Ok(())
    }

    /// Create restore pod
    async fn create_restore_pod(&self, namespace: &str, backup_id: &str) -> Result<String> {
        let pod_name = format!("restore-{}", backup_id);

        // This is a simplified version - in production, you'd use proper pod specs
        warn!("Create restore pod not fully implemented - using existing pod");

        Ok(pod_name)
    }

    /// Stop database
    async fn stop_database(&self, pod_name: &str) -> Result<()> {
        let cmd = "pg_ctl stop -D /var/lib/postgresql/data";
        self.k8s_client.exec_in_pod(pod_name, cmd).await?;
        Ok(())
    }

    /// Restore from backup file
    async fn restore_from_backup(
        &self,
        pod_name: &str,
        database: &str,
        backup_file: &str,
    ) -> Result<()> {
        info!("Restoring database from backup");

        // Extract backup
        let cmd = format!("cd /tmp && tar xzf {}", backup_file);
        self.k8s_client.exec_in_pod(pod_name, &cmd).await?;

        // Restore data directory
        let cmd = "rm -rf /var/lib/postgresql/data/* && cp -r /tmp/data/* /var/lib/postgresql/data/";
        self.k8s_client.exec_in_pod(pod_name, cmd).await?;

        // Start database
        let cmd = "pg_ctl start -D /var/lib/postgresql/data";
        self.k8s_client.exec_in_pod(pod_name, cmd).await?;

        info!("Database restored and started");

        Ok(())
    }

    /// Apply point-in-time recovery
    async fn apply_pitr(
        &self,
        pod_name: &str,
        database: &str,
        wal_position: &str,
        target_time: &chrono::DateTime<Utc>,
    ) -> Result<()> {
        info!("Applying PITR to {}", target_time.to_rfc3339());

        // Create recovery.conf
        let recovery_conf = format!(
            "restore_command = 'cp /tmp/wal/%f %p'\nrecovery_target_time = '{}'",
            target_time.to_rfc3339()
        );

        let cmd = format!(
            "echo '{}' > /var/lib/postgresql/data/recovery.conf",
            recovery_conf
        );
        self.k8s_client.exec_in_pod(pod_name, &cmd).await?;

        // Restart database to apply recovery
        let cmd = "pg_ctl restart -D /var/lib/postgresql/data";
        self.k8s_client.exec_in_pod(pod_name, cmd).await?;

        info!("PITR applied successfully");

        Ok(())
    }

    /// Verify restore
    async fn verify_restore(&self, pod_name: &str, database: &str) -> Result<usize> {
        let cmd = format!(
            "psql -U postgres -d {} -t -c \"SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public';\"",
            database
        );
        let output = self.k8s_client.exec_in_pod(pod_name, &cmd).await?;
        output
            .trim()
            .parse()
            .context("Failed to parse table count")
    }

    /// Get database size
    async fn get_database_size(&self, pod_name: &str, database: &str) -> Result<u64> {
        let cmd = format!(
            "psql -U postgres -d {} -t -c \"SELECT pg_database_size('{}');\"",
            database, database
        );
        let output = self.k8s_client.exec_in_pod(pod_name, &cmd).await?;
        output
            .trim()
            .parse()
            .context("Failed to parse database size")
    }
}
