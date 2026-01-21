/**
 * Consensus Agent - Edge Function Handler
 *
 * Google Cloud Edge Function handler for the Consensus Agent.
 * Performs analytical synthesis and consensus formation across signals.
 *
 * Classification: ANALYTICAL SYNTHESIS / CONSENSUS / CROSS-SIGNAL AGGREGATION
 *
 * CRITICAL CONSTRAINTS:
 * - Stateless execution
 * - No execution interception
 * - No orchestration logic
 * - No enforcement logic
 * - No direct SQL access
 * - Async, non-blocking writes via ruvector-service only
 * - Emits exactly ONE DecisionEvent per invocation
 *
 * @module agents/consensus/handler
 */

import { v4 as uuidv4 } from 'uuid';
import {
  AGENT_ID,
  AGENT_VERSION,
  DECISION_TYPE,
  ConsensusInputSchema,
  ConsensusResponse,
  ConsensusInput,
  FAILURE_MODES,
} from '../../contracts/consensus-agent';
import {
  DecisionEvent,
  createInputsHash,
} from '../../contracts/decision-event';
import {
  computeConsensus,
  buildConstraintsApplied,
  buildConsensusOutput,
} from './computation';
import { getRuVectorClient } from '../../services/ruvector-client';
import { getTelemetryEmitter } from '../../services/telemetry-emitter';
import { logger } from '../../logger';

/**
 * Edge Function request interface
 */
export interface EdgeFunctionRequest {
  body: unknown;
  headers?: Record<string, string>;
  method?: string;
}

/**
 * Edge Function response interface
 */
export interface EdgeFunctionResponse {
  statusCode: number;
  body: string;
  headers: Record<string, string>;
}

/**
 * Error response structure
 */
interface ErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
  [key: string]: unknown; // Allow index signature for Record compatibility
}

/**
 * Consensus Agent Edge Function Handler
 *
 * Entry point for Google Cloud Edge Function deployment.
 * Handles incoming requests, validates input, computes consensus,
 * emits DecisionEvent, and returns response.
 *
 * @param request - The incoming Edge Function request
 * @returns Edge Function response
 */
export async function handleConsensusRequest(
  request: EdgeFunctionRequest
): Promise<EdgeFunctionResponse> {
  const executionRef = uuidv4();
  const startTime = Date.now();
  const telemetry = getTelemetryEmitter();
  const ruvector = getRuVectorClient();

  // Emit invocation started telemetry
  telemetry.emitInvocationStarted(AGENT_ID, AGENT_VERSION, executionRef);

  try {
    // 1. Validate input
    const validationResult = ConsensusInputSchema.safeParse(request.body);
    if (!validationResult.success) {
      const error = createErrorResponse(
        FAILURE_MODES.VALIDATION_FAILURE.code,
        'Invalid input: ' + validationResult.error.message,
        validationResult.error.issues
      );
      return createResponse(400, error);
    }

    const input: ConsensusInput = {
      ...validationResult.data,
      executionRef: validationResult.data.executionRef || executionRef,
    };

    // 2. Check for sufficient signals
    if (input.signals.length === 0) {
      const error = createErrorResponse(
        FAILURE_MODES.INSUFFICIENT_SIGNALS.code,
        'No signals provided for consensus computation'
      );
      return createResponse(400, error);
    }

    // 3. Compute consensus
    logger.info({
      msg: 'Computing consensus',
      executionRef,
      signalCount: input.signals.length,
      method: input.options.aggregationMethod,
    });

    const computationResult = computeConsensus(input);

    // 4. Build DecisionEvent (exactly ONE per invocation)
    const decisionEvent: DecisionEvent = {
      agent_id: AGENT_ID,
      agent_version: AGENT_VERSION,
      decision_type: DECISION_TYPE,
      inputs_hash: createInputsHash(input),
      outputs: buildConsensusOutput(computationResult),
      confidence: computationResult.confidence,
      constraints_applied: buildConstraintsApplied(input),
      execution_ref: executionRef,
      timestamp: new Date().toISOString(),
    };

    // 5. Persist DecisionEvent to ruvector-service (async, non-blocking)
    try {
      await ruvector.persistDecisionEvent(decisionEvent);
      telemetry.emitDecisionEventEmitted(
        AGENT_ID,
        AGENT_VERSION,
        executionRef,
        DECISION_TYPE,
        computationResult.confidence
      );
    } catch (persistError) {
      // Log persistence failure but don't fail the request
      // The DecisionEvent was computed successfully
      logger.error({
        msg: 'Failed to persist DecisionEvent',
        executionRef,
        error: persistError instanceof Error ? persistError.message : String(persistError),
      });
      // Note: We still return success since computation completed
      // The persistence failure is logged for operational awareness
    }

    // 6. Build response
    const consensusAchieved =
      computationResult.agreementLevel >= input.options.minAgreementThreshold;

    const response: ConsensusResponse = {
      consensusAchieved,
      decisionEvent,
      summary: generateSummary(computationResult, consensusAchieved),
      processingMetadata: {
        signalsProcessed: computationResult.totalSignals,
        computationTimeMs: computationResult.computationTimeMs,
        method: computationResult.method,
      },
    };

    // 7. Emit completion telemetry
    const durationMs = Date.now() - startTime;
    telemetry.emitInvocationCompleted(AGENT_ID, AGENT_VERSION, executionRef, durationMs, {
      consensusAchieved,
      signalsProcessed: computationResult.totalSignals,
      agreementLevel: computationResult.agreementLevel,
      confidence: computationResult.confidence,
    });

    logger.info({
      msg: 'Consensus computation completed',
      executionRef,
      consensusAchieved,
      agreementLevel: computationResult.agreementLevel,
      confidence: computationResult.confidence,
      durationMs,
    });

    return createResponse(200, { success: true, ...response });

  } catch (error) {
    const durationMs = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : String(error);

    telemetry.emitInvocationFailed(
      AGENT_ID,
      AGENT_VERSION,
      executionRef,
      error instanceof Error ? error : new Error(errorMessage),
      durationMs
    );

    logger.error({
      msg: 'Consensus computation failed',
      executionRef,
      error: errorMessage,
      durationMs,
    });

    const errorResponse = createErrorResponse(
      FAILURE_MODES.COMPUTATION_ERROR.code,
      'Consensus computation failed: ' + errorMessage
    );

    return createResponse(500, errorResponse);
  }
}

