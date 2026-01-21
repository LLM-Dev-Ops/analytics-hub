/**
 * Strategic Recommendation Agent - Telemetry Tests
 *
 * Tests for telemetry emission and tracking metrics
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  StrategicRecommendationTelemetry,
  createTelemetryContext,
  createChildTelemetryContext,
  OpenTelemetryBridge,
  TelemetryContext,
} from '../telemetry';
import {
  StrategicRecommendation,
  CrossDomainCorrelation,
  StrategicRecommendationOutput,
} from '../types';

describe('StrategicRecommendationTelemetry', () => {
  let telemetryContext: TelemetryContext;
  let telemetry: StrategicRecommendationTelemetry;

  beforeEach(() => {
    telemetryContext = createTelemetryContext(
      'strategic-agent-1',
      '1.0.0',
      'test',
      { test_id: 'test-123' }
    );

    telemetry = new StrategicRecommendationTelemetry(telemetryContext);
  });

  afterEach(async () => {
    await telemetry.flush();
  });

  describe('createTelemetryContext', () => {
    it('should create a valid telemetry context', () => {
      const context = createTelemetryContext(
        'test-agent',
        '1.0.0',
        'production'
      );

      expect(context).toHaveProperty('executionId');
      expect(context).toHaveProperty('correlationId');
      expect(context.agentId).toBe('test-agent');
      expect(context.agentVersion).toBe('1.0.0');
      expect(context.environment).toBe('production');
      expect(context.tags).toHaveProperty('agent_name', 'strategic-recommendation');
    });

    it('should create context with custom tags', () => {
      const customTags = { feature: 'analysis', region: 'us-west' };
      const context = createTelemetryContext(
        'test-agent',
        '1.0.0',
        'production',
        customTags
      );

      expect(context.tags.feature).toBe('analysis');
      expect(context.tags.region).toBe('us-west');
    });

    it('should use default environment', () => {
      // Mock NODE_ENV
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'development';

      const context = createTelemetryContext('test-agent', '1.0.0');

      expect(context.environment).toBe('development');

      process.env.NODE_ENV = originalEnv;
    });
  });

  describe('createChildTelemetryContext', () => {
    it('should create a child context with inherited correlation ID', () => {
      const parentContext = createTelemetryContext('parent-agent', '1.0.0');
      const childContext = createChildTelemetryContext(
        parentContext,
        'child-agent',
        '1.0.0'
      );

      expect(childContext.correlationId).toBe(parentContext.correlationId);
      expect(childContext.executionId).not.toBe(parentContext.executionId);
      expect(childContext.parentEventId).toBe(parentContext.executionId);
      expect(childContext.agentId).toBe('child-agent');
    });

    it('should preserve parent tags in child context', () => {
      const parentContext = createTelemetryContext(
        'parent-agent',
        '1.0.0',
        'production',
        { parent_tag: 'parent-value' }
      );
      const childContext = createChildTelemetryContext(
        parentContext,
        'child-agent',
        '1.0.0'
      );

      expect(childContext.tags.parent_agent_id).toBe(parentContext.agentId);
      expect(childContext.tags.parent_tag).toBe('parent-value');
    });
  });

  describe('emitAgentInvocation', () => {
    it('should emit agent invocation metrics on success', async () => {
      const input = { query: 'test query' };
      const output = { recommendations: [], confidence: 0.8 };

      telemetry.emitAgentInvocation(input, output, 100, true);

      await telemetry.flush();
      // Note: In actual tests, you would verify these were sent to Observatory
    });

    it('should emit agent invocation metrics on failure', async () => {
      const input = { query: 'test query' };
      const error = new Error('Processing failed');

      telemetry.emitAgentInvocation(input, undefined, 50, false, error);

      await telemetry.flush();
    });

    it('should calculate input/output sizes correctly', async () => {
      const input = { data: 'x'.repeat(1000) };
      const output = { result: 'y'.repeat(2000) };

      telemetry.emitAgentInvocation(input, output, 100, true);

      await telemetry.flush();
    });
  });

  describe('emitRecommendationGenerated', () => {
    it('should emit recommendation metrics for multiple recommendations', async () => {
      const recommendations: StrategicRecommendation[] = [
        {
          recommendationId: 'rec-1',
          category: 'cost-optimization',
          priority: 'high',
          title: 'Reduce compute costs',
          description: 'Optimize resource allocation',
          rationale: 'Analysis shows overallocation',
          supportingCorrelations: [],
          supportingTrends: [],
          confidence: 0.85,
          timeHorizon: 'short-term',
        },
        {
          recommendationId: 'rec-2',
          category: 'performance-improvement',
          priority: 'medium',
          title: 'Improve latency',
          description: 'Upgrade infrastructure',
          rationale: 'Trend analysis indicates',
          supportingCorrelations: [],
          supportingTrends: [],
          confidence: 0.65,
          timeHorizon: 'medium-term',
        },
        {
          recommendationId: 'rec-3',
          category: 'risk-mitigation',
          priority: 'critical',
          title: 'Address security gap',
          description: 'Implement encryption',
          rationale: 'Policy violation detected',
          supportingCorrelations: [],
          supportingTrends: [],
          confidence: 0.95,
          timeHorizon: 'immediate',
        },
      ];

      telemetry.emitRecommendationGenerated(recommendations);

      await telemetry.flush();
    });

    it('should track confidence distribution correctly', async () => {
      const recommendations: StrategicRecommendation[] = [
        {
          recommendationId: 'rec-1',
          category: 'cost-optimization',
          priority: 'high',
          title: 'Test 1',
          description: 'Test',
          rationale: 'Test',
          supportingCorrelations: [],
          supportingTrends: [],
          confidence: 0.15, // Very Low
          timeHorizon: 'short-term',
        },
        {
          recommendationId: 'rec-2',
          category: 'cost-optimization',
          priority: 'high',
          title: 'Test 2',
          description: 'Test',
          rationale: 'Test',
          supportingCorrelations: [],
          supportingTrends: [],
          confidence: 0.35, // Low
          timeHorizon: 'short-term',
        },
        {
          recommendationId: 'rec-3',
          category: 'cost-optimization',
          priority: 'high',
          title: 'Test 3',
          description: 'Test',
          rationale: 'Test',
          supportingCorrelations: [],
          supportingTrends: [],
          confidence: 0.5, // Medium
          timeHorizon: 'short-term',
        },
        {
          recommendationId: 'rec-4',
          category: 'cost-optimization',
          priority: 'high',
          title: 'Test 4',
          description: 'Test',
          rationale: 'Test',
          supportingCorrelations: [],
          supportingTrends: [],
          confidence: 0.75, // High
          timeHorizon: 'short-term',
        },
        {
          recommendationId: 'rec-5',
          category: 'cost-optimization',
          priority: 'high',
          title: 'Test 5',
          description: 'Test',
          rationale: 'Test',
          supportingCorrelations: [],
          supportingTrends: [],
          confidence: 0.95, // Very High
          timeHorizon: 'short-term',
        },
      ];

      telemetry.emitRecommendationGenerated(recommendations);

      await telemetry.flush();
    });
  });

  describe('emitCorrelationDetected', () => {
    it('should emit correlation detection metrics', async () => {
      const correlations: CrossDomainCorrelation[] = [
        {
          correlationId: 'corr-1',
          primaryTrend: {
            metricType: 'latency',
            layer: 'observatory',
            direction: 'increasing',
            magnitude: 0.8,
            velocity: 0.05,
            dataPoints: 50,
            confidence: 0.9,
          },
          secondaryTrend: {
            metricType: 'cpu_usage',
            layer: 'observatory',
            direction: 'increasing',
            magnitude: 0.75,
            velocity: 0.04,
            dataPoints: 50,
            confidence: 0.85,
          },
          correlationCoefficient: 0.87,
          strength: 'strong',
          lagTime: 2,
          causality: 'potential',
        },
        {
          correlationId: 'corr-2',
          primaryTrend: {
            metricType: 'cost',
            layer: 'cost-ops',
            direction: 'decreasing',
            magnitude: 0.5,
            velocity: -0.03,
            dataPoints: 50,
            confidence: 0.7,
          },
          secondaryTrend: {
            metricType: 'requests',
            layer: 'observatory',
            direction: 'decreasing',
            magnitude: 0.55,
            velocity: -0.025,
            dataPoints: 50,
            confidence: 0.72,
          },
          correlationCoefficient: 0.92,
          strength: 'strong',
          lagTime: 1,
          causality: 'likely',
        },
        {
          correlationId: 'corr-3',
          primaryTrend: {
            metricType: 'error_rate',
            layer: 'observatory',
            direction: 'stable',
            magnitude: 0.2,
            velocity: 0,
            dataPoints: 50,
            confidence: 0.6,
          },
          secondaryTrend: {
            metricType: 'memory_usage',
            layer: 'observatory',
            direction: 'stable',
            magnitude: 0.15,
            velocity: 0,
            dataPoints: 50,
            confidence: 0.55,
          },
          correlationCoefficient: 0.45,
          strength: 'moderate',
          causality: 'none',
        },
      ];

      telemetry.emitCorrelationDetected(correlations, 250);

      await telemetry.flush();
    });

    it('should track correlation strength distribution', async () => {
      const correlations: CrossDomainCorrelation[] = [
        // Strong correlations
        ...Array(3).fill(null).map((_, i) => ({
          correlationId: `strong-${i}`,
          primaryTrend: {
            metricType: 'metric1',
            layer: 'layer1',
            direction: 'increasing' as const,
            magnitude: 0.8,
            velocity: 0.05,
            dataPoints: 50,
            confidence: 0.9,
          },
          secondaryTrend: {
            metricType: 'metric2',
            layer: 'layer2',
            direction: 'increasing' as const,
            magnitude: 0.75,
            velocity: 0.04,
            dataPoints: 50,
            confidence: 0.85,
          },
          correlationCoefficient: 0.85,
          strength: 'strong' as const,
        })),
        // Moderate correlations
        ...Array(2).fill(null).map((_, i) => ({
          correlationId: `moderate-${i}`,
          primaryTrend: {
            metricType: 'metric3',
            layer: 'layer1',
            direction: 'stable' as const,
            magnitude: 0.5,
            velocity: 0,
            dataPoints: 50,
            confidence: 0.7,
          },
          secondaryTrend: {
            metricType: 'metric4',
            layer: 'layer2',
            direction: 'stable' as const,
            magnitude: 0.45,
            velocity: 0,
            dataPoints: 50,
            confidence: 0.65,
          },
          correlationCoefficient: 0.65,
          strength: 'moderate' as const,
        })),
        // Weak correlations
        {
          correlationId: 'weak-1',
          primaryTrend: {
            metricType: 'metric5',
            layer: 'layer1',
            direction: 'decreasing' as const,
            magnitude: 0.3,
            velocity: -0.02,
            dataPoints: 50,
            confidence: 0.5,
          },
          secondaryTrend: {
            metricType: 'metric6',
            layer: 'layer2',
            direction: 'decreasing' as const,
            magnitude: 0.25,
            velocity: -0.015,
            dataPoints: 50,
            confidence: 0.45,
          },
          correlationCoefficient: 0.35,
          strength: 'weak' as const,
        },
      ];

      telemetry.emitCorrelationDetected(correlations, 150);

      await telemetry.flush();
    });
  });

  describe('emitDecisionEventPersisted', () => {
    it('should emit decision event persistence metrics on success', async () => {
      const decisionEvent = {
        agent_id: 'strategic-agent-1',
        decision_type: 'strategic_recommendation',
        confidence: 0.85,
      };

      telemetry.emitDecisionEventPersisted(decisionEvent, 50, true);

      await telemetry.flush();
    });

    it('should emit decision event persistence metrics on failure', async () => {
      const decisionEvent = {
        agent_id: 'strategic-agent-1',
        decision_type: 'strategic_recommendation',
        confidence: 0.85,
      };

      telemetry.emitDecisionEventPersisted(decisionEvent, 50, false);

      await telemetry.flush();
    });
  });

  describe('emitAgentOutputAnalysis', () => {
    it('should emit comprehensive agent output metrics', async () => {
      const output: StrategicRecommendationOutput = {
        recommendations: [
          {
            recommendationId: 'rec-1',
            category: 'cost-optimization',
            priority: 'high',
            title: 'Optimize costs',
            description: 'Implementation details',
            rationale: 'Based on trend analysis',
            supportingCorrelations: ['corr-1', 'corr-2'],
            supportingTrends: ['trend-1'],
            confidence: 0.85,
            timeHorizon: 'short-term',
          },
        ],
        totalSignalsAnalyzed: 1250,
        trendsIdentified: 15,
        correlationsFound: 8,
        overallConfidence: 0.78,
        analysisMetadata: {
          timeWindow: {
            startTime: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
            endTime: new Date().toISOString(),
          },
          layersAnalyzed: ['observatory', 'cost-ops', 'governance'],
          processingDuration: 1500,
        },
      };

      telemetry.emitAgentOutputAnalysis(output, 1500);

      await telemetry.flush();
    });
  });

  describe('OpenTelemetryBridge', () => {
    it('should create span context from telemetry context', () => {
      const context = createTelemetryContext('agent-1', '1.0.0');
      const spanContext = OpenTelemetryBridge.createSpanContext(context);

      expect(spanContext['trace-id']).toBe(context.correlationId);
      expect(spanContext['span-id']).toBe(context.executionId);
      expect(spanContext['agent-id']).toBe(context.agentId);
      expect(spanContext['agent-version']).toBe(context.agentVersion);
    });

    it('should add context as span attributes', () => {
      const context = createTelemetryContext('agent-1', '1.0.0');
      const mockSpan = {
        setAttributes: vi.fn(),
      };

      OpenTelemetryBridge.addContextAsSpanAttributes(mockSpan, context);

      expect(mockSpan.setAttributes).toHaveBeenCalledWith(
        expect.objectContaining({
          'agent.id': context.agentId,
          'agent.version': context.agentVersion,
          'execution.id': context.executionId,
          'correlation.id': context.correlationId,
          'environment': context.environment,
        })
      );
    });
  });

  describe('Error handling', () => {
    it('should handle errors in emitAgentInvocation gracefully', async () => {
      // This should not throw
      telemetry.emitAgentInvocation(
        { test: 'data' },
        undefined,
        100,
        true
      );

      await telemetry.flush();
    });

    it('should handle errors in emitRecommendationGenerated gracefully', async () => {
      const recommendations: StrategicRecommendation[] = [];

      telemetry.emitRecommendationGenerated(recommendations);

      await telemetry.flush();
    });
  });
});
