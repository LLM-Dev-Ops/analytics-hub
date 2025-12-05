/**
 * LLM-CostOps Adapter (Frontend)
 *
 * Thin adapter for consuming cost summaries, projections, and token
 * accounting baselines from LLM-CostOps via the API.
 */

import type {
  AdapterHealth,
  EcosystemAdapter,
  TimeRange,
} from './types';
import { healthyAdapter, unhealthyAdapter } from './types';

/**
 * Cost summary for dashboard display
 */
export interface CostSummary {
  summaryId: string;
  periodStart: Date;
  periodEnd: Date;
  totalCostUsd: number;
  breakdown: {
    byProvider: Record<string, number>;
    byModel: Record<string, number>;
    byOperation: Record<string, number>;
    byTeam: Record<string, number>;
  };
  topConsumers: Array<{
    consumerId: string;
    consumerType: 'user' | 'team' | 'application' | 'pipeline';
    name: string;
    costUsd: number;
    percentage: number;
  }>;
  currency: string;
}

/**
 * Cost projection for forecasting charts
 */
export interface CostProjection {
  projectionId: string;
  generatedAt: Date;
  projectionPeriod: 'daily' | 'weekly' | 'monthly' | 'quarterly';
  projectedCostUsd: number;
  confidenceInterval: {
    lowerBound: number;
    upperBound: number;
    confidenceLevel: number;
  };
  trend: 'increasing' | 'stable' | 'decreasing';
}

/**
 * Token accounting baseline
 */
export interface TokenAccountingBaseline {
  baselineId: string;
  createdAt: Date;
  period: TimeRange;
  tokenMetrics: {
    totalTokens: number;
    promptTokens: number;
    completionTokens: number;
    cachedTokens: number;
    byModel: Record<string, number>;
  };
  costPerToken: {
    averageCostPer1kTokens: number;
    promptCostPer1k: number;
    completionCostPer1k: number;
    byModel: Record<string, number>;
  };
  efficiencyMetrics: {
    cacheHitRate: number;
    tokensPerRequestAvg: number;
    costPerRequestAvg: number;
  };
}

/**
 * Budget status for gauges
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
 * Query parameters
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
 * LLM-CostOps adapter for frontend
 */
export class CostOpsAdapter implements EcosystemAdapter {
  private connected: boolean = false;

  async connect(): Promise<void> {
    console.debug('[CostOpsAdapter] Connecting...');
    this.connected = true;
    console.debug('[CostOpsAdapter] Connected');
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
    console.debug('[CostOpsAdapter] Disconnecting...');
    this.connected = false;
  }

  /**
   * Fetch cost summary for cost breakdown charts
   */
  async fetchCostSummary(query: CostSummaryQuery): Promise<CostSummary> {
    if (!this.connected) {
      throw new Error('CostOps adapter not connected');
    }

    console.debug('[CostOpsAdapter] Fetching cost summary', query);
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
   * Fetch cost projections for forecasting charts
   */
  async fetchProjections(
    period: 'daily' | 'weekly' | 'monthly' | 'quarterly'
  ): Promise<CostProjection[]> {
    if (!this.connected) {
      throw new Error('CostOps adapter not connected');
    }

    console.debug('[CostOpsAdapter] Fetching projections', { period });
    return [];
  }

  /**
   * Fetch token accounting baseline for efficiency metrics
   */
  async fetchTokenBaseline(timeRange: TimeRange): Promise<TokenAccountingBaseline> {
    if (!this.connected) {
      throw new Error('CostOps adapter not connected');
    }

    console.debug('[CostOpsAdapter] Fetching token baseline', timeRange);
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
   * Fetch budget status for budget gauges
   */
  async fetchBudgetStatus(teamId?: string): Promise<BudgetStatus> {
    if (!this.connected) {
      throw new Error('CostOps adapter not connected');
    }

    console.debug('[CostOpsAdapter] Fetching budget status', { teamId });
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
