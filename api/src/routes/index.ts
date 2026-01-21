/**
 * Route registration
 */

import { FastifyInstance } from 'fastify';
import { eventsRoutes } from './events';
import { metricsRoutes } from './metrics';
import { analyticsRoutes } from './analytics';
import { consensusRoutes } from './consensus';
import { strategicRecommendationsRoutes } from './strategic-recommendations';

export function registerRoutes(fastify: FastifyInstance): void {
  // Register route modules
  fastify.register(eventsRoutes, { prefix: '/api/v1/events' });
  fastify.register(metricsRoutes, { prefix: '/api/v1/metrics' });
  fastify.register(analyticsRoutes, { prefix: '/api/v1/analytics' });

  // Register agent routes
  fastify.register(consensusRoutes, { prefix: '/api/v1/agents/consensus' });
  fastify.register(strategicRecommendationsRoutes, { prefix: '/api/v1/analytics/strategic-recommendations' });
}
