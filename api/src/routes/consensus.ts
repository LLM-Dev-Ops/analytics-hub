/**
 * Consensus Agent API Routes
 *
 * Exposes the Consensus Agent as REST endpoints for the Analytics Hub API.
 *
 * @module routes/consensus
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import {
  handleConsensusRequest,
  healthCheck as agentHealthCheck,
} from '../agents/consensus/handler';
import {
  AGENT_ID,
  AGENT_VERSION,
  DECISION_TYPE,
  ConsensusInputSchema,
  ANALYTICS_CLASSIFICATION,
  AGENT_PERMISSIONS,
  AGENT_BOUNDARIES,
} from '../contracts/consensus-agent';

/**
 * Register Consensus Agent routes
 */
export async function consensusRoutes(fastify: FastifyInstance) {
  /**
   * POST /consensus/analyze
   *
   * Analyze signals and compute consensus.
   * Emits exactly ONE DecisionEvent per invocation.
   */
  fastify.post(
    '/analyze',
    {
      schema: {
        description: 'Analyze signals and compute consensus',
        tags: ['agents', 'consensus'],
        summary: 'Compute consensus across analytical signals',
        body: {
          type: 'object',
          properties: {
            signals: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  signalId: { type: 'string' },
                  sourceLayer: { type: 'string' },
                  value: { oneOf: [{ type: 'number' }, { type: 'object' }] },
                  confidence: { type: 'number', minimum: 0, maximum: 1 },
                  timestamp: { type: 'string', format: 'date-time' },
                  metadata: { type: 'object' },
                },
                required: ['signalId', 'sourceLayer', 'value', 'confidence', 'timestamp'],
              },
              minItems: 1,
            },
            timeRange: {
              type: 'object',
              properties: {
                start: { type: 'string', format: 'date-time' },
                end: { type: 'string', format: 'date-time' },
              },
              required: ['start', 'end'],
            },
            options: {
              type: 'object',
              properties: {
                minAgreementThreshold: { type: 'number', minimum: 0, maximum: 1, default: 0.6 },
                confidenceWeighting: { type: 'string', enum: ['uniform', 'proportional', 'exponential'] },
                aggregationMethod: { type: 'string', enum: ['mean', 'median', 'mode', 'weighted_mean'] },
                includeDivergentAnalysis: { type: 'boolean', default: true },
                scopeFilter: { type: 'array', items: { type: 'string' } },
              },
            },
            executionRef: { type: 'string', format: 'uuid' },
          },
          required: ['signals', 'timeRange'],
        },
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              consensusAchieved: { type: 'boolean' },
              decisionEvent: { type: 'object' },
              summary: { type: 'string' },
              processingMetadata: {
                type: 'object',
                properties: {
                  signalsProcessed: { type: 'number' },
                  computationTimeMs: { type: 'number' },
                  method: { type: 'string' },
                },
              },
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
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const graph = request.executionGraph;
      const agentSpanId = graph?.startAgentSpan('consensus-agent', {
        agent_id: AGENT_ID,
        agent_version: AGENT_VERSION,
        route: '/api/v1/agents/consensus/analyze',
      });

      try {
        const response = await handleConsensusRequest({ body: request.body });
        const responseBody = JSON.parse(response.body);

        if (agentSpanId && responseBody.decisionEvent) {
          graph!.attachArtifact(agentSpanId, {
            artifact_type: 'decision_event',
            artifact_id: responseBody.decisionEvent.execution_ref || agentSpanId,
            data: responseBody.decisionEvent,
          });
        }

        graph?.endAgentSpan(agentSpanId!, response.statusCode < 400 ? 'ok' : 'error');

        reply
          .code(response.statusCode)
          .headers(response.headers)
          .send(responseBody);
      } catch (error) {
        if (agentSpanId) graph?.endAgentSpan(agentSpanId, 'error');
        throw error;
      }
    }
  );

  /**
   * GET /consensus/health
   *
   * Health check for the Consensus Agent.
   */
  fastify.get(
    '/health',
    {
      schema: {
        description: 'Consensus Agent health check',
        tags: ['agents', 'consensus', 'health'],
        response: {
          200: {
            type: 'object',
            properties: {
              status: { type: 'string' },
              agent_id: { type: 'string' },
              agent_version: { type: 'string' },
              ruvector_latency_ms: { type: 'number' },
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
   * GET /consensus/metadata
   *
   * Get agent metadata and capabilities.
   */
  fastify.get(
    '/metadata',
    {
      schema: {
        description: 'Get Consensus Agent metadata and capabilities',
        tags: ['agents', 'consensus'],
        response: {
          200: {
            type: 'object',
            properties: {
              agent_id: { type: 'string' },
              agent_version: { type: 'string' },
              decision_type: { type: 'string' },
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
        decision_type: DECISION_TYPE,
        classification: ANALYTICS_CLASSIFICATION,
        permissions: AGENT_PERMISSIONS,
        boundaries: AGENT_BOUNDARIES,
      });
    }
  );
}
