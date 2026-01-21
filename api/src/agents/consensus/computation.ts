/**
 * Consensus Computation Module
 *
 * Core analytical synthesis logic for the Consensus Agent.
 * Computes consensus across multiple signals with confidence weighting.
 *
 * Classification: ANALYTICAL SYNTHESIS / CONSENSUS FORMATION
 *
 * @module agents/consensus/computation
 */

import {
  SignalInput,
  ConsensusInput,
} from '../../contracts/consensus-agent';
import {
  ConsensusOutput,
  ConstraintApplied,
} from '../../contracts/decision-event';

/**
 * Confidence weighting functions
 */
const WEIGHTING_FUNCTIONS = {
  /** Uniform weighting - all signals equal */
  uniform: (_confidence: number) => 1,

  /** Proportional weighting - weight equals confidence */
  proportional: (confidence: number) => confidence,

  /** Exponential weighting - higher confidence gets exponentially more weight */
  exponential: (confidence: number) => Math.pow(confidence, 2),
} as const;

/**
 * Aggregation functions for numeric signals
 */
const AGGREGATION_FUNCTIONS = {
  /** Simple arithmetic mean */
  mean: (values: number[], _weights?: number[]) => {
    return values.reduce((sum, v) => sum + v, 0) / values.length;
  },

  /** Median value */
  median: (values: number[], _weights?: number[]) => {
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 !== 0
      ? sorted[mid]
      : (sorted[mid - 1] + sorted[mid]) / 2;
  },

  /** Mode (most common value, rounded to 2 decimals) */
  mode: (values: number[], _weights?: number[]) => {
    const rounded = values.map(v => Math.round(v * 100) / 100);
    const counts = new Map<number, number>();
    for (const v of rounded) {
      counts.set(v, (counts.get(v) || 0) + 1);
    }
    let maxCount = 0;
    let mode = rounded[0];
    for (const [value, count] of counts) {
      if (count > maxCount) {
        maxCount = count;
        mode = value;
      }
    }
    return mode;
  },

  /** Confidence-weighted mean */
  weighted_mean: (values: number[], weights: number[] = []) => {
    if (weights.length === 0) {
      return AGGREGATION_FUNCTIONS.mean(values);
    }
    const totalWeight = weights.reduce((sum, w) => sum + w, 0);
    if (totalWeight === 0) return AGGREGATION_FUNCTIONS.mean(values);

    return values.reduce((sum, v, i) => sum + v * weights[i], 0) / totalWeight;
  },
} as const;

/**
 * Intermediate consensus computation result
 */
export interface ConsensusComputationResult {
  consensusValue: number | Record<string, unknown>;
  agreementLevel: number;
  agreementCount: number;
  totalSignals: number;
  divergentSignals: Array<{
    signalId: string;
    divergenceScore: number;
    value: unknown;
  }>;
  statistics: {
    mean?: number;
    median?: number;
    stdDev?: number;
    variance?: number;
  };
  confidence: number;
  computationTimeMs: number;
  method: string;
}

/**
 * Compute consensus from a set of signals
 *
 * This is the core analytical synthesis function that:
 * 1. Filters signals by scope (if specified)
 * 2. Extracts numeric values for aggregation
 * 3. Applies confidence weighting
 * 4. Computes consensus using the specified method
 * 5. Identifies divergent signals
 * 6. Calculates overall confidence
 *
 * @param input - Consensus input with signals and options
 * @returns Consensus computation result
 */
export function computeConsensus(input: ConsensusInput): ConsensusComputationResult {
  const startTime = Date.now();
  const { signals, options } = input;

  // Filter by scope if specified
  const filteredSignals = options.scopeFilter && options.scopeFilter.length > 0
    ? signals.filter(s => options.scopeFilter!.includes(s.sourceLayer))
    : signals;

  if (filteredSignals.length === 0) {
    return {
      consensusValue: null as any,
      agreementLevel: 0,
      agreementCount: 0,
      totalSignals: signals.length,
      divergentSignals: [],
      statistics: {},
      confidence: 0,
      computationTimeMs: Date.now() - startTime,
      method: options.aggregationMethod,
    };
  }

  // Extract numeric values for signals that have numeric values
  const numericSignals = filteredSignals.filter(s => typeof s.value === 'number');
  const structuredSignals = filteredSignals.filter(s => typeof s.value === 'object');

  // Compute weights based on confidence weighting strategy
  const weightFn = WEIGHTING_FUNCTIONS[options.confidenceWeighting];
  const weights = numericSignals.map(s => weightFn(s.confidence));

  let consensusValue: number | Record<string, unknown>;
  let statistics: ConsensusComputationResult['statistics'] = {};

  if (numericSignals.length > 0) {
    // Numeric consensus computation
    const values = numericSignals.map(s => s.value as number);
    const aggregateFn = AGGREGATION_FUNCTIONS[options.aggregationMethod];

    consensusValue = aggregateFn(values, weights);

    // Compute statistics
    const mean = AGGREGATION_FUNCTIONS.mean(values);
    const median = AGGREGATION_FUNCTIONS.median(values);
    const variance = values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / values.length;
    const stdDev = Math.sqrt(variance);

    statistics = { mean, median, stdDev, variance };
  } else if (structuredSignals.length > 0) {
    // For structured signals, use the highest confidence signal as consensus
    const sortedByConfidence = [...structuredSignals].sort((a, b) => b.confidence - a.confidence);
    consensusValue = sortedByConfidence[0].value as Record<string, unknown>;
  } else {
    consensusValue = null as any;
  }

  // Calculate agreement level and identify divergent signals
  const { agreementLevel, agreementCount, divergentSignals } = calculateAgreement(
    filteredSignals,
    consensusValue,
    options.minAgreementThreshold,
    options.includeDivergentAnalysis
  );

  // Calculate overall confidence
  // Confidence = weighted average of signal confidences × agreement level
  const weightedConfidenceSum = filteredSignals.reduce(
    (sum, s) => sum + s.confidence * weightFn(s.confidence),
    0
  );
  const totalWeight = filteredSignals.reduce((sum, s) => sum + weightFn(s.confidence), 0);
  const avgWeightedConfidence = totalWeight > 0 ? weightedConfidenceSum / totalWeight : 0;
  const confidence = avgWeightedConfidence * agreementLevel;

  return {
    consensusValue,
    agreementLevel,
    agreementCount,
    totalSignals: filteredSignals.length,
    divergentSignals,
    statistics,
    confidence: Math.round(confidence * 1000) / 1000, // Round to 3 decimal places
    computationTimeMs: Date.now() - startTime,
    method: options.aggregationMethod,
  };
}

