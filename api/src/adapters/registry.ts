/**
 * LLM-Registry Adapter
 *
 * Thin adapter for consuming model metadata and pipeline descriptors
 * from LLM-Registry.
 */

import { logger } from '../logger';
import {
  AdapterHealth,
  EcosystemAdapter,
  healthyAdapter,
  unhealthyAdapter,
} from './types';

export interface RegistryConfig {
  endpoint: string;
  apiKey?: string;
  timeoutMs?: number;
}

/**
 * Model metadata
 */
export interface ModelMetadata {
  modelId: string;
  name: string;
  version: string;
  provider: string;
  modelType: ModelType;
  capabilities: ModelCapability[];
  contextWindow: number;
  pricing: ModelPricing;
  performance: ModelPerformance;
  status: ModelStatus;
  registeredAt: Date;
  lastUpdated: Date;
  tags: Record<string, string>;
}

export type ModelType =
  | 'text_generation'
  | 'text_embedding'
  | 'image_generation'
  | 'image_analysis'
  | 'audio_transcription'
  | 'audio_generation'
  | 'multi_modal'
  | 'code_generation'
  | 'fine_tuned';

export type ModelCapability =
  | 'chat'
  | 'completion'
  | 'embedding'
  | 'function_calling'
  | 'vision'
  | 'audio'
  | 'streaming'
  | 'batch_processing'
  | 'fine_tuning';

export interface ModelPricing {
  currency: string;
  inputCostPer1kTokens: number;
  outputCostPer1kTokens: number;
  imageCostPerUnit?: number;
  audioCostPerMinute?: number;
}

export interface ModelPerformance {
  avgLatencyMs: number;
  p95LatencyMs: number;
  p99LatencyMs: number;
  tokensPerSecond: number;
  availability: number;
}

export type ModelStatus = 'active' | 'deprecated' | 'preview' | 'maintenance' | 'retired';

/**
 * Pipeline descriptor
 */
export interface PipelineDescriptor {
  pipelineId: string;
  name: string;
  version: string;
  description: string;
  stages: PipelineStage[];
  inputSchema: Record<string, unknown>;
  outputSchema: Record<string, unknown>;
  createdAt: Date;
  lastUpdated: Date;
  owner: string;
  status: PipelineStatus;
  metrics: PipelineMetrics;
}

export interface PipelineStage {
  stageId: string;
  stageName: string;
  stageType: StageType;
  modelId?: string;
  config: Record<string, unknown>;
  timeoutMs: number;
  retryPolicy: RetryPolicy;
}

export type StageType =
  | 'model_inference'
  | 'preprocessing'
  | 'postprocessing'
  | 'embedding'
  | 'retrieval'
  | 'routing'
  | 'aggregation'
  | 'transform'
  | 'cache'
  | 'rate_limit';

export interface RetryPolicy {
  maxAttempts: number;
  initialDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
}

export type PipelineStatus = 'active' | 'paused' | 'draft' | 'archived';

export interface PipelineMetrics {
  totalInvocations: number;
  successRate: number;
  avgLatencyMs: number;
  avgCostPerInvocation: number;
}

/**
 * Provider info
 */
export interface ProviderInfo {
  providerId: string;
  name: string;
  status: 'operational' | 'degraded' | 'outage';
  apiVersion: string;
  models: string[];
  rateLimits: RateLimits;
  health: ProviderHealth;
}

export interface RateLimits {
  requestsPerMinute: number;
  tokensPerMinute: number;
  tokensPerDay?: number;
}

export interface ProviderHealth {
  availability: number;
  avgLatencyMs: number;
  errorRate: number;
  lastChecked: Date;
}

/**
 * Query parameters for models
 */
export interface ModelQuery {
  providers?: string[];
  modelTypes?: ModelType[];
  capabilities?: ModelCapability[];
  status?: ModelStatus;
  minContextWindow?: number;
  tags?: Record<string, string>;
}

/**
 * Query parameters for pipelines
 */
export interface PipelineQuery {
  owner?: string;
  status?: PipelineStatus;
  modelIds?: string[];
  createdAfter?: Date;
}

/**
 * LLM-Registry adapter for consuming registry data
 */
export class RegistryAdapter implements EcosystemAdapter {
  private config: RegistryConfig;
  private connected: boolean = false;

