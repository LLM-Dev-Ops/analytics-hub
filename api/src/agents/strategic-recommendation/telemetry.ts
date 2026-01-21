/**
 * Strategic Recommendation Agent - Telemetry Emission
 *
 * Emits telemetry events compatible with LLM-Observatory format.
 * Tracks agent invocation metrics, recommendation generation, correlation detection,
 * and decision event persistence with OpenTelemetry support.
 *
 * @module agents/strategic-recommendation/telemetry
 */

import { v4 as uuidv4 } from 'uuid';
import { logger } from '../../logger';
import { getTelemetryEmitter, TelemetryEmitter } from '../../services/telemetry-emitter';
import {
  AnalyticsEvent,
  CommonEventFields,
  EventType,
  EventPayload,
  LatencyMetrics,
  TelemetryPayload,
  SourceModule,
  Severity,
  SCHEMA_VERSION,
  ErrorMetrics,
} from '../../types/events';
import {
  StrategicRecommendation,
  CrossDomainCorrelation,
  TrendAnalysis,
  StrategicRecommendationOutput,
} from './types';

/**
 * Telemetry context for request tracing
 */
export interface TelemetryContext {
  executionId: string;
  correlationId: string;
  parentEventId?: string;
  agentId: string;
  agentVersion: string;
  environment: string;
  tags: Record<string, string>;
}

/**
 * Agent invocation metrics
 */
export interface AgentInvocationMetrics {
  totalLatencyMs: number;
  inputSize: number;
  outputSize: number;
  success: boolean;
  errorCode?: string;
  errorMessage?: string;
  tags?: Record<string, string>;
}

/**
 * Recommendation generation metrics
 */
export interface RecommendationMetrics {
  count: number;
  confidenceDistribution: {
    veryLow: number;
    low: number;
    medium: number;
    high: number;
    veryHigh: number;
  };
  byCategory: Record<string, number>;
  byPriority: Record<string, number>;
  averageConfidence: number;
}

/**
 * Correlation detection performance metrics
 */
export interface CorrelationDetectionMetrics {
  totalCorrelationsFound: number;
  correlationsByStrength: {
    weak: number;
    moderate: number;
    strong: number;
  };
  averageCorrelationCoefficient: number;
  detectionDurationMs: number;
}

/**
 * Strategic Recommendation Agent Telemetry Manager
 *
 * Handles telemetry emission compatible with LLM-Observatory format.
 * Provides methods to track agent invocation, recommendation generation,
 * correlation detection, and decision event persistence.
 */
export class StrategicRecommendationTelemetry {
  private emitter: TelemetryEmitter;
  private context: TelemetryContext;

  constructor(context: TelemetryContext, emitterConfig?: any) {
    this.context = context;
    this.emitter = getTelemetryEmitter(emitterConfig);
  }

  /**
   * Create common event fields for all analytics events
   */
  private createCommonEventFields(): CommonEventFields {
    return {
      event_id: uuidv4(),
      timestamp: new Date().toISOString(),
      source_module: SourceModule.LlmAnalyticsHub,
      event_type: EventType.Telemetry,
      correlation_id: this.context.correlationId,
      parent_event_id: this.context.parentEventId,
      schema_version: SCHEMA_VERSION,
      severity: Severity.Info,
      environment: this.context.environment,
      tags: {
        ...this.context.tags,
        agent_id: this.context.agentId,
        agent_version: this.context.agentVersion,
      },
    };
  }

