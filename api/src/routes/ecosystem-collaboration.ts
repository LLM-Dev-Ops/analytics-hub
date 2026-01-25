/**
 * Ecosystem Collaboration Agent API Routes
 *
 * Exposes the Ecosystem Collaboration Agent as REST endpoints.
 * Phase 5 - Ecosystem & Collaboration (Layer 1)
 *
 * @module routes/ecosystem-collaboration
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import {
  handleEcosystemCollaborationRequest,
  healthCheck as agentHealthCheck,
} from '../agents/ecosystem-collaboration/handler';
import {
  AGENT_ID,
  AGENT_VERSION,
  SIGNAL_TYPES,
  PERFORMANCE_BUDGETS,
  ANALYTICS_CLASSIFICATION,
  AGENT_PERMISSIONS,
  AGENT_BOUNDARIES,
} from '../contracts/ecosystem-collaboration-agent';

/**
 * Register Ecosystem Collaboration Agent routes
 */
export async function ecosystemCollaborationRoutes(fastify: FastifyInstance) {
  /**
   * POST /ecosystem-collaboration/analyze
   *
   * Analyze ecosystem signals and emit aggregation/consensus/strategic signals.
   * Emits exactly ONE DecisionEvent per invocation.
   *
   * MUST NOT: mutate state, commit actions, draw conclusions
   */
  fastify.post(
    '/analyze',
    {
      schema: {
        description: 'Analyze ecosystem signals for aggregation, consensus, and cross-system correlations',
        tags: ['agents', 'ecosystem', 'phase-5'],
        summary: 'Ecosystem Collaboration Agent - Analytics',
        body: {
          type: 'object',
          properties: {
            requestId: { type: 'string', format: 'uuid' },
            signals: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  partnerId: { type: 'string' },
                  sourceSystem: { type: 'string' },
                  category: {
                    type: 'string',
                    enum: ['performance', 'cost', 'quality', 'availability', 'latency'],
                  },
                  value: { type: 'number' },
                  unit: { type: 'string' },
                  confidence: { type: 'number', minimum: 0, maximum: 1 },
                  timestamp: { type: 'string', format: 'date-time' },
                  metadata: { type: 'object' },
                },
                required: ['partnerId', 'sourceSystem', 'category', 'value', 'unit', 'confidence', 'timestamp'],
              },
              minItems: 1,
            },
            crossSystemQueries: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  sourceSystems: { type: 'array', items: { type: 'string' }, minItems: 2 },
                  metrics: { type: 'array', items: { type: 'string' }, minItems: 1 },
                  timeRange: {
                    type: 'object',
                    properties: {
                      start: { type: 'string', format: 'date-time' },
                      end: { type: 'string', format: 'date-time' },
                    },
                    required: ['start', 'end'],
                  },
                  correlationThreshold: { type: 'number', minimum: 0, maximum: 1, default: 0.5 },
                },
                required: ['sourceSystems', 'metrics', 'timeRange'],
              },
            },
            options: {
              type: 'object',
              properties: {
                granularity: {
                  type: 'string',
                  enum: ['minute', 'hour', 'day', 'week'],
                  default: 'hour',
                },
                updateIndex: { type: 'boolean', default: true },
                crossSystemAnalytics: { type: 'boolean', default: true },
                scopeFilter: { type: 'array', items: { type: 'string' } },
              },
            },
            executionRef: { type: 'string', format: 'uuid' },
          },
          required: ['requestId', 'signals'],
        },
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              requestId: { type: 'string' },
              aggregationSignals: { type: 'array' },
              consensusSignals: { type: 'array' },
              strategicSignals: { type: 'array' },
              indexEntries: { type: 'array' },
              processingMetadata: {
                type: 'object',
                properties: {
                  signalsProcessed: { type: 'number' },
                  computationTimeMs: { type: 'number' },
                  tokenCount: { type: 'number' },
                  latencyMs: { type: 'number' },
                },
              },
              decisionEventId: { type: 'string' },
            },
          },
          400: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              error: {
                type: 'object',
                properties: {
                  code: { type: 'string' },
                  message: { type: 'string' },
                  details: { type: 'object' },
                },
              },
            },
          },
          500: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              error: {
                type: 'object',
                properties: {
                  code: { type: 'string' },
                  message: { type: 'string' },
                },
              },
            },
          },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const response = await handleEcosystemCollaborationRequest({ body: request.body });

      reply
        .code(response.statusCode)
        .headers(response.headers)
        .send(JSON.parse(response.body));
    }
  );

  /**
   * GET /ecosystem-collaboration/health
   *
   * Health check for the Ecosystem Collaboration Agent.
   */
  fastify.get(
    '/health',
    {
      schema: {
        description: 'Ecosystem Collaboration Agent health check',
        tags: ['agents', 'ecosystem', 'health'],
        response: {
          200: {
            type: 'object',
            properties: {
              status: { type: 'string' },
              agent_id: { type: 'string' },
              agent_version: { type: 'string' },
              ruvector_latency_ms: { type: 'number' },
              ruvector_healthy: { type: 'boolean' },
              timestamp: { type: 'string' },
              performance_budgets: {
                type: 'object',
                properties: {
                  MAX_TOKENS: { type: 'number' },
                  MAX_LATENCY_MS: { type: 'number' },
                },
              },
            },
          },
          503: {
            type: 'object',
            properties: {
              status: { type: 'string' },
              agent_id: { type: 'string' },
              agent_version: { type: 'string' },
              error: { type: 'string' },
              timestamp: { type: 'string' },
            },
          },
        },
      },
    },
    async (_request: FastifyRequest, reply: FastifyReply) => {
      const response = await agentHealthCheck();
      reply.code(response.statusCode).send(JSON.parse(response.body));
    }
  );

  /**
   * GET /ecosystem-collaboration/metadata
   *
   * Get agent metadata, capabilities, and boundaries.
   */
  fastify.get(
    '/metadata',
    {
      schema: {
        description: 'Get Ecosystem Collaboration Agent metadata and boundaries',
        tags: ['agents', 'ecosystem'],
        response: {
          200: {
            type: 'object',
            properties: {
              agent_id: { type: 'string' },
              agent_version: { type: 'string' },
              signal_types: { type: 'object' },
              performance_budgets: { type: 'object' },
              classification: { type: 'object' },
              permissions: { type: 'object' },
              boundaries: { type: 'object' },
            },
          },
        },
      },
    },
    async (_request: FastifyRequest, reply: FastifyReply) => {
      reply.send({
        agent_id: AGENT_ID,
        agent_version: AGENT_VERSION,
        signal_types: SIGNAL_TYPES,
        performance_budgets: PERFORMANCE_BUDGETS,
        classification: ANALYTICS_CLASSIFICATION,
        permissions: AGENT_PERMISSIONS,
        boundaries: AGENT_BOUNDARIES,
      });
    }
  );
}
