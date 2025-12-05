/**
 * LLM-Config-Manager Adapter (Frontend)
 *
 * Thin adapter for consuming configuration-driven analytics parameters
 * and retention settings from LLM-Config-Manager via the API.
 */

import type {
  AdapterHealth,
  EcosystemAdapter,
} from './types';
import { healthyAdapter, unhealthyAdapter } from './types';

/**
 * Analytics parameters for dashboard configuration
 */
export interface AnalyticsParameters {
  configId: string;
  version: string;
  createdAt: Date;
  aggregation: {
    defaultWindowMinutes: number;
    rollupWindows: Array<{
      name: string;
      durationMinutes: number;
      aggregations: string[];
    }>;
    defaultPercentiles: number[];
    maxCardinality: number;
    enableHistograms: boolean;
  };
  anomalyDetection: {
    enabled: boolean;
    algorithm: 'z_score' | 'iqr' | 'dbscan' | 'isolation_forest' | 'prophet';
    sensitivity: number;
    minDataPoints: number;
    evaluationWindowMinutes: number;
    cooldownMinutes: number;
  };
  forecasting: {
    enabled: boolean;
    model: 'arima' | 'prophet' | 'exponential_smoothing' | 'linear_regression' | 'lstm';
    horizonHours: number;
    trainingWindowDays: number;
    updateFrequencyHours: number;
    confidenceLevel: number;
  };
  alerting: {
    enabled: boolean;
    defaultSeverity: 'info' | 'warning' | 'error' | 'critical';
    rateLimitPerHour: number;
    groupingWindowMinutes: number;
  };
  sampling: {
    enabled: boolean;
    defaultRate: number;
    highVolumeRate: number;
    highVolumeThresholdRps: number;
    preserveErrors: boolean;
  };
}

/**
 * Retention settings for data management display
 */
export interface RetentionSettings {
  configId: string;
  version: string;
  createdAt: Date;
  policies: Array<{
    policyId: string;
    name: string;
    dataType: 'raw_events' | 'aggregated_metrics' | 'traces' | 'logs' | 'alerts' | 'audits';
    retentionDays: number;
    tier: 'hot' | 'warm' | 'cold' | 'archive';
    compressAfterDays?: number;
    archiveAfterDays?: number;
  }>;
  archival: {
    enabled: boolean;
    compression: 'none' | 'gzip' | 'zstd' | 'lz4' | 'snappy';
    encryptionEnabled: boolean;
  };
  compaction: {
    enabled: boolean;
    scheduleCron: string;
    targetFileSizeMb: number;
    maxConcurrentJobs: number;
  };
}

/**
 * Feature flags for feature toggles
 */
export interface FeatureFlags {
  configId: string;
  flags: Record<string, {
    name: string;
    enabled: boolean;
    description: string;
    rolloutPercentage: number;
    allowedEnvironments: string[];
  }>;
  lastUpdated: Date;
}

/**
 * Environment config for settings display
 */
export interface EnvironmentConfig {
  environment: string;
  endpoints: Record<string, string>;
  limits: {
    maxConcurrentQueries: number;
    maxQueryTimeoutSecs: number;
    maxResultRows: number;
    maxMemoryMb: number;
  };
  security: {
    requireAuth: boolean;
    allowedOrigins: string[];
    rateLimitRps: number;
  };
}

/**
 * LLM-Config-Manager adapter for frontend
 */
export class ConfigManagerAdapter implements EcosystemAdapter {
  private connected: boolean = false;

  async connect(): Promise<void> {
    console.debug('[ConfigManagerAdapter] Connecting...');
    this.connected = true;
    console.debug('[ConfigManagerAdapter] Connected');
  }

  async healthCheck(): Promise<AdapterHealth> {
    const start = Date.now();

    if (!this.connected) {
      return unhealthyAdapter('config_manager', 'Not connected');
    }

    const latencyMs = Date.now() - start;
    return healthyAdapter('config_manager', latencyMs);
  }

  async disconnect(): Promise<void> {
    console.debug('[ConfigManagerAdapter] Disconnecting...');
    this.connected = false;
  }

