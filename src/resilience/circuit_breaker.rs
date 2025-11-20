//! Circuit Breaker Implementation
//!
//! Prevents cascading failures by breaking the circuit when error rate exceeds threshold.

use std::sync::Arc;
use tokio::sync::RwLock;
use tokio::time::{Duration, Instant};
use tracing::{info, warn};

/// Circuit breaker states
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum CircuitState {
    /// Circuit is closed, operations allowed
    Closed,
    /// Circuit is open, operations blocked
    Open,
    /// Circuit is half-open, testing if service recovered
    HalfOpen,
}

/// Circuit breaker for fault tolerance
pub struct CircuitBreaker {
    state: Arc<RwLock<CircuitBreakerState>>,
    failure_threshold: usize,
    timeout: Duration,
}

struct CircuitBreakerState {
    state: CircuitState,
    failure_count: usize,
    success_count: usize,
    last_failure_time: Option<Instant>,
}

impl CircuitBreaker {
    /// Create a new circuit breaker
    pub fn new(failure_threshold: usize, timeout_seconds: u64) -> Self {
        Self {
            state: Arc::new(RwLock::new(CircuitBreakerState {
                state: CircuitState::Closed,
                failure_count: 0,
                success_count: 0,
                last_failure_time: None,
            })),
            failure_threshold,
            timeout: Duration::from_secs(timeout_seconds),
        }
    }

    /// Check if circuit breaker allows operations
    pub async fn is_available(&self) -> bool {
        let mut state = self.state.write().await;

        match state.state {
            CircuitState::Closed => true,
            CircuitState::Open => {
                // Check if timeout has elapsed
                if let Some(last_failure) = state.last_failure_time {
                    if Instant::now() - last_failure > self.timeout {
                        info!("Circuit breaker transitioning to half-open");
                        state.state = CircuitState::HalfOpen;
                        state.failure_count = 0;
                        state.success_count = 0;
                        return true;
                    }
                }
                false
            }
            CircuitState::HalfOpen => true,
        }
    }

    /// Record a successful operation
    pub async fn record_success(&self) {
        let mut state = self.state.write().await;

        match state.state {
            CircuitState::HalfOpen => {
                state.success_count += 1;
                if state.success_count >= 3 {
                    info!("Circuit breaker closing after successful recovery");
                    state.state = CircuitState::Closed;
                    state.failure_count = 0;
                    state.success_count = 0;
                    state.last_failure_time = None;
                }
            }
            CircuitState::Closed => {
                state.failure_count = 0;
            }
            CircuitState::Open => {}
        }
    }

    /// Record a failed operation
    pub async fn record_failure(&self) {
        let mut state = self.state.write().await;

        state.failure_count += 1;
        state.last_failure_time = Some(Instant::now());

        match state.state {
            CircuitState::Closed => {
                if state.failure_count >= self.failure_threshold {
                    warn!(
                        "Circuit breaker opening after {} failures",
                        state.failure_count
                    );
                    state.state = CircuitState::Open;
                }
            }
            CircuitState::HalfOpen => {
                warn!("Circuit breaker reopening after failure in half-open state");
                state.state = CircuitState::Open;
                state.success_count = 0;
            }
            CircuitState::Open => {}
        }
    }

    /// Get current circuit state
    pub async fn get_state(&self) -> CircuitState {
        self.state.read().await.state.clone()
    }

    /// Reset circuit breaker to closed state
    pub async fn reset(&self) {
        let mut state = self.state.write().await;
        state.state = CircuitState::Closed;
        state.failure_count = 0;
        state.success_count = 0;
        state.last_failure_time = None;
        info!("Circuit breaker reset to closed state");
    }

    /// Get circuit breaker statistics
    pub async fn get_stats(&self) -> CircuitBreakerStats {
        let state = self.state.read().await;
        CircuitBreakerStats {
            state: state.state.clone(),
            failure_count: state.failure_count,
            success_count: state.success_count,
        }
    }
}

/// Circuit breaker statistics
#[derive(Debug, Clone)]
pub struct CircuitBreakerStats {
    pub state: CircuitState,
    pub failure_count: usize,
    pub success_count: usize,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_circuit_breaker_opens_on_failures() {
        let cb = CircuitBreaker::new(3, 60);

        assert_eq!(cb.get_state().await, CircuitState::Closed);
        assert!(cb.is_available().await);

        // Record failures
        for _ in 0..3 {
            cb.record_failure().await;
        }

        assert_eq!(cb.get_state().await, CircuitState::Open);
        assert!(!cb.is_available().await);
    }

    #[tokio::test]
    async fn test_circuit_breaker_closes_on_success() {
        let cb = CircuitBreaker::new(3, 1);

        // Open the circuit
        for _ in 0..3 {
            cb.record_failure().await;
        }
        assert_eq!(cb.get_state().await, CircuitState::Open);

        // Wait for timeout
        tokio::time::sleep(Duration::from_secs(2)).await;

        // Should transition to half-open
        assert!(cb.is_available().await);
        assert_eq!(cb.get_state().await, CircuitState::HalfOpen);

        // Record successes
        for _ in 0..3 {
            cb.record_success().await;
        }

        assert_eq!(cb.get_state().await, CircuitState::Closed);
    }
}
