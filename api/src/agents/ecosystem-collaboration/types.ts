/**
 * Ecosystem Collaboration Agent Types
 *
 * Internal types for the Ecosystem Collaboration Agent computation.
 *
 * @module agents/ecosystem-collaboration/types
 */

import type {
  EcosystemSignal,
  AggregationSignal,
  ConsensusSignal,
  StrategicSignal,
  IndexEntry,
} from '../../contracts/ecosystem-collaboration-agent';

/**
 * Grouped signals by partner and category
 */
export interface SignalGroup {
  partnerId: string;
  category: string;
  signals: EcosystemSignal[];
}

/**
 * Correlation pair for cross-system analytics
 */
export interface CorrelationPair {
  systemA: string;
  systemB: string;
  metricA: string;
  metricB: string;
  valuesA: number[];
  valuesB: number[];
}

/**
 * Computation result from aggregation
 */
export interface AggregationResult {
  signals: AggregationSignal[];
  indexEntries: IndexEntry[];
}

/**
 * Computation result from consensus analysis
 */
export interface ConsensusResult {
  signals: ConsensusSignal[];
  overallAlignment: number;
}

/**
 * Computation result from strategic correlation
 */
export interface StrategicResult {
  signals: StrategicSignal[];
  correlationCount: number;
}

/**
 * Combined computation output
 */
export interface ComputationOutput {
  aggregation: AggregationResult;
  consensus: ConsensusResult;
  strategic: StrategicResult;
  confidence: number;
  tokenEstimate: number;
}

/**
 * Performance tracking for budget compliance
 */
export interface PerformanceMetrics {
  startTime: number;
  tokenCount: number;
  latencyMs: number;
  withinBudget: boolean;
}
