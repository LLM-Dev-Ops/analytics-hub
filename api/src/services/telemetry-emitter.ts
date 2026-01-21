/**
 * Telemetry Emitter
 *
 * Emits telemetry compatible with LLM-Observatory for agent monitoring.
 *
 * @module services/telemetry-emitter
 */

import { logger } from '../logger';

/**
 * Telemetry event types
 */
export type TelemetryEventType =
  | 'agent_invocation_started'
  | 'agent_invocation_completed'
  | 'agent_invocation_failed'
  | 'consensus_computation_started'
  | 'consensus_computation_completed'
  | 'decision_event_emitted'
  | 'persistence_started'
  | 'persistence_completed'
  | 'persistence_failed';

/**
 * Telemetry event data
 */
export interface TelemetryEvent {
  eventType: TelemetryEventType;
  agentId: string;
  agentVersion: string;
  executionRef: string;
  timestamp: string;
  durationMs?: number;
  metadata?: Record<string, unknown>;
  error?: {
    code: string;
    message: string;
    stack?: string;
  };
}

/**
 * Observatory telemetry configuration
 */
export interface ObservatoryConfig {
  endpoint: string;
  apiKey?: string;
  enabled: boolean;
  batchSize: number;
  flushIntervalMs: number;
}

const DEFAULT_CONFIG: ObservatoryConfig = {
  endpoint: process.env.OBSERVATORY_ENDPOINT || 'http://localhost:9090',
  apiKey: process.env.OBSERVATORY_API_KEY,
  enabled: process.env.TELEMETRY_ENABLED !== 'false',
  batchSize: 100,
  flushIntervalMs: 5000,
};

/**
 * Telemetry Emitter
 *
 * Batches and sends telemetry events to LLM-Observatory.
 */
export class TelemetryEmitter {
  private config: ObservatoryConfig;
  private buffer: TelemetryEvent[] = [];
  private flushTimer: NodeJS.Timeout | null = null;

  constructor(config: Partial<ObservatoryConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };

    if (this.config.enabled) {
      this.startFlushTimer();
    }
  }

  /**
   * Emit a telemetry event
   */
  emit(event: Omit<TelemetryEvent, 'timestamp'>): void {
    if (!this.config.enabled) return;

    const telemetryEvent: TelemetryEvent = {
      ...event,
      timestamp: new Date().toISOString(),
    };

    this.buffer.push(telemetryEvent);

    if (this.buffer.length >= this.config.batchSize) {
      this.flush().catch(err => {
        logger.warn({ msg: 'Telemetry flush failed', error: err.message });
      });
    }
  }

  /**
   * Emit agent invocation start
   */
  emitInvocationStarted(agentId: string, agentVersion: string, executionRef: string): void {
    this.emit({
      eventType: 'agent_invocation_started',
      agentId,
      agentVersion,
      executionRef,
    });
  }

  /**
   * Emit agent invocation completion
   */
  emitInvocationCompleted(
    agentId: string,
    agentVersion: string,
    executionRef: string,
    durationMs: number,
    metadata?: Record<string, unknown>
  ): void {
    this.emit({
      eventType: 'agent_invocation_completed',
      agentId,
      agentVersion,
      executionRef,
      durationMs,
      metadata,
    });
  }

  /**
   * Emit agent invocation failure
   */
  emitInvocationFailed(
    agentId: string,
    agentVersion: string,
    executionRef: string,
    error: Error,
    durationMs: number
  ): void {
    this.emit({
      eventType: 'agent_invocation_failed',
      agentId,
      agentVersion,
      executionRef,
      durationMs,
      error: {
        code: error.name,
        message: error.message,
        stack: error.stack,
      },
    });
  }

  /**
   * Emit decision event emission
   */
  emitDecisionEventEmitted(
    agentId: string,
    agentVersion: string,
    executionRef: string,
    decisionType: string,
    confidence: number
  ): void {
    this.emit({
      eventType: 'decision_event_emitted',
      agentId,
      agentVersion,
      executionRef,
      metadata: {
        decisionType,
        confidence,
      },
    });
  }

  /**
   * Flush buffered events to Observatory
   */
  async flush(): Promise<void> {
    if (this.buffer.length === 0) return;

    const events = [...this.buffer];
    this.buffer = [];

    try {
      const response = await fetch(`${this.config.endpoint}/api/v1/telemetry/batch`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(this.config.apiKey ? { 'Authorization': `Bearer ${this.config.apiKey}` } : {}),
        },
        body: JSON.stringify({ events }),
      });

      if (!response.ok) {
        throw new Error(`Observatory error: ${response.status}`);
      }
    } catch (error) {
      // Re-add events to buffer on failure
      this.buffer = [...events, ...this.buffer].slice(0, this.config.batchSize * 2);
      throw error;
    }
  }

  /**
   * Start the flush timer
   */
  private startFlushTimer(): void {
    this.flushTimer = setInterval(() => {
      this.flush().catch(err => {
        logger.warn({ msg: 'Telemetry auto-flush failed', error: err.message });
      });
    }, this.config.flushIntervalMs);
  }

  /**
   * Stop the emitter and flush remaining events
   */
  async shutdown(): Promise<void> {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
    await this.flush();
  }
}

/**
 * Singleton instance
 */
let emitterInstance: TelemetryEmitter | null = null;

/**
 * Get the telemetry emitter instance
 */
export function getTelemetryEmitter(config?: Partial<ObservatoryConfig>): TelemetryEmitter {
  if (!emitterInstance) {
    emitterInstance = new TelemetryEmitter(config);
  }
  return emitterInstance;
}

/**
 * Reset the emitter instance (for testing)
 */
export function resetTelemetryEmitter(): void {
  emitterInstance = null;
}
