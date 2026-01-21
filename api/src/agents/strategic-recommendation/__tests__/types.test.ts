/**
 * Strategic Recommendation Agent - Type Validation Tests
 *
 * Tests for Zod schema validation and type safety
 */

import {
  TimeRangeSchema,
  SignalSchema,
  SignalAggregationSchema,
  TrendAnalysisSchema,
  CrossDomainCorrelationSchema,
  StrategicRecommendationSchema,
  StrategicRecommendationInputSchema,
  StrategicRecommendationOutputSchema,
} from '../types';

describe('Strategic Recommendation Types', () => {
  describe('TimeRangeSchema', () => {
    it('should validate valid time range', () => {
      const validTimeRange = {
        startTime: '2024-01-01T00:00:00.000Z',
        endTime: '2024-01-02T00:00:00.000Z',
      };

      const result = TimeRangeSchema.safeParse(validTimeRange);
      expect(result.success).toBe(true);
    });

    it('should reject invalid datetime format', () => {
      const invalidTimeRange = {
        startTime: '2024-01-01',
        endTime: '2024-01-02',
      };

      const result = TimeRangeSchema.safeParse(invalidTimeRange);
      expect(result.success).toBe(false);
    });

    it('should reject missing fields', () => {
      const result = TimeRangeSchema.safeParse({ startTime: '2024-01-01T00:00:00.000Z' });
      expect(result.success).toBe(false);
    });
  });

  describe('SignalSchema', () => {
    it('should validate valid signal', () => {
      const validSignal = {
        signalId: 'sig-123',
        layer: 'observatory',
        timestamp: '2024-01-01T00:00:00.000Z',
        metricType: 'latency',
        value: 150.5,
        confidence: 0.95,
        metadata: { source: 'prod-cluster-1' },
      };

      const result = SignalSchema.safeParse(validSignal);
      expect(result.success).toBe(true);
    });

    it('should reject confidence outside 0-1 range', () => {
      const invalidSignal = {
        signalId: 'sig-123',
        layer: 'observatory',
        timestamp: '2024-01-01T00:00:00.000Z',
        metricType: 'latency',
        value: 150.5,
        confidence: 1.5,
      };

      const result = SignalSchema.safeParse(invalidSignal);
      expect(result.success).toBe(false);
    });

    it('should accept signal without optional metadata', () => {
      const minimalSignal = {
        signalId: 'sig-123',
        layer: 'cost-ops',
        timestamp: '2024-01-01T00:00:00.000Z',
        metricType: 'spend',
        value: 1000,
        confidence: 0.8,
      };

      const result = SignalSchema.safeParse(minimalSignal);
      expect(result.success).toBe(true);
    });
  });

  describe('SignalAggregationSchema', () => {
    it('should validate valid signal aggregation', () => {
      const validAggregation = {
        timeWindow: {
          startTime: '2024-01-01T00:00:00.000Z',
          endTime: '2024-01-02T00:00:00.000Z',
        },
        signalsByLayer: {
          observatory: [
            {
              signalId: 'sig-1',
              layer: 'observatory',
              timestamp: '2024-01-01T12:00:00.000Z',
              metricType: 'latency',
              value: 150,
              confidence: 0.9,
            },
          ],
          'cost-ops': [],
        },
        totalSignals: 1,
        layersIncluded: ['observatory', 'cost-ops'],
      };

      const result = SignalAggregationSchema.safeParse(validAggregation);
      expect(result.success).toBe(true);
    });

    it('should reject negative totalSignals', () => {
      const invalidAggregation = {
        timeWindow: {
          startTime: '2024-01-01T00:00:00.000Z',
          endTime: '2024-01-02T00:00:00.000Z',
        },
        signalsByLayer: {},
        totalSignals: -1,
        layersIncluded: [],
      };

      const result = SignalAggregationSchema.safeParse(invalidAggregation);
      expect(result.success).toBe(false);
    });
  });

  describe('TrendAnalysisSchema', () => {
    it('should validate valid trend analysis', () => {
      const validTrend = {
        metricType: 'latency',
        layer: 'observatory',
        direction: 'increasing' as const,
        magnitude: 0.75,
        velocity: 5.2,
        dataPoints: 100,
        confidence: 0.92,
        anomalies: [
          {
            timestamp: '2024-01-01T15:00:00.000Z',
            value: 500,
            deviationScore: 3.5,
          },
        ],
      };

      const result = TrendAnalysisSchema.safeParse(validTrend);
      expect(result.success).toBe(true);
    });

    it('should reject invalid trend direction', () => {
      const invalidTrend = {
        metricType: 'latency',
        layer: 'observatory',
        direction: 'unknown',
        magnitude: 0.5,
        velocity: 1.0,
        dataPoints: 50,
        confidence: 0.8,
      };

      const result = TrendAnalysisSchema.safeParse(invalidTrend);
      expect(result.success).toBe(false);
    });

    it('should reject magnitude outside 0-1 range', () => {
      const invalidTrend = {
        metricType: 'latency',
        layer: 'observatory',
        direction: 'stable' as const,
        magnitude: 1.5,
        velocity: 0.0,
        dataPoints: 20,
        confidence: 0.7,
      };

      const result = TrendAnalysisSchema.safeParse(invalidTrend);
      expect(result.success).toBe(false);
    });

    it('should reject zero or negative dataPoints', () => {
      const invalidTrend = {
        metricType: 'latency',
        layer: 'observatory',
        direction: 'stable' as const,
        magnitude: 0.5,
        velocity: 0.0,
        dataPoints: 0,
        confidence: 0.7,
      };

      const result = TrendAnalysisSchema.safeParse(invalidTrend);
      expect(result.success).toBe(false);
    });
  });

  describe('CrossDomainCorrelationSchema', () => {
    const validPrimaryTrend = {
      metricType: 'latency',
      layer: 'observatory',
      direction: 'increasing' as const,
      magnitude: 0.8,
      velocity: 2.5,
      dataPoints: 100,
      confidence: 0.9,
    };

    const validSecondaryTrend = {
      metricType: 'cost',
      layer: 'cost-ops',
      direction: 'increasing' as const,
      magnitude: 0.7,
      velocity: 1.8,
      dataPoints: 100,
      confidence: 0.85,
    };

    it('should validate valid correlation', () => {
      const validCorrelation = {
        correlationId: 'corr-123',
        primaryTrend: validPrimaryTrend,
        secondaryTrend: validSecondaryTrend,
        correlationCoefficient: 0.85,
        strength: 'strong' as const,
        lagTime: 300,
        causality: 'likely' as const,
      };

      const result = CrossDomainCorrelationSchema.safeParse(validCorrelation);
      expect(result.success).toBe(true);
    });

    it('should reject correlation coefficient outside -1 to 1', () => {
      const invalidCorrelation = {
        correlationId: 'corr-123',
        primaryTrend: validPrimaryTrend,
        secondaryTrend: validSecondaryTrend,
        correlationCoefficient: 1.5,
        strength: 'strong' as const,
      };

      const result = CrossDomainCorrelationSchema.safeParse(invalidCorrelation);
      expect(result.success).toBe(false);
    });

    it('should reject invalid strength value', () => {
      const invalidCorrelation = {
        correlationId: 'corr-123',
        primaryTrend: validPrimaryTrend,
        secondaryTrend: validSecondaryTrend,
        correlationCoefficient: 0.5,
        strength: 'very-strong',
      };

      const result = CrossDomainCorrelationSchema.safeParse(invalidCorrelation);
      expect(result.success).toBe(false);
    });
  });

  describe('StrategicRecommendationSchema', () => {
    it('should validate valid recommendation', () => {
      const validRecommendation = {
        recommendationId: 'rec-123',
        category: 'cost-optimization' as const,
        priority: 'high' as const,
        title: 'Optimize instance sizing',
        description: 'Right-size overprovisioned instances',
        rationale: 'Analysis shows 40% underutilization',
        supportingCorrelations: ['corr-1', 'corr-2'],
        supportingTrends: ['trend-1', 'trend-2'],
        expectedImpact: {
          costSavings: 50000,
          performanceGain: 0.15,
        },
        confidence: 0.88,
        timeHorizon: 'short-term' as const,
        metadata: { affectedServices: ['api', 'worker'] },
      };

      const result = StrategicRecommendationSchema.safeParse(validRecommendation);
      expect(result.success).toBe(true);
    });

    it('should reject invalid category', () => {
      const invalidRecommendation = {
        recommendationId: 'rec-123',
        category: 'invalid-category',
        priority: 'high' as const,
        title: 'Test',
        description: 'Test',
        rationale: 'Test',
        supportingCorrelations: [],
        supportingTrends: [],
        confidence: 0.8,
        timeHorizon: 'short-term' as const,
      };

      const result = StrategicRecommendationSchema.safeParse(invalidRecommendation);
      expect(result.success).toBe(false);
    });

    it('should reject invalid priority', () => {
      const invalidRecommendation = {
        recommendationId: 'rec-123',
        category: 'cost-optimization' as const,
        priority: 'urgent',
        title: 'Test',
        description: 'Test',
        rationale: 'Test',
        supportingCorrelations: [],
        supportingTrends: [],
        confidence: 0.8,
        timeHorizon: 'short-term' as const,
      };

      const result = StrategicRecommendationSchema.safeParse(invalidRecommendation);
      expect(result.success).toBe(false);
    });

    it('should validate all recommendation categories', () => {
      const categories = [
        'cost-optimization',
        'performance-improvement',
        'risk-mitigation',
        'capacity-planning',
        'governance-compliance',
        'strategic-initiative',
      ];

      categories.forEach((category) => {
        const recommendation = {
          recommendationId: `rec-${category}`,
          category,
          priority: 'medium' as const,
          title: 'Test',
          description: 'Test',
          rationale: 'Test',
          supportingCorrelations: [],
          supportingTrends: [],
          confidence: 0.8,
          timeHorizon: 'short-term' as const,
        };

        const result = StrategicRecommendationSchema.safeParse(recommendation);
        expect(result.success).toBe(true);
      });
    });

    it('should validate all time horizons', () => {
      const horizons = ['immediate', 'short-term', 'medium-term', 'long-term'];

      horizons.forEach((timeHorizon) => {
        const recommendation = {
          recommendationId: `rec-${timeHorizon}`,
          category: 'cost-optimization' as const,
          priority: 'medium' as const,
          title: 'Test',
          description: 'Test',
          rationale: 'Test',
          supportingCorrelations: [],
          supportingTrends: [],
          confidence: 0.8,
          timeHorizon,
        };

        const result = StrategicRecommendationSchema.safeParse(recommendation);
        expect(result.success).toBe(true);
      });
    });
  });

  describe('StrategicRecommendationInputSchema', () => {
    it('should validate valid input', () => {
      const validInput = {
        timeWindow: {
          startTime: '2024-01-01T00:00:00.000Z',
          endTime: '2024-01-07T00:00:00.000Z',
        },
        sourceLayers: ['observatory', 'cost-ops', 'governance'],
        minConfidence: 0.7,
        maxRecommendations: 5,
        focusCategories: ['cost-optimization', 'performance-improvement'],
        executionRef: '550e8400-e29b-41d4-a716-446655440000',
      };

      const result = StrategicRecommendationInputSchema.safeParse(validInput);
      expect(result.success).toBe(true);
    });

    it('should apply default values', () => {
      const minimalInput = {
        timeWindow: {
          startTime: '2024-01-01T00:00:00.000Z',
          endTime: '2024-01-07T00:00:00.000Z',
        },
        sourceLayers: ['observatory'],
        executionRef: '550e8400-e29b-41d4-a716-446655440000',
      };

      const result = StrategicRecommendationInputSchema.safeParse(minimalInput);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.minConfidence).toBe(0.5);
        expect(result.data.maxRecommendations).toBe(10);
      }
    });

    it('should reject empty sourceLayers', () => {
      const invalidInput = {
        timeWindow: {
          startTime: '2024-01-01T00:00:00.000Z',
          endTime: '2024-01-07T00:00:00.000Z',
        },
        sourceLayers: [],
        executionRef: '550e8400-e29b-41d4-a716-446655440000',
      };

      const result = StrategicRecommendationInputSchema.safeParse(invalidInput);
      expect(result.success).toBe(false);
    });

    it('should reject invalid UUID format', () => {
      const invalidInput = {
        timeWindow: {
          startTime: '2024-01-01T00:00:00.000Z',
          endTime: '2024-01-07T00:00:00.000Z',
        },
        sourceLayers: ['observatory'],
        executionRef: 'not-a-uuid',
      };

      const result = StrategicRecommendationInputSchema.safeParse(invalidInput);
      expect(result.success).toBe(false);
    });

    it('should reject minConfidence outside 0-1 range', () => {
      const invalidInput = {
        timeWindow: {
          startTime: '2024-01-01T00:00:00.000Z',
          endTime: '2024-01-07T00:00:00.000Z',
        },
        sourceLayers: ['observatory'],
        minConfidence: 1.5,
        executionRef: '550e8400-e29b-41d4-a716-446655440000',
      };

      const result = StrategicRecommendationInputSchema.safeParse(invalidInput);
      expect(result.success).toBe(false);
    });

    it('should reject zero or negative maxRecommendations', () => {
      const invalidInput = {
        timeWindow: {
          startTime: '2024-01-01T00:00:00.000Z',
          endTime: '2024-01-07T00:00:00.000Z',
        },
        sourceLayers: ['observatory'],
        maxRecommendations: 0,
        executionRef: '550e8400-e29b-41d4-a716-446655440000',
      };

      const result = StrategicRecommendationInputSchema.safeParse(invalidInput);
      expect(result.success).toBe(false);
    });
  });

  describe('StrategicRecommendationOutputSchema', () => {
    it('should validate valid output', () => {
      const validOutput = {
        recommendations: [
          {
            recommendationId: 'rec-1',
            category: 'cost-optimization' as const,
            priority: 'high' as const,
            title: 'Optimize instances',
            description: 'Right-size',
            rationale: 'Underutilization',
            supportingCorrelations: ['corr-1'],
            supportingTrends: ['trend-1'],
            confidence: 0.9,
            timeHorizon: 'short-term' as const,
          },
        ],
        totalSignalsAnalyzed: 1500,
        trendsIdentified: 25,
        correlationsFound: 8,
        overallConfidence: 0.85,
        analysisMetadata: {
          timeWindow: {
            startTime: '2024-01-01T00:00:00.000Z',
            endTime: '2024-01-07T00:00:00.000Z',
          },
          layersAnalyzed: ['observatory', 'cost-ops'],
          processingDuration: 2500,
        },
      };

      const result = StrategicRecommendationOutputSchema.safeParse(validOutput);
      expect(result.success).toBe(true);
    });

    it('should reject negative counts', () => {
      const invalidOutput = {
        recommendations: [],
        totalSignalsAnalyzed: -1,
        trendsIdentified: 0,
        correlationsFound: 0,
        overallConfidence: 0.5,
        analysisMetadata: {
          timeWindow: {
            startTime: '2024-01-01T00:00:00.000Z',
            endTime: '2024-01-07T00:00:00.000Z',
          },
          layersAnalyzed: [],
        },
      };

      const result = StrategicRecommendationOutputSchema.safeParse(invalidOutput);
      expect(result.success).toBe(false);
    });

    it('should validate empty recommendations array', () => {
      const validOutput = {
        recommendations: [],
        totalSignalsAnalyzed: 0,
        trendsIdentified: 0,
        correlationsFound: 0,
        overallConfidence: 0.0,
        analysisMetadata: {
          timeWindow: {
            startTime: '2024-01-01T00:00:00.000Z',
            endTime: '2024-01-07T00:00:00.000Z',
          },
          layersAnalyzed: [],
        },
      };

      const result = StrategicRecommendationOutputSchema.safeParse(validOutput);
      expect(result.success).toBe(true);
    });
  });
});
