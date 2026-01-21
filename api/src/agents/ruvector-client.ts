/**
 * RuVector Service Client for Agent Decision Persistence
 *
 * HTTP-only client for persisting DecisionEvents to ruvector-service.
 * This client NEVER connects directly to databases - all operations
 * go through ruvector-service HTTP API.
 *
 * Features:
 * - Async, non-blocking writes with retry logic
 * - Circuit breaker pattern for resilience
 * - Telemetry emission for monitoring
 * - Request/response validation
 * - Connection pooling via fetch API
 *
 * @module agents/ruvector-client
 */

import { DecisionEvent, DecisionEventSchema } from '../contracts/decision-event';
import { logger } from '../logger';

/**
 * Configuration for RuVector client
 */
export interface RuVectorClientConfig {
  /** ruvector-service endpoint URL */
  endpoint: string;
  /** API key for authentication */
  apiKey?: string;
  /** Request timeout in milliseconds */
  timeoutMs?: number;
  /** Number of retry attempts for failed requests */
  retryAttempts?: number;
  /** Initial retry delay in milliseconds (uses exponential backoff) */
  retryDelayMs?: number;
  /** Circuit breaker failure threshold */
  circuitBreakerThreshold?: number;
  /** Circuit breaker reset timeout in milliseconds */
  circuitBreakerResetMs?: number;
  /** Enable telemetry emission */
  telemetryEnabled?: boolean;
}

/**
 * Search query parameters for DecisionEvents
 */
export interface SearchQuery {
  /** Filter by agent ID */
  agentId?: string;
  /** Filter by decision type */
  decisionType?: string;
  /** Start time for time range filter (ISO 8601) */
  startTime?: string;
  /** End time for time range filter (ISO 8601) */
  endTime?: string;
  /** Minimum confidence threshold (0-1) */
  minConfidence?: number;
  /** Maximum number of results */
  limit?: number;
  /** Offset for pagination */
  offset?: number;
  /** Execution reference UUID */
  executionRef?: string;
}

/**
 * Telemetry event for monitoring
 */
export interface TelemetryEvent {
  operation: 'store' | 'search' | 'get' | 'health';
  success: boolean;
  latencyMs: number;
  timestamp: Date;
  error?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Circuit breaker states
 */
enum CircuitState {
  CLOSED = 'CLOSED',
  OPEN = 'OPEN',
  HALF_OPEN = 'HALF_OPEN',
}

/**
 * RuVector Service Client
 *
 * Provides async, non-blocking persistence for DecisionEvents
 * with built-in resilience patterns and telemetry.
 */
export class RuVectorClient {
  private config: Required<RuVectorClientConfig>;
  private circuitState: CircuitState = CircuitState.CLOSED;
  private failureCount: number = 0;
  private lastFailureTime: number = 0;
  private telemetryBuffer: TelemetryEvent[] = [];

  /**
   * Default configuration values
   */
  private static readonly DEFAULT_CONFIG: Required<RuVectorClientConfig> = {
    endpoint: process.env.RUVECTOR_ENDPOINT || 'http://localhost:8080',
    apiKey: process.env.RUVECTOR_API_KEY || '',
    timeoutMs: 5000,
    retryAttempts: 3,
    retryDelayMs: 1000,
    circuitBreakerThreshold: 5,
    circuitBreakerResetMs: 60000,
    telemetryEnabled: true,
  };

  constructor(config?: Partial<RuVectorClientConfig>) {
    this.config = {
      ...RuVectorClient.DEFAULT_CONFIG,
      ...config,
    };

    logger.info({
      msg: 'RuVectorClient initialized',
      endpoint: this.config.endpoint,
      telemetryEnabled: this.config.telemetryEnabled,
    });
  }

  /**
   * Store a DecisionEvent
   *
   * Async, non-blocking write with automatic retries and circuit breaker.
   *
   * @param event - DecisionEvent to persist
   * @returns Promise resolving to the stored event ID
   * @throws Error if persistence fails after all retries
   */
  async storeDecisionEvent(event: DecisionEvent): Promise<string> {
    const startTime = Date.now();

    try {
      // Validate event schema
      const validatedEvent = DecisionEventSchema.parse(event);

      // Check circuit breaker
      this.checkCircuitBreaker();

      // Attempt to store with retries
      const response = await this.retryOperation(async () => {
        return await this.makeRequest<{ eventId: string }>('/api/v1/decision-events', {
          method: 'POST',
          body: JSON.stringify(validatedEvent),
        });
      });

      // Record success
      this.recordSuccess();
      this.emitTelemetry({
        operation: 'store',
        success: true,
        latencyMs: Date.now() - startTime,
        timestamp: new Date(),
        metadata: {
          agentId: event.agent_id,
          executionRef: event.execution_ref,
        },
      });

      logger.info({
        msg: 'DecisionEvent stored successfully',
        eventId: response.eventId,
        agentId: event.agent_id,
        executionRef: event.execution_ref,
        latencyMs: Date.now() - startTime,
      });

      return response.eventId;
    } catch (error) {
      this.recordFailure();
      this.emitTelemetry({
        operation: 'store',
        success: false,
        latencyMs: Date.now() - startTime,
        timestamp: new Date(),
        error: error instanceof Error ? error.message : String(error),
        metadata: {
          agentId: event.agent_id,
          executionRef: event.execution_ref,
        },
      });

      logger.error({
        msg: 'Failed to store DecisionEvent',
        error: error instanceof Error ? error.message : String(error),
        agentId: event.agent_id,
        executionRef: event.execution_ref,
      });

      throw error;
    }
  }

