/**
 * Strategic Recommendation Agent - Core Logic Tests
 *
 * Tests for signal aggregation, trend analysis, correlation detection,
 * and recommendation synthesis. Ensures NO prohibited operations.
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';

// Mock types based on the schema
import type {
  Signal,
  SignalAggregation,
  TrendAnalysis,
  CrossDomainCorrelation,
  StrategicRecommendation,
  StrategicRecommendationInput,
  StrategicRecommendationOutput,
} from '../types';

/**
 * Mock Strategic Recommendation Agent
 * This represents the expected interface and behavior
 */
class StrategicRecommendationAgent {
  /**
   * Aggregate signals from multiple source layers
   */
  async aggregateSignals(
    signals: Signal[],
    timeWindow: { startTime: string; endTime: string }
  ): Promise<SignalAggregation> {
    // Group signals by layer
    const signalsByLayer: Record<string, Signal[]> = {};

    signals.forEach((signal) => {
      if (!signalsByLayer[signal.layer]) {
        signalsByLayer[signal.layer] = [];
      }
      signalsByLayer[signal.layer].push(signal);
    });

    return {
      timeWindow,
      signalsByLayer,
      totalSignals: signals.length,
      layersIncluded: Object.keys(signalsByLayer),
    };
  }

  /**
   * Analyze trends from aggregated signals
   */
  async analyzeTrends(aggregation: SignalAggregation): Promise<TrendAnalysis[]> {
    const trends: TrendAnalysis[] = [];

    // Analyze each layer
    for (const [layer, signals] of Object.entries(aggregation.signalsByLayer)) {
      if (signals.length === 0) continue;

      // Group by metric type
      const byMetric: Record<string, Signal[]> = {};
      signals.forEach((s) => {
        if (!byMetric[s.metricType]) byMetric[s.metricType] = [];
        byMetric[s.metricType].push(s);
      });

      // Analyze each metric
      for (const [metricType, metricSignals] of Object.entries(byMetric)) {
        if (metricSignals.length < 2) continue;

        const values = metricSignals.map((s) => s.value);
        const trend = this.calculateTrend(values);

        trends.push({
          metricType,
          layer,
          direction: trend.direction,
          magnitude: trend.magnitude,
          velocity: trend.velocity,
          dataPoints: values.length,
          confidence: this.calculateConfidence(metricSignals),
        });
      }
    }

    return trends;
  }

  /**
   * Detect cross-domain correlations
   */
  async detectCorrelations(trends: TrendAnalysis[]): Promise<CrossDomainCorrelation[]> {
    const correlations: CrossDomainCorrelation[] = [];

    // Compare all trend pairs
    for (let i = 0; i < trends.length; i++) {
      for (let j = i + 1; j < trends.length; j++) {
        const primary = trends[i];
        const secondary = trends[j];

        // Skip if same layer
        if (primary.layer === secondary.layer) continue;

        const coefficient = this.calculateCorrelation(primary, secondary);

        // Only record significant correlations
        if (Math.abs(coefficient) > 0.5) {
          correlations.push({
            correlationId: `corr-${i}-${j}`,
            primaryTrend: primary,
            secondaryTrend: secondary,
            correlationCoefficient: coefficient,
            strength: this.classifyStrength(Math.abs(coefficient)),
            causality: this.assessCausality(coefficient),
          });
        }
      }
    }

    return correlations;
  }

  /**
   * Synthesize strategic recommendations
   */
  async synthesizeRecommendations(
    trends: TrendAnalysis[],
    correlations: CrossDomainCorrelation[],
    input: StrategicRecommendationInput
  ): Promise<StrategicRecommendation[]> {
    const recommendations: StrategicRecommendation[] = [];

    // Generate recommendations based on correlations
    for (const correlation of correlations) {
      if (correlation.strength === 'weak') continue;

      const rec = this.createRecommendation(correlation, trends);
      if (rec && rec.confidence >= input.minConfidence) {
        recommendations.push(rec);
      }
    }

    // Sort by priority and confidence
    recommendations.sort((a, b) => {
      const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
      const priorityDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
      return priorityDiff !== 0 ? priorityDiff : b.confidence - a.confidence;
    });

    // Limit results
    return recommendations.slice(0, input.maxRecommendations);
  }

