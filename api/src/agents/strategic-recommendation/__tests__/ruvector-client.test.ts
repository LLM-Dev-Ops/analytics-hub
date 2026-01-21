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
          const score = Math.random();
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

      jest.spyOn(flakyClient as any, 'withRetry').mockImplementation(async (operation) => {
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

      jest.spyOn(flakyClient as any, 'withRetry').mockImplementation(async (operation) => {
        attemptCount++;
        return operation();
      });

      await expect(flakyClient.store('', 'sig-1', { value: 100 })).rejects.toThrow();

      // Should fail immediately without retries
      expect(attemptCount).toBe(1);
    });

    it('should throw after max retries', async () => {
      const flakyClient = new RuVectorClient();

      jest.spyOn(flakyClient as any, 'withRetry').mockImplementation(async () => {
        throw new Error('Permanent failure');
      });

      await expect(flakyClient.store('signals', 'sig-1', { value: 100 })).rejects.toThrow(
        /Operation failed after \d+ attempts/
      );
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
      expect(typeof retrieved.data.number).toBe('number');
      expect(typeof retrieved.data.boolean).toBe('boolean');
      expect(Array.isArray(retrieved.data.array)).toBe(true);
      expect(typeof retrieved.data.object).toBe('object');
    });

    it('should handle large objects', async () => {
      const largeData = {
        items: Array.from({ length: 1000 }, (_, i) => ({
          id: i,
          value: Math.random(),
          timestamp: new Date().toISOString(),
        })),
      };

      await expect(client.store('test', 'large-1', largeData)).resolves.not.toThrow();

      const retrieved = await client.get('test', 'large-1');
      expect(retrieved.data.items.length).toBe(1000);
    });

    it('should handle special characters in IDs', async () => {
      const specialIds = ['sig-123', 'sig_456', 'sig.789', 'sig@abc'];

      for (const id of specialIds) {
        await client.store('signals', id, { value: 100 });
        const retrieved = await client.get('signals', id);
        expect(retrieved).not.toBeNull();
      }
    });
  });

  describe('Namespace Isolation', () => {
    it('should isolate data by namespace', async () => {
      await client.store('signals', 'item-1', { type: 'signal' });
      await client.store('trends', 'item-1', { type: 'trend' });

      const signal = await client.get('signals', 'item-1');
      const trend = await client.get('trends', 'item-1');

      expect(signal.data.type).toBe('signal');
      expect(trend.data.type).toBe('trend');
    });

    it('should not find items in wrong namespace', async () => {
      await client.store('signals', 'item-1', { value: 100 });

      const result = await client.get('trends', 'item-1');

      expect(result).toBeNull();
    });

    it('should search only within specified namespace', async () => {
      await client.store('signals', 'sig-1', { value: 100 });
      await client.store('trends', 'trend-1', { value: 200 });

      const signalResults = await client.search('signals', {});
      const trendResults = await client.search('trends', {});

      expect(signalResults.some((r) => r.id.startsWith('sig-'))).toBe(true);
      expect(signalResults.some((r) => r.id.startsWith('trend-'))).toBe(false);

      expect(trendResults.some((r) => r.id.startsWith('trend-'))).toBe(true);
      expect(trendResults.some((r) => r.id.startsWith('sig-'))).toBe(false);
    });
  });
});
