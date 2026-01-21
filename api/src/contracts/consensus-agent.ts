/**
 * Consensus Agent Contract
 *
 * Defines inputs, outputs, validation rules, and boundaries for the Consensus Agent.
 * This agent performs ANALYTICAL SYNTHESIS and CONSENSUS FORMATION across signals.
 *
 * Classification: ANALYTICAL SYNTHESIS / CONSENSUS / CROSS-SIGNAL AGGREGATION
 *
 * @module contracts/consensus-agent
 */

import { z } from 'zod';
import { DecisionEventSchema } from './decision-event';

// ============================================================================
// AGENT METADATA
// ============================================================================

export const AGENT_ID = 'consensus-agent';
export const AGENT_VERSION = '1.0.0';
export const DECISION_TYPE = 'analytics_consensus_summary';

// ============================================================================
// INPUT SCHEMAS
// ============================================================================

/**
 * Individual signal input for consensus computation
 */
export const SignalInputSchema = z.object({
  /** Unique signal identifier */
  signalId: z.string(),
  /** Source layer (e.g., "observatory", "costops", "governance") */
  sourceLayer: z.string(),
  /** Signal value (numeric or structured) */
  value: z.union([z.number(), z.object({}).passthrough()]),
  /** Confidence of the signal (0-1) */
  confidence: z.number().min(0).max(1),
  /** Timestamp of signal generation */
  timestamp: z.string().datetime(),
  /** Optional metadata */
  metadata: z.record(z.unknown()).optional(),
});

/**
 * Consensus Agent input schema
 */
export const ConsensusInputSchema = z.object({
  /** Signals to analyze for consensus */
  signals: z.array(SignalInputSchema).min(1),
  /** Time range for analysis */
  timeRange: z.object({
    start: z.string().datetime(),
    end: z.string().datetime(),
  }),
  /** Consensus computation options */
  options: z.object({
    /** Minimum agreement threshold to establish consensus (0-1) */
    minAgreementThreshold: z.number().min(0).max(1).default(0.6),
    /** Confidence weighting strategy */
    confidenceWeighting: z.enum(['uniform', 'proportional', 'exponential']).default('proportional'),
    /** Aggregation method for numeric signals */
    aggregationMethod: z.enum(['mean', 'median', 'mode', 'weighted_mean']).default('weighted_mean'),
    /** Include divergent signal analysis */
    includeDivergentAnalysis: z.boolean().default(true),
    /** Signal scope filter */
    scopeFilter: z.array(z.string()).optional(),
  }).default({}),
  /** Execution reference for tracing */
  executionRef: z.string().uuid().optional(),
});

export type SignalInput = z.infer<typeof SignalInputSchema>;
export type ConsensusInput = z.infer<typeof ConsensusInputSchema>;

// ============================================================================
// OUTPUT SCHEMAS
// ============================================================================

/**
 * Consensus Agent response schema
 */
export const ConsensusResponseSchema = z.object({
  /** Whether consensus was achieved */
  consensusAchieved: z.boolean(),
  /** The decision event emitted */
  decisionEvent: DecisionEventSchema,
  /** Human-readable summary */
  summary: z.string(),
  /** Processing metadata */
  processingMetadata: z.object({
    signalsProcessed: z.number().int(),
    computationTimeMs: z.number(),
    method: z.string(),
  }),
});

export type ConsensusResponse = z.infer<typeof ConsensusResponseSchema>;

// ============================================================================
// CLI CONTRACT
// ============================================================================

/**
 * CLI invocation shape for the Consensus Agent
 *
 * @example
 * ```bash
 * # Analyze consensus from stdin
 * cat signals.json | consensus-agent analyze
 *
 * # Synthesize with specific options
 * consensus-agent synthesize --min-agreement 0.7 --method weighted_mean
 *
 * # Summarize consensus results
 * consensus-agent summarize --format json
 *
 * # Inspect specific signal alignment
 * consensus-agent inspect --signal-id signal-123
 * ```
 */