/**
 * Calculate agreement level across signals
 *
 * For numeric signals: Uses normalized distance from consensus
 * For structured signals: Uses simple equality check (future: semantic similarity)
 */
function calculateAgreement(
  signals: SignalInput[],
  consensusValue: number | Record<string, unknown>,
  threshold: number,
  includeDivergent: boolean
): {
  agreementLevel: number;
  agreementCount: number;
  divergentSignals: Array<{ signalId: string; divergenceScore: number; value: unknown }>;
} {
  if (signals.length === 0 || consensusValue === null) {
    return { agreementLevel: 0, agreementCount: 0, divergentSignals: [] };
  }

  const divergentSignals: Array<{ signalId: string; divergenceScore: number; value: unknown }> = [];
  let agreementSum = 0;
  let agreementCount = 0;

  for (const signal of signals) {
    const divergenceScore = calculateDivergence(signal.value, consensusValue);
    const agreementScore = 1 - divergenceScore;

    agreementSum += agreementScore;

    if (agreementScore >= threshold) {
      agreementCount++;
    } else if (includeDivergent) {
      divergentSignals.push({
        signalId: signal.signalId,
        divergenceScore: Math.round(divergenceScore * 1000) / 1000,
        value: signal.value,
      });
    }
  }

  const agreementLevel = Math.round((agreementSum / signals.length) * 1000) / 1000;

  return { agreementLevel, agreementCount, divergentSignals };
}

/**
 * Calculate divergence between a signal value and consensus
 *
 * Returns a value between 0 (no divergence) and 1 (maximum divergence)
 */
function calculateDivergence(
  signalValue: unknown,
  consensusValue: unknown
): number {
  // Numeric comparison
  if (typeof signalValue === 'number' && typeof consensusValue === 'number') {
    if (consensusValue === 0) {
      return signalValue === 0 ? 0 : 1;
    }
    // Normalized absolute difference, capped at 1
    const relativeDiff = Math.abs(signalValue - consensusValue) / Math.abs(consensusValue);
    return Math.min(relativeDiff, 1);
  }

  // Structured comparison (simple equality for now)
  if (typeof signalValue === 'object' && typeof consensusValue === 'object') {
    return JSON.stringify(signalValue) === JSON.stringify(consensusValue) ? 0 : 1;
  }

  // Type mismatch = maximum divergence
  return 1;
}

/**
 * Build constraints applied for the DecisionEvent
 */
export function buildConstraintsApplied(input: ConsensusInput): ConstraintApplied[] {
  const constraints: ConstraintApplied[] = [];

  // Main constraint from input parameters
  constraints.push({
    scope: input.options.scopeFilter?.join(',') || 'all',
    dataBoundaries: {
      startTime: input.timeRange.start,
      endTime: input.timeRange.end,
      layers: input.options.scopeFilter,
    },
    confidenceBands: {
      lower: input.options.minAgreementThreshold,
      upper: 1.0,
    },
    minAgreementThreshold: input.options.minAgreementThreshold,
  });

  return constraints;
}

/**
 * Build ConsensusOutput from computation result
 */
export function buildConsensusOutput(result: ConsensusComputationResult): ConsensusOutput {
  return {
    consensusValue: result.consensusValue,
    agreementLevel: result.agreementLevel,
    agreementCount: result.agreementCount,
    totalSignals: result.totalSignals,
    divergentSignals: result.divergentSignals.length > 0 ? result.divergentSignals : undefined,
    statistics: Object.keys(result.statistics).length > 0 ? result.statistics : undefined,
  };
}
