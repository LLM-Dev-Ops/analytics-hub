/**
 * Ecosystem Collaboration Agent Computation
 *
 * Pure functions for aggregation, indexing, and cross-system analytics.
 * NO state mutation. NO action commits. NO conclusions.
 *
 * @module agents/ecosystem-collaboration/computation
 */

import type {
  EcosystemSignal,
  AggregationSignal,
  ConsensusSignal,
  StrategicSignal,
  IndexEntry,
  CrossSystemQuery,
} from '../../contracts/ecosystem-collaboration-agent';
import type {
  SignalGroup,
  CorrelationPair,
  AggregationResult,
  ConsensusResult,
  StrategicResult,
  ComputationOutput,
} from './types';

/**
 * Group signals by partner and category
 */
export function groupSignals(signals: EcosystemSignal[]): SignalGroup[] {
  const groups = new Map<string, SignalGroup>();

  for (const signal of signals) {
    const key = `${signal.partnerId}:${signal.category}`;
    if (!groups.has(key)) {
      groups.set(key, {
        partnerId: signal.partnerId,
        category: signal.category,
        signals: [],
      });
    }
    groups.get(key)!.signals.push(signal);
  }

  return Array.from(groups.values());
}

/**
 * Compute aggregation signals from grouped data
 * Emits aggregation_signal - NO conclusions, data only
 */
export function computeAggregation(
  groups: SignalGroup[],
  timeRange: { start: string; end: string }
): AggregationResult {
  const aggregationSignals: AggregationSignal[] = [];
  const indexEntries: IndexEntry[] = [];

  for (const group of groups) {
    const values = group.signals.map(s => s.value);
    const confidences = group.signals.map(s => s.confidence);

    // Weighted average by confidence
    const totalWeight = confidences.reduce((sum, c) => sum + c, 0);
    const weightedSum = group.signals.reduce(
      (sum, s) => sum + s.value * s.confidence,
      0
    );
    const aggregatedValue = totalWeight > 0 ? weightedSum / totalWeight : 0;

    // Average confidence
    const avgConfidence =
      confidences.length > 0
        ? confidences.reduce((sum, c) => sum + c, 0) / confidences.length
        : 0;

    aggregationSignals.push({
      signalType: 'aggregation_signal',
      partnerId: group.partnerId,
      category: group.category,
      aggregatedValue,
      sampleCount: group.signals.length,
      timeRange,
      confidence: avgConfidence,
    });

    indexEntries.push({
      partnerId: group.partnerId,
      category: group.category,
      lastUpdated: new Date().toISOString(),
      signalCount: group.signals.length,
      avgConfidence,
    });
  }

  return { signals: aggregationSignals, indexEntries };
}

/**
 * Compute consensus signals across systems
 * Emits consensus_signal - NO conclusions, alignment data only
 */
export function computeConsensus(
  signals: EcosystemSignal[],
  systems: string[]
): ConsensusResult {
  const consensusSignals: ConsensusSignal[] = [];

  // Group by category for consensus analysis
  const categoryGroups = new Map<string, Map<string, number[]>>();

  for (const signal of signals) {
    if (!systems.includes(signal.sourceSystem)) continue;

    if (!categoryGroups.has(signal.category)) {
      categoryGroups.set(signal.category, new Map());
    }
    const categoryMap = categoryGroups.get(signal.category)!;
    if (!categoryMap.has(signal.sourceSystem)) {
      categoryMap.set(signal.sourceSystem, []);
    }
    categoryMap.get(signal.sourceSystem)!.push(signal.value);
  }

  // Compute alignment for each category
  for (const [category, systemValues] of categoryGroups) {
    const systemAverages: { system: string; avg: number }[] = [];

    for (const [system, values] of systemValues) {
      const avg = values.reduce((s, v) => s + v, 0) / values.length;
      systemAverages.push({ system, avg });
    }

    if (systemAverages.length < 2) continue;

    // Compute overall average and deviations
    const overallAvg =
      systemAverages.reduce((s, sa) => s + sa.avg, 0) / systemAverages.length;
    const maxDeviation = Math.max(
      ...systemAverages.map(sa => Math.abs(sa.avg - overallAvg))
    );

    // Alignment score: 1 = perfect alignment, 0 = max deviation
    const alignmentScore =
      overallAvg !== 0 ? Math.max(0, 1 - maxDeviation / Math.abs(overallAvg)) : 1;

    const divergenceFactors = systemAverages
      .filter(sa => Math.abs(sa.avg - overallAvg) > 0.01)
      .map(sa => ({
        system: sa.system,
        deviation: sa.avg - overallAvg,
      }));

    consensusSignals.push({
      signalType: 'consensus_signal',
      metric: category,
      systems: systemAverages.map(sa => sa.system),
      alignmentScore,
      divergenceFactors: divergenceFactors.length > 0 ? divergenceFactors : undefined,
    });
  }

  const overallAlignment =
    consensusSignals.length > 0
      ? consensusSignals.reduce((s, cs) => s + cs.alignmentScore, 0) /
        consensusSignals.length
      : 0;

  return { signals: consensusSignals, overallAlignment };
}

/**
 * Compute Pearson correlation coefficient
 */
