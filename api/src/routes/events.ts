/**
 * Events API routes
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { withDataProcessingSpan } from '../execution';

// ---------- Strict internal event schema ----------

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

// ---------- Loose fanout schema (governance-core, etc.) ----------

const FanoutSchema = z.object({
  source: z.string(),
  event_type: z.string(),
  execution_id: z.string(),
  timestamp: z.string(),
  payload: z.any(),
  severity: z
    .enum(['debug', 'info', 'warning', 'error', 'critical'])
    .optional(),
  environment: z.string().optional(),
  correlation_id: z.string().uuid().optional(),
  tags: z.record(z.string()).optional(),
});

/**
 * Detect whether the body matches the fanout format (has `source` and
 * `execution_id` but no `event_id`).
 */
function isFanoutPayload(body: unknown): boolean {
  if (!body || typeof body !== 'object') return false;
  const b = body as Record<string, unknown>;
  return typeof b.source === 'string' && typeof b.execution_id === 'string' && !b.event_id;
}

function normaliseFanoutToEvent(body: z.infer<typeof FanoutSchema>) {
  return {
    event_id: uuidv4(),
    timestamp: body.timestamp,
    source_module: body.source,
    event_type: body.event_type,
    correlation_id: body.correlation_id ?? undefined,
    schema_version: '1.0.0',
    severity: body.severity ?? 'info',
    environment: body.environment ?? process.env.PLATFORM_ENV ?? 'dev',
    tags: {
      ...body.tags,
      ingested_via: 'fanout-events',
      fanout_execution_id: body.execution_id,
    },
    payload: body.payload,
  };
}

// JSON Schema for Fastify validation — accept both formats (loose: no required fields enforced at this level)
const EventJsonSchema = {
  type: 'object',
  properties: {
    // Internal event fields
    event_id: { type: 'string' },
    timestamp: { type: 'string' },
    source_module: { type: 'string' },
    event_type: { type: 'string' },
    correlation_id: { type: 'string' },
    parent_event_id: { type: 'string' },
    schema_version: { type: 'string' },
    severity: { type: 'string', enum: ['debug', 'info', 'warning', 'error', 'critical'] },
    environment: { type: 'string' },
    tags: { type: 'object', additionalProperties: { type: 'string' } },
    payload: {},
    // Fanout fields
    source: { type: 'string' },
    execution_id: { type: 'string' },
  },
  required: ['event_type', 'timestamp'],
};

export async function eventsRoutes(fastify: FastifyInstance) {
  // Ingest a single event (accepts both internal and fanout formats)
  fastify.post(
    '/',
    {
      schema: {
        description:
          'Ingest a single analytics event. Accepts the full internal schema ' +
          '(event_id, source_module, …) or the loose fanout format ' +
          '(source, execution_id, …) used by governance-core.',
        tags: ['events'],
        body: EventJsonSchema,
        response: {
          201: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              event_id: { type: 'string' },
            },
          },
          202: {
            type: 'object',
            properties: {
              status: { type: 'string' },
              execution_id: { type: 'string' },
            },
          },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const raw = request.body;

      // ── Fanout format (governance-core, etc.) ──
      if (isFanoutPayload(raw)) {
        await withDataProcessingSpan(
          request.executionGraph,
          'fanout-event-ingestion',
          async () => {
            const parsed = FanoutSchema.parse(raw);
            const event = normaliseFanoutToEvent(parsed);

            if (fastify.db) {
              await fastify.db.insertEvent(event);
            }
            if (fastify.kafka) {
              await fastify.kafka.publishEvent(event);
            }
            fastify.metrics?.eventsProcessed?.inc({
              source_module: event.source_module,
              event_type: event.event_type,
            });

            reply.code(202).send({
              status: 'accepted',
              execution_id: parsed.execution_id,
            });
          },
          () => ({
            artifact_type: 'fanout_ingestion_result',
            data: { source: (raw as any).source, execution_id: (raw as any).execution_id, status: 'accepted' },
          }),
        );
        return;
      }

      // ── Internal format ──
      await withDataProcessingSpan(
        request.executionGraph,
        'event-ingestion',
        async () => {
          try {
            // Validate event
            EventSchema.parse(raw);

            // Store in database (if available)
            if (fastify.db) {
              await fastify.db.insertEvent(raw);
            }

            // Publish to Kafka for real-time processing (if available)
            if (fastify.kafka) {
              await fastify.kafka.publishEvent(raw);
            }

            // Update metrics
            fastify.metrics?.eventsProcessed?.inc({
              source_module: (raw as any).source_module,
              event_type: (raw as any).event_type,
            });

            reply.code(201).send({
              success: true,
              event_id: (raw as any).event_id,
            });
          } catch (err) {
            fastify.log.error({ err }, 'Failed to ingest event');
            fastify.metrics?.eventsErrors?.inc({
              source_module: (raw as any).source_module || 'unknown',
              event_type: (raw as any).event_type || 'unknown',
              error_type: 'ingestion_error',
            });
            reply.code(500).send({ error: 'Failed to ingest event' });
          }
        },
        () => ({
          artifact_type: 'ingestion_result',
          data: { event_id: (raw as any).event_id, status: 'ingested' },
        }),
      );
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
          items: EventJsonSchema,
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

      await withDataProcessingSpan(
        request.executionGraph,
        'batch-event-ingestion',
        async () => {
          try {
            // Validate all events
            events.forEach((event) => EventSchema.parse(event));

            // Store in database (transaction) - if available
            if (fastify.db) {
              await fastify.db.transaction(async (_client) => {
                for (const event of events) {
                  await fastify.db.insertEvent(event);
                }
              });
            }

            // Publish to Kafka - if available
            if (fastify.kafka) {
              await fastify.kafka.publishBatch(events);
            }

            // Update metrics
            events.forEach((event) => {
              fastify.metrics?.eventsProcessed?.inc({
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
        },
        () => ({
          artifact_type: 'batch_ingestion_result',
          data: { count: events.length, status: 'ingested' },
        }),
      );
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

      await withDataProcessingSpan(
        request.executionGraph,
        'event-query',
        async () => {
          try {
            if (!fastify.db) {
              reply.code(503).send({ error: 'Database not configured' });
              return;
            }

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
        },
        () => ({
          artifact_type: 'query_result',
          data: { start_time: query.start_time, end_time: query.end_time },
        }),
      );
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

      await withDataProcessingSpan(
        request.executionGraph,
        'event-retrieval',
        async () => {
          try {
            if (!fastify.db) {
              reply.code(503).send({ error: 'Database not configured' });
              return;
            }

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
        },
        () => ({
          artifact_type: 'retrieval_result',
          data: { event_id: eventId },
        }),
      );
    }
  );
}
