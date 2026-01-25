/**
 * Ecosystem Collaboration Agent Handler
 *
 * Edge function handler for the Ecosystem Collaboration Agent.
 * Emits exactly ONE DecisionEvent per invocation.
 *
 * This agent performs:
 * - Aggregation of ecosystem partner signals
 * - Indexing of collaboration metrics
 * - Cross-system analytics
 *
 * MUST NOT:
 * - Mutate state
 * - Commit actions
 * - Draw conclusions
 *
 * @module agents/ecosystem-collaboration/handler
 */

import { v4 as uuidv4 } from 'uuid';
import {
  AGENT_ID,
  AGENT_VERSION,
  SIGNAL_TYPES,
  PERFORMANCE_BUDGETS,
  EcosystemCollaborationInputSchema,
  EcosystemDecisionEventSchema,
  createInputsHash,
  type EcosystemCollaborationInput,
  type EcosystemCollaborationResponse,
  type EcosystemDecisionEvent,
  type EcosystemConstraint,
} from '../../contracts/ecosystem-collaboration-agent';
import { computeEcosystemAnalytics } from './computation';
import { getRuVectorClient } from '../ruvector-client';
import { logger } from '../../logger';

/**
 * Edge function request shape
 */
export interface EdgeFunctionRequest {
  body: unknown;
}

/**
 * Edge function response shape
 */
export interface EdgeFunctionResponse {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
}

/**
 * Standard response headers
 */
const RESPONSE_HEADERS = {
  'Content-Type': 'application/json',
  'X-Agent-Id': AGENT_ID,
  'X-Agent-Version': AGENT_VERSION,
};

/**
 * Handle ecosystem collaboration request
 *
 * Validates input, computes analytics, emits DecisionEvent, returns response.
 */
