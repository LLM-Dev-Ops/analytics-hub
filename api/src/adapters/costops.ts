/**
 * LLM-CostOps Adapter
 *
 * Thin adapter for consuming cost summaries, projections, and token
 * accounting baselines from LLM-CostOps.
 */

import { logger } from '../logger';
import {
  AdapterHealth,
  EcosystemAdapter,
  TimeRange,
  healthyAdapter,
  unhealthyAdapter,
} from './types';

export interface CostOpsConfig {
  endpoint: string;
  apiKey?: string;
  timeoutMs?: number;
}

/**
 * Cost summary
 */
export interface CostSummary {
  summaryId: string;
  periodStart: Date;
  periodEnd: Date;
  totalCostUsd: number;
  breakdown: CostBreakdown;
  topConsumers: CostConsumer[];
  currency: string;
}

export interface CostBreakdown {
  byProvider: Record<string, number>;
  byModel: Record<string, number>;
  byOperation: Record<string, number>;
  byTeam: Record<string, number>;
}

export interface CostConsumer {
  consumerId: string;
  consumerType: 'user' | 'team' | 'application' | 'pipeline';
  name: string;
  costUsd: number;
  percentage: number;
}

/**
 * Cost projection
 */
export interface CostProjection {
  projectionId: string;
  generatedAt: Date;
  projectionPeriod: 'daily' | 'weekly' | 'monthly' | 'quarterly';
  projectedCostUsd: number;
  confidenceInterval: ConfidenceInterval;
  trend: 'increasing' | 'stable' | 'decreasing';
  assumptions: string[];
}

export interface ConfidenceInterval {
  lowerBound: number;
  upperBound: number;
  confidenceLevel: number;
}

/**
 * Token accounting baseline
 */
export interface TokenAccountingBaseline {
  baselineId: string;
  createdAt: Date;
  period: TimeRange;
  tokenMetrics: TokenMetrics;
  costPerToken: CostPerToken;
  efficiencyMetrics: EfficiencyMetrics;
}

export interface TokenMetrics {
  totalTokens: number;
  promptTokens: number;
  completionTokens: number;
  cachedTokens: number;
  byModel: Record<string, number>;
}

export interface CostPerToken {
  averageCostPer1kTokens: number;
  promptCostPer1k: number;
  completionCostPer1k: number;
  byModel: Record<string, number>;
}

export interface EfficiencyMetrics {
  cacheHitRate: number;
  tokensPerRequestAvg: number;
  costPerRequestAvg: number;
}

/**
 * Budget status
 */
export interface BudgetStatus {
  budgetId: string;
  teamId?: string;
  periodBudgetUsd: number;
  spentUsd: number;
  remainingUsd: number;
  utilizationPercentage: number;
  projectedOverage?: number;
}

/**
 * Query parameters for cost summaries
 */
export interface CostSummaryQuery {
  startTime?: Date;
  endTime?: Date;
  providers?: string[];
  models?: string[];
  teams?: string[];
  granularity?: 'hourly' | 'daily' | 'weekly' | 'monthly';
}

/**
 * LLM-CostOps adapter for consuming cost data
 */
export class CostOpsAdapter implements EcosystemAdapter {
  private config: CostOpsConfig;
  private connected: boolean = false;

  constructor(config?: Partial<CostOpsConfig>) {
    this.config = {
      endpoint: process.env.COSTOPS_ENDPOINT || 'http://localhost:8082',
      apiKey: process.env.COSTOPS_API_KEY,
      timeoutMs: parseInt(process.env.COSTOPS_TIMEOUT_MS || '30000', 10),
      ...config,
    };
  }

  async connect(): Promise<void> {
    logger.info({ endpoint: this.config.endpoint }, 'Connecting to LLM-CostOps');
    this.connected = true;
    logger.info('Successfully connected to LLM-CostOps');
  }

  async healthCheck(): Promise<AdapterHealth> {
    const start = Date.now();

    if (!this.connected) {
      return unhealthyAdapter('costops', 'Not connected');
    }

    const latencyMs = Date.now() - start;
    return healthyAdapter('costops', latencyMs);
  }

  async disconnect(): Promise<void> {
    logger.info('Disconnecting from LLM-CostOps');
    this.connected = false;
  }

  /**
   * Fetch cost summary
   */
  async fetchCostSummary(query: CostSummaryQuery): Promise<CostSummary> {
    if (!this.connected) {
      throw new Error('CostOps adapter not connected');
    }

    logger.debug({ query }, 'Fetching cost summary from CostOps');

    // Placeholder implementation
    return {
      summaryId: crypto.randomUUID(),
      periodStart: query.startTime || new Date(),
      periodEnd: query.endTime || new Date(),
      totalCostUsd: 0,
      breakdown: {
        byProvider: {},
        byModel: {},
        byOperation: {},
        byTeam: {},
      },
      topConsumers: [],
      currency: 'USD',
    };
  }

  /**
   * Fetch cost projections
   */
  async fetchProjections(
    period: 'daily' | 'weekly' | 'monthly' | 'quarterly'
  ): Promise<CostProjection[]> {
    if (!this.connected) {
      throw new Error('CostOps adapter not connected');
    }

    logger.debug({ period }, 'Fetching cost projections from CostOps');

    // Placeholder implementation
    return [];
  }

  /**
   * Fetch token accounting baseline
   */
  async fetchTokenBaseline(timeRange: TimeRange): Promise<TokenAccountingBaseline> {
    if (!this.connected) {
      throw new Error('CostOps adapter not connected');
    }

    logger.debug({ timeRange }, 'Fetching token baseline from CostOps');

    // Placeholder implementation
    return {
      baselineId: crypto.randomUUID(),
      createdAt: new Date(),
      period: timeRange,
      tokenMetrics: {
        totalTokens: 0,
        promptTokens: 0,
        completionTokens: 0,
        cachedTokens: 0,
        byModel: {},
      },
      costPerToken: {
        averageCostPer1kTokens: 0,
        promptCostPer1k: 0,
        completionCostPer1k: 0,
        byModel: {},
      },
      efficiencyMetrics: {
        cacheHitRate: 0,
        tokensPerRequestAvg: 0,
        costPerRequestAvg: 0,
      },
    };
  }

  /**
   * Fetch budget status
   */
  async fetchBudgetStatus(teamId?: string): Promise<BudgetStatus> {
    if (!this.connected) {
      throw new Error('CostOps adapter not connected');
    }

    logger.debug({ teamId }, 'Fetching budget status from CostOps');

    // Placeholder implementation
    return {
      budgetId: crypto.randomUUID(),
      teamId,
      periodBudgetUsd: 0,
      spentUsd: 0,
      remainingUsd: 0,
      utilizationPercentage: 0,
    };
  }
}
