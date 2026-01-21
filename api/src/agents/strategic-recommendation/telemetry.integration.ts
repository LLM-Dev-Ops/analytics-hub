/**
 * Strategic Recommendation Agent - Telemetry Integration Examples
 *
 * This file demonstrates how to integrate telemetry into the agent execution flow.
 * These are reference implementations - adapt as needed for your use case.
 *
 * @module agents/strategic-recommendation/telemetry-integration
 */

import {
  StrategicRecommendationTelemetry,
  createTelemetryContext,
  createChildTelemetryContext,
  TelemetryContext,
} from './telemetry';
import {
  StrategicRecommendationInput,
  StrategicRecommendationOutput,
} from './types';
import { logger } from '../../logger';

/**
 * Example 1: Basic Agent Execution with Telemetry
 *
 * Demonstrates wrapping agent execution with telemetry tracking
 */
export async function executeAgentWithBasicTelemetry(
  agentId: string,
  agentVersion: string,
  input: StrategicRecommendationInput,
  executeAgent: (input: StrategicRecommendationInput) => Promise<StrategicRecommendationOutput>
): Promise<StrategicRecommendationOutput> {
  // Create telemetry context
  const telemetryContext = createTelemetryContext(
    agentId,
    agentVersion,
    process.env.NODE_ENV || 'development',
    {
      execution_ref: input.executionRef,
      source_layers: input.sourceLayers.join(','),
    }
  );

  const telemetry = new StrategicRecommendationTelemetry(telemetryContext);
  const startTime = Date.now();

  try {
    logger.info(
      {
        msg: 'Agent execution started',
        agentId,
        executionRef: input.executionRef,
        correlationId: telemetryContext.correlationId,
      },
      'Agent execution'
    );

    // Execute agent
    const output = await executeAgent(input);
    const duration = Date.now() - startTime;

    // Emit metrics
    telemetry.emitAgentInvocation(input, output, duration, true);
    telemetry.emitRecommendationGenerated(output.recommendations);
    telemetry.emitAgentOutputAnalysis(output, duration);

    logger.info(
      {
        msg: 'Agent execution completed successfully',
        agentId,
        executionRef: input.executionRef,
        duration,
        recommendationCount: output.recommendations.length,
      },
      'Agent execution'
    );

    return output;
  } catch (error) {
    const duration = Date.now() - startTime;
    const err = error instanceof Error ? error : new Error(String(error));

    // Emit error metrics
    telemetry.emitAgentInvocation(input, undefined, duration, false, err);

    logger.error(
      {
        msg: 'Agent execution failed',
        agentId,
        executionRef: input.executionRef,
        error: err.message,
        duration,
      },
      'Agent execution'
    );

    throw err;
  } finally {
    // Flush remaining events
    await telemetry.flush();
  }
}

/**
 * Example 2: Multi-Stage Agent Execution with Detailed Telemetry
 *
 * Demonstrates tracking different stages of agent execution
 */
