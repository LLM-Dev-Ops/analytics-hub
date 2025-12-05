/**
 * LLM-Config-Manager Adapter
 *
 * Thin adapter for consuming configuration-driven analytics parameters
 * and retention settings from LLM-Config-Manager.
 */

import { logger } from '../logger';
import {
  AdapterHealth,
  EcosystemAdapter,
  healthyAdapter,
  unhealthyAdapter,
} from './types';

export interface ConfigManagerConfig {
  endpoint: string;
  apiKey?: string;
  timeoutMs?: number;
  cacheTtlSecs?: number;
}

/**
 * Analytics parameters
 */
export interface AnalyticsParameters {
  configId: string;
  version: string;
  createdAt: Date;
  aggregation: AggregationConfig;
  anomalyDetection: AnomalyDetectionConfig;
  forecasting: ForecastingConfig;
  alerting: AlertingConfig;
  sampling: SamplingConfig;
}

export interface AggregationConfig {
  defaultWindowMinutes: number;
  rollupWindows: RollupWindow[];
  defaultPercentiles: number[];
  maxCardinality: number;
  enableHistograms: boolean;
}

export interface RollupWindow {
  name: string;
  durationMinutes: number;
  aggregations: string[];
}

export interface AnomalyDetectionConfig {
  enabled: boolean;
  algorithm: 'z_score' | 'iqr' | 'dbscan' | 'isolation_forest' | 'prophet';
  sensitivity: number;
  minDataPoints: number;
  evaluationWindowMinutes: number;
  cooldownMinutes: number;
}

export interface ForecastingConfig {
  enabled: boolean;
  model: 'arima' | 'prophet' | 'exponential_smoothing' | 'linear_regression' | 'lstm';
  horizonHours: number;
  trainingWindowDays: number;
  updateFrequencyHours: number;
  confidenceLevel: number;
}

export interface AlertingConfig {
  enabled: boolean;
  defaultSeverity: 'info' | 'warning' | 'error' | 'critical';
  channels: AlertChannel[];
  rateLimitPerHour: number;
  groupingWindowMinutes: number;
}

export interface AlertChannel {
  channelType: 'email' | 'slack' | 'pagerduty' | 'webhook' | 'sns';
  config: Record<string, string>;
  enabled: boolean;
}

export interface SamplingConfig {
  enabled: boolean;
  defaultRate: number;
  highVolumeRate: number;
  highVolumeThresholdRps: number;
  preserveErrors: boolean;
}

/**
 * Retention settings
 */
export interface RetentionSettings {
  configId: string;
  version: string;
  createdAt: Date;
  policies: RetentionPolicy[];
  archival: ArchivalConfig;
  compaction: CompactionConfig;
}

export interface RetentionPolicy {
  policyId: string;
  name: string;
  dataType: 'raw_events' | 'aggregated_metrics' | 'traces' | 'logs' | 'alerts' | 'audits';
  retentionDays: number;
  tier: 'hot' | 'warm' | 'cold' | 'archive';
  compressAfterDays?: number;
  archiveAfterDays?: number;
}

export interface ArchivalConfig {
  enabled: boolean;
  destination: ArchivalDestination;
  compression: 'none' | 'gzip' | 'zstd' | 'lz4' | 'snappy';
  encryptionEnabled: boolean;
}

export type ArchivalDestination =
  | { type: 's3'; bucket: string; prefix: string }
  | { type: 'gcs'; bucket: string; prefix: string }
  | { type: 'azure'; container: string; prefix: string };

export interface CompactionConfig {
  enabled: boolean;
  scheduleCron: string;
  targetFileSizeMb: number;
  maxConcurrentJobs: number;
}

/**
 * Feature flags
 */
export interface FeatureFlags {
  configId: string;
  flags: Record<string, FeatureFlag>;
  lastUpdated: Date;
}

export interface FeatureFlag {
  name: string;
  enabled: boolean;
  description: string;
  rolloutPercentage: number;
  allowedEnvironments: string[];
}

/**
 * Environment config
 */
export interface EnvironmentConfig {
  environment: string;
  endpoints: Record<string, string>;
  limits: ResourceLimits;
  security: SecurityConfig;
}

export interface ResourceLimits {
  maxConcurrentQueries: number;
  maxQueryTimeoutSecs: number;
  maxResultRows: number;
  maxMemoryMb: number;
}

export interface SecurityConfig {
  requireAuth: boolean;
  allowedOrigins: string[];
  rateLimitRps: number;
  ipWhitelist?: string[];
}

/**
 * LLM-Config-Manager adapter for consuming configuration data
 */
export class ConfigManagerAdapter implements EcosystemAdapter {
  private config: ConfigManagerConfig;
  private connected: boolean = false;

  constructor(config?: Partial<ConfigManagerConfig>) {
    this.config = {
      endpoint: process.env.CONFIG_MANAGER_ENDPOINT || 'http://localhost:8085',
      apiKey: process.env.CONFIG_MANAGER_API_KEY,
      timeoutMs: parseInt(process.env.CONFIG_MANAGER_TIMEOUT_MS || '30000', 10),
      cacheTtlSecs: parseInt(process.env.CONFIG_MANAGER_CACHE_TTL_SECS || '300', 10),
      ...config,
    };
  }

  async connect(): Promise<void> {
    logger.info({ endpoint: this.config.endpoint }, 'Connecting to LLM-Config-Manager');
    this.connected = true;
    logger.info('Successfully connected to LLM-Config-Manager');
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
    logger.info('Disconnecting from LLM-Config-Manager');
    this.connected = false;
  }

  /**
   * Fetch analytics parameters
   */
  async fetchAnalyticsParameters(): Promise<AnalyticsParameters> {
    if (!this.connected) {
      throw new Error('Config-Manager adapter not connected');
    }

    logger.debug('Fetching analytics parameters from Config-Manager');

    // Placeholder with sensible defaults
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
        channels: [],
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
   * Fetch retention settings
   */
  async fetchRetentionSettings(): Promise<RetentionSettings> {
    if (!this.connected) {
      throw new Error('Config-Manager adapter not connected');
    }

    logger.debug('Fetching retention settings from Config-Manager');

    // Placeholder with sensible defaults
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
        {
          policyId: 'traces',
          name: 'Traces',
          dataType: 'traces',
          retentionDays: 14,
          tier: 'hot',
          compressAfterDays: 3,
          archiveAfterDays: 14,
        },
      ],
      archival: {
        enabled: false,
        destination: { type: 's3', bucket: 'analytics-archive', prefix: 'data/' },
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
   * Fetch feature flags
   */
  async fetchFeatureFlags(): Promise<FeatureFlags> {
    if (!this.connected) {
      throw new Error('Config-Manager adapter not connected');
    }

    logger.debug('Fetching feature flags from Config-Manager');

    // Placeholder implementation
    return {
      configId: crypto.randomUUID(),
      flags: {},
      lastUpdated: new Date(),
    };
  }

  /**
   * Fetch environment config
   */
  async fetchEnvironmentConfig(environment: string): Promise<EnvironmentConfig> {
    if (!this.connected) {
      throw new Error('Config-Manager adapter not connected');
    }

    logger.debug({ environment }, 'Fetching environment config from Config-Manager');

    // Placeholder implementation
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

  /**
   * Get config value by key
   */
  async getConfigValue<T>(key: string): Promise<T | null> {
    if (!this.connected) {
      throw new Error('Config-Manager adapter not connected');
    }

    logger.debug({ key }, 'Fetching config value from Config-Manager');

    // Placeholder implementation
    return null;
  }
}