  /**
   * Search for DecisionEvents
   *
   * @param query - Search parameters
   * @returns Promise resolving to array of matching DecisionEvents
   */
  async searchDecisionEvents(query: SearchQuery): Promise<DecisionEvent[]> {
    const startTime = Date.now();

    try {
      // Check circuit breaker
      this.checkCircuitBreaker();

      // Build query parameters
      const params = new URLSearchParams();
      if (query.agentId) params.set('agent_id', query.agentId);
      if (query.decisionType) params.set('decision_type', query.decisionType);
      if (query.startTime) params.set('start_time', query.startTime);
      if (query.endTime) params.set('end_time', query.endTime);
      if (query.minConfidence !== undefined) params.set('min_confidence', String(query.minConfidence));
      if (query.limit) params.set('limit', String(query.limit));
      if (query.offset) params.set('offset', String(query.offset));
      if (query.executionRef) params.set('execution_ref', query.executionRef);

      // Execute search
      const response = await this.retryOperation(async () => {
        return await this.makeRequest<{ events: DecisionEvent[] }>(
          `/api/v1/decision-events?${params.toString()}`,
          { method: 'GET' }
        );
      });

      // Validate response events
      const validatedEvents = response.events.map(event => DecisionEventSchema.parse(event));

      // Record success
      this.recordSuccess();
      this.emitTelemetry({
        operation: 'search',
        success: true,
        latencyMs: Date.now() - startTime,
        timestamp: new Date(),
        metadata: {
          resultCount: validatedEvents.length,
          query,
        },
      });

      logger.debug({
        msg: 'DecisionEvents search completed',
        resultCount: validatedEvents.length,
        latencyMs: Date.now() - startTime,
        query,
      });

      return validatedEvents;
    } catch (error) {
      this.recordFailure();
      this.emitTelemetry({
        operation: 'search',
        success: false,
        latencyMs: Date.now() - startTime,
        timestamp: new Date(),
        error: error instanceof Error ? error.message : String(error),
        metadata: { query },
      });

      logger.error({
        msg: 'Failed to search DecisionEvents',
        error: error instanceof Error ? error.message : String(error),
        query,
      });

      throw error;
    }
  }

  /**
   * Get a specific DecisionEvent by ID
   *
   * @param id - Event ID
   * @returns Promise resolving to the DecisionEvent or null if not found
   */
  async getDecisionEvent(id: string): Promise<DecisionEvent | null> {
    const startTime = Date.now();

    try {
      // Check circuit breaker
      this.checkCircuitBreaker();

      // Fetch event by ID
      const response = await this.retryOperation(async () => {
        return await this.makeRequest<{ event: DecisionEvent | null }>(
          `/api/v1/decision-events/${encodeURIComponent(id)}`,
          { method: 'GET' }
        );
      });

      // Validate event if present
      const validatedEvent = response.event ? DecisionEventSchema.parse(response.event) : null;

      // Record success
      this.recordSuccess();
      this.emitTelemetry({
        operation: 'get',
        success: true,
        latencyMs: Date.now() - startTime,
        timestamp: new Date(),
        metadata: {
          eventId: id,
          found: validatedEvent !== null,
        },
      });

      logger.debug({
        msg: 'DecisionEvent retrieval completed',
        eventId: id,
        found: validatedEvent !== null,
        latencyMs: Date.now() - startTime,
      });

      return validatedEvent;
    } catch (error) {
      // Handle 404 as not found (not a failure)
      if (error instanceof Error && error.message.includes('404')) {
        this.recordSuccess();
        this.emitTelemetry({
          operation: 'get',
          success: true,
          latencyMs: Date.now() - startTime,
          timestamp: new Date(),
          metadata: {
            eventId: id,
            found: false,
          },
        });

        logger.debug({
          msg: 'DecisionEvent not found',
          eventId: id,
        });

        return null;
      }

      this.recordFailure();
      this.emitTelemetry({
        operation: 'get',
        success: false,
        latencyMs: Date.now() - startTime,
        timestamp: new Date(),
        error: error instanceof Error ? error.message : String(error),
        metadata: { eventId: id },
      });

      logger.error({
        msg: 'Failed to get DecisionEvent',
        error: error instanceof Error ? error.message : String(error),
        eventId: id,
      });

      throw error;
    }
  }