export async function executeAgentWithDetailedTelemetry(
  agentId: string,
  agentVersion: string,
  input: StrategicRecommendationInput,
  executionStages: {
    aggregateSignals: () => Promise<{ count: number; duration: number }>;
    analyzeTrends: () => Promise<{ count: number; duration: number }>;
    detectCorrelations: () => Promise<{
      correlations: any[];
      duration: number;
    }>;
    generateRecommendations: () => Promise<{
      recommendations: any[];
      duration: number;
    }>;
  }
): Promise<StrategicRecommendationOutput> {
  const telemetryContext = createTelemetryContext(
    agentId,
    agentVersion,
    process.env.NODE_ENV || 'development',
    { execution_ref: input.executionRef }
  );

  const telemetry = new StrategicRecommendationTelemetry(telemetryContext);
  const overallStartTime = Date.now();

  try {
    // Stage 1: Aggregate Signals
    logger.info({ stage: 'signal_aggregation' }, 'Starting stage');
    const signalStage = await executionStages.aggregateSignals();
    logger.info(
      {
        stage: 'signal_aggregation',
        count: signalStage.count,
        duration: signalStage.duration,
      },
      'Stage completed'
    );

    // Stage 2: Analyze Trends
    logger.info({ stage: 'trend_analysis' }, 'Starting stage');
    const trendStage = await executionStages.analyzeTrends();
    logger.info(
      {
        stage: 'trend_analysis',
        count: trendStage.count,
        duration: trendStage.duration,
      },
      'Stage completed'
    );

    // Stage 3: Detect Correlations
    logger.info({ stage: 'correlation_detection' }, 'Starting stage');
    const correlationStage = await executionStages.detectCorrelations();
    logger.info(
      {
        stage: 'correlation_detection',
        count: correlationStage.correlations.length,
        duration: correlationStage.duration,
      },
      'Stage completed'
    );

    // Emit correlation metrics
    telemetry.emitCorrelationDetected(
      correlationStage.correlations,
      correlationStage.duration
    );

    // Stage 4: Generate Recommendations
    logger.info({ stage: 'recommendation_generation' }, 'Starting stage');
    const recommendationStage = await executionStages.generateRecommendations();
    logger.info(
      {
        stage: 'recommendation_generation',
        count: recommendationStage.recommendations.length,
        duration: recommendationStage.duration,
      },
      'Stage completed'
    );

    // Emit recommendation metrics
    telemetry.emitRecommendationGenerated(recommendationStage.recommendations);

    // Construct output
    const output: StrategicRecommendationOutput = {
      recommendations: recommendationStage.recommendations,
      totalSignalsAnalyzed: signalStage.count,
      trendsIdentified: trendStage.count,
      correlationsFound: correlationStage.correlations.length,
      overallConfidence:
        recommendationStage.recommendations.length > 0
          ? recommendationStage.recommendations.reduce((sum, r) => sum + r.confidence, 0) /
            recommendationStage.recommendations.length
          : 0,
      analysisMetadata: {
        timeWindow: input.timeWindow,
        layersAnalyzed: input.sourceLayers,
        processingDuration: Date.now() - overallStartTime,
      },
    };

    // Emit overall metrics
    telemetry.emitAgentInvocation(
      input,
      output,
      Date.now() - overallStartTime,
      true
    );
    telemetry.emitAgentOutputAnalysis(
      output,
      Date.now() - overallStartTime
    );

    return output;
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    telemetry.emitAgentInvocation(
      input,
      undefined,
      Date.now() - overallStartTime,
      false,
      err
    );
    throw err;
  } finally {
    await telemetry.flush();
  }
}

/**
 * Example 3: Hierarchical Agent Execution with Distributed Tracing
 *
 * Demonstrates parent-child agent calls with correlation ID propagation
 */
export async function executeHierarchicalAgentWithTelemetry(
  parentAgentId: string,
  parentAgentVersion: string,
  input: StrategicRecommendationInput,
  childAgentExecutor: (
    childContext: TelemetryContext,
    input: StrategicRecommendationInput
  ) => Promise<StrategicRecommendationOutput>
): Promise<StrategicRecommendationOutput> {
  // Create parent context
  const parentContext = createTelemetryContext(
    parentAgentId,
    parentAgentVersion,
    process.env.NODE_ENV || 'development'
  );

  const parentTelemetry = new StrategicRecommendationTelemetry(parentContext);
  const parentStartTime = Date.now();

  try {
    logger.info(
      {
        msg: 'Parent agent execution started',
        agentId: parentAgentId,
        correlationId: parentContext.correlationId,
      },
      'Hierarchical execution'
    );

    // Create child context (inherits correlation ID from parent)
    const childContext = createChildTelemetryContext(
      parentContext,
      'child-analysis-agent',
      '1.0.0'
    );

    logger.info(
      {
        msg: 'Child agent execution started',
        correlationId: childContext.correlationId,
        parentEventId: childContext.parentEventId,
      },
      'Hierarchical execution'
    );

    // Execute child agent with its own telemetry context
    const childOutput = await childAgentExecutor(childContext, input);

    const childDuration = Date.now() - parentStartTime;

    logger.info(
      {
        msg: 'Child agent execution completed',
        duration: childDuration,
        recommendationCount: childOutput.recommendations.length,
      },
      'Hierarchical execution'
    );

    // Parent emits telemetry for overall execution
    parentTelemetry.emitAgentInvocation(
      input,
      childOutput,
      childDuration,
      true
    );
    parentTelemetry.emitRecommendationGenerated(childOutput.recommendations);
    parentTelemetry.emitAgentOutputAnalysis(childOutput, childDuration);

    logger.info(
      {
        msg: 'Parent agent execution completed',
        duration: childDuration,
      },
      'Hierarchical execution'
    );

    return childOutput;
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    const duration = Date.now() - parentStartTime;

    parentTelemetry.emitAgentInvocation(input, undefined, duration, false, err);

    logger.error(
      {
        msg: 'Hierarchical agent execution failed',
        error: err.message,
        duration,
        correlationId: parentContext.correlationId,
      },
      'Hierarchical execution'
    );

    throw err;
  } finally {
    await parentTelemetry.flush();
  }
}