  constructor(config?: Partial<RegistryConfig>) {
    this.config = {
      endpoint: process.env.REGISTRY_ENDPOINT || 'http://localhost:8084',
      apiKey: process.env.REGISTRY_API_KEY,
      timeoutMs: parseInt(process.env.REGISTRY_TIMEOUT_MS || '30000', 10),
      ...config,
    };
  }

  async connect(): Promise<void> {
    logger.info({ endpoint: this.config.endpoint }, 'Connecting to LLM-Registry');
    this.connected = true;
    logger.info('Successfully connected to LLM-Registry');
  }

  async healthCheck(): Promise<AdapterHealth> {
    const start = Date.now();

    if (!this.connected) {
      return unhealthyAdapter('registry', 'Not connected');
    }

    const latencyMs = Date.now() - start;
    return healthyAdapter('registry', latencyMs);
  }

  async disconnect(): Promise<void> {
    logger.info('Disconnecting from LLM-Registry');
    this.connected = false;
  }

  /**
   * Fetch model by ID
   */
  async fetchModel(modelId: string): Promise<ModelMetadata> {
    if (!this.connected) {
      throw new Error('Registry adapter not connected');
    }

    logger.debug({ modelId }, 'Fetching model from Registry');

    // Placeholder implementation
    return {
      modelId,
      name: modelId,
      version: '1.0.0',
      provider: 'unknown',
      modelType: 'text_generation',
      capabilities: [],
      contextWindow: 0,
      pricing: {
        currency: 'USD',
        inputCostPer1kTokens: 0,
        outputCostPer1kTokens: 0,
      },
      performance: {
        avgLatencyMs: 0,
        p95LatencyMs: 0,
        p99LatencyMs: 0,
        tokensPerSecond: 0,
        availability: 0,
      },
      status: 'active',
      registeredAt: new Date(),
      lastUpdated: new Date(),
      tags: {},
    };
  }

  /**
   * List models
   */
  async listModels(query?: ModelQuery): Promise<ModelMetadata[]> {
    if (!this.connected) {
      throw new Error('Registry adapter not connected');
    }

    logger.debug({ query }, 'Listing models from Registry');

    // Placeholder implementation
    return [];
  }

  /**
   * Fetch pipeline by ID
   */
  async fetchPipeline(pipelineId: string): Promise<PipelineDescriptor> {
    if (!this.connected) {
      throw new Error('Registry adapter not connected');
    }

    logger.debug({ pipelineId }, 'Fetching pipeline from Registry');

    // Placeholder implementation
    return {
      pipelineId,
      name: pipelineId,
      version: '1.0.0',
      description: '',
      stages: [],
      inputSchema: {},
      outputSchema: {},
      createdAt: new Date(),
      lastUpdated: new Date(),
      owner: 'unknown',
      status: 'active',
      metrics: {
        totalInvocations: 0,
        successRate: 0,
        avgLatencyMs: 0,
        avgCostPerInvocation: 0,
      },
    };
  }

  /**
   * List pipelines
   */
  async listPipelines(query?: PipelineQuery): Promise<PipelineDescriptor[]> {
    if (!this.connected) {
      throw new Error('Registry adapter not connected');
    }

    logger.debug({ query }, 'Listing pipelines from Registry');

    // Placeholder implementation
    return [];
  }

  /**
   * Fetch provider info
   */
  async fetchProvider(providerId: string): Promise<ProviderInfo> {
    if (!this.connected) {
      throw new Error('Registry adapter not connected');
    }

    logger.debug({ providerId }, 'Fetching provider from Registry');

    // Placeholder implementation
    return {
      providerId,
      name: providerId,
      status: 'operational',
      apiVersion: '1.0',
      models: [],
      rateLimits: {
        requestsPerMinute: 0,
        tokensPerMinute: 0,
      },
      health: {
        availability: 0,
        avgLatencyMs: 0,
        errorRate: 0,
        lastChecked: new Date(),
      },
    };
  }

  /**
   * List providers
   */
  async listProviders(): Promise<ProviderInfo[]> {
    if (!this.connected) {
      throw new Error('Registry adapter not connected');
    }

    logger.debug('Listing providers from Registry');

    // Placeholder implementation
    return [];
  }
}