  /**
   * Health check for ruvector-service
   *
   * @returns Promise resolving to health status
   */
  async healthCheck(): Promise<{ healthy: boolean; latencyMs: number; circuitState: CircuitState }> {
    const startTime = Date.now();

    try {
      const response = await this.makeRequest<{ status: string }>('/health', { method: 'GET' });
      const latencyMs = Date.now() - startTime;

      this.emitTelemetry({
        operation: 'health',
        success: true,
        latencyMs,
        timestamp: new Date(),
      });

      return {
        healthy: response.status === 'healthy',
        latencyMs,
        circuitState: this.circuitState,
      };
    } catch (error) {
      const latencyMs = Date.now() - startTime;

      this.emitTelemetry({
        operation: 'health',
        success: false,
        latencyMs,
        timestamp: new Date(),
        error: error instanceof Error ? error.message : String(error),
      });

      return {
        healthy: false,
        latencyMs,
        circuitState: this.circuitState,
      };
    }
  }

  /**
   * Get buffered telemetry events and clear buffer
   *
   * @returns Array of telemetry events
   */
  getTelemetry(): TelemetryEvent[] {
    const events = [...this.telemetryBuffer];
    this.telemetryBuffer = [];
    return events;
  }

  /**
   * Check circuit breaker state
   *
   * @throws Error if circuit is OPEN
   */
  private checkCircuitBreaker(): void {
    const now = Date.now();

    if (this.circuitState === CircuitState.OPEN) {
      // Check if reset timeout has elapsed
      if (now - this.lastFailureTime >= this.config.circuitBreakerResetMs) {
        logger.info({
          msg: 'Circuit breaker transitioning to HALF_OPEN',
          failureCount: this.failureCount,
        });
        this.circuitState = CircuitState.HALF_OPEN;
        this.failureCount = 0;
      } else {
        throw new Error('Circuit breaker is OPEN - service unavailable');
      }
    }
  }

  /**
   * Record successful operation
   */
  private recordSuccess(): void {
    if (this.circuitState === CircuitState.HALF_OPEN) {
      logger.info({
        msg: 'Circuit breaker transitioning to CLOSED',
      });
      this.circuitState = CircuitState.CLOSED;
    }
    this.failureCount = 0;
  }

  /**
   * Record failed operation
   */
  private recordFailure(): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();

    if (this.failureCount >= this.config.circuitBreakerThreshold) {
      logger.warn({
        msg: 'Circuit breaker transitioning to OPEN',
        failureCount: this.failureCount,
        threshold: this.config.circuitBreakerThreshold,
      });
      this.circuitState = CircuitState.OPEN;
    }
  }

  /**
   * Emit telemetry event
   */
  private emitTelemetry(event: TelemetryEvent): void {
    if (!this.config.telemetryEnabled) {
      return;
    }

    this.telemetryBuffer.push(event);

    // Limit buffer size to prevent memory leaks
    if (this.telemetryBuffer.length > 1000) {
      this.telemetryBuffer.shift();
    }
  }

  /**
   * Retry operation with exponential backoff
   */
  private async retryOperation<T>(operation: () => Promise<T>): Promise<T> {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= this.config.retryAttempts; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        if (attempt < this.config.retryAttempts) {
          const delayMs = this.config.retryDelayMs * Math.pow(2, attempt - 1);
          logger.debug({
            msg: 'Retrying operation',
            attempt,
            maxAttempts: this.config.retryAttempts,
            delayMs,
            error: lastError.message,
          });
          await this.delay(delayMs);
        }
      }
    }

    throw lastError || new Error('Operation failed after all retries');
  }

  /**
   * Make HTTP request to ruvector-service
   */
  private async makeRequest<T>(
    path: string,
    options: { method: string; body?: string }
  ): Promise<T> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.config.timeoutMs);

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      };

      if (this.config.apiKey) {
        headers['Authorization'] = `Bearer ${this.config.apiKey}`;
      }

      const response = await fetch(`${this.config.endpoint}${path}`, {
        method: options.method,
        headers,
        body: options.body,
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`ruvector-service error: ${response.status} - ${errorText}`);
      }

      return await response.json() as T;
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error(`Request timeout after ${this.config.timeoutMs}ms`);
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Delay helper for retries
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * Singleton instance for shared client usage
 */
let clientInstance: RuVectorClient | null = null;

/**
 * Get or create the singleton RuVectorClient instance
 *
 * @param config - Optional configuration (only used on first call)
 * @returns Singleton RuVectorClient instance
 */
export function getRuVectorClient(config?: Partial<RuVectorClientConfig>): RuVectorClient {
  if (!clientInstance) {
    clientInstance = new RuVectorClient(config);
  }
  return clientInstance;
}

/**
 * Reset the singleton instance (primarily for testing)
 */
export function resetRuVectorClient(): void {
  clientInstance = null;
}
