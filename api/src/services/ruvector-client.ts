/**
 * RuVector Service Client
 *
 * Client for persisting DecisionEvents to ruvector-service.
 * ruvector-service is backed by Google SQL (Postgres).
 *
 * CRITICAL: LLM-Analytics-Hub NEVER connects directly to Google SQL.
 * ALL persistence occurs via this client to ruvector-service only.
 *
 * @module services/ruvector-client
 */

import { DecisionEvent } from '../contracts/decision-event';
import { logger } from '../logger';

/**
 * RuVector service configuration
 */
export interface RuVectorConfig {
  /** ruvector-service endpoint URL */
  endpoint: string;
  /** API key for authentication */
  apiKey?: string;
  /** Request timeout in milliseconds */
  timeoutMs: number;
  /** Number of retry attempts */
  retryAttempts: number;
  /** Delay between retries in milliseconds */
  retryDelayMs: number;
}

/**
 * Default configuration
 */
const DEFAULT_CONFIG: RuVectorConfig = {
  endpoint: process.env.RUVECTOR_ENDPOINT || 'http://localhost:8080',
  apiKey: process.env.RUVECTOR_API_KEY,
  timeoutMs: 5000,
  retryAttempts: 3,
  retryDelayMs: 1000,
};

/**
 * Response from ruvector-service
 */
export interface RuVectorResponse {
  success: boolean;
  eventId?: string;
  error?: string;
  timestamp: string;
}

/**
 * RuVector Service Client
 *
 * Handles all persistence operations for DecisionEvents.
 * This is the ONLY way LLM-Analytics-Hub agents persist data.
 */
export class RuVectorClient {
  private config: RuVectorConfig;

  constructor(config: Partial<RuVectorConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Persist a DecisionEvent to ruvector-service
   *
   * @param event - The DecisionEvent to persist
   * @returns Promise resolving to the persistence result
   * @throws Error if persistence fails after all retries
   */
  async persistDecisionEvent(event: DecisionEvent): Promise<RuVectorResponse> {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= this.config.retryAttempts; attempt++) {
      try {
        const response = await this.makeRequest('/api/v1/decision-events', {
          method: 'POST',
          body: JSON.stringify(event),
        });

        if (response.success) {
          logger.info({
            msg: 'DecisionEvent persisted successfully',
            agentId: event.agent_id,
            executionRef: event.execution_ref,
            eventId: response.eventId,
          });
          return response;
        }

        lastError = new Error(response.error || 'Unknown persistence error');
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        logger.warn({
          msg: 'DecisionEvent persistence attempt failed',
          attempt,
          maxAttempts: this.config.retryAttempts,
          error: lastError.message,
        });

        if (attempt < this.config.retryAttempts) {
          await this.delay(this.config.retryDelayMs * attempt);
        }
      }
    }

    logger.error({
      msg: 'DecisionEvent persistence failed after all retries',
      agentId: event.agent_id,
      executionRef: event.execution_ref,
      error: lastError?.message,
    });

    throw lastError || new Error('Persistence failed');
  }

  /**
   * Query DecisionEvents from ruvector-service
   *
   * @param query - Query parameters
   * @returns Promise resolving to matching DecisionEvents
   */
  async queryDecisionEvents(query: {
    agentId?: string;
    decisionType?: string;
    startTime?: string;
    endTime?: string;
    limit?: number;
    offset?: number;
  }): Promise<DecisionEvent[]> {
    const params = new URLSearchParams();
    if (query.agentId) params.set('agent_id', query.agentId);
    if (query.decisionType) params.set('decision_type', query.decisionType);
    if (query.startTime) params.set('start_time', query.startTime);
    if (query.endTime) params.set('end_time', query.endTime);
    if (query.limit) params.set('limit', String(query.limit));
    if (query.offset) params.set('offset', String(query.offset));

    const response = await this.makeRequest(`/api/v1/decision-events?${params.toString()}`, {
      method: 'GET',
    });

    return response.events || [];
  }

  /**
   * Health check for ruvector-service
   *
   * @returns Promise resolving to health status
   */
  async healthCheck(): Promise<{ healthy: boolean; latencyMs: number }> {
    const start = Date.now();
    try {
      const response = await this.makeRequest('/health', { method: 'GET' });
      return {
        healthy: response.status === 'healthy',
        latencyMs: Date.now() - start,
      };
    } catch {
      return {
        healthy: false,
        latencyMs: Date.now() - start,
      };
    }
  }

  /**
   * Make HTTP request to ruvector-service
   */
  private async makeRequest(
    path: string,
    options: { method: string; body?: string }
  ): Promise<any> {
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

      return await response.json();
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
 * Singleton instance
 */
let clientInstance: RuVectorClient | null = null;

/**
 * Get the RuVector client instance
 */
export function getRuVectorClient(config?: Partial<RuVectorConfig>): RuVectorClient {
  if (!clientInstance) {
    clientInstance = new RuVectorClient(config);
  }
  return clientInstance;
}

/**
 * Reset the client instance (for testing)
 */
export function resetRuVectorClient(): void {
  clientInstance = null;
}
