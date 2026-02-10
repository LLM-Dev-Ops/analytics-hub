/**
 * ExecutionGraph — per-request, append-only span accumulator
 *
 * Manages the lifecycle of repo-level and agent-level execution spans
 * within a single API request. Enforces the Agentics invariant that
 * every execution must contain at least one agent span.
 */

import { v4 as uuidv4 } from 'uuid';
import {
  ExecutionContext,
  ExecutionSpan,
  SpanArtifact,
  SpanHierarchy,
  SpanStatus,
} from './span-types';

export class ExecutionGraph {
  private repoSpan: ExecutionSpan;
  private agentSpans: ExecutionSpan[] = [];

  constructor(context: ExecutionContext, repoName: string) {
    this.repoSpan = {
      span_id: uuidv4(),
      parent_span_id: context.parent_span_id,
      trace_id: context.execution_id,
      span_type: 'repo',
      name: repoName,
      status: 'ok',
      start_time: new Date().toISOString(),
      attributes: { repo_name: repoName },
      artifacts: [],
    };
  }

  /**
   * Start an agent-level span. Returns the span_id for later
   * use with endAgentSpan() and attachArtifact().
   */
  startAgentSpan(
    agentName: string,
    attributes?: Record<string, unknown>,
  ): string {
    const span: ExecutionSpan = {
      span_id: uuidv4(),
      parent_span_id: this.repoSpan.span_id,
      trace_id: this.repoSpan.trace_id,
      span_type: 'agent',
      name: agentName,
      status: 'ok',
      start_time: new Date().toISOString(),
      attributes: attributes || {},
      artifacts: [],
    };
    this.agentSpans.push(span);
    return span.span_id;
  }

  /**
   * Complete an agent span, setting its end_time and final status.
   */
  endAgentSpan(spanId: string, status: SpanStatus): void {
    const span = this.agentSpans.find((s) => s.span_id === spanId);
    if (span) {
      span.end_time = new Date().toISOString();
      span.status = status;
    }
  }

  /**
   * Attach a machine-verifiable artifact to an agent span.
   */
  attachArtifact(
    spanId: string,
    artifact: Omit<SpanArtifact, 'timestamp'>,
  ): void {
    const span = this.agentSpans.find((s) => s.span_id === spanId);
    if (span) {
      span.artifacts.push({
        ...artifact,
        timestamp: new Date().toISOString(),
      });
    }
  }

  /**
   * Finalize the repo-level span.
   */
  finalize(status: SpanStatus): void {
    this.repoSpan.end_time = new Date().toISOString();
    this.repoSpan.status = status;
  }

  /**
   * Validate the execution graph invariants.
   * Returns invalid if no agent spans were emitted.
   */
  validate(): { valid: boolean; error?: string } {
    if (this.agentSpans.length === 0) {
      return {
        valid: false,
        error: 'No agent-level spans were emitted during execution',
      };
    }
    return { valid: true };
  }

  /**
   * Build the JSON-serializable span hierarchy for the response.
   */
  toHierarchy(): SpanHierarchy {
    return {
      core_span_id: this.repoSpan.parent_span_id,
      repo_span: { ...this.repoSpan },
      agent_spans: this.agentSpans.map((s) => ({ ...s })),
    };
  }

  getRepoSpanId(): string {
    return this.repoSpan.span_id;
  }

  getTraceId(): string {
    return this.repoSpan.trace_id;
  }
}

// ─── Helper for data routes ────────────────────────────────────

/**
 * Wrap a data-processing operation with an agent-level span.
 * Creates a `data-processing-agent` span, executes the handler,
 * and optionally attaches an artifact from the result.
 */
export async function withDataProcessingSpan<T>(
  graph: ExecutionGraph | null | undefined,
  operationName: string,
  handler: () => Promise<T>,
  artifactBuilder?: (result: T) => { artifact_type: string; data: unknown },
): Promise<T> {
  if (!graph) return handler();

  const spanId = graph.startAgentSpan('data-processing-agent', {
    operation: operationName,
  });

  try {
    const result = await handler();

    if (artifactBuilder) {
      const artifact = artifactBuilder(result);
      graph.attachArtifact(spanId, {
        artifact_type: artifact.artifact_type,
        artifact_id: spanId,
        data: artifact.data,
      });
    }

    graph.endAgentSpan(spanId, 'ok');
    return result;
  } catch (error) {
    graph.endAgentSpan(spanId, 'error');
    throw error;
  }
}
