/**
 * Strategic Recommendation Agent - Core Logic
 *
 * Aggregates DecisionEvents from multiple source layers (Observatory, CostOps, Governance),
 * performs trend analysis, detects correlations, and generates strategic recommendations.
 *
 * The agent MUST:
 * - Aggregate signals from multiple source layers
 * - Perform trend analysis across time windows
 * - Detect correlations between signals
 * - Generate strategic recommendations based on patterns
 * - Calculate confidence scores
 * - Emit exactly ONE DecisionEvent per invocation
 *
 * The agent MUST NOT:
 * - Modify execution behavior
 * - Enforce constraints or policies
 * - Trigger workflows or retries
 * - Execute other agents
 * - Apply optimizations autonomously
 *
 * @module agents/strategic-recommendation/agent
 */

import { v4 as uuidv4 } from 'uuid';
import { createHash } from 'crypto';
import {
  TimeRange,
  Signal,
  SignalAggregation,
  TrendAnalysis,
  TrendDirection,
  CrossDomainCorrelation,
  StrategicRecommendation,
  StrategicRecommendationInput,
  StrategicRecommendationOutput,
  RecommendationPriority,
  RecommendationCategory,
} from './types';

/**
 * Strategic Recommendation Agent version
 */
const AGENT_VERSION = '1.0.0';
const AGENT_ID = 'strategic-recommendation-agent';

/**
 * DecisionEvent structure for Strategic Recommendation Agent
 */
interface DecisionEvent {
  agent_id: string;
  agent_version: string;
  decision_type: string;
  inputs_hash: string;
  outputs: StrategicRecommendationOutput;
  confidence: number;
  constraints_applied: ConstraintApplied[];
  execution_ref: string;
  timestamp: string;
}

interface ConstraintApplied {
  scope: string;
  dataBoundaries: {
    startTime: string;
    endTime: string;
    layers?: string[];
  };
  confidenceBands?: {
    lower: number;
    upper: number;
  };
  minAgreementThreshold?: number;
}

/**
 * Aggregates signals from multiple source layers within a time window
 *
 * @param timeWindow - Time range for signal aggregation
 * @param sourceLayers - List of source layers to aggregate from
 * @returns Aggregated signals grouped by layer
 */
export async function aggregateSignals(
  timeWindow: TimeRange,
  sourceLayers: string[]
): Promise<SignalAggregation> {
  // In production, this would query the DecisionEvents database/stream
  // For now, we'll simulate signal aggregation
  const signalsByLayer: Record<string, Signal[]> = {};
  let totalSignals = 0;

  for (const layer of sourceLayers) {
    // Simulate fetching signals from each layer
    const signals = await fetchSignalsFromLayer(layer, timeWindow);
    signalsByLayer[layer] = signals;
    totalSignals += signals.length;
  }

  return {
    timeWindow,
    signalsByLayer,
    totalSignals,
    layersIncluded: sourceLayers,
  };
}

/**
 * Fetches signals from a specific source layer
 * (Simulated implementation - would query actual DecisionEvents in production)
 */
async function fetchSignalsFromLayer(
  layer: string,
  timeWindow: TimeRange
): Promise<Signal[]> {
  // Production implementation would:
  // 1. Query DecisionEvents table/stream for the given layer
  // 2. Filter by timeWindow
  // 3. Extract relevant metrics as signals
  // 4. Return structured Signal objects

  // Simulation: return mock signals
  return [];
}

/**
 * Analyzes trends in the aggregated signals
 *
 * @param signals - Aggregated signals from multiple layers
 * @returns Array of trend analyses for different metrics
 */
export function analyzeTrends(signals: SignalAggregation): TrendAnalysis[] {
  const trends: TrendAnalysis[] = [];

  for (const [layer, layerSignals] of Object.entries(signals.signalsByLayer)) {
    // Group signals by metric type
    const metricGroups = groupByMetricType(layerSignals);

    for (const [metricType, metricSignals] of Object.entries(metricGroups)) {
      const trend = calculateTrend(metricType, layer, metricSignals);
      if (trend) {
        trends.push(trend);
      }
    }
  }

  return trends;
}

/**
 * Groups signals by metric type
 */
function groupByMetricType(signals: Signal[]): Record<string, Signal[]> {
  return signals.reduce((groups, signal) => {
    if (!groups[signal.metricType]) {
      groups[signal.metricType] = [];
    }
    groups[signal.metricType].push(signal);
    return groups;
  }, {} as Record<string, Signal[]>);
}

/**
 * Calculates trend for a specific metric
 */
