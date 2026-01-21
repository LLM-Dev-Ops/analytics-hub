/**
 * DecisionEvent Contract - Consensus Agent
 *
 * Defines the schema for DecisionEvents emitted by the Consensus Agent.
 * Part of the agentics-contracts specification.
 *
 * @module contracts/decision-event
 */

import { z } from 'zod';

/**
 * Constraint applied during consensus computation
 */
export const ConstraintAppliedSchema = z.object({
  /** Signal scope (e.g., "cost", "performance", "governance") */
  scope: z.string(),
  /** Data boundaries applied */
  dataBoundaries: z.object({
    startTime: z.string().datetime(),
    endTime: z.string().datetime(),
    layers: z.array(z.string()).optional(),
  }),
  /** Confidence bands used in computation */
  confidenceBands: z.object({
    lower: z.number().min(0).max(1),
    upper: z.number().min(0).max(1),
  }).optional(),
  /** Minimum agreement threshold */
  minAgreementThreshold: z.number().min(0).max(1).optional(),
});

/**
 * Consensus output data
 */
export const ConsensusOutputSchema = z.object({
  /** Consensus value or summary */
  consensusValue: z.unknown(),
  /** Agreement level across signals (0-1) */
  agreementLevel: z.number().min(0).max(1),
  /** Number of signals that agree with consensus */
  agreementCount: z.number().int().nonnegative(),
  /** Total number of signals analyzed */
  totalSignals: z.number().int().positive(),
  /** Divergent signals that disagree with consensus */
  divergentSignals: z.array(z.object({
    signalId: z.string(),
    divergenceScore: z.number().min(0).max(1),
    value: z.unknown(),
  })).optional(),
  /** Confidence-weighted summary statistics */
  statistics: z.object({
    mean: z.number().optional(),
    median: z.number().optional(),
    stdDev: z.number().optional(),
    variance: z.number().optional(),
  }).optional(),
});

/**
 * DecisionEvent schema for Consensus Agent
 *
 * Follows the agentics-contracts DecisionEvent specification.
 * Emitted exactly ONCE per agent invocation.
 */
export const DecisionEventSchema = z.object({
  /** Unique agent identifier */
  agent_id: z.literal('consensus-agent'),
  /** Semantic version of the agent */
  agent_version: z.string().regex(/^\d+\.\d+\.\d+$/),
  /** Type of decision made */
  decision_type: z.literal('analytics_consensus_summary'),
  /** Hash of input data for reproducibility */
  inputs_hash: z.string(),
  /** Consensus computation outputs */
  outputs: ConsensusOutputSchema,
  /** Analytical certainty / signal strength (0-1) */
  confidence: z.number().min(0).max(1),
  /** Constraints applied during computation */
  constraints_applied: z.array(ConstraintAppliedSchema),
  /** Reference to the execution context */
  execution_ref: z.string().uuid(),
  /** UTC timestamp of decision */
  timestamp: z.string().datetime(),
});

export type ConstraintApplied = z.infer<typeof ConstraintAppliedSchema>;
export type ConsensusOutput = z.infer<typeof ConsensusOutputSchema>;
export type DecisionEvent = z.infer<typeof DecisionEventSchema>;

/**
 * Create a hash of inputs for reproducibility tracking
 */
export function createInputsHash(inputs: unknown): string {
  const crypto = require('crypto');
  const hash = crypto.createHash('sha256');
  hash.update(JSON.stringify(inputs));
  return hash.digest('hex').substring(0, 16);
}
