//! Backup type definitions

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

/// Backup configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BackupConfig {
    /// S3 bucket name
    pub s3_bucket: String,

    /// S3 prefix/path
    pub s3_prefix: String,

    /// AWS region
    pub aws_region: String,

    /// Encryption enabled
    pub encryption: bool,

    /// Compression enabled
    pub compression: bool,

    /// Retention days
    pub retention_days: u32,
}

impl Default for BackupConfig {
    fn default() -> Self {
        Self {
            s3_bucket: "llm-analytics-backups".to_string(),
            s3_prefix: "timescaledb".to_string(),
            aws_region: "us-east-1".to_string(),
            encryption: true,
            compression: true,
            retention_days: 30,
        }
    }
}

/// Backup metadata
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BackupMetadata {
    /// Backup ID
    pub backup_id: String,

    /// Backup timestamp
    pub timestamp: DateTime<Utc>,

    /// Database name
    pub database: String,

    /// Backup size in bytes
    pub size_bytes: u64,

    /// Backup type (full, incremental)
    pub backup_type: BackupType,

    /// Backup status
    pub status: BackupStatus,

    /// S3 location
    pub s3_location: String,

    /// Checksum (SHA256)
    pub checksum: Option<String>,

    /// Compression used
    pub compression: Option<String>,

    /// Encryption used
    pub encryption: bool,

    /// WAL position (for PITR)
    pub wal_position: Option<String>,

    /// Additional metadata
    pub metadata: serde_json::Value,
}

impl BackupMetadata {
    /// Create new backup metadata
    pub fn new(backup_id: impl Into<String>, database: impl Into<String>) -> Self {
        Self {
            backup_id: backup_id.into(),
            timestamp: Utc::now(),
            database: database.into(),
            size_bytes: 0,
            backup_type: BackupType::Full,
            status: BackupStatus::InProgress,
            s3_location: String::new(),
            checksum: None,
            compression: None,
            encryption: false,
            wal_position: None,
            metadata: serde_json::json!({}),
        }
    }

    /// Mark as completed
    pub fn complete(&mut self, size: u64, s3_location: impl Into<String>) {
        self.status = BackupStatus::Completed;
        self.size_bytes = size;
        self.s3_location = s3_location.into();
    }

    /// Mark as failed
    pub fn fail(&mut self, error: impl Into<String>) {
        self.status = BackupStatus::Failed;
        self.metadata = serde_json::json!({
            "error": error.into(),
        });
    }
}

/// Backup type
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum BackupType {
    /// Full backup
    Full,
    /// Incremental backup
    Incremental,
    /// Differential backup
    Differential,
}

/// Backup status
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum BackupStatus {
    /// Backup in progress
    InProgress,
    /// Backup completed successfully
    Completed,
    /// Backup failed
    Failed,
    /// Backup verification pending
    VerificationPending,
    /// Backup verified
    Verified,
}

/// Restore configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RestoreConfig {
    /// Backup ID to restore from
    pub backup_id: String,

    /// Target namespace for restore
    pub target_namespace: String,

    /// Point-in-time target (optional)
    pub pitr_target: Option<DateTime<Utc>>,

    /// Restore to different database name
    pub target_database: Option<String>,

    /// Skip data validation
    pub skip_validation: bool,
}

/// Restore result
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RestoreResult {
    /// Restore successful
    pub success: bool,

    /// Restore duration in seconds
    pub duration_seconds: u64,

    /// Restored database size in bytes
    pub restored_size_bytes: u64,

    /// Number of tables restored
    pub tables_restored: usize,

    /// Messages
    pub messages: Vec<String>,
}

impl RestoreResult {
    /// Create new restore result
    pub fn new() -> Self {
        Self {
            success: false,
            duration_seconds: 0,
            restored_size_bytes: 0,
            tables_restored: 0,
            messages: Vec::new(),
        }
    }

    /// Add a message
    pub fn add_message(&mut self, message: impl Into<String>) {
        self.messages.push(message.into());
    }
}

impl Default for RestoreResult {
    fn default() -> Self {
        Self::new()
    }
}

/// Backup verification result
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VerificationResult {
    /// Backup ID
    pub backup_id: String,

    /// Verification successful
    pub valid: bool,

    /// Checks performed
    pub checks: Vec<VerificationCheck>,

    /// Overall status
    pub status: String,
}

impl VerificationResult {
    /// Create new verification result
    pub fn new(backup_id: impl Into<String>) -> Self {
        Self {
            backup_id: backup_id.into(),
            valid: true,
            checks: Vec::new(),
            status: "pending".to_string(),
        }
    }

    /// Add a check
    pub fn add_check(&mut self, check: VerificationCheck) {
        if !check.passed {
            self.valid = false;
        }
        self.checks.push(check);
    }

    /// Mark as complete
    pub fn complete(&mut self) {
        self.status = if self.valid {
            "valid".to_string()
        } else {
            "invalid".to_string()
        };
    }
}

/// Individual verification check
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VerificationCheck {
    /// Check name
    pub name: String,

    /// Check passed
    pub passed: bool,

    /// Check message
    pub message: String,
}

impl VerificationCheck {
    /// Create a new check
    pub fn new(name: impl Into<String>) -> Self {
        Self {
            name: name.into(),
            passed: false,
            message: String::new(),
        }
    }

    /// Mark as passed
    pub fn pass(mut self, message: impl Into<String>) -> Self {
        self.passed = true;
        self.message = message.into();
        self
    }

    /// Mark as failed
    pub fn fail(mut self, message: impl Into<String>) -> Self {
        self.passed = false;
        self.message = message.into();
        self
    }
}

/// Backup list entry
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BackupEntry {
    /// Backup ID
    pub backup_id: String,

    /// Timestamp
    pub timestamp: DateTime<Utc>,

    /// Size in bytes
    pub size_bytes: u64,

    /// Backup type
    pub backup_type: BackupType,

    /// Status
    pub status: BackupStatus,

    /// Age in days
    pub age_days: i64,
}
