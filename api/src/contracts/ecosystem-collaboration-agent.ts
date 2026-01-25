/**
 * Ecosystem Collaboration Agent Contract
 *
 * Defines inputs, outputs, validation rules, and boundaries for the
 * Ecosystem Collaboration Agent (Phase 5 - Layer 1).
 *
 * Classification: ANALYTICAL SYNTHESIS / AGGREGATION / CROSS-SYSTEM ANALYTICS
 *
 * This agent performs:
 * - Aggregation of ecosystem partner signals
 * - Indexing of collaboration metrics
 * - Cross-system analytics across LLM ecosystem
 *
 * MUST NOT:
 * - Mutate state
 * - Commit actions
 * - Draw conclusions (emit signals only)
 *
 * @module contracts/ecosystem-collaboration-agent
 */

import { z } from 'zod';

// ============================================================================
// AGENT METADATA
// ============================================================================

export const AGENT_ID = 'ecosystem-collaboration-agent';
export const AGENT_VERSION = '1.0.0';

/**
 * Signal types emitted by this agent
 * Per DecisionEvent rules: consensus_signal, aggregation_signal, strategic_signal
 */
export const SIGNAL_TYPES = {
  CONSENSUS_SIGNAL: 'consensus_signal',
  AGGREGATION_SIGNAL: 'aggregation_signal',
  STRATEGIC_SIGNAL: 'strategic_signal',
} as const;

// ============================================================================
// PERFORMANCE BUDGETS
// ============================================================================

export const PERFORMANCE_BUDGETS = {
  MAX_TOKENS: 1500,
  MAX_LATENCY_MS: 3000,
} as const;

// ============================================================================
// INPUT SCHEMAS
// ============================================================================

/**
 * Ecosystem partner signal input
 */
export const EcosystemSignalSchema = z.object({
  /** Partner system identifier */
  partnerId: z.string().min(1),
  /** Signal source system */
  sourceSystem: z.string().min(1),
  /** Signal category */
  category: z.enum(['performance', 'cost', 'quality', 'availability', 'latency']),
  /** Metric value */
  value: z.number(),
  /** Unit of measurement */
  unit: z.string(),
  /** Signal confidence (0-1) */
  confidence: z.number().min(0).max(1),
  /** Signal timestamp */
  timestamp: z.string().datetime(),
  /** Optional metadata */
  metadata: z.record(z.unknown()).optional(),
});

/**
 * Cross-system correlation request
 */
export const CrossSystemQuerySchema = z.object({
  /** Source systems to correlate */
  sourceSystems: z.array(z.string()).min(2),
  /** Metrics to analyze */
  metrics: z.array(z.string()).min(1),
  /** Time range for analysis */
  timeRange: z.object({
    start: z.string().datetime(),
    end: z.string().datetime(),
  }),
  /** Correlation threshold */
  correlationThreshold: z.number().min(0).max(1).default(0.5),
});

/**
 * Main input schema for Ecosystem Collaboration Agent
 */
export const EcosystemCollaborationInputSchema = z.object({
  /** Request ID for tracing */
  requestId: z.string().uuid(),
  /** Ecosystem signals to aggregate */
  signals: z.array(EcosystemSignalSchema).min(1),
  /** Cross-system queries */
  crossSystemQueries: z.array(CrossSystemQuerySchema).optional(),
  /** Aggregation options */
  options: z.object({
    /** Aggregation granularity */
    granularity: z.enum(['minute', 'hour', 'day', 'week']).default('hour'),
    /** Include index update */
    updateIndex: z.boolean().default(true),
    /** Include cross-system analytics */
    crossSystemAnalytics: z.boolean().default(true),
    /** Signal scope filter */
    scopeFilter: z.array(z.string()).optional(),
  }).default({}),
  /** Execution reference for tracing */
  executionRef: z.string().uuid().optional(),
});

export type EcosystemSignal = z.infer<typeof EcosystemSignalSchema>;
export type CrossSystemQuery = z.infer<typeof CrossSystemQuerySchema>;
export type EcosystemCollaborationInput = z.infer<typeof EcosystemCollaborationInputSchema>;

// ============================================================================
// OUTPUT SCHEMAS
// ============================================================================

