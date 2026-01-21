/**
 * Strategic Recommendation Agent - Type Definitions
 *
 * Defines types for aggregating signals, analyzing trends,
 * and generating strategic recommendations across multiple data sources.
 *
 * @module agents/strategic-recommendation/types
 */

import { z } from 'zod';
import {
  StrategicRecommendation as BaseStrategicRecommendation,
  TrendAnalysis as BaseTrendAnalysis,
  RiskOpportunityAssessment,
  DecisionEvent,
  ConstraintType,
} from '../types';

/**
 * Time range for signal aggregation
 */
export const TimeRangeSchema = z.object({
  startTime: z.string().datetime(),
  endTime: z.string().datetime(),
});

export type TimeRange = z.infer<typeof TimeRangeSchema>;

export type UUID = string;
export type ISODateString = string;

/**
 * Data source types that can feed into the agent
 */
export enum DataSource {
  Observatory = 'llm-observatory',
  Sentinel = 'llm-sentinel',
  CostOps = 'llm-cost-ops',
  Governance = 'llm-governance-dashboard',
  Registry = 'llm-registry',
  PolicyEngine = 'llm-policy-engine',
}

/**
 * Source layer types (legacy support)
 */
export type SourceLayer = 'observatory' | 'cost-ops' | 'governance' | 'consensus';

/**
 * Individual signal from a source layer
 */
export const SignalSchema = z.object({
  signalId: z.string(),
  layer: z.string(),
  timestamp: z.string().datetime(),
  metricType: z.string(),
  value: z.number(),
  confidence: z.number().min(0).max(1),
  metadata: z.record(z.unknown()).optional(),
});

export type Signal = z.infer<typeof SignalSchema>;

/**
 * Aggregated signals from multiple sources (enhanced)
 * Note: Enhanced fields are optional for backward compatibility
 */
export const SignalAggregationSchema = z.object({
  aggregation_id: z.string().uuid().optional(),
  timeWindow: TimeRangeSchema,
  time_window: z.object({
    start: z.string().datetime(),
    end: z.string().datetime(),
    granularity: z.enum(['minute', 'hour', 'day', 'week', 'month']),
  }).optional(),
  signalsByLayer: z.record(z.array(SignalSchema)),
  by_source: z.array(z.object({
    source: z.string(),
    signal_count: z.number().int().nonnegative(),
    avg_severity: z.number().min(0),
    dominant_categories: z.array(z.string()),
    key_metrics: z.record(z.number()),
  })).optional(),
  totalSignals: z.number().int().nonnegative(),
  layersIncluded: z.array(z.string()),
  aggregated_metrics: z.object({
    total_events: z.number().int().nonnegative(),
    unique_resources: z.number().int().nonnegative(),
    avg_latency_ms: z.number().nonnegative().optional(),
    total_cost: z.number().nonnegative().optional(),
    error_rate: z.number().min(0).max(1).optional(),
    security_incidents: z.number().int().nonnegative().optional(),
    policy_violations: z.number().int().nonnegative().optional(),
  }).optional(),
  statistics: z.object({
    mean: z.record(z.number()),
    median: z.record(z.number()),
    std_dev: z.record(z.number()),
    percentiles: z.record(z.record(z.number())),
  }).optional(),
  temporal_patterns: z.array(z.object({
    pattern_type: z.enum(['spike', 'dip', 'cyclical', 'trending']),
    detected_at: z.string().datetime(),
    strength: z.number().min(0).max(1),
    description: z.string(),
  })).optional(),
});

export type SignalAggregation = z.infer<typeof SignalAggregationSchema>;

/**
 * Trend direction
 */
export type TrendDirection = 'increasing' | 'decreasing' | 'stable' | 'volatile';

/**
 * Trend analysis for a specific metric
 */
export const TrendAnalysisSchema = z.object({
  metricType: z.string(),
  layer: z.string(),
  direction: z.enum(['increasing', 'decreasing', 'stable', 'volatile']),
  magnitude: z.number().min(0).max(1),
  velocity: z.number(),
  dataPoints: z.number().int().positive(),
  confidence: z.number().min(0).max(1),
  anomalies: z.array(z.object({
    timestamp: z.string().datetime(),
    value: z.number(),
    deviationScore: z.number(),
  })).optional(),
});

export type TrendAnalysis = z.infer<typeof TrendAnalysisSchema>;

/**
 * Cross-domain correlation between different signal types (enhanced)
 * Identifies relationships between different domains (cost, security, performance)
 * Note: Enhanced fields are optional for backward compatibility
 */
