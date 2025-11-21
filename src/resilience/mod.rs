//! Resilience Patterns
//!
//! Circuit breaker, retry, and fallback patterns for fault tolerance.

pub mod circuit_breaker;
pub mod retry;

pub use circuit_breaker::CircuitBreaker;
pub use retry::RetryPolicy;

use anyhow::Result;

/// Resilience configuration
#[derive(Debug, Clone)]
pub struct ResilienceConfig {
    /// Circuit breaker failure threshold
    pub failure_threshold: usize,

    /// Circuit breaker timeout (seconds)
    pub timeout_seconds: u64,

    /// Maximum retry attempts
    pub max_retries: usize,

    /// Initial retry delay (milliseconds)
    pub retry_delay_ms: u64,

    /// Exponential backoff multiplier
    pub backoff_multiplier: f64,
}

impl Default for ResilienceConfig {
    fn default() -> Self {
        Self {
            failure_threshold: 5,
            timeout_seconds: 60,
            max_retries: 3,
            retry_delay_ms: 100,
            backoff_multiplier: 2.0,
        }
    }
}

/// Execute an operation with circuit breaker and retry
pub async fn execute_with_resilience<F, T, E>(
    circuit_breaker: &CircuitBreaker,
    retry_policy: &RetryPolicy,
    operation: F,
) -> Result<T>
where
    F: Fn() -> std::pin::Pin<Box<dyn std::future::Future<Output = Result<T, E>> + Send>> + Send + Sync,
    E: std::error::Error + Send + Sync + 'static,
{
    // Check circuit breaker
    if !circuit_breaker.is_available().await {
        anyhow::bail!("Circuit breaker is open");
    }

    // Execute with retry
    let result = retry_policy.execute(operation).await;

    // Update circuit breaker state
    match &result {
        Ok(_) => circuit_breaker.record_success().await,
        Err(_) => circuit_breaker.record_failure().await,
    }

    result.map_err(|e| anyhow::anyhow!("Operation failed: {}", e))
}
