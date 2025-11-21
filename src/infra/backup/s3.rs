//! S3 backup storage implementation

use anyhow::{Context, Result};
use aws_sdk_s3::primitives::ByteStream;
use aws_sdk_s3::types::{Delete, ObjectIdentifier};
use aws_sdk_s3::Client as S3Client;
use chrono::{DateTime, Utc};
use futures::StreamExt;
use std::path::Path;
use tokio::fs::File;
use tokio::io::AsyncWriteExt;
use tracing::{debug, info};

use super::types::{BackupConfig, BackupEntry, BackupMetadata, BackupStatus, BackupType};

/// S3 backup storage manager
pub struct S3BackupStorage {
    client: S3Client,
    config: BackupConfig,
}

impl S3BackupStorage {
    /// Create new S3 backup storage
    pub async fn new(config: BackupConfig) -> Result<Self> {
        // Create AWS config
        let aws_config = aws_config::defaults(aws_config::BehaviorVersion::latest())
            .region(aws_sdk_s3::config::Region::new(config.aws_region.clone()))
            .load()
            .await;

        let client = S3Client::new(&aws_config);

        Ok(Self { client, config })
    }

    /// Upload a backup file to S3
    pub async fn upload_backup(
        &self,
        file_path: &Path,
        metadata: &BackupMetadata,
    ) -> Result<String> {
        let file_name = file_path
            .file_name()
            .context("Invalid file path")?
            .to_str()
            .context("Invalid file name")?;

        let s3_key = format!(
            "{}/{}/{}",
            self.config.s3_prefix, metadata.database, file_name
        );

        info!(
            "Uploading backup to s3://{}/{}",
            self.config.s3_bucket, s3_key
        );

        // Read file
        let body = ByteStream::from_path(file_path)
            .await
            .context("Failed to read backup file")?;

        // Build put object request
        let mut request = self
            .client
            .put_object()
            .bucket(&self.config.s3_bucket)
            .key(&s3_key)
            .body(body);

        // Add metadata
        request = request
            .metadata("backup-id", &metadata.backup_id)
            .metadata("database", &metadata.database)
            .metadata("backup-type", format!("{:?}", metadata.backup_type))
            .metadata("timestamp", metadata.timestamp.to_rfc3339());

        if let Some(checksum) = &metadata.checksum {
            request = request.metadata("checksum-sha256", checksum);
        }

        if let Some(wal_pos) = &metadata.wal_position {
            request = request.metadata("wal-position", wal_pos);
        }

        // Add server-side encryption if enabled
        if self.config.encryption {
            request = request.server_side_encryption(aws_sdk_s3::types::ServerSideEncryption::Aes256);
        }

        // Upload
        request
            .send()
            .await
            .context("Failed to upload backup to S3")?;

        let s3_location = format!("s3://{}/{}", self.config.s3_bucket, s3_key);
        info!("Backup uploaded successfully to {}", s3_location);

        Ok(s3_location)
    }

    /// Download a backup file from S3
    pub async fn download_backup(
        &self,
        s3_location: &str,
        local_path: &Path,
    ) -> Result<()> {
        info!("Downloading backup from {} to {:?}", s3_location, local_path);

        // Parse S3 location
        let s3_key = self.parse_s3_location(s3_location)?;

        // Get object
        let response = self
            .client
            .get_object()
            .bucket(&self.config.s3_bucket)
            .key(&s3_key)
            .send()
            .await
            .context("Failed to download backup from S3")?;

        // Create parent directory if it doesn't exist
        if let Some(parent) = local_path.parent() {
            tokio::fs::create_dir_all(parent)
                .await
                .context("Failed to create parent directory")?;
        }

        // Write to file
        let mut file = File::create(local_path)
            .await
            .context("Failed to create local file")?;

        let mut body = response.body;
        while let Some(bytes) = body.next().await {
            let bytes = bytes.context("Failed to read S3 object")?;
            file.write_all(&bytes)
                .await
                .context("Failed to write to local file")?;
        }

        file.flush().await.context("Failed to flush file")?;

        info!("Backup downloaded successfully to {:?}", local_path);

        Ok(())
    }

    /// List all backups for a database
    pub async fn list_backups(&self, database: &str) -> Result<Vec<BackupEntry>> {
        let prefix = format!("{}/{}/", self.config.s3_prefix, database);

        debug!("Listing backups with prefix: {}", prefix);

        let mut backups = Vec::new();
        let mut continuation_token: Option<String> = None;

        loop {
            let mut request = self
                .client
                .list_objects_v2()
                .bucket(&self.config.s3_bucket)
                .prefix(&prefix);

            if let Some(token) = continuation_token {
                request = request.continuation_token(token);
            }

            let response = request
                .send()
                .await
                .context("Failed to list S3 objects")?;

            if let Some(contents) = response.contents {
                for object in contents {
                    if let (Some(key), Some(size), Some(last_modified)) =
                        (object.key, object.size, object.last_modified)
                    {
                        // Get object metadata
                        let metadata_response = self
                            .client
                            .head_object()
                            .bucket(&self.config.s3_bucket)
                            .key(&key)
                            .send()
                            .await;

                        if let Ok(metadata) = metadata_response {
                            let backup_id = metadata
                                .metadata()
                                .and_then(|m| m.get("backup-id"))
                                .map(|s| s.to_string())
                                .unwrap_or_else(|| key.clone());

                            let backup_type = metadata
                                .metadata()
                                .and_then(|m| m.get("backup-type"))
                                .and_then(|s| match s.as_str() {
                                    "Full" => Some(BackupType::Full),
                                    "Incremental" => Some(BackupType::Incremental),
                                    "Differential" => Some(BackupType::Differential),
                                    _ => None,
                                })
                                .unwrap_or(BackupType::Full);

                            let timestamp: DateTime<Utc> = last_modified.as_secs_f64()
                                .try_into()
                                .map(|secs| DateTime::from_timestamp(secs, 0).unwrap_or_else(Utc::now))
                                .unwrap_or_else(|_| Utc::now());
                            let age_days = (Utc::now() - timestamp).num_days();

                            backups.push(BackupEntry {
                                backup_id,
                                timestamp,
                                size_bytes: size as u64,
                                backup_type,
                                status: BackupStatus::Completed,
                                age_days,
                            });
                        }
                    }
                }
            }

            if response.is_truncated() == Some(true) {
                continuation_token = response.next_continuation_token;
            } else {
                break;
            }
        }

        // Sort by timestamp (newest first)
        backups.sort_by(|a, b| b.timestamp.cmp(&a.timestamp));

        info!("Found {} backups for database {}", backups.len(), database);

        Ok(backups)
    }