  /**
   * Emit agent invocation metrics
   *
   * Tracks the latency, input/output size, and success status of agent invocations.
   *
   * @param input - Input data to the agent
   * @param output - Output data from the agent
   * @param durationMs - Execution duration in milliseconds
   * @param success - Whether the invocation was successful
   * @param error - Optional error information
   */
  emitAgentInvocation(
    input: unknown,
    output: unknown,
    durationMs: number,
    success: boolean,
    error?: Error
  ): void {
    try {
      const inputSize = this.calculateDataSize(input);
      const outputSize = this.calculateDataSize(output);

      const metrics: LatencyMetrics = {
        model_id: this.context.agentId,
        request_id: this.context.executionId,
        total_latency_ms: durationMs,
        breakdown: {
          processing_ms: durationMs,
        },
      };

      const telemetryPayload: TelemetryPayload = {
        type: 'latency',
        data: metrics,
      };

      const payload: EventPayload = {
        payload_type: 'telemetry',
        data: telemetryPayload,
      };

      const event: AnalyticsEvent = {
        ...this.createCommonEventFields(),
        payload,
      };

      // Add metadata
      event.tags = {
        ...event.tags,
        input_size: inputSize.toString(),
        output_size: outputSize.toString(),
        success: success.toString(),
        ...(error && { error_code: error.name, error_message: error.message }),
      };

      // Emit to Observatory via base telemetry emitter
      this.emitter.emit({
        eventType: success ? 'agent_invocation_completed' : 'agent_invocation_failed',
        agentId: this.context.agentId,
        agentVersion: this.context.agentVersion,
        executionRef: this.context.executionId,
        durationMs,
        metadata: {
          inputSize,
          outputSize,
          eventId: event.event_id,
          correlationId: this.context.correlationId,
        },
        ...(error && {
          error: {
            code: error.name,
            message: error.message,
            stack: error.stack,
          },
        }),
      });

      logger.info(
        {
          msg: 'Agent invocation metrics emitted',
          agentId: this.context.agentId,
          executionId: this.context.executionId,
          durationMs,
          inputSize,
          outputSize,
          success,
        },
        'Agent invocation'
      );
    } catch (err) {
      logger.warn(
        {
          msg: 'Failed to emit agent invocation telemetry',
          error: err instanceof Error ? err.message : String(err),
          agentId: this.context.agentId,
        },
        'Telemetry error'
      );
    }
  }

  /**
   * Emit recommendation generation metrics
   *
   * Tracks the number of recommendations generated, confidence distribution,
   * and categorization of recommendations.
   *
   * @param recommendations - Array of generated recommendations
   */
  emitRecommendationGenerated(recommendations: StrategicRecommendation[]): void {
    try {
      const metrics = this.calculateRecommendationMetrics(recommendations);

      const payload: EventPayload = {
        payload_type: 'telemetry',
        data: {
          type: 'token_usage',
          data: {
            model_id: this.context.agentId,
            request_id: this.context.executionId,
            prompt_tokens: 0,
            completion_tokens: 0,
            total_tokens: recommendations.length,
            estimated_cost: undefined,
          },
        },
      };

      const event: AnalyticsEvent = {
        ...this.createCommonEventFields(),
        payload,
      };

      event.tags = {
        ...event.tags,
        recommendation_count: metrics.count.toString(),
        avg_confidence: metrics.averageConfidence.toFixed(2),
        categories: Object.entries(metrics.byCategory)
          .map(([cat, count]) => `${cat}:${count}`)
          .join(','),
        priorities: Object.entries(metrics.byPriority)
          .map(([pri, count]) => `${pri}:${count}`)
          .join(','),
      };

      // Emit decision event for each recommendation with high confidence
      recommendations
        .filter((rec) => rec.confidence >= 0.7)
        .forEach((rec) => {
          this.emitter.emitDecisionEventEmitted(
            this.context.agentId,
            this.context.agentVersion,
            this.context.executionId,
            `recommendation:${rec.category}`,
            rec.confidence
          );
        });

      logger.info(
        {
          msg: 'Recommendation generation metrics emitted',
          agentId: this.context.agentId,
          executionId: this.context.executionId,
          recommendationCount: metrics.count,
          averageConfidence: metrics.averageConfidence.toFixed(2),
          confidenceDistribution: metrics.confidenceDistribution,
        },
        'Recommendations generated'
      );
    } catch (err) {
      logger.warn(
        {
          msg: 'Failed to emit recommendation generation telemetry',
          error: err instanceof Error ? err.message : String(err),
          agentId: this.context.agentId,
        },
        'Telemetry error'
      );
    }
  }