export const CrossDomainCorrelationSchema = z.object({
  correlation_id: z.string().uuid().optional(),
  correlationId: z.string(), // Legacy support
  primaryTrend: TrendAnalysisSchema,
  secondaryTrend: TrendAnalysisSchema,
  domains: z.array(z.object({
    domain: z.enum(['cost', 'security', 'performance', 'governance', 'compliance']),
    metrics: z.array(z.string()),
  })).optional(),
  correlations: z.array(z.object({
    metric_a: z.string(),
    metric_b: z.string(),
    correlation_coefficient: z.number().min(-1).max(1),
    p_value: z.number().min(0).max(1),
    is_significant: z.boolean(),
    relationship_type: z.enum(['positive', 'negative', 'none']),
  })).optional(),
  correlationCoefficient: z.number().min(-1).max(1),
  strength: z.enum(['weak', 'moderate', 'strong']),
  lagTime: z.number().optional(),
  causality: z.enum(['none', 'potential', 'likely']).optional(),
  causal_relationships: z.array(z.object({
    cause_metric: z.string(),
    effect_metric: z.string(),
    lag_time: z.string().optional(),
    confidence: z.number().min(0).max(1),
    evidence: z.array(z.string()),
  })).optional(),
  insights: z.array(z.object({
    insight_type: z.enum(['trade_off', 'synergy', 'cascade_effect', 'feedback_loop']),
    description: z.string(),
    affected_domains: z.array(z.string()),
    impact_score: z.number().min(0).max(1),
  })).optional(),
  anomalous_correlations: z.array(z.object({
    metrics: z.array(z.string()),
    expected_correlation: z.number().min(-1).max(1),
    actual_correlation: z.number().min(-1).max(1),
    deviation_score: z.number().nonnegative(),
    possible_explanation: z.string().optional(),
  })).optional(),
});

export type CrossDomainCorrelation = z.infer<typeof CrossDomainCorrelationSchema>;

/**
 * Recommendation priority level
 */
export type RecommendationPriority = 'critical' | 'high' | 'medium' | 'low';

/**
 * Recommendation category
 */
export type RecommendationCategory =
  | 'cost-optimization'
  | 'performance-improvement'
  | 'risk-mitigation'
  | 'capacity-planning'
  | 'governance-compliance'
  | 'strategic-initiative';

/**
 * Strategic recommendation
 */
export const StrategicRecommendationSchema = z.object({
  recommendationId: z.string(),
  category: z.enum([
    'cost-optimization',
    'performance-improvement',
    'risk-mitigation',
    'capacity-planning',
    'governance-compliance',
    'strategic-initiative',
  ]),
  priority: z.enum(['critical', 'high', 'medium', 'low']),
  title: z.string(),
  description: z.string(),
  rationale: z.string(),
  supportingCorrelations: z.array(z.string()),
  supportingTrends: z.array(z.string()),
  expectedImpact: z.object({
    costSavings: z.number().optional(),
    performanceGain: z.number().optional(),
    riskReduction: z.number().optional(),
  }).optional(),
  confidence: z.number().min(0).max(1),
  timeHorizon: z.enum(['immediate', 'short-term', 'medium-term', 'long-term']),
  metadata: z.record(z.unknown()).optional(),
});

export type StrategicRecommendation = z.infer<typeof StrategicRecommendationSchema>;

export const DataSourceSchema = z.nativeEnum(DataSource);

/**
 * Input to the Strategic Recommendation Agent (enhanced)
 */
export const StrategicRecommendationInputSchema = z.object({
  request_id: z.string().uuid(),
  timeWindow: TimeRangeSchema,
  time_range: z.object({
    start: z.string().datetime(),
    end: z.string().datetime(),
  }),
  sourceLayers: z.array(z.string()).min(1),
  data_sources: z.array(DataSourceSchema).optional(),
  focus_areas: z.array(z.enum(['cost', 'security', 'performance', 'governance', 'compliance', 'operations'])).optional(),
  constraints: z.array(z.object({
    type: z.string(),
    value: z.unknown(),
    description: z.string().optional(),
  })).optional(),
  minConfidence: z.number().min(0).max(1).default(0.5),
  min_confidence: z.number().min(0).max(1).optional(),
  maxRecommendations: z.number().int().positive().default(10),
  max_recommendations: z.number().int().positive().optional(),
  focusCategories: z.array(z.string()).optional(),
  include_details: z.boolean().optional(),
  executionRef: z.string().uuid(),
  context: z.object({
    previous_recommendations: z.array(z.string().uuid()).optional(),
    implemented_actions: z.array(z.object({
      recommendation_id: z.string().uuid(),
      action_taken: z.string(),
      outcome: z.enum(['successful', 'failed', 'partial']),
      impact_observed: z.record(z.number()).optional(),
    })).optional(),
  }).optional(),
});

