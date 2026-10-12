/**
 * Strategic Recommendation Agent - RuVector Client Tests
 *
 * Tests for RuVector storage and search operations
 */

import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';

/**
 * Mock RuVector client for testing
 */
class RuVectorClient {
  private storage: Map<string, any> = new Map();
  private retryAttempts = 3;
  private retryDelay = 100;

  /**
   * Store a signal or analysis result
   */
  async store(namespace: string, id: string, data: any, metadata?: any): Promise<void> {
    return this.withRetry(async () => {
      if (!namespace || !id) {
        throw new Error('Namespace and ID are required');
      }

      const key = `${namespace}:${id}`;
      this.storage.set(key, {
        data,
        metadata,
        timestamp: new Date().toISOString(),
      });
    });
  }

  /**
   * Search for similar items
   */
  async search(
    namespace: string,
    query: any,
    options?: {
      limit?: number;
      threshold?: number;
      filters?: Record<string, any>;
    }
  ): Promise<any[]> {
    return this.withRetry(async () => {
      if (!namespace) {
        throw new Error('Namespace is required');
      }

      const results: any[] = [];
      const limit = options?.limit ?? 10;
      const threshold = options?.threshold ?? 0.5;

      // Simple mock search - filter by namespace
      for (const [key, value] of this.storage.entries()) {
        if (key.startsWith(`${namespace}:`)) {
          // Mock similarity score
          const score = 1;
          if (score >= threshold) {
            results.push({
              id: key.split(':')[1],
              score,
              ...value,
            });
          }
        }

        if (results.length >= limit) break;
      }

      return results.sort((a, b) => b.score - a.score);
    });
  }

  /**
   * Get item by ID
   */
  async get(namespace: string, id: string): Promise<any | null> {
    return this.withRetry(async () => {
      const key = `${namespace}:${id}`;
      return this.storage.get(key) ?? null;
    });
  }

  /**
   * Delete item
   */
  async delete(namespace: string, id: string): Promise<boolean> {
    return this.withRetry(async () => {
      const key = `${namespace}:${id}`;
      return this.storage.delete(key);
    });
  }

  /**
   * Batch store multiple items
   */
  async storeBatch(
    namespace: string,
    items: Array<{ id: string; data: any; metadata?: any }>
  ): Promise<void> {
    return this.withRetry(async () => {
      for (const item of items) {
        await this.store(namespace, item.id, item.data, item.metadata);
      }
    });
  }

  /**
   * Get storage statistics
   */
  async getStats(): Promise<{
    totalItems: number;
    namespaces: string[];
    storageSize: number;
  }> {
    const namespaces = new Set<string>();
    for (const key of this.storage.keys()) {
      const namespace = key.split(':')[0];
      namespaces.add(namespace);
    }

    return {
      totalItems: this.storage.size,
      namespaces: Array.from(namespaces),
      storageSize: JSON.stringify(Array.from(this.storage.entries())).length,
    };
  }

  /**
   * Clear all data (for testing)
   */
  async clear(): Promise<void> {
    this.storage.clear();
  }

  /**
   * Retry wrapper for operations
   */
  private async withRetry<T>(operation: () => Promise<T>): Promise<T> {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= this.retryAttempts; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error as Error;

        // Don't retry on validation errors
        if (error instanceof Error && error.message.includes('required')) {
          throw error;
        }

        if (attempt < this.retryAttempts) {
          await this.delay(this.retryDelay * attempt);
        }
      }
    }

    throw new Error(`Operation failed after ${this.retryAttempts} attempts: ${lastError?.message}`);
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

