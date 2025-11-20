/**
 * Events API routes
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';

const EventSchema = z.object({
  event_id: z.string().uuid(),
  timestamp: z.string().datetime(),
  source_module: z.string(),
  event_type: z.string(),
  correlation_id: z.string().uuid().optional(),
  parent_event_id: z.string().uuid().optional(),
  schema_version: z.string(),
  severity: z.enum(['debug', 'info', 'warning', 'error', 'critical']),
  environment: z.string(),
  tags: z.record(z.string()).optional(),
  payload: z.any(),
});

export async function eventsRoutes(fastify: FastifyInstance) {
  // Ingest a single event
  fastify.post(
    '/',
    {
      schema: {
        description: 'Ingest a single analytics event',
        tags: ['events'],
        body: EventSchema,
        response: {
          201: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              event_id: { type: 'string' },
            },
          },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const event = request.body;

      try {
        // Validate event
        EventSchema.parse(event);

        // Store in database
        await fastify.db.insertEvent(event);

        // Publish to Kafka for real-time processing
        await fastify.kafka.publishEvent(event);

        // Update metrics
        fastify.metrics.eventsProcessed.inc({
          source_module: (event as any).source_module,
          event_type: (event as any).event_type,
        });

        reply.code(201).send({
          success: true,
          event_id: (event as any).event_id,
        });
      } catch (err) {
        fastify.log.error({ err }, 'Failed to ingest event');
        fastify.metrics.eventsErrors.inc({
          source_module: (event as any).source_module || 'unknown',
          event_type: (event as any).event_type || 'unknown',
          error_type: 'ingestion_error',
        });
        reply.code(500).send({ error: 'Failed to ingest event' });
      }
    }
  );

  // Ingest batch of events
  fastify.post(
    '/batch',
    {
      schema: {
        description: 'Ingest multiple events in a batch',
        tags: ['events'],
        body: {
          type: 'array',
          items: EventSchema,
        },
        response: {
          201: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              count: { type: 'number' },
            },
          },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const events = request.body as any[];

      try {
        // Validate all events
        events.forEach((event) => EventSchema.parse(event));

        // Store in database (transaction)
        await fastify.db.transaction(async (client) => {
          for (const event of events) {
            await fastify.db.insertEvent(event);
          }
        });

        // Publish to Kafka
        await fastify.kafka.publishBatch(events);

        // Update metrics
        events.forEach((event) => {
          fastify.metrics.eventsProcessed.inc({
            source_module: event.source_module,
            event_type: event.event_type,
          });
        });

        reply.code(201).send({
          success: true,
          count: events.length,
        });
      } catch (err) {
        fastify.log.error({ err }, 'Failed to ingest batch');
        reply.code(500).send({ error: 'Failed to ingest batch' });
      }
    }
  );

  // Query events
  fastify.get(
    '/',
    {
      schema: {
        description: 'Query events with filters',
        tags: ['events'],
        querystring: {
          type: 'object',
          properties: {
            start_time: { type: 'string', format: 'date-time' },
            end_time: { type: 'string', format: 'date-time' },
            source_module: { type: 'string' },
            event_type: { type: 'string' },
            severity: { type: 'string' },
            limit: { type: 'number', default: 50 },
            offset: { type: 'number', default: 0 },
          },
          required: ['start_time', 'end_time'],
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const query = request.query as any;

      try {
        const events = await fastify.db.queryEvents(
          new Date(query.start_time),
          new Date(query.end_time),
          {
            sourceModule: query.source_module,
            eventType: query.event_type,
            severity: query.severity,
            limit: query.limit,
            offset: query.offset,
          }
        );

        reply.send({
          events,
          count: events.length,
          limit: query.limit,
          offset: query.offset,
        });
      } catch (err) {
        fastify.log.error({ err }, 'Failed to query events');
        reply.code(500).send({ error: 'Failed to query events' });
      }
    }
  );

  // Get event by ID
  fastify.get(
    '/:eventId',
    {
      schema: {
        description: 'Get event by ID',
        tags: ['events'],
        params: {
          type: 'object',
          properties: {
            eventId: { type: 'string', format: 'uuid' },
          },
        },
      },
    },
    async (request: FastifyRequest<{ Params: { eventId: string } }>, reply: FastifyReply) => {
      const { eventId } = request.params;

      try {
        const result = await fastify.db.query(
          'SELECT * FROM analytics_events WHERE event_id = $1',
          [eventId]
        );

        if (result.rows.length === 0) {
          reply.code(404).send({ error: 'Event not found' });
          return;
        }

        reply.send(result.rows[0]);
      } catch (err) {
        fastify.log.error({ err }, 'Failed to get event');
        reply.code(500).send({ error: 'Failed to get event' });
      }
    }
  );
}
