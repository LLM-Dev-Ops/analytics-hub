/**
 * Consensus Agent Metadata
 *
 * Platform registration metadata for the Consensus Agent.
 * Used by agentics-contracts for agent discovery and registration.
 *
 * @module agents/consensus/metadata
 */

import {
  AGENT_ID,
  AGENT_VERSION,
  DECISION_TYPE,
  ANALYTICS_CLASSIFICATION,
  AGENT_PERMISSIONS,
  AGENT_BOUNDARIES,
  CLI_CONTRACT,
} from '../../contracts/consensus-agent';

/**
 * Agent registration metadata
 *
 * This metadata is used to register the agent with the platform.
 */
export const AGENT_METADATA = {
  // =========================================================================
  // IDENTITY
  // =========================================================================

  /** Unique agent identifier */
  id: AGENT_ID,

  /** Agent display name */
  name: 'Consensus Agent',

  /** Semantic version */
  version: AGENT_VERSION,

  /** Description */
  description:
    'Derive consensus views and agreement metrics across multiple analytical signals and DecisionEvents.',

  // =========================================================================
  // CLASSIFICATION
  // =========================================================================

  /** Agent classification */
  classification: ANALYTICS_CLASSIFICATION,

  /** Decision type emitted */
  decisionType: DECISION_TYPE,

  /** Tags for discovery */
  tags: [
    'analytics',
    'consensus',
    'aggregation',
    'synthesis',
    'cross-signal',
    'read-only',
  ],

  // =========================================================================
  // DEPLOYMENT
  // =========================================================================

  /** Deployment configuration */
  deployment: {
    /** Runtime environment */
    runtime: 'nodejs20',

    /** Entry point for Edge Function */
    entryPoint: 'consensus',

    /** Maximum execution timeout (ms) */
    timeoutMs: 30000,

    /** Memory allocation (MB) */
    memoryMb: 256,

    /** Minimum instances (for scaling) */
    minInstances: 0,

    /** Maximum instances */
    maxInstances: 100,

    /** Region deployment */
    regions: ['us-central1', 'us-east1', 'europe-west1'],
  },

  // =========================================================================
  // ENDPOINTS
  // =========================================================================

  /** API endpoints */
  endpoints: [
    {
      path: '/api/v1/agents/consensus/analyze',
      method: 'POST',
      description: 'Compute consensus across analytical signals',
    },
    {
      path: '/api/v1/agents/consensus/health',
      method: 'GET',
      description: 'Health check',
    },
    {
      path: '/api/v1/agents/consensus/metadata',
      method: 'GET',
      description: 'Get agent metadata',
    },
  ],

  // =========================================================================
  // CLI
  // =========================================================================

  /** CLI contract */
  cli: {
    binary: 'consensus-agent',
    commands: CLI_CONTRACT.commands,
    flags: CLI_CONTRACT.flags,
  },

  // =========================================================================
  // DEPENDENCIES
  // =========================================================================

  /** External service dependencies */
  dependencies: {
    /** Required services */
    required: ['ruvector-service'],

    /** Optional services */
    optional: ['observatory-telemetry'],
  },

  // =========================================================================
  // DATA FLOW
  // =========================================================================

  /** Input sources */
  inputs: [
    {
      source: 'LLM-Observatory',
      type: 'telemetry',
      description: 'Telemetry signals from Observatory',
    },
    {
      source: 'LLM-CostOps',
      type: 'cost',
      description: 'Cost and ROI signals',
    },
    {
      source: 'LLM-Governance-Dashboard',
      type: 'governance',
      description: 'Governance artifacts',
    },
  ],

  /** Output consumers */
  outputs: [
    {
      consumer: 'LLM-Auto-Optimizer',
      type: 'read-only',
      description: 'Optimization recommendations',
    },
    {
      consumer: 'LLM-Governance-Dashboard',
      type: 'analytics',
      description: 'Consensus analytics',
    },
    {
      consumer: 'Executive Systems',
      type: 'insights',
      description: 'Strategic insights',
    },
  ],

  // =========================================================================
  // PERMISSIONS & BOUNDARIES
  // =========================================================================

  permissions: AGENT_PERMISSIONS,
  boundaries: AGENT_BOUNDARIES,

  // =========================================================================
  // OBSERVABILITY
  // =========================================================================

  /** Observability configuration */
  observability: {
    /** Telemetry emission */
    telemetry: {
      enabled: true,
      endpoint: 'observatory-telemetry',
    },

    /** Metrics */
    metrics: [
      'consensus_agent_invocations_total',
      'consensus_agent_duration_seconds',
      'consensus_agent_confidence_histogram',
      'consensus_agent_agreement_level_histogram',
      'consensus_agent_signals_processed_total',
      'consensus_agent_errors_total',
    ],

    /** Logging */
    logging: {
      level: 'info',
      structured: true,
    },
  },
} as const;

/**
 * Export metadata for registration
 */
export default AGENT_METADATA;