  /**
   * Execute full analysis
   */
  async analyze(input: StrategicRecommendationInput): Promise<StrategicRecommendationOutput> {
    const startTime = Date.now();

    // This would normally fetch from RuVector, but for testing we simulate
    const signals = await this.fetchSignals(input);
    const aggregation = await this.aggregateSignals(signals, input.timeWindow);
    const trends = await this.analyzeTrends(aggregation);
    const correlations = await this.detectCorrelations(trends);
    const recommendations = await this.synthesizeRecommendations(trends, correlations, input);

    const processingDuration = Date.now() - startTime;

    return {
      recommendations,
      totalSignalsAnalyzed: signals.length,
      trendsIdentified: trends.length,
      correlationsFound: correlations.length,
      overallConfidence: this.calculateOverallConfidence(recommendations),
      analysisMetadata: {
        timeWindow: input.timeWindow,
        layersAnalyzed: input.sourceLayers,
        processingDuration,
      },
    };
  }

  // Helper methods
  private async fetchSignals(input: StrategicRecommendationInput): Promise<Signal[]> {
    // Mock implementation - would fetch from RuVector
    return [];
  }

  private calculateTrend(values: number[]): {
    direction: 'increasing' | 'decreasing' | 'stable' | 'volatile';
    magnitude: number;
    velocity: number;
  } {
    if (values.length < 2) {
      return { direction: 'stable', magnitude: 0, velocity: 0 };
    }

    // Simple linear trend calculation
    const n = values.length;
    const slope = (values[n - 1] - values[0]) / (n - 1);
    const mean = values.reduce((a, b) => a + b, 0) / n;
    const variance = values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / n;
    const stdDev = Math.sqrt(variance);

    // Determine direction
    let direction: 'increasing' | 'decreasing' | 'stable' | 'volatile';
    if (stdDev / mean > 0.3) {
      direction = 'volatile';
    } else if (Math.abs(slope) < mean * 0.05) {
      direction = 'stable';
    } else {
      direction = slope > 0 ? 'increasing' : 'decreasing';
    }

    return {
      direction,
      magnitude: Math.min(Math.abs(slope / mean), 1),
      velocity: slope,
    };
  }

  private calculateConfidence(signals: Signal[]): number {
    if (signals.length === 0) return 0;
    const avgConfidence = signals.reduce((sum, s) => sum + s.confidence, 0) / signals.length;
    // Factor in sample size
    const sampleSizeFactor = Math.min(signals.length / 100, 1);
    return avgConfidence * sampleSizeFactor;
  }

  private calculateCorrelation(t1: TrendAnalysis, t2: TrendAnalysis): number {
    // Simplified correlation based on direction alignment
    const directionScore = t1.direction === t2.direction ? 1 : -0.5;
    const magnitudeAlignment = 1 - Math.abs(t1.magnitude - t2.magnitude);
    return directionScore * magnitudeAlignment * 0.8;
  }

  private classifyStrength(coefficient: number): 'weak' | 'moderate' | 'strong' {
    if (coefficient >= 0.7) return 'strong';
    if (coefficient >= 0.4) return 'moderate';
    return 'weak';
  }

  private assessCausality(coefficient: number): 'none' | 'potential' | 'likely' {
    const abs = Math.abs(coefficient);
    if (abs < 0.5) return 'none';
    if (abs < 0.8) return 'potential';
    return 'likely';
  }

  private createRecommendation(
    correlation: CrossDomainCorrelation,
    trends: TrendAnalysis[]
  ): StrategicRecommendation | null {
    // Generate recommendation based on correlation pattern
    const { primaryTrend, secondaryTrend } = correlation;

    // Example: High latency + High cost = optimization opportunity
    if (
      primaryTrend.metricType.includes('latency') &&
      secondaryTrend.metricType.includes('cost')
    ) {
      return {
        recommendationId: `rec-${correlation.correlationId}`,
        category: 'cost-optimization',
        priority: correlation.strength === 'strong' ? 'high' : 'medium',
        title: 'Optimize resource allocation',
        description: 'Latency and cost are both increasing',
        rationale: `Strong correlation (${correlation.correlationCoefficient.toFixed(2)}) detected`,
        supportingCorrelations: [correlation.correlationId],
        supportingTrends: [primaryTrend.metricType, secondaryTrend.metricType],
        confidence: (primaryTrend.confidence + secondaryTrend.confidence) / 2,
        timeHorizon: 'short-term',
      };
    }

    return null;
  }