/**
 * Example 4: Telemetry with Decision Event Persistence
 *
 * Demonstrates tracking the full lifecycle including persistence
 */
export async function executeAgentWithPersistence(
  agentId: string,
  agentVersion: string,
  input: StrategicRecommendationInput,
  executeAgent: (input: StrategicRecommendationInput) => Promise<StrategicRecommendationOutput>,
  persistDecisionEvent: (event: any) => Promise<void>
): Promise<StrategicRecommendationOutput> {
  const telemetryContext = createTelemetryContext(
    agentId,
    agentVersion,
    process.env.NODE_ENV || 'development'
  );

  const telemetry = new StrategicRecommendationTelemetry(telemetryContext);
  const startTime = Date.now();

  try {
    // Execute agent
    const output = await executeAgent(input);
    const execDuration = Date.now() - startTime;

    // Emit execution metrics
    telemetry.emitAgentInvocation(input, output, execDuration, true);
    telemetry.emitRecommendationGenerated(output.recommendations);
    telemetry.emitAgentOutputAnalysis(output, execDuration);

    // Persist decision event
    logger.info(
      {
        msg: 'Persisting decision event',
        recommendationCount: output.recommendations.length,
      },
      'Persistence'
    );

    const persistStartTime = Date.now();
    try {
      const decisionEvent = {
        agent_id: agentId,
        agent_version: agentVersion,
        decision_type: 'strategic_recommendation',
        confidence: output.overallConfidence,
        recommendations: output.recommendations,
        timestamp: new Date().toISOString(),
      };

      await persistDecisionEvent(decisionEvent);
      const persistDuration = Date.now() - persistStartTime;

      telemetry.emitDecisionEventPersisted(
        decisionEvent,
        persistDuration,
        true
      );

      logger.info(
        {
          msg: 'Decision event persisted successfully',
          duration: persistDuration,
        },
        'Persistence'
      );
    } catch (persistError) {
      const persistDuration = Date.now() - persistStartTime;
      const err = persistError instanceof Error ? persistError : new Error(String(persistError));

      telemetry.emitDecisionEventPersisted(
        { agent_id: agentId },
        persistDuration,
        false
      );

      logger.error(
        {
          msg: 'Failed to persist decision event',
          error: err.message,
          duration: persistDuration,
        },
        'Persistence'
      );

      // Don't rethrow - persistence failure shouldn't fail the agent
    }

    return output;
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    telemetry.emitAgentInvocation(input, undefined, Date.now() - startTime, false, err);
    throw err;
  } finally {
    await telemetry.flush();
  }
}

/**
 * Example 5: Batch Telemetry Emission
 *
 * Demonstrates efficiently emitting telemetry for multiple recommendations
 */
export async function emitBatchRecommendationTelemetry(
  agentId: string,
  agentVersion: string,
  recommendations: any[],
  batchSize: number = 100
): Promise<void> {
  const telemetryContext = createTelemetryContext(agentId, agentVersion);
  const telemetry = new StrategicRecommendationTelemetry(telemetryContext);

  // Process in batches to avoid overwhelming Observatory
  for (let i = 0; i < recommendations.length; i += batchSize) {
    const batch = recommendations.slice(i, i + batchSize);
    telemetry.emitRecommendationGenerated(batch);

    // Flush after each batch
    await telemetry.flush();

    logger.info(
      {
        msg: 'Batch telemetry emitted',
        batchNumber: Math.floor(i / batchSize) + 1,
        batchSize: batch.length,
        totalProcessed: i + batch.length,
      },
      'Batch telemetry'
    );
  }
}
