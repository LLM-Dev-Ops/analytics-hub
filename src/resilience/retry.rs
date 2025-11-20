//! Retry Policy Implementation
//!
//! Configurable retry logic with exponential backoff.

use std::time::Duration;
use tokio::time::sleep;
use tracing::{debug, warn};

/// Retry policy configuration
pub struct RetryPolicy {
    max_attempts: usize,
    initial_delay: Duration,
    max_delay: Duration,
    multiplier: f64,
}

impl RetryPolicy {
    /// Create a new retry policy
    pub fn new(max_attempts: usize, initial_delay_ms: u64, multiplier: f64) -> Self {
        Self {
            max_attempts,
            initial_delay: Duration::from_millis(initial_delay_ms),
            max_delay: Duration::from_secs(30),
            multiplier,
        }
    }

    /// Execute an operation with retry
    pub async fn execute<F, T, E>(&self, operation: F) -> Result<T, E>
    where
        F: Fn() -> std::pin::Pin<Box<dyn std::future::Future<Output = Result<T, E>> + Send>> + Send + Sync,
        E: std::fmt::Display,
    {
        let mut attempts = 0;
        let mut delay = self.initial_delay;

        loop {
            attempts += 1;

            match operation().await {
                Ok(result) => {
                    if attempts > 1 {
                        debug!("Operation succeeded after {} attempts", attempts);
                    }
                    return Ok(result);
                }
                Err(err) => {
                    if attempts >= self.max_attempts {
                        warn!(
                            "Operation failed after {} attempts: {}",
                            attempts, err
                        );
                        return Err(err);
                    }

                    warn!(
                        "Operation failed (attempt {}/{}): {}. Retrying in {:?}",
                        attempts, self.max_attempts, err, delay
                    );

                    sleep(delay).await;

                    // Exponential backoff
                    delay = Duration::from_millis(
                        (delay.as_millis() as f64 * self.multiplier) as u64
                    )
                    .min(self.max_delay);
                }
            }
        }
    }
}

impl Default for RetryPolicy {
    fn default() -> Self {
        Self::new(3, 100, 2.0)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicUsize, Ordering};
    use std::sync::Arc;

    #[tokio::test]
    async fn test_retry_success_after_failures() {
        let policy = RetryPolicy::new(5, 10, 2.0);
        let counter = Arc::new(AtomicUsize::new(0));
        let counter_clone = counter.clone();

        let result = policy
            .execute(|| {
                let counter = counter_clone.clone();
                Box::pin(async move {
                    let count = counter.fetch_add(1, Ordering::SeqCst);
                    if count < 2 {
                        Err("Temporary failure")
                    } else {
                        Ok("Success")
                    }
                })
            })
            .await;

        assert!(result.is_ok());
        assert_eq!(result.unwrap(), "Success");
        assert_eq!(counter.load(Ordering::SeqCst), 3);
    }

    #[tokio::test]
    async fn test_retry_exhaustion() {
        let policy = RetryPolicy::new(3, 10, 2.0);

        let result = policy
            .execute(|| Box::pin(async { Err::<(), _>("Always fails") }))
            .await;

        assert!(result.is_err());
    }
}
