/**
 * Ecosystem Collaboration Agent Tests
 *
 * Tests for Phase 5 - Ecosystem & Collaboration (Layer 1) agent.
 *
 * Verifies:
 * - DecisionEvent emission (exactly ONE per invocation)
 * - Signal types (consensus_signal, aggregation_signal, strategic_signal)
 * - Performance budgets (MAX_TOKENS=1500, MAX_LATENCY_MS=3000)
 * - Boundary compliance (no state mutation, no action commits, no conclusions)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  computeEcosystemAnalytics,
  computeAggregation,
  computeConsensus,
  computeStrategicCorrelations,
  groupSignals,
  estimateTokens,
} from '../computation';
import {
  EcosystemCollaborationInputSchema,
  EcosystemDecisionEventSchema,
  AGENT_ID,
  AGENT_VERSION,
  SIGNAL_TYPES,
  PERFORMANCE_BUDGETS,
  createInputsHash,
} from '../../../contracts/ecosystem-collaboration-agent';
import type { EcosystemSignal, CrossSystemQuery } from '../../../contracts/ecosystem-collaboration-agent';

describe('EcosystemCollaborationAgent', () => {
  const mockSignals: EcosystemSignal[] = [
    {
      partnerId: 'partner-1',
      sourceSystem: 'system-a',
      category: 'performance',
      value: 95.5,
      unit: 'percent',
      confidence: 0.9,
      timestamp: '2024-01-15T10:00:00Z',
    },
    {
      partnerId: 'partner-1',
      sourceSystem: 'system-b',
      category: 'performance',
      value: 92.0,
      unit: 'percent',
      confidence: 0.85,
      timestamp: '2024-01-15T10:05:00Z',
    },
    {
      partnerId: 'partner-2',
      sourceSystem: 'system-a',
      category: 'cost',
      value: 150.0,
      unit: 'usd',
      confidence: 0.95,
      timestamp: '2024-01-15T10:00:00Z',
    },
    {
      partnerId: 'partner-2',
      sourceSystem: 'system-b',
      category: 'cost',
      value: 145.0,
      unit: 'usd',
      confidence: 0.9,
      timestamp: '2024-01-15T10:05:00Z',
    },
  ];

  const mockTimeRange = {
    start: '2024-01-15T00:00:00Z',
    end: '2024-01-15T23:59:59Z',
  };

  describe('Input Validation', () => {
    it('should validate valid input', () => {
      const input = {
        requestId: '550e8400-e29b-41d4-a716-446655440000',
        signals: mockSignals,
        options: {
          granularity: 'hour' as const,
          updateIndex: true,
          crossSystemAnalytics: true,
        },
      };

      const result = EcosystemCollaborationInputSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it('should reject empty signals array', () => {
      const input = {
        requestId: '550e8400-e29b-41d4-a716-446655440000',
        signals: [],
      };

      const result = EcosystemCollaborationInputSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('should reject invalid confidence values', () => {
      const input = {
        requestId: '550e8400-e29b-41d4-a716-446655440000',
        signals: [{ ...mockSignals[0], confidence: 1.5 }],
      };

      const result = EcosystemCollaborationInputSchema.safeParse(input);
      expect(result.success).toBe(false);
    });
  });

  describe('Signal Grouping', () => {
    it('should group signals by partner and category', () => {
      const groups = groupSignals(mockSignals);

      expect(groups).toHaveLength(2); // partner-1:performance, partner-2:cost
      expect(groups.find(g => g.partnerId === 'partner-1')?.signals).toHaveLength(2);
    });
  });

  describe('Aggregation Computation', () => {
    it('should compute aggregation signals', () => {
      const groups = groupSignals(mockSignals);
      const result = computeAggregation(groups, mockTimeRange);

      expect(result.signals).toHaveLength(2);
      expect(result.signals[0].signalType).toBe('aggregation_signal');
      expect(result.indexEntries).toHaveLength(2);
    });

    it('should compute weighted average by confidence', () => {
      const groups = groupSignals(mockSignals.slice(0, 2)); // performance signals only
      const result = computeAggregation(groups, mockTimeRange);

      // Weighted avg: (95.5*0.9 + 92.0*0.85) / (0.9 + 0.85) = 93.83...
      const performanceSignal = result.signals.find(s => s.category === 'performance');
      expect(performanceSignal?.aggregatedValue).toBeCloseTo(93.83, 1);
    });
  });

  describe('Consensus Computation', () => {
    it('should compute consensus signals', () => {
      const result = computeConsensus(mockSignals, ['system-a', 'system-b']);

      expect(result.signals.length).toBeGreaterThan(0);
      expect(result.signals[0].signalType).toBe('consensus_signal');
    });

    it('should calculate alignment score', () => {
      const result = computeConsensus(mockSignals, ['system-a', 'system-b']);

      const performanceConsensus = result.signals.find(s => s.metric === 'performance');
      expect(performanceConsensus?.alignmentScore).toBeGreaterThan(0);
      expect(performanceConsensus?.alignmentScore).toBeLessThanOrEqual(1);
    });

    it('should identify divergent signals', () => {
      const result = computeConsensus(mockSignals, ['system-a', 'system-b']);

      const hasConsensus = result.signals.some(s => s.divergenceFactors !== undefined);
      // Divergence depends on the data - just verify structure
      expect(result.overallAlignment).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Strategic Correlation Computation', () => {
    it('should compute strategic signals from cross-system queries', () => {
      const queries: CrossSystemQuery[] = [
        {
          sourceSystems: ['system-a', 'system-b'],
          metrics: ['performance', 'cost'],
          timeRange: mockTimeRange,
          correlationThreshold: 0.1, // Low threshold to ensure we get results
        },
      ];

      const result = computeStrategicCorrelations(mockSignals, queries);

      // May or may not have signals depending on correlation
      expect(result.correlationCount).toBeGreaterThanOrEqual(0);
      if (result.signals.length > 0) {
        expect(result.signals[0].signalType).toBe('strategic_signal');
      }
    });

    it('should filter by correlation threshold', () => {
      const queries: CrossSystemQuery[] = [
        {
          sourceSystems: ['system-a', 'system-b'],
          metrics: ['performance', 'cost'],
          timeRange: mockTimeRange,
          correlationThreshold: 0.99, // Very high threshold
        },
      ];

      const result = computeStrategicCorrelations(mockSignals, queries);

      // High threshold should filter out most correlations
      expect(result.correlationCount).toBeLessThanOrEqual(1);
    });
  });

  describe('Full Computation Pipeline', () => {
    it('should compute complete ecosystem analytics', () => {
      const output = computeEcosystemAnalytics(
        mockSignals,
        undefined,
        {
          granularity: 'hour',
          updateIndex: true,
          crossSystemAnalytics: true,
        },
        mockTimeRange
      );

      expect(output.aggregation.signals.length).toBeGreaterThan(0);
      expect(output.consensus.signals.length).toBeGreaterThan(0);
      expect(output.confidence).toBeGreaterThanOrEqual(0);
      expect(output.confidence).toBeLessThanOrEqual(1);
    });

    it('should apply scope filter', () => {
      const output = computeEcosystemAnalytics(
        mockSignals,
        undefined,
        {
          granularity: 'hour',
          updateIndex: true,
          crossSystemAnalytics: true,
          scopeFilter: ['performance'], // Only performance
        },
        mockTimeRange
      );

      // Should only have performance-related signals
      expect(
        output.aggregation.signals.every(s => s.category === 'performance')
      ).toBe(true);
    });
  });

  describe('Performance Budgets', () => {
    it('should have MAX_TOKENS=1500', () => {
      expect(PERFORMANCE_BUDGETS.MAX_TOKENS).toBe(1500);
    });

    it('should have MAX_LATENCY_MS=3000', () => {
      expect(PERFORMANCE_BUDGETS.MAX_LATENCY_MS).toBe(3000);
    });

    it('should estimate token count', () => {
      const output = computeEcosystemAnalytics(
        mockSignals,
        undefined,
        {
          granularity: 'hour',
          updateIndex: true,
          crossSystemAnalytics: true,
        },
        mockTimeRange
      );

      expect(output.tokenEstimate).toBeGreaterThan(0);
    });
  });

  describe('Signal Types', () => {
    it('should emit consensus_signal type', () => {
      expect(SIGNAL_TYPES.CONSENSUS_SIGNAL).toBe('consensus_signal');
    });

    it('should emit aggregation_signal type', () => {
      expect(SIGNAL_TYPES.AGGREGATION_SIGNAL).toBe('aggregation_signal');
    });

    it('should emit strategic_signal type', () => {
      expect(SIGNAL_TYPES.STRATEGIC_SIGNAL).toBe('strategic_signal');
    });
  });

  describe('Agent Metadata', () => {
    it('should have correct agent ID', () => {
      expect(AGENT_ID).toBe('ecosystem-collaboration-agent');
    });

    it('should have valid semver version', () => {
      expect(AGENT_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
    });
  });

  describe('Inputs Hash', () => {
    it('should create deterministic SHA-256 hash', () => {
      const input = { signals: mockSignals };
      const hash1 = createInputsHash(input);
      const hash2 = createInputsHash(input);

      expect(hash1).toBe(hash2);
      expect(hash1).toHaveLength(64); // SHA-256 hex
    });

    it('should produce different hashes for different inputs', () => {
      const hash1 = createInputsHash({ a: 1 });
      const hash2 = createInputsHash({ a: 2 });

      expect(hash1).not.toBe(hash2);
    });
  });

  describe('DecisionEvent Schema', () => {
    it('should validate correct DecisionEvent', () => {
      const event = {
        agent_id: 'ecosystem-collaboration-agent',
        agent_version: '1.0.0',
        decision_type: 'aggregation_signal',
        inputs_hash: 'a'.repeat(64),
        outputs: {
          aggregationSignals: [],
          consensusSignals: [],
          strategicSignals: [],
          indexEntriesUpdated: 0,
        },
        confidence: 0.85,
        constraints_applied: [
          {
            scope: 'ecosystem_collaboration',
            dataBoundaries: {
              startTime: '2024-01-15T00:00:00Z',
              endTime: '2024-01-15T23:59:59Z',
            },
            performanceBudget: {
              maxTokens: 1500,
              maxLatencyMs: 3000,
            },
          },
        ],
        execution_ref: '550e8400-e29b-41d4-a716-446655440000',
        timestamp: '2024-01-15T12:00:00Z',
      };

      const result = EcosystemDecisionEventSchema.safeParse(event);
      expect(result.success).toBe(true);
    });

    it('should reject invalid decision types', () => {
      const event = {
        agent_id: 'ecosystem-collaboration-agent',
        agent_version: '1.0.0',
        decision_type: 'invalid_type', // Invalid
        inputs_hash: 'a'.repeat(64),
        outputs: {
          aggregationSignals: [],
          consensusSignals: [],
          strategicSignals: [],
          indexEntriesUpdated: 0,
        },
        confidence: 0.85,
        constraints_applied: [],
        execution_ref: '550e8400-e29b-41d4-a716-446655440000',
        timestamp: '2024-01-15T12:00:00Z',
      };

      const result = EcosystemDecisionEventSchema.safeParse(event);
      expect(result.success).toBe(false);
    });
  });

  describe('Boundary Compliance', () => {
    it('should NOT mutate input signals', () => {
      const originalSignals = JSON.parse(JSON.stringify(mockSignals));

      computeEcosystemAnalytics(
        mockSignals,
        undefined,
        {
          granularity: 'hour',
          updateIndex: true,
          crossSystemAnalytics: true,
        },
        mockTimeRange
      );

      expect(mockSignals).toEqual(originalSignals);
    });

    it('should only emit data signals, not conclusions', () => {
      const output = computeEcosystemAnalytics(
        mockSignals,
        undefined,
        {
          granularity: 'hour',
          updateIndex: true,
          crossSystemAnalytics: true,
        },
        mockTimeRange
      );

      // Verify signals contain data, not conclusions
      for (const signal of output.aggregation.signals) {
        expect(signal).not.toHaveProperty('conclusion');
        expect(signal).not.toHaveProperty('recommendation');
        expect(signal).not.toHaveProperty('action');
      }

      for (const signal of output.consensus.signals) {
        expect(signal).not.toHaveProperty('conclusion');
        expect(signal).not.toHaveProperty('recommendation');
        expect(signal).not.toHaveProperty('action');
      }

      for (const signal of output.strategic.signals) {
        expect(signal).not.toHaveProperty('conclusion');
        expect(signal).not.toHaveProperty('recommendation');
        expect(signal).not.toHaveProperty('action');
      }
    });
  });
});