export const CLI_CONTRACT = {
  commands: ['analyze', 'synthesize', 'summarize', 'inspect'] as const,
  flags: {
    '--min-agreement': 'Minimum agreement threshold (0-1)',
    '--method': 'Aggregation method (mean|median|mode|weighted_mean)',
    '--confidence-weighting': 'Confidence weighting (uniform|proportional|exponential)',
    '--format': 'Output format (json|yaml|table)',
    '--signal-id': 'Specific signal ID to inspect',
    '--time-range': 'Time range (ISO format: start,end)',
    '--scope': 'Signal scope filter (comma-separated)',
  },
} as const;

// ============================================================================
// BOUNDARY DEFINITIONS
// ============================================================================

/**
 * Explicit boundaries - what this agent MUST NOT do
 */
export const AGENT_BOUNDARIES = {
  /** Actions this agent is PROHIBITED from performing */
  PROHIBITED_ACTIONS: [
    'Modify execution behavior',
    'Enforce constraints or policies',
    'Trigger workflows or retries',
    'Execute other agents',
    'Apply optimizations autonomously',
    'Emit anomaly detections',
    'Connect directly to SQL databases',
    'Execute raw SQL queries',
    'Intercept execution paths',
    'Orchestrate agents',
  ],

  /** Systems this agent MUST NOT interact with directly */
  PROHIBITED_INTEGRATIONS: [
    'Google SQL (Postgres) - use ruvector-service only',
    'Workflow execution engines',
    'Policy enforcement systems',
    'Auto-optimizer (except read-only consumption)',
  ],

  /** Data this agent MUST NOT persist directly */
  NON_PERSISTABLE_DATA: [
    'Raw signal values (temporary, in-memory only)',
    'Intermediate computation states',
    'Execution context beyond execution_ref',
  ],
} as const;

/**
 * Permitted actions for this agent
 */
export const AGENT_PERMISSIONS = {
  /** Actions this agent MAY perform */
  PERMITTED_ACTIONS: [
    'Aggregate DecisionEvents across layers',
    'Perform statistical and semantic analysis',
    'Derive correlations, trends, and consensus views',
    'Produce strategic or executive-level insights',
    'Emit analytical DecisionEvents',
    'Read from Observatory telemetry inputs',
    'Read from CostOps cost/ROI inputs',
    'Read from Governance Dashboard artifacts',
  ],

  /** Systems that MAY consume this agent\'s output */
  PERMITTED_CONSUMERS: [
    'LLM-Auto-Optimizer (read-only)',
    'LLM-Governance-Dashboard',
    'Executive reporting systems',
    'Strategic analytics consumers',
  ],
} as const;

// ============================================================================
// ANALYTICS CLASSIFICATION
// ============================================================================

export const ANALYTICS_CLASSIFICATION = {
  type: 'ANALYTICAL_SYNTHESIS',
  subtype: 'CONSENSUS_FORMATION',
  scope: 'CROSS_SIGNAL_AGGREGATION',
  readOnly: true,
  executionPath: 'OUTSIDE_CRITICAL_PATH',
} as const;

// ============================================================================
// FAILURE MODES
// ============================================================================

export const FAILURE_MODES = {
  /** Input validation failures */
  VALIDATION_FAILURE: {
    code: 'CONSENSUS_VALIDATION_FAILURE',
    recoverable: true,
    action: 'Return validation error, do not emit DecisionEvent',
  },

  /** Insufficient signals for consensus */
  INSUFFICIENT_SIGNALS: {
    code: 'CONSENSUS_INSUFFICIENT_SIGNALS',
    recoverable: true,
    action: 'Return partial result with low confidence, emit DecisionEvent with confidence=0',
  },

  /** ruvector-service connection failure */
  PERSISTENCE_FAILURE: {
    code: 'CONSENSUS_PERSISTENCE_FAILURE',
    recoverable: false,
    action: 'Log error, return failure response, do not emit DecisionEvent',
  },

  /** Computation timeout */
  COMPUTATION_TIMEOUT: {
    code: 'CONSENSUS_COMPUTATION_TIMEOUT',
    recoverable: false,
    action: 'Abort computation, return timeout error, do not emit DecisionEvent',
  },

  /** Internal computation error */
  COMPUTATION_ERROR: {
    code: 'CONSENSUS_COMPUTATION_ERROR',
    recoverable: false,
    action: 'Log error, return failure response, do not emit DecisionEvent',
  },
} as const;
