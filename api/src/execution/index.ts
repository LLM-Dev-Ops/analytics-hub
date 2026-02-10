/**
 * Agentics Execution Span Module
 *
 * Provides execution span instrumentation for the analytics-hub
 * as a Foundational Execution Unit within the Agentics system.
 */

export type {
  SpanType,
  SpanStatus,
  SpanArtifact,
  ExecutionSpan,
  ExecutionContext,
  SpanHierarchy,
} from './span-types';

export { ExecutionContextSchema } from './span-types';
export { ExecutionGraph, withDataProcessingSpan } from './execution-graph';
