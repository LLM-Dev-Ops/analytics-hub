/**
 * Strategic Recommendations API routes
 * Endpoints for triggering strategic analysis and retrieving recommendations
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { v4 as uuidv4 } from 'uuid';
import {
  StrategicRecommendationInputSchema,
  StrategicRecommendationOutputSchema,
  StrategicRecommendationSchema,
  StrategicRecommendation,
} from '../agents/strategic-recommendation/types';

/**
 * Type definitions for request parameters
 */
interface AnalyzeRequest {
  Body: {
    start_time: string;
    end_time: string;
    domains?: string[];
    focus_areas?: string[];
    min_confidence?: number;
    max_recommendations?: number;
  };
}

interface GetRecommendationParams {
  Params: {
    id: string;
  };
}

interface ListRecommendationsQuery {
  Querystring: {
    limit?: number;
    offset?: number;
    start_time?: string;
    end_time?: string;
    category?: string;
    priority?: string;
  };
}

interface SummaryQuery {
  Querystring: {
    days?: number;
    priority?: string;
  };
}

export async function strategicRecommendationsRoutes(fastify: FastifyInstance) {
  /**
   * POST /api/analytics/strategic-recommendations/analyze
   * Triggers strategic analysis for a given time window
   */
  fastify.post<AnalyzeRequest>(
    '/analyze',
    {
      schema: {
        description: 'Trigger strategic analysis and generate recommendations',
        tags: ['strategic-recommendations'],
        body: {
          type: 'object',
          properties: {
            start_time: { type: 'string', format: 'date-time' },
            end_time: { type: 'string', format: 'date-time' },
            domains: {
              type: 'array',
              items: { type: 'string' },
              description: 'Optional list of domains to analyze (observatory, cost-ops, governance, consensus)',
            },
            focus_areas: {
              type: 'array',
              items: { type: 'string' },
              description: 'Optional focus categories (cost-optimization, performance-improvement, etc.)',
            },
            min_confidence: {
              type: 'number',
              minimum: 0,
              maximum: 1,
              default: 0.5,
              description: 'Minimum confidence threshold for recommendations',
            },
            max_recommendations: {
              type: 'number',
              minimum: 1,
              default: 10,
              description: 'Maximum number of recommendations to return',
            },
          },
          required: ['start_time', 'end_time'],
        },
        response: {
          200: {
            type: 'object',
            properties: {
              recommendations: { type: 'array' },
              totalSignalsAnalyzed: { type: 'number' },
              trendsIdentified: { type: 'number' },
              correlationsFound: { type: 'number' },
              overallConfidence: { type: 'number' },
              analysisMetadata: { type: 'object' },
            },
          },
        },
      },
    },
    async (request: FastifyRequest<AnalyzeRequest>, reply: FastifyReply) => {
      const { start_time, end_time, domains, focus_areas, min_confidence, max_recommendations } = request.body;

      try {
        const executionRef = uuidv4();
        const startTime = Date.now();

        // Prepare input for the Strategic Recommendation Agent
        const agentInput = {
          timeWindow: {
            startTime: start_time,
            endTime: end_time,
          },
          sourceLayers: domains || ['observatory', 'cost-ops', 'governance', 'consensus'],
          minConfidence: min_confidence || 0.5,
          maxRecommendations: max_recommendations || 10,
          focusCategories: focus_areas,
          executionRef,
        };

        // Validate input
        StrategicRecommendationInputSchema.parse(agentInput);

        fastify.log.info(
          { executionRef, timeWindow: agentInput.timeWindow, sourceLayers: agentInput.sourceLayers },
          'Starting strategic analysis'
        );

        // TODO: Call the Strategic Recommendation Agent
        // For now, return a placeholder response
        const mockRecommendations: StrategicRecommendation[] = [];
        const processingDuration = Date.now() - startTime;

        const output = {
          recommendations: mockRecommendations,
          totalSignalsAnalyzed: 0,
          trendsIdentified: 0,
          correlationsFound: 0,
          overallConfidence: 0,
          analysisMetadata: {
            timeWindow: agentInput.timeWindow,
            layersAnalyzed: agentInput.sourceLayers,
            processingDuration,
          },
        };

        // Validate output
        StrategicRecommendationOutputSchema.parse(output);

        // Store recommendations in database (if available)
        if (fastify.db) {
          await fastify.db.transaction(async (client) => {
            for (const recommendation of output.recommendations) {
              await client.query(
                `INSERT INTO strategic_recommendations
                 (recommendation_id, category, priority, title, description, rationale,
                  supporting_correlations, supporting_trends, expected_impact, confidence,
                  time_horizon, metadata, generated_at, execution_ref)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW(), $13)`,
                [
                  recommendation.recommendationId,
                  recommendation.category,
                  recommendation.priority,
                  recommendation.title,
                  recommendation.description,
                  recommendation.rationale,
                  JSON.stringify(recommendation.supportingCorrelations),
                  JSON.stringify(recommendation.supportingTrends),
                  JSON.stringify(recommendation.expectedImpact),
                  recommendation.confidence,
                  recommendation.timeHorizon,
                  JSON.stringify(recommendation.metadata || {}),
                  executionRef,
                ]
              );
            }
          });
        }

        // Update metrics
        fastify.metrics?.eventsProcessed?.inc({
          source_module: 'strategic-recommendation-agent',
          event_type: 'analysis_completed',
        });

        fastify.log.info(
          {
            executionRef,
            recommendationsCount: output.recommendations.length,
            processingDuration,
          },
          'Strategic analysis completed'
        );

        reply.send(output);
      } catch (err) {
        fastify.log.error({ err }, 'Failed to perform strategic analysis');
        fastify.metrics?.eventsErrors?.inc({
          source_module: 'strategic-recommendation-agent',
          event_type: 'analysis_error',
          error_type: 'analysis_failed',
        });
        reply.code(500).send({ error: 'Failed to perform strategic analysis' });
      }
    }
  );

  /**
   * GET /api/analytics/strategic-recommendations/:id
   * Retrieves a specific recommendation by ID
   */
  fastify.get<GetRecommendationParams>(
    '/:id',
    {
      schema: {
        description: 'Get a specific strategic recommendation by ID',
        tags: ['strategic-recommendations'],
        params: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
          },
          required: ['id'],
        },
      },
    },
    async (request: FastifyRequest<GetRecommendationParams>, reply: FastifyReply) => {
      const { id } = request.params;

      try {
        if (!fastify.db) {
          reply.code(503).send({ error: 'Database not configured' });
          return;
        }

        const result = await fastify.db.query(
          `SELECT
             recommendation_id, category, priority, title, description, rationale,
             supporting_correlations, supporting_trends, expected_impact, confidence,
             time_horizon, metadata, generated_at, execution_ref
           FROM strategic_recommendations
           WHERE recommendation_id = $1`,
          [id]
        );

        if (result.rows.length === 0) {
          reply.code(404).send({ error: 'Recommendation not found' });
          return;
        }

        const row = result.rows[0];
        const recommendation = {
          recommendationId: row.recommendation_id,
          category: row.category,
          priority: row.priority,
          title: row.title,
          description: row.description,
          rationale: row.rationale,
          supportingCorrelations: JSON.parse(row.supporting_correlations),
          supportingTrends: JSON.parse(row.supporting_trends),
          expectedImpact: JSON.parse(row.expected_impact),
          confidence: row.confidence,
          timeHorizon: row.time_horizon,
          metadata: JSON.parse(row.metadata),
          generatedAt: row.generated_at,
          executionRef: row.execution_ref,
        };

        // Validate the recommendation
        StrategicRecommendationSchema.parse(recommendation);

        reply.send(recommendation);
      } catch (err) {
        fastify.log.error({ err, id }, 'Failed to get recommendation');
        reply.code(500).send({ error: 'Failed to get recommendation' });
      }
    }
  );

  /**
   * GET /api/analytics/strategic-recommendations
   * Lists recent recommendations with pagination and filtering
   */
  fastify.get<ListRecommendationsQuery>(
    '/',
    {
      schema: {
        description: 'List strategic recommendations with filtering and pagination',
        tags: ['strategic-recommendations'],
        querystring: {
          type: 'object',
          properties: {
            limit: { type: 'number', minimum: 1, maximum: 100, default: 20 },
            offset: { type: 'number', minimum: 0, default: 0 },
            start_time: { type: 'string', format: 'date-time' },
            end_time: { type: 'string', format: 'date-time' },
            category: {
              type: 'string',
              enum: [
                'cost-optimization',
                'performance-improvement',
                'risk-mitigation',
                'capacity-planning',
                'governance-compliance',
                'strategic-initiative',
              ],
            },
            priority: {
              type: 'string',
              enum: ['critical', 'high', 'medium', 'low'],
            },
          },
        },
      },
    },
    async (request: FastifyRequest<ListRecommendationsQuery>, reply: FastifyReply) => {
      const query = request.query;
      const limit = query.limit || 20;
      const offset = query.offset || 0;

      try {
        if (!fastify.db) {
          reply.code(503).send({ error: 'Database not configured' });
          return;
        }

        let sql = `
          SELECT
            recommendation_id, category, priority, title, description, rationale,
            supporting_correlations, supporting_trends, expected_impact, confidence,
            time_horizon, metadata, generated_at, execution_ref
          FROM strategic_recommendations
          WHERE 1=1
        `;
        const params: any[] = [];
        let paramIndex = 1;

        if (query.start_time) {
          sql += ` AND generated_at >= $${paramIndex}`;
          params.push(new Date(query.start_time));
          paramIndex++;
        }

        if (query.end_time) {
          sql += ` AND generated_at <= $${paramIndex}`;
          params.push(new Date(query.end_time));
          paramIndex++;
        }

        if (query.category) {
          sql += ` AND category = $${paramIndex}`;
          params.push(query.category);
          paramIndex++;
        }

        if (query.priority) {
          sql += ` AND priority = $${paramIndex}`;
          params.push(query.priority);
          paramIndex++;
        }

        sql += ` ORDER BY generated_at DESC, priority DESC`;
        sql += ` LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
        params.push(limit, offset);

        const result = await fastify.db.query(sql, params);

        const recommendations = result.rows.map((row) => ({
          recommendationId: row.recommendation_id,
          category: row.category,
          priority: row.priority,
          title: row.title,
          description: row.description,
          rationale: row.rationale,
          supportingCorrelations: JSON.parse(row.supporting_correlations),
          supportingTrends: JSON.parse(row.supporting_trends),
          expectedImpact: JSON.parse(row.expected_impact),
          confidence: row.confidence,
          timeHorizon: row.time_horizon,
          metadata: JSON.parse(row.metadata),
          generatedAt: row.generated_at,
          executionRef: row.execution_ref,
        }));

        // Get total count for pagination
        const countResult = await fastify.db.query(
          'SELECT COUNT(*) FROM strategic_recommendations WHERE 1=1' +
            (query.start_time ? ' AND generated_at >= $1' : '') +
            (query.end_time ? ` AND generated_at <= $${query.start_time ? 2 : 1}` : '') +
            (query.category ? ` AND category = $${(query.start_time ? 1 : 0) + (query.end_time ? 1 : 0) + 1}` : '') +
            (query.priority
              ? ` AND priority = $${(query.start_time ? 1 : 0) + (query.end_time ? 1 : 0) + (query.category ? 1 : 0) + 1}`
              : ''),
          params.slice(0, -2)
        );

        reply.send({
          recommendations,
          total: parseInt(countResult.rows[0].count),
          limit,
          offset,
        });
      } catch (err) {
        fastify.log.error({ err }, 'Failed to list recommendations');
        reply.code(500).send({ error: 'Failed to list recommendations' });
      }
    }
  );

  /**
   * GET /api/analytics/strategic-recommendations/summary
   * Get executive summary of recent strategic insights
   */
  fastify.get<SummaryQuery>(
    '/summary',
    {
      schema: {
        description: 'Get executive summary of recent strategic recommendations',
        tags: ['strategic-recommendations'],
        querystring: {
          type: 'object',
          properties: {
            days: { type: 'number', minimum: 1, maximum: 90, default: 7 },
            priority: {
              type: 'string',
              enum: ['critical', 'high', 'medium', 'low'],
            },
          },
        },
      },
    },
    async (request: FastifyRequest<SummaryQuery>, reply: FastifyReply) => {
      const query = request.query;
      const days = query.days || 7;

      try {
        if (!fastify.db) {
          reply.code(503).send({ error: 'Database not configured' });
          return;
        }

        const startDate = new Date();
        startDate.setDate(startDate.getDate() - days);

        let sql = `
          SELECT
            category,
            priority,
            COUNT(*) as count,
            AVG(confidence) as avg_confidence,
            MAX(generated_at) as latest_generated
          FROM strategic_recommendations
          WHERE generated_at >= $1
        `;
        const params: any[] = [startDate];

        if (query.priority) {
          sql += ' AND priority = $2';
          params.push(query.priority);
        }

        sql += ' GROUP BY category, priority ORDER BY priority DESC, count DESC';

        const result = await fastify.db.query(sql, params);

        const summary = {
          period: {
            days,
            start: startDate.toISOString(),
            end: new Date().toISOString(),
          },
          totalRecommendations: result.rows.reduce((sum, row) => sum + parseInt(row.count), 0),
          byCategory: result.rows.map((row) => ({
            category: row.category,
            priority: row.priority,
            count: parseInt(row.count),
            avgConfidence: parseFloat(row.avg_confidence),
            latestGenerated: row.latest_generated,
          })),
          priorityBreakdown: await getPriorityBreakdown(fastify, startDate, query.priority),
          topRecommendations: await getTopRecommendations(fastify, startDate, query.priority, 5),
        };

        reply.send(summary);
      } catch (err) {
        fastify.log.error({ err }, 'Failed to get summary');
        reply.code(500).send({ error: 'Failed to get summary' });
      }
    }
  );
}

/**
 * Helper function to get priority breakdown
 */
async function getPriorityBreakdown(
  fastify: FastifyInstance,
  startDate: Date,
  priorityFilter?: string
): Promise<any> {
  let sql = `
    SELECT
      priority,
      COUNT(*) as count,
      AVG(confidence) as avg_confidence
    FROM strategic_recommendations
    WHERE generated_at >= $1
  `;
  const params: any[] = [startDate];

  if (priorityFilter) {
    sql += ' AND priority = $2';
    params.push(priorityFilter);
  }

  sql += ' GROUP BY priority ORDER BY CASE priority WHEN \'critical\' THEN 1 WHEN \'high\' THEN 2 WHEN \'medium\' THEN 3 WHEN \'low\' THEN 4 END';

  const result = await fastify.db.query(sql, params);

  return result.rows.map((row) => ({
    priority: row.priority,
    count: parseInt(row.count),
    avgConfidence: parseFloat(row.avg_confidence),
  }));
}

/**
 * Helper function to get top recommendations
 */
async function getTopRecommendations(
  fastify: FastifyInstance,
  startDate: Date,
  priorityFilter: string | undefined,
  limit: number
): Promise<any[]> {
  let sql = `
    SELECT
      recommendation_id, category, priority, title, confidence, generated_at
    FROM strategic_recommendations
    WHERE generated_at >= $1
  `;
  const params: any[] = [startDate];

  if (priorityFilter) {
    sql += ' AND priority = $2';
    params.push(priorityFilter);
  }

  sql += ` ORDER BY priority DESC, confidence DESC, generated_at DESC LIMIT $${params.length + 1}`;
  params.push(limit);

  const result = await fastify.db.query(sql, params);

  return result.rows.map((row) => ({
    recommendationId: row.recommendation_id,
    category: row.category,
    priority: row.priority,
    title: row.title,
    confidence: row.confidence,
    generatedAt: row.generated_at,
  }));
}
