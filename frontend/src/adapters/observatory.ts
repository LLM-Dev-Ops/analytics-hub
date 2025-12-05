/**
 * LLM-Observatory Adapter (Frontend)
 *
 * Thin adapter for consuming telemetry, usage traces, and time-series
 * performance metrics from LLM-Observatory via the API.
 */

import { getApi } from '../services/api';
import type {
  AdapterHealth,
  EcosystemAdapter,
  TimeRange,
  PaginationOptions,
} from './types';
import { healthyAdapter, unhealthyAdapter } from './types';

/**
 * Telemetry data point
 */
export interface TelemetryPoint {
  timestamp: Date;
  metricName: string;
  value: number;
  unit: string;
  tags: Record<string, string>;
  modelId?: string;
  provider?: string;
}

/**
 * Usage trace
 */
export interface UsageTrace {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  operationName: string;
  startTime: Date;
  endTime: Date;
  durationMs: number;
  status: 'ok' | 'error' | 'timeout';
  attributes: Record<string, unknown>;
  tokenUsage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

/**
 * Performance metrics for dashboard display
 */
export interface PerformanceMetrics {
  metricId: string;
  measurement: string;
  timeRange: TimeRange;
  dataPoints: Array<{ timestamp: Date; value: number }>;
  aggregations: {
    min: number;
    max: number;
    avg: number;
    p50: number;
    p95: number;
    p99: number;
    count: number;
  };
}

/**
 * Query parameters
 */
export interface TelemetryQuery extends PaginationOptions {
  metricNames?: string[];
  startTime?: Date;
  endTime?: Date;
  modelIds?: string[];
  providers?: string[];
}

export interface TraceQuery extends PaginationOptions {
  traceIds?: string[];
  operationNames?: string[];
  startTime?: Date;
  endTime?: Date;
  minDurationMs?: number;
  status?: 'ok' | 'error' | 'timeout';
}

/**
 * LLM-Observatory adapter for frontend
 */
export class ObservatoryAdapter implements EcosystemAdapter {
  private connected: boolean = false;
  private apiBasePath = '/adapters/observatory';

  async connect(): Promise<void> {
    console.debug('[ObservatoryAdapter] Connecting...');
    this.connected = true;
    console.debug('[ObservatoryAdapter] Connected');
  }

  async healthCheck(): Promise<AdapterHealth> {
    const start = Date.now();

    if (!this.connected) {
      return unhealthyAdapter('observatory', 'Not connected');
    }

    try {
      // In production, would call health endpoint
      const latencyMs = Date.now() - start;
      return healthyAdapter('observatory', latencyMs);
    } catch (error) {
      return unhealthyAdapter('observatory', String(error));
    }
  }

  async disconnect(): Promise<void> {
    console.debug('[ObservatoryAdapter] Disconnecting...');
    this.connected = false;
  }

  /**
   * Fetch telemetry data points for visualization
   */
  async fetchTelemetry(query: TelemetryQuery): Promise<TelemetryPoint[]> {
    if (!this.connected) {
      throw new Error('Observatory adapter not connected');
    }

    // Placeholder - in production would call API
    console.debug('[ObservatoryAdapter] Fetching telemetry', query);
    return [];
  }

  /**
   * Fetch usage traces for trace viewer
   */
  async fetchTraces(query: TraceQuery): Promise<UsageTrace[]> {
    if (!this.connected) {
      throw new Error('Observatory adapter not connected');
    }

    console.debug('[ObservatoryAdapter] Fetching traces', query);
    return [];
  }

  /**
   * Fetch performance metrics for charts
   */
  async fetchPerformanceMetrics(
    measurement: string,
    timeRange: TimeRange
  ): Promise<PerformanceMetrics> {
    if (!this.connected) {
      throw new Error('Observatory adapter not connected');
    }

    console.debug('[ObservatoryAdapter] Fetching performance metrics', { measurement, timeRange });
    return {
      metricId: crypto.randomUUID(),
      measurement,
      timeRange,
      dataPoints: [],
      aggregations: {
        min: 0,
        max: 0,
        avg: 0,
        p50: 0,
        p95: 0,
        p99: 0,
        count: 0,
      },
    };
  }
}
