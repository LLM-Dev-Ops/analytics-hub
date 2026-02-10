/**
 * Fastify Execution Context Plugin
 *
 * Hooks into the Fastify request lifecycle to:
 * 1. Extract execution context (execution_id, parent_span_id) from headers
 * 2. Create an ExecutionGraph per request
 * 3. Validate and wrap responses with the span hierarchy
 *
 * Enforces the Agentics contract: every non-operational request must
 * carry a parent_span_id and produce at least one agent span.
 */

import fp from 'fastify-plugin';
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { v4 as uuidv4 } from 'uuid';
import { ExecutionGraph } from './execution-graph';
import type { ExecutionContext } from './span-types';

const HEADER_EXECUTION_ID = 'x-execution-id';
const HEADER_PARENT_SPAN_ID = 'x-parent-span-id';

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Operational paths that are excluded from execution context enforcement.
 */
function isOperationalPath(url: string): boolean {
  const path = url.split('?')[0];

  // Top-level operational endpoints
  if (
    path === '/health' ||
    path === '/ready' ||
    path === '/metrics'
  ) {
    return true;
  }

  // Swagger documentation
  if (path.startsWith('/documentation')) return true;

  // Agent health and metadata sub-routes (introspection, not execution)
  if (path.endsWith('/health') || path.endsWith('/metadata')) return true;

  return false;
}

async function executionContextPlugin(fastify: FastifyInstance) {
  // Decorate request with executionGraph (null by default)
  fastify.decorateRequest('executionGraph', null);

  // ── onRequest: extract context, reject if missing ──────────

  fastify.addHook(
    'onRequest',
    async (request: FastifyRequest, reply: FastifyReply) => {
      if (isOperationalPath(request.url)) return;

      const parentSpanId = request.headers[HEADER_PARENT_SPAN_ID] as
        | string
        | undefined;
      const executionId = request.headers[HEADER_EXECUTION_ID] as
        | string
        | undefined;

      if (!parentSpanId) {
        reply.code(400).send({
          success: false,
          error: {
            code: 'MISSING_EXECUTION_CONTEXT',
            message:
              'x-parent-span-id header is required for all non-operational requests',
          },
        });
        return;
      }

      if (!UUID_REGEX.test(parentSpanId)) {
        reply.code(400).send({
          success: false,
          error: {
            code: 'INVALID_EXECUTION_CONTEXT',
            message: 'x-parent-span-id must be a valid UUID',
          },
        });
        return;
      }

      const context: ExecutionContext = {
        execution_id: executionId && UUID_REGEX.test(executionId)
          ? executionId
          : uuidv4(),
        parent_span_id: parentSpanId,
      };

      request.executionGraph = new ExecutionGraph(context, 'analytics-hub');
    },
  );

  // ── onSend: validate graph and wrap response ───────────────

  fastify.addHook(
    'onSend',
    async (
      request: FastifyRequest,
      reply: FastifyReply,
      payload: unknown,
    ) => {
      if (!request.executionGraph) return payload;

      const graph = request.executionGraph;
      graph.finalize(reply.statusCode < 400 ? 'ok' : 'error');

      const validation = graph.validate();
      if (!validation.valid) {
        // Invariant violation: no agent spans emitted.
        // Mark repo span as failed and return 500.
        graph.finalize('error');
        reply.code(500);
        return JSON.stringify({
          success: false,
          error: {
            code: 'EXECUTION_INVARIANT_VIOLATION',
            message: validation.error,
          },
          _execution: graph.toHierarchy(),
        });
      }

      // Wrap JSON responses with _execution
      let parsed: Record<string, unknown> | null = null;
      try {
        parsed =
          typeof payload === 'string' ? JSON.parse(payload) : null;
      } catch {
        // Not JSON — attach trace via header
      }

      if (parsed && typeof parsed === 'object') {
        return JSON.stringify({
          ...parsed,
          _execution: graph.toHierarchy(),
        });
      }

      // Non-JSON payload: put trace in header
      reply.header(
        'x-execution-trace',
        JSON.stringify(graph.toHierarchy()),
      );
      return payload;
    },
  );
}

export default fp(executionContextPlugin, {
  name: 'execution-context',
  fastify: '4.x',
});