export type StrategicRecommendationInput = z.infer<typeof StrategicRecommendationInputSchema>;

/**
 * Output from the Strategic Recommendation Agent (enhanced)
 * Note: Enhanced fields are optional for backward compatibility
 */
export const StrategicRecommendationOutputSchema = z.object({
  request_id: z.string().uuid().optional(),
  recommendations: z.array(StrategicRecommendationSchema),
  signal_aggregation: SignalAggregationSchema.optional(),
  cross_domain_correlations: z.array(CrossDomainCorrelationSchema).optional(),
  system_health: z.object({
    overall_score: z.number().min(0).max(100),
    dimensions: z.array(z.object({
      dimension: z.string(),
      score: z.number().min(0).max(100),
      trend: z.enum(['improving', 'stable', 'degrading']),
      critical_issues: z.array(z.string()).optional(),
    })),
  }).optional(),
  kpis: z.array(z.object({
    name: z.string(),
    current_value: z.number(),
    target_value: z.number().optional(),
    trend: TrendAnalysisSchema,
    status: z.enum(['healthy', 'warning', 'critical']),
  })).optional(),
  decision_event: z.object({
    agent_id: z.string(),
    agent_version: z.string(),
    decision_type: z.string(),
    inputs_hash: z.string(),
    outputs: z.record(z.unknown()),
    confidence: z.number().min(0).max(1),
    constraints_applied: z.array(z.string()),
    execution_ref: z.string().optional(),
    timestamp: z.string().datetime(),
    metadata: z.record(z.unknown()).optional(),
  }).optional(),
  totalSignalsAnalyzed: z.number().int().nonnegative(),
  trendsIdentified: z.number().int().nonnegative(),
  correlationsFound: z.number().int().nonnegative(),
  overallConfidence: z.number().min(0).max(1),
  analysisMetadata: z.object({
    timeWindow: TimeRangeSchema,
    layersAnalyzed: z.array(z.string()),
    processingDuration: z.number().optional(),
  }),
  metadata: z.object({
    agent_version: z.string(),
    processing_time_ms: z.number().nonnegative(),
    data_sources_used: z.array(DataSourceSchema),
    events_analyzed: z.number().int().nonnegative(),
    model_version: z.string().optional(),
    timestamp: z.string().datetime(),
  }).optional(),
});

export type StrategicRecommendationOutput = z.infer<typeof StrategicRecommendationOutputSchema>;

/**
 * Agent configuration
 */
export const StrategicRecommendationAgentConfigSchema = z.object({
  agent_id: z.string().min(1),
  version: z.string().regex(/^\d+\.\d+\.\d+$/),
  model: z.object({
    provider: z.enum(['anthropic', 'openai', 'custom']),
    model_name: z.string(),
    temperature: z.number().min(0).max(2).optional(),
    max_tokens: z.number().int().positive().optional(),
  }).optional(),
  default_constraints: z.array(z.object({
    type: z.string(),
    value: z.unknown(),
  })).optional(),
  confidence_thresholds: z.object({
    min_overall: z.number().min(0).max(1),
    min_data_quality: z.number().min(0).max(1),
    min_trend_strength: z.number().min(0).max(1),
  }).optional(),
  source_priorities: z.record(z.number()).optional(),
  features: z.object({
    enable_causal_analysis: z.boolean().optional(),
    enable_predictive_modeling: z.boolean().optional(),
    enable_anomaly_detection: z.boolean().optional(),
    enable_cross_domain_correlation: z.boolean().optional(),
  }).optional(),
});

export type StrategicRecommendationAgentConfig = z.infer<typeof StrategicRecommendationAgentConfigSchema>;

// Type inference exports
export type ValidatedSignalAggregation = z.infer<typeof SignalAggregationSchema>;
export type ValidatedCrossDomainCorrelation = z.infer<typeof CrossDomainCorrelationSchema>;
export type ValidatedStrategicRecommendationInput = z.infer<typeof StrategicRecommendationInputSchema>;
export type ValidatedStrategicRecommendationOutput = z.infer<typeof StrategicRecommendationOutputSchema>;
export type ValidatedStrategicRecommendationAgentConfig = z.infer<typeof StrategicRecommendationAgentConfigSchema>;