  /**
   * Emit correlation detection performance metrics
   *
   * Tracks the performance of correlation detection including number of correlations,
   * strength distribution, and detection latency.
   *
   * @param correlations - Array of detected correlations
   * @param durationMs - Time taken to detect correlations
   */
  emitCorrelationDetected(
    correlations: CrossDomainCorrelation[],
    durationMs: number
  ): void {
    try {
      const metrics = this.calculateCorrelationMetrics(correlations, durationMs);

      const metrics_latency: LatencyMetrics = {
        model_id: this.context.agentId,
        request_id: this.context.executionId,
        total_latency_ms: durationMs,
        breakdown: {
          processing_ms: durationMs,
        },
      };

      const payload: EventPayload = {
        payload_type: 'telemetry',
        data: {
          type: 'latency',
          data: metrics_latency,
        },
      };

      const event: AnalyticsEvent = {
        ...this.createCommonEventFields(),
        payload,
      };

      event.tags = {
        ...event.tags,
        correlation_count: metrics.totalCorrelationsFound.toString(),
        weak_correlations: metrics.correlationsByStrength.weak.toString(),
        moderate_correlations: metrics.correlationsByStrength.moderate.toString(),
        strong_correlations: metrics.correlationsByStrength.strong.toString(),
        avg_correlation_coefficient: metrics.averageCorrelationCoefficient.toFixed(2),
        detection_duration_ms: durationMs.toString(),
      };

      logger.info(
        {
          msg: 'Correlation detection metrics emitted',
          agentId: this.context.agentId,
          executionId: this.context.executionId,
          totalCorrelationsFound: metrics.totalCorrelationsFound,
          correlationsByStrength: metrics.correlationsByStrength,
          averageCorrelationCoefficient: metrics.averageCorrelationCoefficient.toFixed(2),
          detectionDurationMs: durationMs,
        },
        'Correlations detected'
      );
    } catch (err) {
      logger.warn(
        {
          msg: 'Failed to emit correlation detection telemetry',
          error: err instanceof Error ? err.message : String(err),
          agentId: this.context.agentId,
        },
        'Telemetry error'
      );
    }
  }

  /**
   * Emit decision event persistence metrics
   *
   * Tracks the persistence of decision events to the database.
   * Used for auditability and compliance tracking.
   *
   * @param decisionEvent - The decision event being persisted
   * @param persistenceDurationMs - Time taken to persist
   * @param success - Whether persistence was successful
   */
  emitDecisionEventPersisted(
    decisionEvent: any,
    persistenceDurationMs: number,
    success: boolean
  ): void {
    try {
      const payload: EventPayload = {
        payload_type: 'governance',
        data: {
          type: 'audit',
          data: {
            action: 'decision_event_persisted',
            resource_type: 'decision_event',
            resource_id: decisionEvent.agent_id,
            user_id: 'system',
            success,
            ...(
              !success && {
                error_message: 'Failed to persist decision event',
              }
            ),
          },
        },
      };

      const event: AnalyticsEvent = {
        ...this.createCommonEventFields(),
        event_type: success ? EventType.Lifecycle : EventType.Audit,
        severity: success ? Severity.Info : Severity.Warning,
        payload,
      };

      event.tags = {
        ...event.tags,
        decision_type: decisionEvent.decision_type,
        confidence: decisionEvent.confidence.toString(),
        persistence_duration_ms: persistenceDurationMs.toString(),
        success: success.toString(),
      };

      // Emit to Observatory
      this.emitter.emit({
        eventType: success ? 'persistence_completed' : 'persistence_failed',
        agentId: this.context.agentId,
        agentVersion: this.context.agentVersion,
        executionRef: this.context.executionId,
        durationMs: persistenceDurationMs,
        metadata: {
          decisionEventId: decisionEvent.agent_id,
          eventId: event.event_id,
          correlationId: this.context.correlationId,
        },
        ...(
          !success && {
            error: {
              code: 'PERSISTENCE_FAILED',
              message: 'Failed to persist decision event to database',
            },
          }
        ),
      });

      logger.info(
        {
          msg: 'Decision event persistence metrics emitted',
          agentId: this.context.agentId,
          executionId: this.context.executionId,
          persistenceDurationMs,
          success,
          decisionType: decisionEvent.decision_type,
        },
        'Decision event persisted'
      );
    } catch (err) {
      logger.warn(
        {
          msg: 'Failed to emit decision event persistence telemetry',
          error: err instanceof Error ? err.message : String(err),
          agentId: this.context.agentId,
        },
        'Telemetry error'
      );
    }
  }

