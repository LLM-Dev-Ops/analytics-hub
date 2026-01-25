/**
 * Ecosystem Collaboration Agent
 *
 * Phase 5 - Ecosystem & Collaboration (Layer 1)
 *
 * This agent performs:
 * - Aggregation of ecosystem partner signals
 * - Indexing of collaboration metrics
 * - Cross-system analytics
 *
 * Emits: consensus_signal, aggregation_signal, strategic_signal
 *
 * MUST NOT: mutate state, commit actions, draw conclusions
 *
 * @module agents/ecosystem-collaboration
 */

export {
  handleEcosystemCollaborationRequest,
  healthCheck,
  type EdgeFunctionRequest,
  type EdgeFunctionResponse,
} from './handler';

export {
  computeEcosystemAnalytics,
  computeAggregation,
  computeConsensus,
  computeStrategicCorrelations,
  groupSignals,
  estimateTokens,
} from './computation';

export type {
  SignalGroup,
  CorrelationPair,
  AggregationResult,
  ConsensusResult,
  StrategicResult,
  ComputationOutput,
  PerformanceMetrics,
} from './types';
