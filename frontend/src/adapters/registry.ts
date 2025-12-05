/**
 * LLM-Registry Adapter (Frontend)
 *
 * Thin adapter for consuming model metadata and pipeline descriptors
 * from LLM-Registry via the API.
 */

import type {
  AdapterHealth,
  EcosystemAdapter,
} from './types';
import { healthyAdapter, unhealthyAdapter } from './types';

/**
 * Model metadata for model selector/display
 */
export interface ModelMetadata {
  modelId: string;
  name: string;
  version: string;
  provider: string;
  modelType: ModelType;
  capabilities: ModelCapability[];
  contextWindow: number;
  pricing: {
    currency: string;
    inputCostPer1kTokens: number;
    outputCostPer1kTokens: number;
  };
  performance: {
    avgLatencyMs: number;
    p95LatencyMs: number;
    tokensPerSecond: number;
    availability: number;
  };
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

export type ModelStatus = 'active' | 'deprecated' | 'preview' | 'maintenance' | 'retired';

/**
 * Pipeline descriptor for pipeline view
 */
export interface PipelineDescriptor {
  pipelineId: string;
  name: string;
  version: string;
  description: string;
  stages: PipelineStage[];
  createdAt: Date;
  lastUpdated: Date;
  owner: string;
  status: PipelineStatus;
  metrics: {
    totalInvocations: number;
    successRate: number;
    avgLatencyMs: number;
    avgCostPerInvocation: number;
  };
}

export interface PipelineStage {
  stageId: string;
  stageName: string;
  stageType: StageType;
  modelId?: string;
  timeoutMs: number;
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

export type PipelineStatus = 'active' | 'paused' | 'draft' | 'archived';

/**
 * Provider info for provider status display
 */
export interface ProviderInfo {
  providerId: string;
  name: string;
  status: 'operational' | 'degraded' | 'outage';
  apiVersion: string;
  models: string[];
  rateLimits: {
    requestsPerMinute: number;
    tokensPerMinute: number;
  };
  health: {
    availability: number;
    avgLatencyMs: number;
    errorRate: number;
    lastChecked: Date;
  };
}

/**
 * Query parameters
 */
export interface ModelQuery {
  providers?: string[];
  modelTypes?: ModelType[];
  capabilities?: ModelCapability[];
  status?: ModelStatus;
  minContextWindow?: number;
}

export interface PipelineQuery {
  owner?: string;
  status?: PipelineStatus;
  modelIds?: string[];
  createdAfter?: Date;
}

/**
 * LLM-Registry adapter for frontend
 */
export class RegistryAdapter implements EcosystemAdapter {
  private connected: boolean = false;

  async connect(): Promise<void> {
    console.debug('[RegistryAdapter] Connecting...');
    this.connected = true;
    console.debug('[RegistryAdapter] Connected');
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
    console.debug('[RegistryAdapter] Disconnecting...');
    this.connected = false;
  }

  /**
   * Fetch model by ID for model detail view
   */
  async fetchModel(modelId: string): Promise<ModelMetadata> {
    if (!this.connected) {
      throw new Error('Registry adapter not connected');
    }

    console.debug('[RegistryAdapter] Fetching model', { modelId });
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
   * List models for model selector
   */
  async listModels(query?: ModelQuery): Promise<ModelMetadata[]> {
    if (!this.connected) {
      throw new Error('Registry adapter not connected');
    }

    console.debug('[RegistryAdapter] Listing models', query);
    return [];
  }

  /**
   * Fetch pipeline by ID for pipeline detail view
   */
  async fetchPipeline(pipelineId: string): Promise<PipelineDescriptor> {
    if (!this.connected) {
      throw new Error('Registry adapter not connected');
    }

    console.debug('[RegistryAdapter] Fetching pipeline', { pipelineId });
    return {
      pipelineId,
      name: pipelineId,
      version: '1.0.0',
      description: '',
      stages: [],
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
   * List pipelines for pipeline browser
   */
  async listPipelines(query?: PipelineQuery): Promise<PipelineDescriptor[]> {
    if (!this.connected) {
      throw new Error('Registry adapter not connected');
    }

    console.debug('[RegistryAdapter] Listing pipelines', query);
    return [];
  }

  /**
   * List providers for provider status panel
   */
  async listProviders(): Promise<ProviderInfo[]> {
    if (!this.connected) {
      throw new Error('Registry adapter not connected');
    }

    console.debug('[RegistryAdapter] Listing providers');
    return [];
  }
}