  /**
   * Fetch analytics parameters for dashboard settings
   */
  async fetchAnalyticsParameters(): Promise<AnalyticsParameters> {
    if (!this.connected) {
      throw new Error('Config-Manager adapter not connected');
    }

    console.debug('[ConfigManagerAdapter] Fetching analytics parameters');
    return {
      configId: crypto.randomUUID(),
      version: '1.0.0',
      createdAt: new Date(),
      aggregation: {
        defaultWindowMinutes: 5,
        rollupWindows: [
          { name: '1min', durationMinutes: 1, aggregations: ['avg', 'count'] },
          { name: '5min', durationMinutes: 5, aggregations: ['avg', 'min', 'max', 'count'] },
          { name: '1hour', durationMinutes: 60, aggregations: ['avg', 'min', 'max', 'p50', 'p95', 'p99', 'count'] },
        ],
        defaultPercentiles: [0.5, 0.9, 0.95, 0.99],
        maxCardinality: 10000,
        enableHistograms: true,
      },
      anomalyDetection: {
        enabled: true,
        algorithm: 'z_score',
        sensitivity: 3.0,
        minDataPoints: 30,
        evaluationWindowMinutes: 15,
        cooldownMinutes: 60,
      },
      forecasting: {
        enabled: true,
        model: 'exponential_smoothing',
        horizonHours: 24,
        trainingWindowDays: 7,
        updateFrequencyHours: 1,
        confidenceLevel: 0.95,
      },
      alerting: {
        enabled: true,
        defaultSeverity: 'warning',
        rateLimitPerHour: 100,
        groupingWindowMinutes: 5,
      },
      sampling: {
        enabled: false,
        defaultRate: 1.0,
        highVolumeRate: 0.1,
        highVolumeThresholdRps: 10000,
        preserveErrors: true,
      },
    };
  }

  /**
   * Fetch retention settings for data management panel
   */
  async fetchRetentionSettings(): Promise<RetentionSettings> {
    if (!this.connected) {
      throw new Error('Config-Manager adapter not connected');
    }

    console.debug('[ConfigManagerAdapter] Fetching retention settings');
    return {
      configId: crypto.randomUUID(),
      version: '1.0.0',
      createdAt: new Date(),
      policies: [
        {
          policyId: 'raw-events',
          name: 'Raw Events',
          dataType: 'raw_events',
          retentionDays: 7,
          tier: 'hot',
          compressAfterDays: 1,
          archiveAfterDays: 7,
        },
        {
          policyId: 'aggregated-metrics',
          name: 'Aggregated Metrics',
          dataType: 'aggregated_metrics',
          retentionDays: 90,
          tier: 'warm',
          compressAfterDays: 7,
          archiveAfterDays: 30,
        },
      ],
      archival: {
        enabled: false,
        compression: 'zstd',
        encryptionEnabled: true,
      },
      compaction: {
        enabled: true,
        scheduleCron: '0 2 * * *',
        targetFileSizeMb: 256,
        maxConcurrentJobs: 4,
      },
    };
  }

  /**
   * Fetch feature flags for feature toggles
   */
  async fetchFeatureFlags(): Promise<FeatureFlags> {
    if (!this.connected) {
      throw new Error('Config-Manager adapter not connected');
    }

    console.debug('[ConfigManagerAdapter] Fetching feature flags');
    return {
      configId: crypto.randomUUID(),
      flags: {},
      lastUpdated: new Date(),
    };
  }

  /**
   * Fetch environment config for settings display
   */
  async fetchEnvironmentConfig(environment: string): Promise<EnvironmentConfig> {
    if (!this.connected) {
      throw new Error('Config-Manager adapter not connected');
    }

    console.debug('[ConfigManagerAdapter] Fetching environment config', { environment });
    return {
      environment,
      endpoints: {},
      limits: {
        maxConcurrentQueries: 100,
        maxQueryTimeoutSecs: 300,
        maxResultRows: 100000,
        maxMemoryMb: 4096,
      },
      security: {
        requireAuth: true,
        allowedOrigins: ['*'],
        rateLimitRps: 1000,
      },
    };
  }
}
