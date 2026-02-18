/**
 * Fanout Ingest API route
 *
 * Accepts the looser payload format used by governance-core and other
 * fanout producers, normalises it into the internal analytics event
 * schema, and forwards it through the standard processing pipeline.
 *
 * POST /api/v1/ingest
 *   → 202 Accepted  { status: "accepted", execution_id: "<echo>" }
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { withDataProcessingSpan } from '../execution';

// ---------- validation schema for the fanout payload ----------

const IngestSchema = z.object({
  source: z.string(),
  event_type: z.string(),
  execution_id: z.string(),
  timestamp: z.string(),
  payload: z.any(),

  // Optional fields that callers *may* provide
  severity: z
    .enum(['debug', 'info', 'warning', 'error', 'critical'])
    .optional(),
  environment: z.string().optional(),
  correlation_id: z.string().uuid().optional(),
  tags: z.record(z.string()).optional(),
});

type IngestBody = z.infer<typeof IngestSchema>;

const IngestJsonSchema = {
  type: 'object' as const,
  properties: {
    source: { type: 'string' },
    event_type: { type: 'string' },
    execution_id: { type: 'string' },
    timestamp: { type: 'string' },
    payload: {},
    severity: {
      type: 'string',
      enum: ['debug', 'info', 'warning', 'error', 'critical'],
    },
    environment: { type: 'string' },
    correlation_id: { type: 'string', format: 'uuid' },
    tags: { type: 'object', additionalProperties: { type: 'string' } },
  },
  required: ['source', 'event_type', 'execution_id', 'timestamp', 'payload'],
};

// ---------- normalisation helper ----------

function normaliseToEvent(body: IngestBody) {
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
      ingested_via: 'fanout-ingest',
      fanout_execution_id: body.execution_id,
    },
    payload: body.payload,
  };
}

// ---------- route ----------

export async function ingestRoutes(fastify: FastifyInstance) {
  fastify.post(
    '/',
    {
      schema: {
        description:
          'Ingest a fanout event from governance-core or similar producers. ' +
          'The payload is normalised to the internal event schema before processing.',
        tags: ['ingest'],
        body: IngestJsonSchema,
        response: {
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
      const raw = request.body as IngestBody;

      await withDataProcessingSpan(
        request.executionGraph,
        'fanout-ingest',
        async () => {
          // Validate with Zod (provides richer error messages than JSON Schema alone)
          const parsed = IngestSchema.parse(raw);

          // Normalise to internal event format
          const event = normaliseToEvent(parsed);

          // Store in database (if available)
          if (fastify.db) {
            await fastify.db.insertEvent(event);
          }

          // Publish to Kafka for real-time processing (if available)
          if (fastify.kafka) {
            await fastify.kafka.publishEvent(event);
          }

          // Update metrics
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
          artifact_type: 'fanout_ingest_result',
          data: {
            event_id: 'generated',
            source: raw.source,
            execution_id: raw.execution_id,
            status: 'accepted',
          },
        }),
      );
    },
  );
}