function calculateTrend(
  metricType: string,
  layer: string,
  signals: Signal[]
): TrendAnalysis | null {
  if (signals.length < 2) {
    return null;
  }

  // Sort signals by timestamp
  const sortedSignals = [...signals].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );

  // Calculate linear regression
  const values = sortedSignals.map((s) => s.value);
  const { slope, direction, magnitude } = calculateLinearRegression(values);

  // Detect anomalies (values > 2 standard deviations from mean)
  const anomalies = detectAnomalies(sortedSignals);

  // Calculate velocity (rate of change)
  const velocity = calculateVelocity(sortedSignals);

  // Determine trend direction
  const trendDirection = determineTrendDirection(slope, values);

  // Average confidence from signals
  const avgConfidence =
    signals.reduce((sum, s) => sum + s.confidence, 0) / signals.length;

  return {
    metricType,
    layer,
    direction: trendDirection,
    magnitude,
    velocity,
    dataPoints: signals.length,
    confidence: avgConfidence,
    anomalies: anomalies.length > 0 ? anomalies : undefined,
  };
}

/**
 * Calculates linear regression for trend analysis
 */
function calculateLinearRegression(values: number[]): {
  slope: number;
  direction: TrendDirection;
  magnitude: number;
} {
  const n = values.length;
  const indices = Array.from({ length: n }, (_, i) => i);

  const sumX = indices.reduce((a, b) => a + b, 0);
  const sumY = values.reduce((a, b) => a + b, 0);
  const sumXY = indices.reduce((sum, x, i) => sum + x * values[i], 0);
  const sumX2 = indices.reduce((sum, x) => sum + x * x, 0);

  const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
  const magnitude = Math.min(Math.abs(slope), 1.0);

  return {
    slope,
    direction: 'stable',
    magnitude,
  };
}

/**
 * Determines trend direction from slope and values
 */
function determineTrendDirection(slope: number, values: number[]): TrendDirection {
  const stdDev = calculateStdDev(values);
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const coefficientOfVariation = stdDev / Math.abs(mean || 1);

  // High volatility
  if (coefficientOfVariation > 0.3) {
    return 'volatile';
  }

  // Check slope
  const slopeThreshold = 0.05;
  if (Math.abs(slope) < slopeThreshold) {
    return 'stable';
  }

  return slope > 0 ? 'increasing' : 'decreasing';
}

/**
 * Calculates standard deviation
 */
function calculateStdDev(values: number[]): number {
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance =
    values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
  return Math.sqrt(variance);
}

/**
 * Detects anomalies in signals
 */
function detectAnomalies(signals: Signal[]): Array<{
  timestamp: string;
  value: number;
  deviationScore: number;
}> {
  const values = signals.map((s) => s.value);
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const stdDev = calculateStdDev(values);

  const anomalies: Array<{
    timestamp: string;
    value: number;
    deviationScore: number;
  }> = [];

  for (const signal of signals) {
    const deviationScore = Math.abs(signal.value - mean) / (stdDev || 1);
    if (deviationScore > 2.0) {
      anomalies.push({
        timestamp: signal.timestamp,
        value: signal.value,
        deviationScore,
      });
    }
  }

  return anomalies;
}

/**
 * Calculates velocity (rate of change) for signals
 */
function calculateVelocity(signals: Signal[]): number {
  if (signals.length < 2) {
    return 0;
  }

  const firstValue = signals[0].value;
  const lastValue = signals[signals.length - 1].value;
  const firstTime = new Date(signals[0].timestamp).getTime();
  const lastTime = new Date(signals[signals.length - 1].timestamp).getTime();

  const timeDelta = (lastTime - firstTime) / (1000 * 60 * 60); // hours
  if (timeDelta === 0) {
    return 0;
  }

  return (lastValue - firstValue) / timeDelta;
}

/**
 * Detects correlations between different trends
 *
 * @param trends - Array of trend analyses
 * @returns Array of cross-domain correlations
 */
export function detectCorrelations(trends: TrendAnalysis[]): CrossDomainCorrelation[] {
  const correlations: CrossDomainCorrelation[] = [];

  // Compare each pair of trends from different layers
  for (let i = 0; i < trends.length; i++) {
    for (let j = i + 1; j < trends.length; j++) {
      const trend1 = trends[i];
      const trend2 = trends[j];

      // Only correlate trends from different layers
      if (trend1.layer === trend2.layer) {
        continue;
      }

      const correlation = calculateCorrelation(trend1, trend2);
      if (correlation) {
        correlations.push(correlation);
      }
    }
  }

  return correlations;
}

/**
 * Calculates correlation between two trends
 */