function pearsonCorrelation(x: number[], y: number[]): number {
  if (x.length !== y.length || x.length < 2) return 0;

  const n = x.length;
  const sumX = x.reduce((s, v) => s + v, 0);
  const sumY = y.reduce((s, v) => s + v, 0);
  const sumXY = x.reduce((s, v, i) => s + v * y[i], 0);
  const sumX2 = x.reduce((s, v) => s + v * v, 0);
  const sumY2 = y.reduce((s, v) => s + v * v, 0);

  const numerator = n * sumXY - sumX * sumY;
  const denominator = Math.sqrt(
    (n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY)
  );

  if (denominator === 0) return 0;
  return numerator / denominator;
}

/**
 * Compute strategic signals from cross-system correlations
 * Emits strategic_signal - NO conclusions, correlation data only
 */
export function computeStrategicCorrelations(
  signals: EcosystemSignal[],
  queries: CrossSystemQuery[]
): StrategicResult {
  const strategicSignals: StrategicSignal[] = [];

  for (const query of queries) {
    const correlationPairs: StrategicSignal['correlationPairs'] = [];

    // Build value arrays for each system-metric pair
    const systemMetricValues = new Map<string, number[]>();

    for (const signal of signals) {
      if (!query.sourceSystems.includes(signal.sourceSystem)) continue;
      if (!query.metrics.includes(signal.category)) continue;

      const signalTime = new Date(signal.timestamp).getTime();
      const startTime = new Date(query.timeRange.start).getTime();
      const endTime = new Date(query.timeRange.end).getTime();

      if (signalTime < startTime || signalTime > endTime) continue;

      const key = `${signal.sourceSystem}:${signal.category}`;
      if (!systemMetricValues.has(key)) {
        systemMetricValues.set(key, []);
      }
      systemMetricValues.get(key)!.push(signal.value);
    }

    // Compute correlations between pairs
    const keys = Array.from(systemMetricValues.keys());
    for (let i = 0; i < keys.length; i++) {
      for (let j = i + 1; j < keys.length; j++) {
        const [systemA, metricA] = keys[i].split(':');
        const [systemB, metricB] = keys[j].split(':');

        const valuesA = systemMetricValues.get(keys[i])!;
        const valuesB = systemMetricValues.get(keys[j])!;

        // Align arrays by taking minimum length
        const minLen = Math.min(valuesA.length, valuesB.length);
        if (minLen < 2) continue;

        const correlation = pearsonCorrelation(
          valuesA.slice(0, minLen),
          valuesB.slice(0, minLen)
        );

        if (Math.abs(correlation) >= query.correlationThreshold) {
          correlationPairs.push({
            systemA,
            systemB,
            metricA,
            metricB,
            correlationCoefficient: Number(correlation.toFixed(4)),
          });
        }
      }
    }

    if (correlationPairs.length > 0) {
      strategicSignals.push({
        signalType: 'strategic_signal',
        correlationPairs,
        timeRange: query.timeRange,
      });
    }
  }

  const correlationCount = strategicSignals.reduce(
    (sum, ss) => sum + ss.correlationPairs.length,
    0
  );

  return { signals: strategicSignals, correlationCount };
}

/**
 * Estimate token count for output
 */
export function estimateTokens(output: ComputationOutput): number {
  // Rough estimate: ~4 chars per token
  const jsonSize = JSON.stringify(output).length;
  return Math.ceil(jsonSize / 4);
}

/**
 * Main computation orchestrator
 */
export function computeEcosystemAnalytics(
  signals: EcosystemSignal[],
  crossSystemQueries: CrossSystemQuery[] | undefined,
  options: {
    granularity: 'minute' | 'hour' | 'day' | 'week';
    updateIndex: boolean;
    crossSystemAnalytics: boolean;
    scopeFilter?: string[];
  },
  timeRange: { start: string; end: string }
): ComputationOutput {
  // Apply scope filter if provided
  const filteredSignals = options.scopeFilter
    ? signals.filter(s => options.scopeFilter!.includes(s.category))
    : signals;

  // Step 1: Aggregation
  const groups = groupSignals(filteredSignals);
  const aggregation = computeAggregation(groups, timeRange);

  // Step 2: Consensus
  const uniqueSystems = [...new Set(filteredSignals.map(s => s.sourceSystem))];
  const consensus = computeConsensus(filteredSignals, uniqueSystems);

  // Step 3: Strategic correlations
  const strategic = options.crossSystemAnalytics && crossSystemQueries
    ? computeStrategicCorrelations(filteredSignals, crossSystemQueries)
    : { signals: [], correlationCount: 0 };

  // Compute overall confidence
  const confidenceFactors = [
    aggregation.signals.length > 0 ? 0.4 : 0,
    consensus.overallAlignment * 0.3,
    strategic.correlationCount > 0 ? 0.3 : 0,
  ];
  const confidence = Math.min(1, confidenceFactors.reduce((s, f) => s + f, 0));

  const output: ComputationOutput = {
    aggregation,
    consensus,
    strategic,
    confidence,
    tokenEstimate: 0, // Will be computed after
  };

  output.tokenEstimate = estimateTokens(output);

  return output;
}
