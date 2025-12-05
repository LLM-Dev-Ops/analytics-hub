//! LLM-Dev-Ops Ecosystem Adapters
//!
//! Thin adapters for consuming data from upstream LLM-Dev-Ops modules.
//! These adapters provide read-only access to external data sources
//! without modifying existing analytics, clustering, forecasting, or statistical logic.
//!
//! Phase 2B: Runtime consumption integrations

pub mod observatory;
pub mod costops;
pub mod memory_graph;
pub mod registry;
pub mod config_manager;

use async_trait::async_trait;
use anyhow::Result;
use serde::{Deserialize, Serialize};
use std::sync::Arc;

/// Common trait for all ecosystem adapters
#[async_trait]
pub trait EcosystemAdapter: Send + Sync {
    /// Initialize the adapter connection
    async fn connect(&self) -> Result<()>;

    /// Check adapter health/availability
    async fn health_check(&self) -> Result<AdapterHealth>;

    /// Gracefully disconnect
    async fn disconnect(&self) -> Result<()>;
}

/// Adapter health status
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AdapterHealth {
    pub adapter_name: String,
    pub is_healthy: bool,
    pub latency_ms: Option<u64>,
    pub last_successful_fetch: Option<chrono::DateTime<chrono::Utc>>,
    pub error_message: Option<String>,
}

impl AdapterHealth {
    pub fn healthy(adapter_name: &str, latency_ms: u64) -> Self {
        Self {
            adapter_name: adapter_name.to_string(),
            is_healthy: true,
            latency_ms: Some(latency_ms),
            last_successful_fetch: Some(chrono::Utc::now()),
            error_message: None,
        }
    }

    pub fn unhealthy(adapter_name: &str, error: &str) -> Self {
        Self {
            adapter_name: adapter_name.to_string(),
            is_healthy: false,
            latency_ms: None,
            last_successful_fetch: None,
            error_message: Some(error.to_string()),
        }
    }
}

/// Unified adapter manager for all ecosystem integrations
pub struct AdapterManager {
    pub observatory: Arc<observatory::ObservatoryAdapter>,
    pub costops: Arc<costops::CostOpsAdapter>,
    pub memory_graph: Arc<memory_graph::MemoryGraphAdapter>,
    pub registry: Arc<registry::RegistryAdapter>,
    pub config_manager: Arc<config_manager::ConfigManagerAdapter>,
}

impl AdapterManager {
    /// Create a new adapter manager with default configurations
    pub fn new() -> Result<Self> {
        Ok(Self {
            observatory: Arc::new(observatory::ObservatoryAdapter::new(
                observatory::ObservatoryConfig::from_env()?,
            )),
            costops: Arc::new(costops::CostOpsAdapter::new(
                costops::CostOpsConfig::from_env()?,
            )),
            memory_graph: Arc::new(memory_graph::MemoryGraphAdapter::new(
                memory_graph::MemoryGraphConfig::from_env()?,
            )),
            registry: Arc::new(registry::RegistryAdapter::new(
                registry::RegistryConfig::from_env()?,
            )),
            config_manager: Arc::new(config_manager::ConfigManagerAdapter::new(
                config_manager::ConfigManagerConfig::from_env()?,
            )),
        })
    }

    /// Connect all adapters
    pub async fn connect_all(&self) -> Result<()> {
        futures::try_join!(
            self.observatory.connect(),
            self.costops.connect(),
            self.memory_graph.connect(),
            self.registry.connect(),
            self.config_manager.connect(),
        )?;
        Ok(())
    }

    /// Check health of all adapters
    pub async fn health_check_all(&self) -> Vec<AdapterHealth> {
        let (obs, cost, mem, reg, cfg) = futures::join!(
            self.observatory.health_check(),
            self.costops.health_check(),
            self.memory_graph.health_check(),
            self.registry.health_check(),
            self.config_manager.health_check(),
        );

        vec![
            obs.unwrap_or_else(|e| AdapterHealth::unhealthy("observatory", &e.to_string())),
            cost.unwrap_or_else(|e| AdapterHealth::unhealthy("costops", &e.to_string())),
            mem.unwrap_or_else(|e| AdapterHealth::unhealthy("memory_graph", &e.to_string())),
            reg.unwrap_or_else(|e| AdapterHealth::unhealthy("registry", &e.to_string())),
            cfg.unwrap_or_else(|e| AdapterHealth::unhealthy("config_manager", &e.to_string())),
        ]
    }

    /// Disconnect all adapters
    pub async fn disconnect_all(&self) -> Result<()> {
        futures::try_join!(
            self.observatory.disconnect(),
            self.costops.disconnect(),
            self.memory_graph.disconnect(),
            self.registry.disconnect(),
            self.config_manager.disconnect(),
        )?;
        Ok(())
    }
}

impl Default for AdapterManager {
    fn default() -> Self {
        Self::new().expect("Failed to create default AdapterManager")
    }
}
