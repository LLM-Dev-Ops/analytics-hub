/**
 * Cloud Function Entry Point — analytics-hub-agents
 *
 * Maps the two Analytics Hub agents to Cloud Function routes:
 *   POST /v1/analytics-hub/consensus       → Consensus Agent
 *   POST /v1/analytics-hub/recommendation  → Strategic Recommendation Agent
 *   GET  /v1/analytics-hub/health          → Health check
 *
 * Every response includes execution_metadata and layers_executed.
 * Business logic is delegated entirely to existing agent modules.
 *
 * @module functions/handler
 */

import crypto from 'crypto';
import { handleConsensusRequest } from '../agents/consensus/handler';
import { analyze as analyzeRecommendation } from '../agents/strategic-recommendation/agent';
import type { StrategicRecommendationInput } from '../agents/strategic-recommendation/types';
import { logger } from '../logger';

// ── Types ──────────────────────────────────────────────────────

interface ExecutionMetadata {
  trace_id: string;
  timestamp: string;
  service: string;
  execution_id: string;
}

interface LayerExecuted {
  layer: string;
  status: 'completed' | 'error';
  duration_ms?: number;
}

/**
 * Cloud Function HTTP request (Express-compatible shape provided by the runtime)
 */
interface CFRequest {
  method: string;
  path: string;
  url: string;
  body: any;
  headers: Record<string, string | string[] | undefined>;
}

/**
 * Cloud Function HTTP response (Express-compatible shape provided by the runtime)
 */
interface CFResponse {
  status(code: number): CFResponse;
  set(key: string, value: string): CFResponse;
  json(data: unknown): void;
  send(data: string): void;
  end(): void;
}

// ── Helpers ────────────────────────────────────────────────────

function buildExecutionMetadata(req: CFRequest): ExecutionMetadata {
  const correlationHeader = req.headers['x-correlation-id'];
  const traceId = (Array.isArray(correlationHeader) ? correlationHeader[0] : correlationHeader)
    || crypto.randomUUID();

  return {
    trace_id: traceId,
    timestamp: new Date().toISOString(),
    service: 'analytics-hub-agents',
    execution_id: crypto.randomUUID(),
  };
}

function setCorsHeaders(res: CFResponse): void {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.set(
    'Access-Control-Allow-Headers',
    'Content-Type, Authorization, x-correlation-id, x-parent-span-id, x-execution-id, x-api-key',
  );
  res.set('Access-Control-Max-Age', '3600');
}

function sendJson(
  res: CFResponse,
  statusCode: number,
  body: Record<string, unknown>,
  meta: ExecutionMetadata,
  layers: LayerExecuted[],
): void {
  res.status(statusCode).json({
    ...body,
    execution_metadata: meta,
    layers_executed: layers,
  });
}

// ── Route Handlers ─────────────────────────────────────────────

async function handleHealth(
  _req: CFRequest,
  res: CFResponse,
  meta: ExecutionMetadata,
): Promise<void> {
  sendJson(res, 200, {
    status: 'healthy',
    agents: ['consensus', 'recommendation'],
    timestamp: new Date().toISOString(),
  }, meta, [
    { layer: 'AGENT_ROUTING', status: 'completed' },
  ]);
}

async function handleConsensus(
  req: CFRequest,
  res: CFResponse,
  meta: ExecutionMetadata,
): Promise<void> {
  const startTime = Date.now();
  try {
    const result = await handleConsensusRequest({
      body: req.body,
      headers: req.headers as Record<string, string>,
    });
    const responseBody = JSON.parse(result.body);
    const durationMs = Date.now() - startTime;

    sendJson(res, result.statusCode, responseBody, meta, [
      { layer: 'AGENT_ROUTING', status: 'completed' },
      { layer: 'ANALYTICS_HUB_CONSENSUS', status: 'completed', duration_ms: durationMs },
    ]);
  } catch (error) {
    const durationMs = Date.now() - startTime;
    logger.error({ err: error }, 'Consensus agent execution failed');

    sendJson(res, 500, {
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Consensus agent execution failed' },
    }, meta, [
      { layer: 'AGENT_ROUTING', status: 'completed' },
      { layer: 'ANALYTICS_HUB_CONSENSUS', status: 'error', duration_ms: durationMs },
    ]);
  }
}

