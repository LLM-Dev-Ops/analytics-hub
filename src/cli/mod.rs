//! CLI command implementations
//!
//! This module contains all CLI command implementations organized by function:
//! - deploy: Infrastructure deployment commands
//! - database: Database operation commands
//! - kafka: Kafka management commands
//! - redis: Redis cluster management commands
//! - validate: Validation and testing commands
//! - health: Health check commands
//! - utils: Utility commands
//! - benchmark: Performance benchmark commands

pub mod benchmark;
pub mod database;
pub mod deploy;
pub mod health;
pub mod kafka;
pub mod redis;
pub mod utils;
pub mod validate;

// Re-export command structs for convenience
pub use benchmark::BenchmarkCommand;
pub use database::DatabaseCommand;
pub use deploy::DeployCommand;
pub use health::HealthCommand;
pub use kafka::KafkaCommand;
pub use redis::RedisCommand;
pub use utils::UtilsCommand;
pub use validate::ValidateCommand;