export async function handleEcosystemCollaborationRequest(
  request: EdgeFunctionRequest
): Promise<EdgeFunctionResponse> {
  const startTime = Date.now();
  const executionRef = uuidv4();

  try {
    // Step 1: Validate input
    const parseResult = EcosystemCollaborationInputSchema.safeParse(request.body);
    if (!parseResult.success) {
      logger.warn({
        msg: 'Ecosystem collaboration validation failed',
        errors: parseResult.error.errors,
      });
      return {
        statusCode: 400,
        headers: RESPONSE_HEADERS,
        body: JSON.stringify({
          success: false,
          error: {
            code: 'ECOSYSTEM_VALIDATION_FAILURE',
            message: 'Invalid input',
            details: parseResult.error.errors,
          },
        }),
      };
    }

    const input: EcosystemCollaborationInput = parseResult.data;

    // Step 2: Extract time range from signals
    const timestamps = input.signals.map(s => new Date(s.timestamp).getTime());
    const timeRange = {
      start: new Date(Math.min(...timestamps)).toISOString(),
      end: new Date(Math.max(...timestamps)).toISOString(),
    };

    // Step 3: Compute analytics
    const computeStart = Date.now();
    const computationOutput = computeEcosystemAnalytics(
      input.signals,
      input.crossSystemQueries,
      input.options,
      timeRange
    );
    const computationTimeMs = Date.now() - computeStart;
    const latencyMs = Date.now() - startTime;

    // Step 4: Check performance budget
    if (computationOutput.tokenEstimate > PERFORMANCE_BUDGETS.MAX_TOKENS) {
      logger.warn({
        msg: 'Token budget exceeded',
        tokenEstimate: computationOutput.tokenEstimate,
        maxTokens: PERFORMANCE_BUDGETS.MAX_TOKENS,
      });
    }

    if (latencyMs > PERFORMANCE_BUDGETS.MAX_LATENCY_MS) {
      logger.warn({
        msg: 'Latency budget exceeded',
        latencyMs,
        maxLatencyMs: PERFORMANCE_BUDGETS.MAX_LATENCY_MS,
      });
    }

    // Step 5: Build constraints applied
    const constraintsApplied: EcosystemConstraint[] = [
      {
        scope: 'ecosystem_collaboration',
        dataBoundaries: {
          startTime: timeRange.start,
          endTime: timeRange.end,
          systems: [...new Set(input.signals.map(s => s.sourceSystem))],
        },
        performanceBudget: {
          maxTokens: PERFORMANCE_BUDGETS.MAX_TOKENS,
          maxLatencyMs: PERFORMANCE_BUDGETS.MAX_LATENCY_MS,
        },
      },
    ];

    // Step 6: Determine primary decision type based on output
    let decisionType: 'consensus_signal' | 'aggregation_signal' | 'strategic_signal';
    if (computationOutput.strategic.signals.length > 0) {
      decisionType = SIGNAL_TYPES.STRATEGIC_SIGNAL as 'strategic_signal';
    } else if (computationOutput.consensus.signals.length > 0) {
      decisionType = SIGNAL_TYPES.CONSENSUS_SIGNAL as 'consensus_signal';
    } else {
      decisionType = SIGNAL_TYPES.AGGREGATION_SIGNAL as 'aggregation_signal';
    }

    // Step 7: Create DecisionEvent
    const decisionEvent: EcosystemDecisionEvent = {
      agent_id: AGENT_ID,
      agent_version: AGENT_VERSION,
      decision_type: decisionType,
      inputs_hash: createInputsHash(input),
      outputs: {
        aggregationSignals: computationOutput.aggregation.signals,
        consensusSignals: computationOutput.consensus.signals,
        strategicSignals: computationOutput.strategic.signals,
        indexEntriesUpdated: computationOutput.aggregation.indexEntries.length,
      },
      confidence: computationOutput.confidence,
      constraints_applied: constraintsApplied,
      execution_ref: input.executionRef || executionRef,
      timestamp: new Date().toISOString(),
    };

    // Validate DecisionEvent before persisting
    EcosystemDecisionEventSchema.parse(decisionEvent);

    // Step 8: Persist DecisionEvent via ruvector-service
    let decisionEventId: string | undefined;
    try {
      const ruvector = getRuVectorClient();
      decisionEventId = await ruvector.storeDecisionEvent(decisionEvent as any);
      logger.info({
        msg: 'DecisionEvent persisted',
        decisionEventId,
        agentId: AGENT_ID,
        executionRef: decisionEvent.execution_ref,
      });
    } catch (persistError) {
      logger.error({
        msg: 'Failed to persist DecisionEvent',
        error: persistError instanceof Error ? persistError.message : String(persistError),
        agentId: AGENT_ID,
      });
      // Continue - persistence failure should not block response
    }

    // Step 9: Build response
    const response: EcosystemCollaborationResponse = {
      success: true,
      requestId: input.requestId,
      aggregationSignals: computationOutput.aggregation.signals,
      consensusSignals: computationOutput.consensus.signals,
      strategicSignals: computationOutput.strategic.signals,
      indexEntries: computationOutput.aggregation.indexEntries,
      processingMetadata: {
        signalsProcessed: input.signals.length,
        computationTimeMs,
        tokenCount: computationOutput.tokenEstimate,
        latencyMs,
      },
      decisionEventId,
    };

    logger.info({
      msg: 'Ecosystem collaboration completed',
      requestId: input.requestId,
      signalsProcessed: input.signals.length,
      aggregationSignals: response.aggregationSignals.length,
      consensusSignals: response.consensusSignals.length,
      strategicSignals: response.strategicSignals.length,
      latencyMs,
    });

    return {
      statusCode: 200,
      headers: RESPONSE_HEADERS,
      body: JSON.stringify(response),
    };
  } catch (error) {
    logger.error({
      msg: 'Ecosystem collaboration failed',
      error: error instanceof Error ? error.message : String(error),
      executionRef,
    });

    return {
      statusCode: 500,
      headers: RESPONSE_HEADERS,
      body: JSON.stringify({
        success: false,
        error: {
          code: 'ECOSYSTEM_COMPUTATION_ERROR',
          message: error instanceof Error ? error.message : 'Internal error',
        },
      }),
    };
  }
}

/**
 * Health check for the Ecosystem Collaboration Agent
 */
export async function healthCheck(): Promise<EdgeFunctionResponse> {
  const startTime = Date.now();

  try {
    const ruvector = getRuVectorClient();
    const ruvectorHealth = await ruvector.healthCheck();

    return {
      statusCode: 200,
      headers: RESPONSE_HEADERS,
      body: JSON.stringify({
        status: 'healthy',
        agent_id: AGENT_ID,
        agent_version: AGENT_VERSION,
        ruvector_latency_ms: ruvectorHealth.latencyMs,
        ruvector_healthy: ruvectorHealth.healthy,
        timestamp: new Date().toISOString(),
        performance_budgets: PERFORMANCE_BUDGETS,
      }),
    };
  } catch (error) {
    return {
      statusCode: 503,
      headers: RESPONSE_HEADERS,
      body: JSON.stringify({
        status: 'unhealthy',
        agent_id: AGENT_ID,
        agent_version: AGENT_VERSION,
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString(),
      }),
    };
  }
}