async function handleRecommendation(
  req: CFRequest,
  res: CFResponse,
  meta: ExecutionMetadata,
): Promise<void> {
  const startTime = Date.now();
  try {
    const body = req.body || {};

    // Build agent input, accepting both snake_case (API) and camelCase (internal) field names.
    const agentInput = {
      request_id: body.request_id || meta.execution_id,
      timeWindow: {
        startTime: body.start_time || body.timeWindow?.startTime,
        endTime: body.end_time || body.timeWindow?.endTime,
      },
      time_range: {
        start: body.start_time || body.time_range?.start || body.timeWindow?.startTime,
        end: body.end_time || body.time_range?.end || body.timeWindow?.endTime,
      },
      sourceLayers: body.domains || body.sourceLayers || ['observatory', 'cost-ops', 'governance', 'consensus'],
      minConfidence: body.min_confidence ?? body.minConfidence ?? 0.5,
      maxRecommendations: body.max_recommendations ?? body.maxRecommendations ?? 10,
      focusCategories: body.focus_areas || body.focusCategories,
      executionRef: meta.execution_id,
    } as StrategicRecommendationInput;

    if (!agentInput.timeWindow.startTime || !agentInput.timeWindow.endTime) {
      const durationMs = Date.now() - startTime;
      sendJson(res, 400, {
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'start_time and end_time are required (or timeWindow.startTime / timeWindow.endTime)',
        },
      }, meta, [
        { layer: 'AGENT_ROUTING', status: 'completed' },
        { layer: 'ANALYTICS_HUB_RECOMMENDATION', status: 'error', duration_ms: durationMs },
      ]);
      return;
    }

    const { output, event } = await analyzeRecommendation(agentInput);
    const durationMs = Date.now() - startTime;

    sendJson(res, 200, {
      ...output,
      decision_event: event,
    }, meta, [
      { layer: 'AGENT_ROUTING', status: 'completed' },
      { layer: 'ANALYTICS_HUB_RECOMMENDATION', status: 'completed', duration_ms: durationMs },
    ]);
  } catch (error) {
    const durationMs = Date.now() - startTime;
    logger.error({ err: error }, 'Recommendation agent execution failed');

    sendJson(res, 500, {
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Recommendation agent execution failed' },
    }, meta, [
      { layer: 'AGENT_ROUTING', status: 'completed' },
      { layer: 'ANALYTICS_HUB_RECOMMENDATION', status: 'error', duration_ms: durationMs },
    ]);
  }
}

// ── Main Entry Point ───────────────────────────────────────────

/**
 * Google Cloud Function HTTP handler.
 *
 * Deploy with:
 *   gcloud functions deploy analytics-hub-agents \
 *     --runtime nodejs20 --trigger-http --region us-central1 \
 *     --project agentics-dev --entry-point handler \
 *     --memory 512MB --timeout 120s --no-allow-unauthenticated
 */
export async function handler(req: CFRequest, res: CFResponse): Promise<void> {
  setCorsHeaders(res);

  // CORS preflight
  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }

  const meta = buildExecutionMetadata(req);
  const path = req.path || req.url;

  // ── Health ──────────────────────────────────────────────────
  if (path === '/v1/analytics-hub/health' && req.method === 'GET') {
    return handleHealth(req, res, meta);
  }

  // ── Consensus Agent ─────────────────────────────────────────
  if (path === '/v1/analytics-hub/consensus' && req.method === 'POST') {
    return handleConsensus(req, res, meta);
  }

  // ── Strategic Recommendation Agent ──────────────────────────
  if (path === '/v1/analytics-hub/recommendation' && req.method === 'POST') {
    return handleRecommendation(req, res, meta);
  }

  // ── 404 ─────────────────────────────────────────────────────
  sendJson(res, 404, {
    success: false,
    error: {
      code: 'NOT_FOUND',
      message: `Route not found: ${req.method} ${path}`,
      available_routes: [
        'GET  /v1/analytics-hub/health',
        'POST /v1/analytics-hub/consensus',
        'POST /v1/analytics-hub/recommendation',
      ],
    },
  }, meta, [
    { layer: 'AGENT_ROUTING', status: 'error' },
  ]);
}