/**
 * Create HTTP response
 */
function createResponse(
  statusCode: number,
  body: Record<string, unknown>
): EdgeFunctionResponse {
  return {
    statusCode,
    body: JSON.stringify(body),
    headers: {
      'Content-Type': 'application/json',
      'X-Agent-Id': AGENT_ID,
      'X-Agent-Version': AGENT_VERSION,
    },
  };
}

/**
 * Create error response structure
 */
function createErrorResponse(
  code: string,
  message: string,
  details?: unknown
): ErrorResponse {
  return {
    success: false,
    error: {
      code,
      message,
      ...(details ? { details } : {}),
    },
  };
}

/**
 * Generate human-readable summary
 */
function generateSummary(
  result: ReturnType<typeof computeConsensus>,
  consensusAchieved: boolean
): string {
  const parts: string[] = [];

  if (consensusAchieved) {
    parts.push(`Consensus achieved across ${result.totalSignals} signals.`);
  } else {
    parts.push(`Consensus not achieved (threshold not met).`);
  }

  parts.push(
    `Agreement level: ${(result.agreementLevel * 100).toFixed(1)}% ` +
    `(${result.agreementCount}/${result.totalSignals} signals agree).`
  );

  if (typeof result.consensusValue === 'number') {
    parts.push(`Consensus value: ${result.consensusValue.toFixed(4)}.`);
  }

  if (result.divergentSignals.length > 0) {
    parts.push(`${result.divergentSignals.length} divergent signal(s) identified.`);
  }

  parts.push(`Confidence: ${(result.confidence * 100).toFixed(1)}%.`);

  return parts.join(' ');
}

/**
 * Export for Google Cloud Functions
 */
export const consensus = handleConsensusRequest;

/**
 * Health check endpoint for Edge Function
 */
export async function healthCheck(): Promise<EdgeFunctionResponse> {
  const ruvector = getRuVectorClient();
  const health = await ruvector.healthCheck();

  return createResponse(health.healthy ? 200 : 503, {
    status: health.healthy ? 'healthy' : 'unhealthy',
    agent_id: AGENT_ID,
    agent_version: AGENT_VERSION,
    ruvector_latency_ms: health.latencyMs,
    timestamp: new Date().toISOString(),
  });
}
