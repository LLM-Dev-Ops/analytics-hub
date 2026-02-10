/**
 * Fastify type declarations
 * Extends Fastify types to include custom decorators
 */

import { Database } from '../database';
import { CacheManager } from '../cache';
import { MetricsCollector } from '../metrics';
import { ExecutionGraph } from '../execution/execution-graph';

declare module 'fastify' {
  interface FastifyInstance {
    db: Database;
    redis: CacheManager;
    kafka: {
      publishEvent: (event: any) => Promise<void>;
      publishBatch: (events: any[]) => Promise<void>;
    };
    metrics: MetricsCollector;
  }

  interface FastifyRequest {
    executionGraph: ExecutionGraph | null;
  }
}