/**
 * Aggregation signal output (no conclusions, data only)
 */
export const AggregationSignalSchema = z.object({
  signalType: z.literal('aggregation_signal'),
  partnerId: z.string(),
  category: z.string(),
  aggregatedValue: z.number(),
  sampleCount: z.number().int().positive(),
  timeRange: z.object({
    start: z.string().datetime(),
    end: z.string().datetime(),
  }),
  confidence: z.number().min(0).max(1),
});

/**
 * Consensus signal output (no conclusions, alignment data only)
 */
export const ConsensusSignalSchema = z.object({
  signalType: z.literal('consensus_signal'),
  metric: z.string(),
  systems: z.array(z.string()),
  alignmentScore: z.number().min(0).max(1),
  divergenceFactors: z.array(z.object({
    system: z.string(),
    deviation: z.number(),
  })).optional(),
});

/**
 * Strategic signal output (no conclusions, correlation data only)
 */
export const StrategicSignalSchema = z.object({
  signalType: z.literal('strategic_signal'),
  correlationPairs: z.array(z.object({
    systemA: z.string(),
    systemB: z.string(),
    metricA: z.string(),
    metricB: z.string(),
    correlationCoefficient: z.number().min(-1).max(1),
  })),
  timeRange: z.object({
    start: z.string().datetime(),
    end: z.string().datetime(),
  }),
});

/**
 * Index entry for ecosystem data
 */
export const IndexEntrySchema = z.object({
  partnerId: z.string(),
  category: z.string(),
  lastUpdated: z.string().datetime(),
  signalCount: z.number().int().nonnegative(),
  avgConfidence: z.number().min(0).max(1),
});

/**
 * Complete response schema
 */
export const EcosystemCollaborationResponseSchema = z.object({
  success: z.boolean(),
  requestId: z.string().uuid(),
  /** Aggregation signals emitted */
  aggregationSignals: z.array(AggregationSignalSchema),
  /** Consensus signals emitted */
  consensusSignals: z.array(ConsensusSignalSchema),
  /** Strategic signals emitted */
  strategicSignals: z.array(StrategicSignalSchema),
  /** Updated index entries */
  indexEntries: z.array(IndexEntrySchema),
  /** Processing metadata */
  processingMetadata: z.object({
    signalsProcessed: z.number().int(),
    computationTimeMs: z.number(),
    tokenCount: z.number().int(),
    latencyMs: z.number(),
  }),
  /** Decision event reference */
  decisionEventId: z.string().optional(),
});

export type AggregationSignal = z.infer<typeof AggregationSignalSchema>;
export type ConsensusSignal = z.infer<typeof ConsensusSignalSchema>;
export type StrategicSignal = z.infer<typeof StrategicSignalSchema>;
export type IndexEntry = z.infer<typeof IndexEntrySchema>;
export type EcosystemCollaborationResponse = z.infer<typeof EcosystemCollaborationResponseSchema>;

// ============================================================================
// DECISION EVENT SCHEMA
// ============================================================================

/**
 * Constraint applied during ecosystem analysis
 */
export const EcosystemConstraintSchema = z.object({
  scope: z.string(),
  dataBoundaries: z.object({
    startTime: z.string().datetime(),
    endTime: z.string().datetime(),
    systems: z.array(z.string()).optional(),
  }),
  performanceBudget: z.object({
    maxTokens: z.number().int(),
    maxLatencyMs: z.number().int(),
  }),
});

/**
 * DecisionEvent outputs for ecosystem collaboration
 */
export const EcosystemOutputSchema = z.object({
  aggregationSignals: z.array(AggregationSignalSchema),
  consensusSignals: z.array(ConsensusSignalSchema),
  strategicSignals: z.array(StrategicSignalSchema),
  indexEntriesUpdated: z.number().int(),
});

/**
 * DecisionEvent for Ecosystem Collaboration Agent
 */
export const EcosystemDecisionEventSchema = z.object({
  agent_id: z.literal('ecosystem-collaboration-agent'),
  agent_version: z.string().regex(/^\d+\.\d+\.\d+$/),
  decision_type: z.enum(['consensus_signal', 'aggregation_signal', 'strategic_signal']),
  inputs_hash: z.string(),
  outputs: EcosystemOutputSchema,
  confidence: z.number().min(0).max(1),
  constraints_applied: z.array(EcosystemConstraintSchema),
  execution_ref: z.string().uuid(),
  timestamp: z.string().datetime(),
});

