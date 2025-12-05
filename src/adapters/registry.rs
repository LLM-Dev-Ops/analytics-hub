//! LLM-Registry Adapter
//!
//! Thin adapter for consuming model metadata and pipeline descriptors
//! from LLM-Registry.
//!
//! This adapter provides read-only access to registry data for analytics
//! purposes without modifying any upstream logic.

use super::{AdapterHealth, EcosystemAdapter};
use anyhow::Result;
use async_trait::async_trait;
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Instant;
use tracing::{debug, info, instrument};

/// Configuration for Registry adapter
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RegistryConfig {
    pub endpoint: String,
    pub api_key: Option<String>,
    pub timeout_secs: u64,
}

impl RegistryConfig {
    pub fn from_env() -> Result<Self> {
        Ok(Self {
            endpoint: std::env::var("REGISTRY_ENDPOINT")
                .unwrap_or_else(|_| "http://localhost:8084".to_string()),
            api_key: std::env::var("REGISTRY_API_KEY").ok(),
            timeout_secs: std::env::var("REGISTRY_TIMEOUT_SECS")
                .unwrap_or_else(|_| "30".to_string())
                .parse()
                .unwrap_or(30),
        })
    }
}

/// Model metadata from registry
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModelMetadata {
    pub model_id: String,
    pub name: String,
    pub version: String,
    pub provider: String,
    pub model_type: ModelType,
    pub capabilities: Vec<ModelCapability>,
    pub context_window: u64,
    pub pricing: ModelPricing,
    pub performance: ModelPerformance,
    pub status: ModelStatus,
    pub registered_at: DateTime<Utc>,
    pub last_updated: DateTime<Utc>,
    pub tags: HashMap<String, String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum ModelType {
    TextGeneration,
    TextEmbedding,
    ImageGeneration,
    ImageAnalysis,
    AudioTranscription,
    AudioGeneration,
    MultiModal,
    CodeGeneration,
    FineTuned,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum ModelCapability {
    Chat,
    Completion,
    Embedding,
    FunctionCalling,
    Vision,
    Audio,
    Streaming,
    BatchProcessing,
    FineTuning,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModelPricing {
    pub currency: String,
    pub input_cost_per_1k_tokens: f64,
    pub output_cost_per_1k_tokens: f64,
    pub image_cost_per_unit: Option<f64>,
    pub audio_cost_per_minute: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModelPerformance {
    pub avg_latency_ms: f64,
    pub p95_latency_ms: f64,
    pub p99_latency_ms: f64,
    pub tokens_per_second: f64,
    pub availability: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum ModelStatus {
    Active,
    Deprecated,
    Preview,
    Maintenance,
    Retired,
}

/// Pipeline descriptor
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PipelineDescriptor {
    pub pipeline_id: String,
    pub name: String,
    pub version: String,
    pub description: String,
    pub stages: Vec<PipelineStage>,
    pub input_schema: serde_json::Value,
    pub output_schema: serde_json::Value,
    pub created_at: DateTime<Utc>,
    pub last_updated: DateTime<Utc>,
    pub owner: String,
    pub status: PipelineStatus,
    pub metrics: PipelineMetrics,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PipelineStage {
    pub stage_id: String,
    pub stage_name: String,
    pub stage_type: StageType,
    pub model_id: Option<String>,
    pub config: HashMap<String, serde_json::Value>,
    pub timeout_ms: u64,
    pub retry_policy: RetryPolicy,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum StageType {
    ModelInference,
    Preprocessing,
    Postprocessing,
    Embedding,
    Retrieval,
    Routing,
    Aggregation,
    Transform,
    Cache,
    RateLimit,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RetryPolicy {
    pub max_attempts: u32,
    pub initial_delay_ms: u64,
    pub max_delay_ms: u64,
    pub backoff_multiplier: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum PipelineStatus {
    Active,
    Paused,
    Draft,
    Archived,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PipelineMetrics {
    pub total_invocations: u64,
    pub success_rate: f64,
    pub avg_latency_ms: f64,
    pub avg_cost_per_invocation: f64,
}

/// Provider information
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProviderInfo {
    pub provider_id: String,
    pub name: String,
    pub status: ProviderStatus,
    pub api_version: String,
    pub models: Vec<String>,
    pub rate_limits: RateLimits,
    pub health: ProviderHealth,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum ProviderStatus {
    Operational,
    Degraded,
    Outage,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RateLimits {
    pub requests_per_minute: u64,
    pub tokens_per_minute: u64,
    pub tokens_per_day: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProviderHealth {
    pub availability: f64,
    pub avg_latency_ms: f64,
    pub error_rate: f64,
    pub last_checked: DateTime<Utc>,
}

/// Query parameters for models
#[derive(Debug, Clone, Default)]
pub struct ModelQuery {
    pub providers: Option<Vec<String>>,
    pub model_types: Option<Vec<ModelType>>,
    pub capabilities: Option<Vec<ModelCapability>>,
    pub status: Option<ModelStatus>,
    pub min_context_window: Option<u64>,
    pub tags: Option<HashMap<String, String>>,
}

/// Query parameters for pipelines
#[derive(Debug, Clone, Default)]
pub struct PipelineQuery {
    pub owner: Option<String>,
    pub status: Option<PipelineStatus>,
    pub model_ids: Option<Vec<String>>,
    pub created_after: Option<DateTime<Utc>>,
}

/// LLM-Registry adapter for consuming registry data
pub struct RegistryAdapter {
    config: RegistryConfig,
    connected: AtomicBool,
}

impl RegistryAdapter {
    pub fn new(config: RegistryConfig) -> Self {
        Self {
            config,
            connected: AtomicBool::new(false),
        }
    }

    /// Fetch model metadata by ID
    #[instrument(skip(self))]
    pub async fn fetch_model(&self, model_id: &str) -> Result<ModelMetadata> {
        if !self.connected.load(Ordering::Relaxed) {
            anyhow::bail!("Registry adapter not connected");
        }

        debug!(model_id = %model_id, "Fetching model metadata from Registry");

        // Placeholder implementation
        Ok(ModelMetadata {
            model_id: model_id.to_string(),
            name: model_id.to_string(),
            version: "1.0.0".to_string(),
            provider: "unknown".to_string(),
            model_type: ModelType::TextGeneration,
            capabilities: Vec::new(),
            context_window: 0,
            pricing: ModelPricing {
                currency: "USD".to_string(),
                input_cost_per_1k_tokens: 0.0,
                output_cost_per_1k_tokens: 0.0,
                image_cost_per_unit: None,
                audio_cost_per_minute: None,
            },
            performance: ModelPerformance {
                avg_latency_ms: 0.0,
                p95_latency_ms: 0.0,
                p99_latency_ms: 0.0,
                tokens_per_second: 0.0,
                availability: 0.0,
            },
            status: ModelStatus::Active,
            registered_at: Utc::now(),
            last_updated: Utc::now(),
            tags: HashMap::new(),
        })
    }

    /// List models matching query
    #[instrument(skip(self))]
    pub async fn list_models(&self, query: ModelQuery) -> Result<Vec<ModelMetadata>> {
        if !self.connected.load(Ordering::Relaxed) {
            anyhow::bail!("Registry adapter not connected");
        }

        debug!("Listing models from Registry");

        // Placeholder implementation
        Ok(Vec::new())
    }

    /// Fetch pipeline descriptor by ID
    #[instrument(skip(self))]
    pub async fn fetch_pipeline(&self, pipeline_id: &str) -> Result<PipelineDescriptor> {
        if !self.connected.load(Ordering::Relaxed) {
            anyhow::bail!("Registry adapter not connected");
        }

        debug!(pipeline_id = %pipeline_id, "Fetching pipeline descriptor from Registry");

        // Placeholder implementation
        Ok(PipelineDescriptor {
            pipeline_id: pipeline_id.to_string(),
            name: pipeline_id.to_string(),
            version: "1.0.0".to_string(),
            description: String::new(),
            stages: Vec::new(),
            input_schema: serde_json::json!({}),
            output_schema: serde_json::json!({}),
            created_at: Utc::now(),
            last_updated: Utc::now(),
            owner: "unknown".to_string(),
            status: PipelineStatus::Active,
            metrics: PipelineMetrics {
                total_invocations: 0,
                success_rate: 0.0,
                avg_latency_ms: 0.0,
                avg_cost_per_invocation: 0.0,
            },
        })
    }

    /// List pipelines matching query
    #[instrument(skip(self))]
    pub async fn list_pipelines(&self, query: PipelineQuery) -> Result<Vec<PipelineDescriptor>> {
        if !self.connected.load(Ordering::Relaxed) {
            anyhow::bail!("Registry adapter not connected");
        }

        debug!("Listing pipelines from Registry");

        // Placeholder implementation
        Ok(Vec::new())
    }

    /// Get provider information
    #[instrument(skip(self))]
    pub async fn fetch_provider(&self, provider_id: &str) -> Result<ProviderInfo> {
        if !self.connected.load(Ordering::Relaxed) {
            anyhow::bail!("Registry adapter not connected");
        }

        debug!(provider_id = %provider_id, "Fetching provider info from Registry");

        // Placeholder implementation
        Ok(ProviderInfo {
            provider_id: provider_id.to_string(),
            name: provider_id.to_string(),
            status: ProviderStatus::Operational,
            api_version: "1.0".to_string(),
            models: Vec::new(),
            rate_limits: RateLimits {
                requests_per_minute: 0,
                tokens_per_minute: 0,
                tokens_per_day: None,
            },
            health: ProviderHealth {
                availability: 0.0,
                avg_latency_ms: 0.0,
                error_rate: 0.0,
                last_checked: Utc::now(),
            },
        })
    }

    /// List all providers
    #[instrument(skip(self))]
    pub async fn list_providers(&self) -> Result<Vec<ProviderInfo>> {
        if !self.connected.load(Ordering::Relaxed) {
            anyhow::bail!("Registry adapter not connected");
        }

        debug!("Listing providers from Registry");

        // Placeholder implementation
        Ok(Vec::new())
    }
}

#[async_trait]
impl EcosystemAdapter for RegistryAdapter {
    #[instrument(skip(self))]
    async fn connect(&self) -> Result<()> {
        info!(endpoint = %self.config.endpoint, "Connecting to LLM-Registry");

        self.connected.store(true, Ordering::Relaxed);

        info!("Successfully connected to LLM-Registry");
        Ok(())
    }

    async fn health_check(&self) -> Result<AdapterHealth> {
        let start = Instant::now();

        if !self.connected.load(Ordering::Relaxed) {
            return Ok(AdapterHealth::unhealthy("registry", "Not connected"));
        }

        let latency_ms = start.elapsed().as_millis() as u64;
        Ok(AdapterHealth::healthy("registry", latency_ms))
    }

    #[instrument(skip(self))]
    async fn disconnect(&self) -> Result<()> {
        info!("Disconnecting from LLM-Registry");
        self.connected.store(false, Ordering::Relaxed);
        Ok(())
    }
}