function calculateCorrelation(
  trend1: TrendAnalysis,
  trend2: TrendAnalysis
): CrossDomainCorrelation | null {
  // Simplified correlation calculation
  // In production, would use actual time-series data and Pearson correlation

  let correlationCoefficient = 0;

  // Same direction trends are positively correlated
  if (trend1.direction === trend2.direction) {
    correlationCoefficient = 0.6 + Math.min(trend1.magnitude, trend2.magnitude) * 0.4;
  } else if (
    (trend1.direction === 'increasing' && trend2.direction === 'decreasing') ||
    (trend1.direction === 'decreasing' && trend2.direction === 'increasing')
  ) {
    // Opposite direction trends are negatively correlated
    correlationCoefficient = -(0.6 + Math.min(trend1.magnitude, trend2.magnitude) * 0.4);
  }

  const absCoeff = Math.abs(correlationCoefficient);
  if (absCoeff < 0.3) {
    return null; // Weak correlation, not significant
  }

  const strength: 'weak' | 'moderate' | 'strong' =
    absCoeff < 0.5 ? 'weak' : absCoeff < 0.7 ? 'moderate' : 'strong';

  const causality: 'none' | 'potential' | 'likely' =
    absCoeff < 0.5 ? 'none' : absCoeff < 0.7 ? 'potential' : 'likely';

  return {
    correlationId: uuidv4(),
    primaryTrend: trend1,
    secondaryTrend: trend2,
    correlationCoefficient,
    strength,
    causality,
  };
}

/**
 * Synthesizes strategic recommendations from correlations
 *
 * @param correlations - Array of cross-domain correlations
 * @returns Array of strategic recommendations
 */
export function synthesizeRecommendations(
  correlations: CrossDomainCorrelation[]
): StrategicRecommendation[] {
  const recommendations: StrategicRecommendation[] = [];

  for (const correlation of correlations) {
    const recommendation = generateRecommendationFromCorrelation(correlation);
    if (recommendation) {
      recommendations.push(recommendation);
    }
  }

  // Sort by priority and confidence
  recommendations.sort((a, b) => {
    const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
    const priorityDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
    if (priorityDiff !== 0) {
      return priorityDiff;
    }
    return b.confidence - a.confidence;
  });

  return recommendations;
}

/**
 * Generates a recommendation from a correlation
 */
function generateRecommendationFromCorrelation(
  correlation: CrossDomainCorrelation
): StrategicRecommendation | null {
  const { primaryTrend, secondaryTrend, correlationCoefficient, strength } = correlation;

  // Example: Cost increasing + Performance decreasing = optimization opportunity
  if (
    primaryTrend.layer === 'cost-ops' &&
    primaryTrend.direction === 'increasing' &&
    secondaryTrend.layer === 'observatory' &&
    secondaryTrend.direction === 'decreasing'
  ) {
    return {
      recommendationId: uuidv4(),
      category: 'cost-optimization',
      priority: determinePriority(strength, primaryTrend.magnitude),
      title: 'Cost-Performance Misalignment Detected',
      description:
        'Rising costs correlate with declining performance, indicating potential inefficiencies in resource utilization.',
      rationale: `Strong ${strength} correlation (${correlationCoefficient.toFixed(
        2
      )}) between cost trends and performance metrics suggests immediate optimization opportunities.`,
      supportingCorrelations: [correlation.correlationId],
      supportingTrends: [
        `${primaryTrend.layer}:${primaryTrend.metricType}`,
        `${secondaryTrend.layer}:${secondaryTrend.metricType}`,
      ],
      expectedImpact: {
        costSavings: primaryTrend.magnitude * 0.3, // 30% potential savings
        performanceGain: secondaryTrend.magnitude * 0.2, // 20% potential improvement
      },
      confidence: (primaryTrend.confidence + secondaryTrend.confidence) / 2,
      timeHorizon: 'short-term',
    };
  }

  // Generic recommendation based on correlation strength
  const category = categorizeRecommendation(primaryTrend, secondaryTrend);
  const priority = determinePriority(strength, Math.max(primaryTrend.magnitude, secondaryTrend.magnitude));

  return {
    recommendationId: uuidv4(),
    category,
    priority,
    title: `${formatTrendDescription(primaryTrend)} correlates with ${formatTrendDescription(
      secondaryTrend
    )}`,
    description: `Detected ${strength} correlation between ${primaryTrend.layer} and ${secondaryTrend.layer} metrics.`,
    rationale: `Correlation coefficient: ${correlationCoefficient.toFixed(2)}`,
    supportingCorrelations: [correlation.correlationId],
    supportingTrends: [
      `${primaryTrend.layer}:${primaryTrend.metricType}`,
      `${secondaryTrend.layer}:${secondaryTrend.metricType}`,
    ],
    confidence: (primaryTrend.confidence + secondaryTrend.confidence) / 2,
    timeHorizon: 'medium-term',
  };
}

/**
 * Categorizes recommendation based on trends
 */
function categorizeRecommendation(
  trend1: TrendAnalysis,
  trend2: TrendAnalysis
): RecommendationCategory {
  if (trend1.layer === 'cost-ops' || trend2.layer === 'cost-ops') {
    return 'cost-optimization';
  }
  if (trend1.layer === 'observatory' || trend2.layer === 'observatory') {
    return 'performance-improvement';
  }
  if (trend1.layer === 'governance' || trend2.layer === 'governance') {
    return 'governance-compliance';
  }
  return 'strategic-initiative';
}

