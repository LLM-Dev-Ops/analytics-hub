/**
 * Agentics Execution Span Types
 *
 * Defines the span data model for the Agentics execution system.
 * All types are JSON-serializable, append-only, and causally ordered
 * via parent_span_id linkage.
 */

import { z } from 'zod';

// ─── Span Types ────────────────────────────────────────────────

export type SpanType = 'core' | 'repo' | 'agent';
export type SpanStatus = 'ok' | 'error';

export interface SpanArtifact {
  artifact_type: string;
  artifact_id: string;
  data: unknown;
  timestamp: string;
}

export interface ExecutionSpan {
  span_id: string;
  parent_span_id: string;
  trace_id: string;
  span_type: SpanType;
  name: string;
  status: SpanStatus;
  start_time: string;
  end_time?: string;
  attributes: Record<string, unknown>;
  artifacts: SpanArtifact[];
}

// ─── Execution Context (from request headers) ──────────────────

export interface ExecutionContext {
  execution_id: string;
  parent_span_id: string;
}

export const ExecutionContextSchema = z.object({
  execution_id: z.string().uuid(),
  parent_span_id: z.string().uuid(),
});

// ─── Output Contract ───────────────────────────────────────────

export interface SpanHierarchy {
  core_span_id: string;
  repo_span: ExecutionSpan;
  agent_spans: ExecutionSpan[];
}