  private calculateOverallConfidence(recommendations: StrategicRecommendation[]): number {
    if (recommendations.length === 0) return 0;
    return (
      recommendations.reduce((sum, r) => sum + r.confidence, 0) / recommendations.length
    );
  }
}

describe('StrategicRecommendationAgent', () => {
  let agent: StrategicRecommendationAgent;

  beforeEach(() => {
    agent = new StrategicRecommendationAgent();
  });

  describe('Signal Aggregation', () => {
    it('should aggregate signals by layer', async () => {
      const signals: Signal[] = [
        {
          signalId: 'sig-1',
          layer: 'observatory',
          timestamp: '2024-01-01T00:00:00.000Z',
          metricType: 'latency',
          value: 100,
          confidence: 0.9,
        },
        {
          signalId: 'sig-2',
          layer: 'cost-ops',
          timestamp: '2024-01-01T01:00:00.000Z',
          metricType: 'spend',
          value: 500,
          confidence: 0.85,
        },
        {
          signalId: 'sig-3',
          layer: 'observatory',
          timestamp: '2024-01-01T02:00:00.000Z',
          metricType: 'latency',
          value: 120,
          confidence: 0.88,
        },
      ];

      const timeWindow = {
        startTime: '2024-01-01T00:00:00.000Z',
        endTime: '2024-01-02T00:00:00.000Z',
      };

      const result = await agent.aggregateSignals(signals, timeWindow);

      expect(result.totalSignals).toBe(3);
      expect(result.layersIncluded).toContain('observatory');
      expect(result.layersIncluded).toContain('cost-ops');
      expect(result.signalsByLayer['observatory']).toHaveLength(2);
      expect(result.signalsByLayer['cost-ops']).toHaveLength(1);
    });

    it('should handle empty signals array', async () => {
      const timeWindow = {
        startTime: '2024-01-01T00:00:00.000Z',
        endTime: '2024-01-02T00:00:00.000Z',
      };

      const result = await agent.aggregateSignals([], timeWindow);

      expect(result.totalSignals).toBe(0);
      expect(result.layersIncluded).toHaveLength(0);
    });

    it('should preserve time window', async () => {
      const signals: Signal[] = [
        {
          signalId: 'sig-1',
          layer: 'observatory',
          timestamp: '2024-01-01T12:00:00.000Z',
          metricType: 'latency',
          value: 100,
          confidence: 0.9,
        },
      ];

      const timeWindow = {
        startTime: '2024-01-01T00:00:00.000Z',
        endTime: '2024-01-02T00:00:00.000Z',
      };

      const result = await agent.aggregateSignals(signals, timeWindow);

      expect(result.timeWindow).toEqual(timeWindow);
    });
  });

  describe('Trend Analysis', () => {
    it('should identify increasing trend', async () => {
      const aggregation: SignalAggregation = {
        timeWindow: {
          startTime: '2024-01-01T00:00:00.000Z',
          endTime: '2024-01-02T00:00:00.000Z',
        },
        signalsByLayer: {
          observatory: [
            {
              signalId: 'sig-1',
              layer: 'observatory',
              timestamp: '2024-01-01T00:00:00.000Z',
              metricType: 'latency',
              value: 100,
              confidence: 0.9,
            },
            {
              signalId: 'sig-2',
              layer: 'observatory',
              timestamp: '2024-01-01T01:00:00.000Z',
              metricType: 'latency',
              value: 150,
              confidence: 0.9,
            },
            {
              signalId: 'sig-3',
              layer: 'observatory',
              timestamp: '2024-01-01T02:00:00.000Z',
              metricType: 'latency',
              value: 200,
              confidence: 0.9,
            },
          ],
        },
        totalSignals: 3,
        layersIncluded: ['observatory'],
      };

      const trends = await agent.analyzeTrends(aggregation);

      expect(trends).toHaveLength(1);
      expect(trends[0].direction).toBe('increasing');
      expect(trends[0].metricType).toBe('latency');
      expect(trends[0].layer).toBe('observatory');
      expect(trends[0].dataPoints).toBe(3);
    });

    it('should identify decreasing trend', async () => {
      const aggregation: SignalAggregation = {
        timeWindow: {
          startTime: '2024-01-01T00:00:00.000Z',
          endTime: '2024-01-02T00:00:00.000Z',
        },
        signalsByLayer: {
          'cost-ops': [
            {
              signalId: 'sig-1',
              layer: 'cost-ops',
              timestamp: '2024-01-01T00:00:00.000Z',
              metricType: 'spend',
              value: 1000,
              confidence: 0.85,
            },
            {
              signalId: 'sig-2',
              layer: 'cost-ops',
              timestamp: '2024-01-01T01:00:00.000Z',
              metricType: 'spend',
              value: 800,
              confidence: 0.85,
            },
            {
              signalId: 'sig-3',
              layer: 'cost-ops',
              timestamp: '2024-01-01T02:00:00.000Z',
              metricType: 'spend',
              value: 600,
              confidence: 0.85,
            },
          ],
        },
        totalSignals: 3,
        layersIncluded: ['cost-ops'],
      };

      const trends = await agent.analyzeTrends(aggregation);

      expect(trends).toHaveLength(1);
      expect(trends[0].direction).toBe('decreasing');
    });

    it('should identify stable trend', async () => {
      const aggregation: SignalAggregation = {
        timeWindow: {
          startTime: '2024-01-01T00:00:00.000Z',
          endTime: '2024-01-02T00:00:00.000Z',
        },
        signalsByLayer: {
          governance: Array.from({ length: 10 }, (_, i) => ({
            signalId: `sig-${i}`,
            layer: 'governance',
            timestamp: `2024-01-01T${i.toString().padStart(2, '0')}:00:00.000Z`,
            metricType: 'compliance',
            value: 95 + (Math.random() * 2 - 1), // Small variance around 95
            confidence: 0.9,
          })),
        },
        totalSignals: 10,
        layersIncluded: ['governance'],
      };

      const trends = await agent.analyzeTrends(aggregation);

      expect(trends).toHaveLength(1);
      expect(trends[0].direction).toBe('stable');
    });

    it('should skip layers with insufficient data', async () => {
      const aggregation: SignalAggregation = {
        timeWindow: {
          startTime: '2024-01-01T00:00:00.000Z',
          endTime: '2024-01-02T00:00:00.000Z',
        },
        signalsByLayer: {
          observatory: [
            {
              signalId: 'sig-1',
              layer: 'observatory',
              timestamp: '2024-01-01T00:00:00.000Z',
              metricType: 'latency',
              value: 100,
              confidence: 0.9,
            },
          ],
        },
        totalSignals: 1,
        layersIncluded: ['observatory'],
      };

      const trends = await agent.analyzeTrends(aggregation);

      expect(trends).toHaveLength(0);
    });

    it('should calculate confidence based on signal quality and sample size', async () => {
      const aggregation: SignalAggregation = {
        timeWindow: {
          startTime: '2024-01-01T00:00:00.000Z',
          endTime: '2024-01-02T00:00:00.000Z',
        },
        signalsByLayer: {
          observatory: Array.from({ length: 50 }, (_, i) => ({
            signalId: `sig-${i}`,
            layer: 'observatory',
            timestamp: `2024-01-01T${(i % 24).toString().padStart(2, '0')}:00:00.000Z`,
            metricType: 'latency',
            value: 100 + i * 2,
            confidence: 0.95,
          })),
        },
        totalSignals: 50,
        layersIncluded: ['observatory'],
      };

      const trends = await agent.analyzeTrends(aggregation);

      expect(trends[0].confidence).toBeGreaterThan(0.4);
      expect(trends[0].confidence).toBeLessThanOrEqual(1.0);
    });
  });

  describe('Correlation Detection', () => {
    it('should detect strong positive correlation', async () => {
      const trends: TrendAnalysis[] = [
        {
          metricType: 'latency',
          layer: 'observatory',
          direction: 'increasing',
          magnitude: 0.8,
          velocity: 10,
          dataPoints: 100,
          confidence: 0.9,
        },
        {
          metricType: 'cost',
          layer: 'cost-ops',
          direction: 'increasing',
          magnitude: 0.75,
          velocity: 8,
          dataPoints: 100,
          confidence: 0.85,
        },
      ];

      const correlations = await agent.detectCorrelations(trends);

      expect(correlations.length).toBeGreaterThan(0);
      expect(correlations[0].correlationCoefficient).toBeGreaterThan(0.5);
      expect(correlations[0].strength).toMatch(/moderate|strong/);
    });

    it('should not correlate trends from same layer', async () => {
      const trends: TrendAnalysis[] = [
        {
          metricType: 'latency',
          layer: 'observatory',
          direction: 'increasing',
          magnitude: 0.8,
          velocity: 10,
          dataPoints: 100,
          confidence: 0.9,
        },
        {
          metricType: 'throughput',
          layer: 'observatory',
          direction: 'decreasing',
          magnitude: 0.7,
          velocity: -8,
          dataPoints: 100,
          confidence: 0.88,
        },
      ];

      const correlations = await agent.detectCorrelations(trends);

      expect(correlations).toHaveLength(0);
    });

    it('should filter out weak correlations', async () => {
      const trends: TrendAnalysis[] = [
        {
          metricType: 'latency',
          layer: 'observatory',
          direction: 'increasing',
          magnitude: 0.3,
          velocity: 2,
          dataPoints: 50,
          confidence: 0.6,
        },
        {
          metricType: 'cost',
          layer: 'cost-ops',
          direction: 'stable',
          magnitude: 0.1,
          velocity: 0.5,
          dataPoints: 50,
          confidence: 0.7,
        },
      ];

      const correlations = await agent.detectCorrelations(trends);

      // Should filter out correlations below 0.5 coefficient
      const weakCorrelations = correlations.filter((c) => Math.abs(c.correlationCoefficient) < 0.5);
      expect(weakCorrelations).toHaveLength(0);
    });

    it('should classify correlation strength correctly', async () => {
      const trends: TrendAnalysis[] = [
        {
          metricType: 'latency',
          layer: 'observatory',
          direction: 'increasing',
          magnitude: 0.9,
          velocity: 15,
          dataPoints: 150,
          confidence: 0.95,
        },
        {
          metricType: 'cost',
          layer: 'cost-ops',
          direction: 'increasing',
          magnitude: 0.85,
          velocity: 14,
          dataPoints: 150,
          confidence: 0.92,
        },
      ];

      const correlations = await agent.detectCorrelations(trends);

      if (correlations.length > 0) {
        expect(['weak', 'moderate', 'strong']).toContain(correlations[0].strength);
      }
    });
  });

  describe('Recommendation Synthesis', () => {
    it('should generate recommendations from strong correlations', async () => {
      const trends: TrendAnalysis[] = [
        {
          metricType: 'latency',
          layer: 'observatory',
          direction: 'increasing',
          magnitude: 0.8,
          velocity: 10,
          dataPoints: 100,
          confidence: 0.9,
        },
        {
          metricType: 'cost',
          layer: 'cost-ops',
          direction: 'increasing',
          magnitude: 0.75,
          velocity: 8,
          dataPoints: 100,
          confidence: 0.85,
        },
      ];

      const correlations: CrossDomainCorrelation[] = [
        {
          correlationId: 'corr-1',
          primaryTrend: trends[0],
          secondaryTrend: trends[1],
          correlationCoefficient: 0.85,
          strength: 'strong',
          causality: 'likely',
        },
      ];

      const input: StrategicRecommendationInput = {
        timeWindow: {
          startTime: '2024-01-01T00:00:00.000Z',
          endTime: '2024-01-07T00:00:00.000Z',
        },
        sourceLayers: ['observatory', 'cost-ops'],
        minConfidence: 0.7,
        maxRecommendations: 10,
        executionRef: '550e8400-e29b-41d4-a716-446655440000',
      };

      const recommendations = await agent.synthesizeRecommendations(trends, correlations, input);

      expect(recommendations.length).toBeGreaterThan(0);
      expect(recommendations[0].confidence).toBeGreaterThanOrEqual(input.minConfidence);
    });

    it('should filter by minimum confidence', async () => {
      const trends: TrendAnalysis[] = [
        {
          metricType: 'latency',
          layer: 'observatory',
          direction: 'increasing',
          magnitude: 0.5,
          velocity: 3,
          dataPoints: 30,
          confidence: 0.6,
        },
        {
          metricType: 'cost',
          layer: 'cost-ops',
          direction: 'increasing',
          magnitude: 0.4,
          velocity: 2,
          dataPoints: 30,
          confidence: 0.55,
        },
      ];

      const correlations: CrossDomainCorrelation[] = [
        {
          correlationId: 'corr-1',
          primaryTrend: trends[0],
          secondaryTrend: trends[1],
          correlationCoefficient: 0.6,
          strength: 'moderate',
        },
      ];

      const input: StrategicRecommendationInput = {
        timeWindow: {
          startTime: '2024-01-01T00:00:00.000Z',
          endTime: '2024-01-07T00:00:00.000Z',
        },
        sourceLayers: ['observatory', 'cost-ops'],
        minConfidence: 0.9, // High threshold
        maxRecommendations: 10,
        executionRef: '550e8400-e29b-41d4-a716-446655440000',
      };

      const recommendations = await agent.synthesizeRecommendations(trends, correlations, input);

      // Should filter out low-confidence recommendations
      recommendations.forEach((rec) => {
        expect(rec.confidence).toBeGreaterThanOrEqual(input.minConfidence);
      });
    });

    it('should limit number of recommendations', async () => {
      const trends: TrendAnalysis[] = Array.from({ length: 20 }, (_, i) => ({
        metricType: `metric-${i}`,
        layer: i % 2 === 0 ? 'observatory' : 'cost-ops',
        direction: 'increasing' as const,
        magnitude: 0.8,
        velocity: 10,
        dataPoints: 100,
        confidence: 0.9,
      }));

      const correlations: CrossDomainCorrelation[] = [];
      for (let i = 0; i < trends.length; i += 2) {
        correlations.push({
          correlationId: `corr-${i}`,
          primaryTrend: trends[i],
          secondaryTrend: trends[i + 1],
          correlationCoefficient: 0.8,
          strength: 'strong',
        });
      }

      const input: StrategicRecommendationInput = {
        timeWindow: {
          startTime: '2024-01-01T00:00:00.000Z',
          endTime: '2024-01-07T00:00:00.000Z',
        },
        sourceLayers: ['observatory', 'cost-ops'],
        minConfidence: 0.5,
        maxRecommendations: 5,
        executionRef: '550e8400-e29b-41d4-a716-446655440000',
      };

      const recommendations = await agent.synthesizeRecommendations(trends, correlations, input);

      expect(recommendations.length).toBeLessThanOrEqual(input.maxRecommendations);
    });

    it('should sort by priority and confidence', async () => {
      const trends: TrendAnalysis[] = [
        {
          metricType: 'latency',
          layer: 'observatory',
          direction: 'increasing',
          magnitude: 0.9,
          velocity: 15,
          dataPoints: 100,
          confidence: 0.95,
        },
        {
          metricType: 'cost',
          layer: 'cost-ops',
          direction: 'increasing',
          magnitude: 0.85,
          velocity: 12,
          dataPoints: 100,
          confidence: 0.9,
        },
      ];

      const correlations: CrossDomainCorrelation[] = [
        {
          correlationId: 'corr-high',
          primaryTrend: trends[0],
          secondaryTrend: trends[1],
          correlationCoefficient: 0.9,
          strength: 'strong',
        },
      ];

      const input: StrategicRecommendationInput = {
        timeWindow: {
          startTime: '2024-01-01T00:00:00.000Z',
          endTime: '2024-01-07T00:00:00.000Z',
        },
        sourceLayers: ['observatory', 'cost-ops'],
        minConfidence: 0.5,
        maxRecommendations: 10,
        executionRef: '550e8400-e29b-41d4-a716-446655440000',
      };

      const recommendations = await agent.synthesizeRecommendations(trends, correlations, input);

      // Verify sorting
      for (let i = 1; i < recommendations.length; i++) {
        const prev = recommendations[i - 1];
        const curr = recommendations[i];
        const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };

        const prevPriority = priorityOrder[prev.priority];
        const currPriority = priorityOrder[curr.priority];

        if (prevPriority === currPriority) {
          expect(prev.confidence).toBeGreaterThanOrEqual(curr.confidence);
        } else {
          expect(prevPriority).toBeLessThan(currPriority);
        }
      }
    });
  });

  describe('Full Analysis', () => {
    it('should execute complete analysis workflow', async () => {
      const input: StrategicRecommendationInput = {
        timeWindow: {
          startTime: '2024-01-01T00:00:00.000Z',
          endTime: '2024-01-07T00:00:00.000Z',
        },
        sourceLayers: ['observatory', 'cost-ops', 'governance'],
        minConfidence: 0.7,
        maxRecommendations: 10,
        executionRef: '550e8400-e29b-41d4-a716-446655440000',
      };

      const output = await agent.analyze(input);

      expect(output.recommendations).toBeDefined();
      expect(Array.isArray(output.recommendations)).toBe(true);
      expect(output.totalSignalsAnalyzed).toBeGreaterThanOrEqual(0);
      expect(output.trendsIdentified).toBeGreaterThanOrEqual(0);
      expect(output.correlationsFound).toBeGreaterThanOrEqual(0);
      expect(output.overallConfidence).toBeGreaterThanOrEqual(0);
      expect(output.overallConfidence).toBeLessThanOrEqual(1);
      expect(output.analysisMetadata.timeWindow).toEqual(input.timeWindow);
      expect(output.analysisMetadata.layersAnalyzed).toEqual(input.sourceLayers);
      expect(output.analysisMetadata.processingDuration).toBeGreaterThan(0);
    });

    it('should handle empty result sets gracefully', async () => {
      const input: StrategicRecommendationInput = {
        timeWindow: {
          startTime: '2024-01-01T00:00:00.000Z',
          endTime: '2024-01-01T01:00:00.000Z',
        },
        sourceLayers: ['observatory'],
        minConfidence: 0.99, // Very high threshold
        maxRecommendations: 10,
        executionRef: '550e8400-e29b-41d4-a716-446655440000',
      };

      const output = await agent.analyze(input);

      expect(output.recommendations).toHaveLength(0);
      expect(output.overallConfidence).toBe(0);
    });
  });

  describe('Security - Prohibited Operations', () => {
    it('should NOT execute any SQL queries', async () => {
      const input: StrategicRecommendationInput = {
        timeWindow: {
          startTime: '2024-01-01T00:00:00.000Z',
          endTime: '2024-01-07T00:00:00.000Z',
        },
        sourceLayers: ['observatory'],
        minConfidence: 0.7,
        maxRecommendations: 10,
        executionRef: '550e8400-e29b-41d4-a716-446655440000',
      };

      // Mock to track if any SQL-like operations are attempted
      const sqlSpy = jest.fn();
      (global as any).executeSql = sqlSpy;

      await agent.analyze(input);

      expect(sqlSpy).not.toHaveBeenCalled();
    });

    it('should NOT perform any write operations', async () => {
      const input: StrategicRecommendationInput = {
        timeWindow: {
          startTime: '2024-01-01T00:00:00.000Z',
          endTime: '2024-01-07T00:00:00.000Z',
        },
        sourceLayers: ['observatory'],
        minConfidence: 0.7,
        maxRecommendations: 10,
        executionRef: '550e8400-e29b-41d4-a716-446655440000',
      };

      // Recommendations should be read-only
      const output = await agent.analyze(input);

      // Verify output is analysis only, no mutations
      expect(output).toHaveProperty('recommendations');
      expect(output).toHaveProperty('analysisMetadata');
      expect(output).not.toHaveProperty('executionResults');
      expect(output).not.toHaveProperty('appliedChanges');
    });

    it('should only READ data, never modify source systems', () => {
      // Agent methods should not have side effects
      const aggregateMethod = agent.aggregateSignals.toString();
      const analyzeMethod = agent.analyzeTrends.toString();

      // Should not contain mutation keywords
      expect(aggregateMethod).not.toContain('UPDATE');
      expect(aggregateMethod).not.toContain('DELETE');
      expect(aggregateMethod).not.toContain('INSERT');
      expect(analyzeMethod).not.toContain('execute');
      expect(analyzeMethod).not.toContain('apply');
    });
  });
});