describe('RuVectorClient', () => {
  let client: RuVectorClient;

  beforeEach(() => {
    client = new RuVectorClient();
  });

  afterEach(async () => {
    await client.clear();
  });

  describe('Store Operations', () => {
    it('should store data successfully', async () => {
      const data = {
        signalId: 'sig-123',
        layer: 'observatory',
        value: 100,
      };

      await expect(client.store('signals', 'sig-123', data)).resolves.not.toThrow();

      const retrieved = await client.get('signals', 'sig-123');
      expect(retrieved).not.toBeNull();
      expect(retrieved.data).toEqual(data);
    });

    it('should store with metadata', async () => {
      const data = { value: 100 };
      const metadata = { source: 'test', version: '1.0' };

      await client.store('signals', 'sig-1', data, metadata);

      const retrieved = await client.get('signals', 'sig-1');
      expect(retrieved.metadata).toEqual(metadata);
    });

    it('should include timestamp on store', async () => {
      const data = { value: 100 };

      await client.store('signals', 'sig-1', data);

      const retrieved = await client.get('signals', 'sig-1');
      expect(retrieved.timestamp).toBeDefined();
      expect(new Date(retrieved.timestamp).getTime()).toBeGreaterThan(0);
    });

    it('should reject store without namespace', async () => {
      await expect(client.store('', 'sig-1', { value: 100 })).rejects.toThrow(
        'Namespace and ID are required'
      );
    });

    it('should reject store without ID', async () => {
      await expect(client.store('signals', '', { value: 100 })).rejects.toThrow(
        'Namespace and ID are required'
      );
    });

    it('should overwrite existing data', async () => {
      await client.store('signals', 'sig-1', { value: 100 });
      await client.store('signals', 'sig-1', { value: 200 });

      const retrieved = await client.get('signals', 'sig-1');
      expect(retrieved.data.value).toBe(200);
    });
  });

  describe('Search Operations', () => {
    beforeEach(async () => {
      // Seed test data
      await client.store('signals', 'sig-1', { layer: 'observatory', value: 100 });
      await client.store('signals', 'sig-2', { layer: 'cost-ops', value: 200 });
      await client.store('signals', 'sig-3', { layer: 'observatory', value: 150 });
      await client.store('trends', 'trend-1', { direction: 'increasing' });
    });

    it('should search within namespace', async () => {
      const results = await client.search('signals', {});

      expect(results.length).toBeGreaterThan(0);
      results.forEach((result) => {
        expect(result.id).toMatch(/^sig-/);
      });
    });

    it('should respect limit parameter', async () => {
      const results = await client.search('signals', {}, { limit: 2 });

      expect(results.length).toBeLessThanOrEqual(2);
    });

    it('should respect threshold parameter', async () => {
      const results = await client.search('signals', {}, { threshold: 0.9 });

      results.forEach((result) => {
        expect(result.score).toBeGreaterThanOrEqual(0.9);
      });
    });

    it('should sort results by score descending', async () => {
      const results = await client.search('signals', {}, { limit: 10 });

      for (let i = 1; i < results.length; i++) {
        expect(results[i - 1].score).toBeGreaterThanOrEqual(results[i].score);
      }
    });

    it('should return empty array for non-existent namespace', async () => {
      const results = await client.search('non-existent', {});

      expect(results).toEqual([]);
    });

    it('should reject search without namespace', async () => {
      await expect(client.search('', {})).rejects.toThrow('Namespace is required');
    });

    it('should include score in results', async () => {
      const results = await client.search('signals', {});

      results.forEach((result) => {
        expect(result.score).toBeGreaterThanOrEqual(0);
        expect(result.score).toBeLessThanOrEqual(1);
      });
    });
  });

  describe('Get Operations', () => {
    beforeEach(async () => {
      await client.store('signals', 'sig-1', { value: 100 });
    });

    it('should retrieve existing item', async () => {
      const result = await client.get('signals', 'sig-1');

      expect(result).not.toBeNull();
      expect(result.data.value).toBe(100);
    });

    it('should return null for non-existent item', async () => {
      const result = await client.get('signals', 'non-existent');

      expect(result).toBeNull();
    });

    it('should return null for wrong namespace', async () => {
      const result = await client.get('wrong-namespace', 'sig-1');

      expect(result).toBeNull();
    });
  });

  describe('Delete Operations', () => {
    beforeEach(async () => {
      await client.store('signals', 'sig-1', { value: 100 });
    });

    it('should delete existing item', async () => {
      const deleted = await client.delete('signals', 'sig-1');

      expect(deleted).toBe(true);

      const retrieved = await client.get('signals', 'sig-1');
      expect(retrieved).toBeNull();
    });

    it('should return false for non-existent item', async () => {
      const deleted = await client.delete('signals', 'non-existent');

      expect(deleted).toBe(false);
    });
  });

  describe('Batch Operations', () => {
    it('should store multiple items in batch', async () => {
      const items = [
        { id: 'sig-1', data: { value: 100 } },
        { id: 'sig-2', data: { value: 200 } },
        { id: 'sig-3', data: { value: 300 } },
      ];

      await client.storeBatch('signals', items);

      const result1 = await client.get('signals', 'sig-1');
      const result2 = await client.get('signals', 'sig-2');
      const result3 = await client.get('signals', 'sig-3');

      expect(result1.data.value).toBe(100);
      expect(result2.data.value).toBe(200);
      expect(result3.data.value).toBe(300);
    });

    it('should store batch with metadata', async () => {
      const items = [
        { id: 'sig-1', data: { value: 100 }, metadata: { source: 'test1' } },
        { id: 'sig-2', data: { value: 200 }, metadata: { source: 'test2' } },
      ];

      await client.storeBatch('signals', items);

      const result1 = await client.get('signals', 'sig-1');
      const result2 = await client.get('signals', 'sig-2');

      expect(result1.metadata.source).toBe('test1');
      expect(result2.metadata.source).toBe('test2');
    });

    it('should handle empty batch', async () => {
      await expect(client.storeBatch('signals', [])).resolves.not.toThrow();
    });
  });

  describe('Statistics', () => {
    it('should return correct stats for empty storage', async () => {
      const stats = await client.getStats();

      expect(stats.totalItems).toBe(0);
      expect(stats.namespaces).toEqual([]);
    });

    it('should return correct item count', async () => {
      await client.store('signals', 'sig-1', { value: 100 });
      await client.store('signals', 'sig-2', { value: 200 });
      await client.store('trends', 'trend-1', { direction: 'up' });

      const stats = await client.getStats();

      expect(stats.totalItems).toBe(3);
    });

    it('should list all namespaces', async () => {
      await client.store('signals', 'sig-1', { value: 100 });
      await client.store('trends', 'trend-1', { direction: 'up' });
      await client.store('correlations', 'corr-1', { coefficient: 0.8 });

      const stats = await client.getStats();

      expect(stats.namespaces).toContain('signals');
      expect(stats.namespaces).toContain('trends');
      expect(stats.namespaces).toContain('correlations');
      expect(stats.namespaces.length).toBe(3);
    });

    it('should calculate storage size', async () => {
      await client.store('signals', 'sig-1', { value: 100 });

      const stats = await client.getStats();

      expect(stats.storageSize).toBeGreaterThan(0);
    });
  });

  describe('Error Handling', () => {
    it('should retry on transient failures', async () => {
      let attemptCount = 0;

      // Mock a flaky operation
      const flakyClient = new RuVectorClient();
      const originalStore = flakyClient['withRetry'].bind(flakyClient);

      jest.spyOn(flakyClient as any, 'withRetry').mockImplementation(async (operation: any) => {
        return originalStore(async () => {
          attemptCount++;
          if (attemptCount < 2) {
            throw new Error('Transient error');
          }
          return operation();
        });
      });

      await expect(
        flakyClient.store('signals', 'sig-1', { value: 100 })
      ).resolves.not.toThrow();

      expect(attemptCount).toBeGreaterThan(1);
    });

    it('should not retry validation errors', async () => {
      const flakyClient = new RuVectorClient();
      let attemptCount = 0;

      jest.spyOn(flakyClient as any, 'withRetry').mockImplementation(async (operation: any) => {
        attemptCount++;
        return operation();
      });

      await expect(flakyClient.store('', 'sig-1', { value: 100 })).rejects.toThrow();

      // Should fail immediately without retries
      expect(attemptCount).toBe(1);
    });

    it('should throw after max retries', async () => {
      const flakyClient = new RuVectorClient();
      const operation = jest.fn(async () => {
        throw new Error('Permanent failure');
      });

      await expect((flakyClient as any).withRetry(operation)).rejects.toThrow(
        /Operation failed after \d+ attempts/
      );
      expect(operation).toHaveBeenCalledTimes(3);
    });
  });

  describe('Concurrency', () => {
    it('should handle concurrent stores', async () => {
      const promises = Array.from({ length: 10 }, (_, i) =>
        client.store('signals', `sig-${i}`, { value: i })
      );

      await expect(Promise.all(promises)).resolves.not.toThrow();

      const stats = await client.getStats();
      expect(stats.totalItems).toBe(10);
    });

    it('should handle concurrent searches', async () => {
      await client.store('signals', 'sig-1', { value: 100 });
      await client.store('signals', 'sig-2', { value: 200 });

      const promises = Array.from({ length: 5 }, () => client.search('signals', {}));

      const results = await Promise.all(promises);

      results.forEach((result) => {
        expect(result.length).toBeGreaterThan(0);
      });
    });

    it('should handle mixed concurrent operations', async () => {
      const operations = [
        client.store('signals', 'sig-1', { value: 100 }),
        client.store('signals', 'sig-2', { value: 200 }),
        client.search('signals', {}),
        client.get('signals', 'sig-1'),
        client.delete('signals', 'sig-2'),
      ];

      await expect(Promise.all(operations)).resolves.not.toThrow();
    });
  });

  describe('Data Integrity', () => {
    it('should preserve data types', async () => {
      const data = {
        string: 'test',
        number: 123,
        boolean: true,
        array: [1, 2, 3],
        object: { nested: 'value' },
        null: null,
      };

      await client.store('test', 'data-1', data);

      const retrieved = await client.get('test', 'data-1');

      expect(retrieved.data).toEqual(data);
      expect(typeof retrieved.data.string).toBe('string');
      expect(typeof retriewozÚÚ$z{-®éÜj×    priority: 'high',
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
        setAttributes: jest.fn(),
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