/**
 * Determines priority based on correlation strength and magnitude
 */
function determinePriority(
  strength: 'weak' | 'moderate' | 'strong',
  magnitude: number
): RecommendationPriority {
  if (strength === 'strong' && magnitude > 0.7) {
    return 'critical';
  }
  if (strength === 'strong' || (strength === 'moderate' && magnitude > 0.6)) {
    return 'high';
  }
  if (strength === 'moderate') {
    return 'medium';
  }
  return 'low';
}

/**
 * Formats trend description for display
 */
function formatTrendDescription(trend: TrendAnalysis): string {
  return `${trend.direction} ${trend.metricType} in ${trend.layer}`;
}

/**
 * Calculates overall confidence score for recommendations
 *
 * @param recommendations - Array of strategic recommendations
 * @returns Overall confidence score (0-1)
 */
export function calculateConfidence(recommendations: StrategicRecommendation[]): number {
  if (recommendations.length === 0) {
    return 0;
  }

  const totalConfidence = recommendations.reduce((sum, rec) => sum + rec.confidence, 0);
  return totalConfidence / recommendations.length;
}

/**
 * Creates a DecisionEvent from analysis results
 *
 * @param input - Original input to the agent
 * @param output - Output from the agent
 * @param confidence - Overall confidence score
 * @returns DecisionEvent for audit and traceability
 */
export function createDecisionEvent(
  input: StrategicRecommendationInput,
  output: StrategicRecommendationOutput,
  confidence: number
): DecisionEvent {
  const inputsHash = createInputsHash(input);

  const constraintsApplied: ConstraintApplied[] = [
    {
      scope: 'strategic-analysis',
      dataBoundaries: {
        startTime: input.timeWindow.startTime,
        endTime: input.timeWindow.endTime,
        layers: input.sourceLayers,
      },
      confidenceBands: {
        lower: input.minConfidence,
        upper: 1.0,
      },
    },
  ];

  return {
    agent_id: AGENT_ID,
    agent_version: AGENT_VERSION,
    decision_type: 'strategic_recommendation_summary',
    inputs_hash: inputsHash,
    outputs: output,
    confidence,
    constraints_applied: constraintsApplied,
    execution_ref: input.executionRef,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Creates a hash of inputs for reproducibility
 */
function createInputsHash(inputs: unknown): string {
  const hash = createHash('sha256');
  hash.update(JSON.stringify(inputs));
  return hash.digest('hex').substring(0, 16);
}

/**
 * Main handler for Strategic Recommendation Agent
 *
 * Orchestrates the complete analysis pipeline:
 * 1. Aggregate signals from multiple layers
 * 2. Analyze trends across time windows
 * 3. Detect correlations between signals
 * 4. Synthesize strategic recommendations
 * 5. Calculate overall confidence
 * 6. Emit DecisionEvent
 *
 * @param input - Strategic recommendation input parameters
 * @returns Strategic recommendation output with DecisionEvent
 */
export async function analyze(
  input: StrategicRecommendationInput
): Promise<{ output: StrategicRecommendationOutput; event: DecisionEvent }> {
  const startTime = Date.now();

  // Step 1: Aggregate signals from multiple source layers
  const signalAggregation = await aggregateSignals(input.timeWindow, input.sourceLayers);

  // Step 2: Analyze trends across time windows
  const trends = analyzeTrends(signalAggregation);

  // Step 3: Detect correlations between signals
  const correlations = detectCorrelations(trends);

  // Step 4: Synthesize strategic recommendations
  let recommendations = synthesizeRecommendations(correlations);

  // Filter by focus categories if specified
  if (input.focusCategories && input.focusCategories.length > 0) {
    recommendations = recommendations.filter((rec) =>
      input.focusCategories!.includes(rec.category)
    );
  }

  // Filter by minimum confidence
  recommendations = recommendations.filter((rec) => rec.confidence >= input.minConfidence);

  // Limit to max recommendations
  recommendations = recommendations.slice(0, input.maxRecommendations);

  // Step 5: Calculate overall confidence
  const overallConfidence = calculateConfidence(recommendations);

  // Build output
  const output: StrategicRecommendationOutput = {
    recommendations,
    totalSignalsAnalyzed: signalAggregation.totalSignals,
    trendsIdentified: trends.length,
    correlationsFound: correlations.length,
    overallConfidence,
    analysisMetadata: {
      timeWindow: input.timeWindow,
      layersAnalyzed: input.sourceLayers,
      processingDuration: Date.now() - startTime,
    },
  };

  // Step 6: Emit DecisionEvent
  const event = createDecisionEvent(input, output, overallConfidence);

  return { output, event };
}