    /// Get backup metadata from S3
    pub async fn get_backup_metadata(&self, s3_location: &str) -> Result<BackupMetadata> {
        let s3_key = self.parse_s3_location(s3_location)?;

        let response = self
            .client
            .head_object()
            .bucket(&self.config.s3_bucket)
            .key(&s3_key)
            .send()
            .await
            .context("Failed to get backup metadata from S3")?;

        let metadata_map = response.metadata().context("No metadata found")?;

        let backup_id = metadata_map
            .get("backup-id")
            .context("Missing backup-id metadata")?
            .to_string();

        let database = metadata_map
            .get("database")
            .context("Missing database metadata")?
            .to_string();

        let backup_type = metadata_map
            .get("backup-type")
            .and_then(|s| match s.as_str() {
                "Full" => Some(BackupType::Full),
                "Incremental" => Some(BackupType::Incremental),
                "Differential" => Some(BackupType::Differential),
                _ => None,
            })
            .unwrap_or(BackupType::Full);

        let timestamp = metadata_map
            .get("timestamp")
            .and_then(|s| DateTime::parse_from_rfc3339(s).ok())
            .map(|dt| dt.with_timezone(&Utc))
            .unwrap_or_else(Utc::now);

        let checksum = metadata_map.get("checksum-sha256").map(|s| s.to_string());

        let wal_position = metadata_map.get("wal-position").map(|s| s.to_string());

        let size_bytes = response.content_length().unwrap_or(0) as u64;

        let compression = if self.config.compression {
            Some("gzip".to_string())
        } else {
            None
        };

        Ok(BackupMetadata {
            backup_id,
            timestamp,
            database,
            size_bytes,
            backup_type,
            status: BackupStatus::Completed,
            s3_location: s3_location.to_string(),
            checksum,
            compression,
            encryption: self.config.encryption,
            wal_position,
            metadata: serde_json::json!({}),
        })
    }

    /// Delete old backups based on retention policy
    pub async fn cleanup_old_backups(&self, database: &str) -> Result<Vec<String>> {
        let backups = self.list_backups(database).await?;

        let retention_days = self.config.retention_days as i64;
        let mut deleted = Vec::new();

        for backup in backups {
            if backup.age_days > retention_days {
                let s3_key = format!(
                    "{}/{}/{}",
                    self.config.s3_prefix, database, backup.backup_id
                );

                info!(
                    "Deleting old backup: {} (age: {} days)",
                    backup.backup_id, backup.age_days
                );

                self.client
                    .delete_object()
                    .bucket(&self.config.s3_bucket)
                    .key(&s3_key)
                    .send()
                    .await
                    .context("Failed to delete old backup")?;

                deleted.push(backup.backup_id);
            }
        }

        if !deleted.is_empty() {
            info!("Deleted {} old backups", deleted.len());
        }

        Ok(deleted)
    }

    /// Delete multiple backups
    pub async fn delete_backups(&self, backup_ids: &[String]) -> Result<()> {
        if backup_ids.is_empty() {
            return Ok(());
        }

        info!("Deleting {} backups", backup_ids.len());

        let objects: Vec<ObjectIdentifier> = backup_ids
            .iter()
            .map(|id| ObjectIdentifier::builder().key(id).build().unwrap())
            .collect();

        let delete = Delete::builder().set_objects(Some(objects)).build()?;

        self.client
            .delete_objects()
            .bucket(&self.config.s3_bucket)
            .delete(delete)
            .send()
            .await
            .context("Failed to delete backups")?;

        info!("Successfully deleted {} backups", backup_ids.len());

        Ok(())
    }

    /// Parse S3 location to get key
    fn parse_s3_location(&self, s3_location: &str) -> Result<String> {
        // Expected format: s3://bucket/key
        let location = s3_location
            .strip_prefix("s3://")
            .context("Invalid S3 location format")?;

        let parts: Vec<&str> = location.splitn(2, '/').collect();
        if parts.len() != 2 {
            anyhow::bail!("Invalid S3 location format");
        }

        Ok(parts[1].to_string())
    }

    /// Check if S3 bucket is accessible
    pub async fn verify_access(&self) -> Result<()> {
        debug!("Verifying S3 bucket access: {}", self.config.s3_bucket);

        self.client
            .head_bucket()
            .bucket(&self.config.s3_bucket)
            .send()
            .await
            .context("Failed to access S3 bucket")?;

        info!("S3 bucket access verified");

        Ok(())
    }
}
