/**
 * Prometheus metrics collection
 */

import { Registry, Counter, Histogram, Gauge, collectDefaultMetrics } from 'prom-client';

export interface MetricsCollector {
  register: Registry;
  httpRequestDuration: Histogram;
  httpRequestTotal: Counter;
  activeConnections: Gauge;
  eventsProcessed: Counter;
  eventsErrors: Counter;
  cacheHits: Counter;
  cacheMisses: Counter;
  dbQueryDuration: Histogram;
}

export function setupMetrics(): MetricsCollector {
  const register = new Registry();

  // Collect default metrics (CPU, memory, etc.)
  collectDefaultMetrics({ register });

  // HTTP metrics
  const httpRequestDuration = new Histogram({
    name: 'http_request_duration_seconds',
    help: 'Duration of HTTP requests in seconds',
    labelNames: ['method', 'route', 'status_code'],
    buckets: [0.001, 0.01, 0.1, 0.5, 1, 2, 5],
    registers: [register],
  });

  const httpRequestTotal = new Counter({
    name: 'http_requests_total',
    help: 'Total number of HTTP requests',
    labelNames: ['method', 'route', 'status_code'],
    registers: [register],
  });

  const activeConnections = new Gauge({
    name: 'active_connections',
    help: 'Number of active connections',
    registers: [register],
  });

  // Event processing metrics
  const eventsProcessed = new Counter({
    name: 'events_processed_total',
    help: 'Total number of events processed',
    labelNames: ['source_module', 'event_type'],
    registers: [register],
  });

  const eventsErrors = new Counter({
    name: 'events_errors_total',
    help: 'Total number of event processing errors',
    labelNames: ['source_module', 'event_type', 'error_type'],
    registers: [register],
  });

  // Cache metrics
  const cacheHits = new Counter({
    name: 'cache_hits_total',
    help: 'Total number of cache hits',
    labelNames: ['cache_type'],
    registers: [register],
  });

  const cacheMisses = new Counter({
    name: 'cache_misses_total',
    help: 'Total number of cache misses',
    labelNames: ['cache_type'],
    registers: [register],
  });

  // Database metrics
  const dbQueryDuration = new Histogram({
    name: 'db_query_duration_seconds',
    help: 'Duration of database queries in seconds',
    labelNames: ['query_type'],
    buckets: [0.001, 0.01, 0.1, 0.5, 1, 2, 5],
    registers: [register],
  });

  return {
    register,
    httpRequestDuration,
    httpRequestTotal,
    activeConnections,
    eventsProcessed,
    eventsErrors,
    cacheHits,
    cacheMisses,
    dbQueryDuration,
  };
}
