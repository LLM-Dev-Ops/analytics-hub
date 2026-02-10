/**
 * Metrics API routes
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { withDataProcessingSpan } from '../execution';

export async function metricsRoutes(fastify: FastifyInstance) {
  // Get aggregated metrics
  fastify.get(
    '/',
    {
      schema: {
        description: 'Get aggregated metrics',
        tags: ['metrics'],
        querystring: {
          type: 'object',
          properties: {
            metric_name: { type: 'string' },
            window: { type: 'string', enum: ['1m', '5m', '1h', '1d'] },
            start_time: { type: 'string', format: 'date-time' },
            end_time: { type: 'string', format: 'date-time' },
          },
          required: ['metric_name', 'window', 'start_time', 'end_time'],
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const query = request.query as any;

      await withDataProcessingSpan(
        request.executionGraph,
        'metrics-aggregation',
        async () => {
          try {
            const metrics = await fastify.db.getAggregatedMetrics(
              query.metric_name,
              query.window,
              new Date(query.start_time),
              new Date(query.end_time)
            );

            reply.send({
              metrics,
              count: metrics.length,
            });
          } catch (err) {
            fastify.log.error({ err }, 'Failed to query metrics');
            reply.code(500).send({ error: 'Failed to query metrics' });
          }
        },
        () => ({
          artifact_type: 'metrics_result',
          data: { metric_name: query.metric_name, window: query.window },
        }),
      );
    }
  );

  // Get event counts by module
  fastify.get(
    '/event-counts',
    {
      schema: {
        description: 'Get event counts grouped by module',
        tags: ['metrics'],
        querystring: {
          type: 'object',
          properties: {
            start_time: { type: 'string', format: 'date-time' },
            end_time: { type: 'string', format: 'date-time' },
          },
          required: ['start_time', 'end_time'],
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const query = request.query as any;

      await withDataProcessingSpan(
        request.executionGraph,
        'metrics-event-counts',
        async () => {
          try {
            const counts = await fastify.db.getEventCountsByModule(
              new Date(query.start_time),
              new Date(query.end_time)
            );

            reply.send({
              counts,
            });
          } catch (err) {
            fastify.log.error({ err }, 'Failed to get event counts');
            reply.code(500).send({ error: 'Failed to get event counts' });
          }
        },
        () => ({
          artifact_type: 'event_counts_result',
          data: { start_time: query.start_time, end_time: query.end_time },
        }),
      );
    }
  );
}