  /**
   * Emit comprehensive agent output analysis metrics
   *
   * Emits full telemetry for agent output including signals analyzed,
   * trends identified, and correlations found.
   *
   * @param output - Agent output
   * @param durationMs - Total processing duration
   */
  emitAgentOutputAnalysis(
    output: StrategicRecommendationOutput,
    durationMs: number
  ): void {
    try {
      const payload: EventPayload = {
        payload_type: 'telemetry',
        data: {
          type: 'token_usage',
          data: {
            model_id: this.context.agentId,
            request_id: this.context.executionId,
            prompt_tokens: output.totalSignalsAnalyzed,
            completion_tokens: output.recommendations.length,
            total_tokens: output.totalSignalsAnalyzed + output.recommendations.length,
            estimated_cost: undefined,
          },
        },
      };

      const event: AnalyticsEvent = {
        ...this.createCommonEventFields(),
        payload,
      };

      event.tags = {
        ...event.tags,
        signals_analyzed: output.totalSignalsAnalyzed.toString(),
        trends_identified: output.trendsIdentified.toString(),
        correlations_found: output.correlationsFound.toString(),
        recommendations_generated: output.recommendations.length.toString(),
        overall_confidence: output.overallConfidence.toFixed(2),
        layers_analyzed: output.analysisMetadata.layersAnalyzed.join(','),
        processing_duration_ms: durationMs.toString(),
      };

      logger.info(
        {
          msg: 'Agent output analysis metrics emitted',
          agentId: this.context.agentId,
          executionId: this.context.executionId,
          signalsAnalyzed: output.totalSignalsAnalyzed,
          trendsIdentified: output.trendsIdentified,
          correlationsFound: output.correlationsFound,
          recommendationsGenerated: output.recommendations.length,
          overallConfidence: output.overallConfidence.toFixed(2),
          processingDurationMs: durationMs,
        },
        'Agent output analysis'
      );
    } catch (err) {
      logger.warn(
        {
          msg: 'Failed to emit agent output analysis telemetry',
          error: err instanceof Error ? err.message : String(err),
          agentId: this.context.agentId,
        },
        'Telemetry error'
      );
    }
  }

  /**
   * Calculate recommendation metrics from an array of recommendations
   */
  private calculateRecommendationMetrics(
    recommendations: StrategicRecommendation[]
  ): RecommendationMetrics {
    const confidenceDistribution = {
      veryLow: 0,
      low: 0,
      medium: 0,
      high: 0,
      veryHigh: 0,
    };

    const byCategory: Record<string, number> = {};
    const byPriority: Record<string, number> = {};
    let totalConfidence = 0;

    recommendations.forEach((rec) => {
      totalConfidence += rec.confidence;

      // Categorize by confidence
      if (rec.confidence < 0.2) confidenceDistribution.veryLow++;
      else if (rec.confidence < 0.4) confidenceDistribution.low++;
      else if (rec.confidence < 0.6) confidenceDistribution.medium++;
      else if (rec.confidence < 0.8) confidenceDistribution.high++;
      else confidenceDistribution.veryHigh++;

      // Count by category
      byCategory[rec.category] = (byCategory[rec.category] || 0) + 1;

      // Count by priority
      byPriority[rec.priority] = (byPriority[rec.priority] || 0) + 1;
    });

    return {
      count: recommendations.length,
      confidenceDistribution,
      byCategory,
      byPriority,
      averageConfidence: recommendations.length > 0 ? totalConfidence / recommendations.length : 0,
    };
  }