export type EcosystemConstraint = z.infer<typeof EcosystemConstraintSchema>;
export type EcosystemOutput = z.infer<typeof EcosystemOutputSchema>;
export type EcosystemDecisionEvent = z.infer<typeof EcosystemDecisionEventSchema>;

// ============================================================================
// BOUNDARY DEFINITIONS
// ============================================================================

/**
 * Explicit boundaries - what this agent MUST NOT do
 */
export const AGENT_BOUNDARIES = {
  PROHIBITED_ACTIONS: [
    'Mutate state in any system',
    'Commit actions or trigger workflows',
    'Draw conclusions from data',
    'Make recommendations',
    'Enforce policies or constraints',
    'Execute other agents',
    'Connect directly to SQL databases',
    'Execute raw SQL queries',
    'Modify execution behavior',
    'Auto-remediate issues',
  ],

  PROHIBITED_INTEGRATIONS: [
    'Google SQL (Postgres) - use ruvector-service only',
    'Workflow execution engines',
    'Policy enforcement systems',
    'Action dispatch systems',
  ],

  OUTPUT_RESTRICTIONS: [
    'No conclusions - only emit signals',
    'No recommendations - only correlations',
    'No actions - only aggregations',
  ],
} as const;

/**
 * Permitted actions for this agent
 */
export const AGENT_PERMISSIONS = {
  PERMITTED_ACTIONS: [
    'Aggregate signals from ecosystem partners',
    'Index collaboration metrics',
    'Perform cross-system analytics',
    'Compute correlations between systems',
    'Emit consensus_signal events',
    'Emit aggregation_signal events',
    'Emit strategic_signal events',
    'Read from ecosystem partner APIs',
    'Persist DecisionEvents via ruvector-service',
  ],

  PERMITTED_CONSUMERS: [
    'LLM-Governance-Dashboard (read-only)',
    'Executive reporting systems',
    'Strategic analytics consumers',
    'Partner ecosystem dashboards',
  ],
} as const;

// ============================================================================
// ANALYTICS CLASSIFICATION
// ============================================================================

export const ANALYTICS_CLASSIFICATION = {
  type: 'ANALYTICAL_SYNTHESIS',
  subtype: 'ECOSYSTEM_COLLABORATION',
  scope: 'CROSS_SYSTEM_AGGREGATION',
  phase: 5,
  layer: 1,
  readOnly: true,
  stateMutation: false,
  actionCommit: false,
  executionPath: 'OUTSIDE_CRITICAL_PATH',
} as const;

// ============================================================================
// FAILURE MODES
// ============================================================================

export const FAILURE_MODES = {
  VALIDATION_FAILURE: {
    code: 'ECOSYSTEM_VALIDATION_FAILURE',
    recoverable: true,
    action: 'Return validation error, do not emit DecisionEvent',
  },

  INSUFFICIENT_SIGNALS: {
    code: 'ECOSYSTEM_INSUFFICIENT_SIGNALS',
    recoverable: true,
    action: 'Return partial result with low confidence',
  },

  PERSISTENCE_FAILURE: {
    code: 'ECOSYSTEM_PERSISTENCE_FAILURE',
    recoverable: false,
    action: 'Log error, return failure response',
  },

  PERFORMANCE_BUDGET_EXCEEDED: {
    code: 'ECOSYSTEM_PERFORMANCE_EXCEEDED',
    recoverable: false,
    action: 'Abort computation, return budget exceeded error',
  },

  CROSS_SYSTEM_TIMEOUT: {
    code: 'ECOSYSTEM_CROSS_SYSTEM_TIMEOUT',
    recoverable: false,
    action: 'Return partial results, log timeout',
  },
} as const;

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Create SHA-256 hash of inputs for reproducibility
 */
export function createInputsHash(inputs: unknown): string {
  const crypto = require('crypto');
  const hash = crypto.createHash('sha256');
  hash.update(JSON.stringify(inputs));
  return hash.digest('hex');
}