  /**
   * Calculate correlation detection metrics
   */
  private calculateCorrelationMetrics(
    correlations: CrossDomainCorrelation[],
    durationMs: number
  ): CorrelationDetectionMetrics {
    const correlationsByStrength = {
      weak: 0,
      moderate: 0,
      strong: 0,
    };

    let totalCoefficient = 0;

    correlations.forEach((corr) => {
      correlationsByStrength[corr.strength]++;
      totalCoefficient += Math.abs(corr.correlationCoefficient);
    });

    return {
      totalCorrelationsFound: correlations.length,
      correlationsByStrength,
      averageCorrelationCoefficient:
        correlations.length > 0 ? totalCoefficient / correlations.length : 0,
      detectionDurationMs: durationMs,
    };
  }

  /**
   * Calculate approximate size of data in bytes
   */
  private calculateDataSize(data: unknown): number {
    try {
      return JSON.stringify(data).length;
    } catch {
      return 0;
    }
  }

  /**
   * Flush any pending telemetry events
   */
  async flush(): Promise<void> {
    try {
      await this.emitter.flush();
      logger.debug(
        { agentId: this.context.agentId },
        'Telemetry flushed'
      );
    } catch (err) {
      logger.warn(
        {
          msg: 'Failed to flush telemetry',
          error: err instanceof Error ? err.message : String(err),
          agentId: this.context.agentId,
        },
        'Telemetry error'
      );
    }
  }
}

/**
 * Create a telemetry context for a Strategic Recommendation Agent execution
 *
 * @param agentId - ID of the agent
 * @param agentVersion - Version of the agent
 * @param environment - Execution environment
 * @param tags - Additional tags for the execution
 * @returns Telemetry context
 */
export function createTelemetryContext(
  agentId: string,
  agentVersion: string,
  environment: string = process.env.NODE_ENV || 'development',
  tags: Record<string, string> = {}
): TelemetryContext {
  return {
    executionId: uuidv4(),
    correlationId: uuidv4(),
    agentId,
    agentVersion,
    environment,
    tags: {
      ...tags,
      agent_name: 'strategic-recommendation',
      timestamp: new Date().toISOString(),
    },
  };
}

/**
 * Create a telemetry context with parent tracing for nested executions
 *
 * @param parentContext - Parent telemetry context
 * @param agentId - ID of the child agent
 * @param agentVersion - Version of the child agent
 * @returns Child telemetry context
 */
export function createChildTelemetryContext(
  parentContext: TelemetryContext,
  agentId: string,
  agentVersion: string
): TelemetryContext {
  return {
    executionId: uuidv4(),
    correlationId: parentContext.correlationId, // Inherit correlation ID for tracing
    parentEventId: parentContext.executionId,
    agentId,
    agentVersion,
    environment: parentContext.environment,
    tags: {
      ...parentContext.tags,
      parent_agent_id: parentContext.agentId,
    },
  };
}

/**
 * OpenTelemetry integration helper
 *
 * Provides methods to integrate with OpenTelemetry for distributed tracing.
 */
export class OpenTelemetryBridge {
  /**
   * Create OpenTelemetry span context from telemetry context
   */
  static createSpanContext(context: TelemetryContext): Record<string, string> {
    return {
      'trace-id': context.correlationId,
      'span-id': context.executionId,
      'parent-span-id': context.parentEventId || '',
      'agent-id': context.agentId,
      'agent-version': context.agentVersion,
    };
  }

  /**
   * Extract telemetry context from OpenTelemetry span
   */
  static extractContextFromSpan(span: any): Partial<TelemetryContext> {
    return {
      correlationId: span.spanContext().traceId,
      executionId: span.spanContext().spanId,
      agentId: span.attributes?.['agent-id'] as string,
      agentVersion: span.attributes?.['agent-version'] as string,
    };
  }

  /**
   * Add telemetry context as span attributes
   */
  static addContextAsSpanAttributes(
    span: any,
    context: TelemetryContext
  ): void {
    span.setAttributes({
      'agent.id': context.agentId,
      'agent.version': context.agentVersion,
      'execution.id': context.executionId,
      'correlation.id': context.correlationId,
      'environment': context.environment,
      ...Object.entries(context.tags).reduce(
        (acc, [key, value]) => ({
          ...acc,
          [`tag.${key}`]: value,
        }),
        {}
      ),
    });
  }
}
