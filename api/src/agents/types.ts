/**
 * Core Agent Types and Contracts
 * Base types for all AI agents in the Analytics Hub
 */

import { z } from 'zod';

export type UUID = string;
export type ISODateString = string;

// Agent decision types
export enum DecisionType {
  StrategicRecommendation = 'strategic_recommendation',
  TrendAnalysis = 'trend_analysis',
  RiskAssessment = 'risk_assessment',
  OpportunityIdentification = 'opportunity_identification',
  CrossDomainCorrelation = 'cross_domain_correlation',
  AnomalyDetection = 'anomaly_detection',
  PredictiveInsight = 'predictive_insight',
}

// Confidence levels for agent outputs
export enum ConfidenceLevel {
  VeryLow = 'very_low',
  Low = 'low',
  Medium = 'medium',
  High = 'high',
  VeryHigh = 'very_high',
}

// Constraint types that can be applied to agent decisions
export enum ConstraintType {
  BudgetLimit = 'budget_limit',
  TimeConstraint = 'time_constraint',
  RiskTolerance = 'risk_tolerance',
  ComplianceRequirement = 'compliance_requirement',
  DataAvailability = 'data_availability',
  ResourceCapacity = 'resource_capacity',
}

/**
 * Core decision event captured for all agent actions
 * Enables auditability, explainability, and continuous learning
 */
export interface DecisionEvent {
  /** Unique identifier for the agent instance */
  agent_id: string;

  /** Version of the agent (for model versioning) */
  agent_version: string;

  /** Type of decision being made */
  decision_type: DecisionType;

  /** Hash of input data for reproducibility */
  inputs_hash: string;

  /** Structured output from the agent */
  outputs: Record<string, unknown>;

  /** Confidence score (0.0 to 1.0) */
  confidence: number;

  /** Constraints that were applied */
  constraints_applied: ConstraintType[];

  /** Reference to the execution trace */
  execution_ref?: string;

  /** When the decision was made */
  timestamp: ISODateString;

  /** Optional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Strategic recommendation confidence breakdown
 */
export interface RecommendationConfidence {
  /** Overall confidence score (0.0 to 1.0) */
  overall: number;

  /** Confidence in data quality */
  data_quality: number;

  /** Confidence in trend analysis */
  trend_strength: number;

  /** Confidence in correlation analysis */
  correlation_strength: number;

  /** Confidence based on historical accuracy */
  historical_accuracy?: number;

  /** Confidence level category */
  level: ConfidenceLevel;

  /** Factors affecting confidence */
  limiting_factors?: string[];
}

/**
 * Trend analysis over time
 */
export interface TrendAnalysis {
  /** Metric being analyzed */
  metric: string;

  /** Time period of analysis */
  period: {
    start: ISODateString;
    end: ISODateString;
  };

  /** Trend direction */
  direction: 'increasing' | 'decreasing' | 'stable' | 'volatile';

  /** Rate of change (percentage) */
  rate_of_change: number;

  /** Statistical significance (p-value) */
  significance: number;

  /** Projected future values */
  projection?: {
    next_period: number;
    confidence_interval: [number, number];
  };

  /** Seasonal patterns detected */
  seasonality?: {
    detected: boolean;
    cycle_length?: string;
    amplitude?: number;
  };

  /** Anomalies detected in the trend */
  anomalies?: Array<{
    timestamp: ISODateString;
    value: number;
    deviation_score: number;
  }>;
}

/**
 * Risk and opportunity assessment
 */
export interface RiskOpportunityAssessment {
  /** Type of assessment */
  type: 'risk' | 'opportunity';

  /** Category */
  category: 'cost' | 'performance' | 'security' | 'compliance' | 'operational' | 'strategic';

  /** Severity/Impact level */
  severity: 'critical' | 'high' | 'medium' | 'low';

  /** Description */
  description: string;

  /** Likelihood of occurrence (0.0 to 1.0) */
  likelihood: number;

  /** Potential impact (quantified if possible) */
  impact: {
    qualitative: string;
    quantitative?: {
      metric: string;
      value: number;
      unit: string;
    };
  };

  /** Timeframe */
  timeframe: 'immediate' | 'short_term' | 'medium_term' | 'long_term';

  /** Recommended actions */
  recommended_actions: Array<{
    action: string;
    priority: 'critical' | 'high' | 'medium' | 'low';
    estimated_effort?: string;
    expected_outcome?: string;
  }>;

  /** Supporting evidence */
  evidence: Array<{
    source: string;
    data_points?: unknown[];
    correlation_strength?: number;
  }>;
}

/**
 * Strategic recommendation output
 */
export interface StrategicRecommendation {
  /** Unique recommendation ID */
  recommendation_id: UUID;

  /** Title/summary */
  title: string;

  /** Detailed description */
  description: string;

  /** Category */
  category: 'optimization' | 'cost_reduction' | 'risk_mitigation' | 'performance_improvement' | 'strategic_initiative';

  /** Priority level */
  priority: 'critical' | 'high' | 'medium' | 'low';

  /** Confidence metrics */
  confidence: RecommendationConfidence;

  /** Supporting trend analyses */
  trends: TrendAnalysis[];

  /** Risk/opportunity assessments */
  assessments: RiskOpportunityAssessment[];

  /** Expected outcomes */
  expected_outcomes: Array<{
    metric: string;
    current_value?: number;
    target_value: number;
    timeframe: string;
    confidence: number;
  }>;

  /** Implementation steps */
  implementation_steps?: Array<{
    step: number;
    description: string;
    dependencies?: number[];
    estimated_duration?: string;
  }>;

  /** Cross-references to related data */
  related_events?: UUID[];

  /** When the recommendation was generated */
  generated_at: ISODateString;

  /** Expiration (if time-sensitive) */
  expires_at?: ISODateString;
}

// Zod Schemas for validation

export const DecisionTypeSchema = z.nativeEnum(DecisionType);
export const ConfidenceLevelSchema = z.nativeEnum(ConfidenceLevel);
export const ConstraintTypeSchema = z.nativeEnum(ConstraintType);

export const DecisionEventSchema = z.object({
  agent_id: z.string().min(1),
  agent_version: z.string().regex(/^\d+\.\d+\.\d+$/),
  decision_type: DecisionTypeSchema,
  inputs_hash: z.string().length(64), // SHA-256 hash
  outputs: z.record(z.unknown()),
  confidence: z.number().min(0).max(1),
  constraints_applied: z.array(ConstraintTypeSchema),
  execution_ref: z.string().optional(),
  timestamp: z.string().datetime(),
  metadata: z.record(z.unknown()).optional(),
});

export const RecommendationConfidenceSchema = z.object({
  overall: z.number().min(0).max(1),
  data_quality: z.number().min(0).max(1),
  trend_strength: z.number().min(0).max(1),
  correlation_strength: z.number().min(0).max(1),
  historical_accuracy: z.number().min(0).max(1).optional(),
  level: ConfidenceLevelSchema,
  limiting_factors: z.array(z.string()).optional(),
});

export const TrendAnalysisSchema = z.object({
  metric: z.string().min(1),
  period: z.object({
    start: z.string().datetime(),
    end: z.string().datetime(),
  }),
  direction: z.enum(['increasing', 'decreasing', 'stable', 'volatile']),
  rate_of_change: z.number(),
  significance: z.number().min(0).max(1),
  projection: z.object({
    next_period: z.number(),
    confidence_interval: z.tuple([z.number(), z.number()]),
  }).optional(),
  seasonality: z.object({
    detected: z.boolean(),
    cycle_length: z.string().optional(),
    amplitude: z.number().optional(),
  }).optional(),
  anomalies: z.array(z.object({
    timestamp: z.string().datetime(),
    value: z.number(),
    deviation_score: z.number(),
  })).optional(),
});

export const RiskOpportunityAssessmentSchema = z.object({
  type: z.enum(['risk', 'opportunity']),
  category: z.enum(['cost', 'performance', 'security', 'compliance', 'operational', 'strategic']),
  severity: z.enum(['critical', 'high', 'medium', 'low']),
  description: z.string().min(1),
  likelihood: z.number().min(0).max(1),
  impact: z.object({
    qualitative: z.string().min(1),
    quantitative: z.object({
      metric: z.string(),
      value: z.number(),
      unit: z.string(),
    }).optional(),
  }),
  timeframe: z.enum(['immediate', 'short_term', 'medium_term', 'long_term']),
  recommended_actions: z.array(z.object({
    action: z.string().min(1),
    priority: z.enum(['critical', 'high', 'medium', 'low']),
    estimated_effort: z.string().optional(),
    expected_outcome: z.string().optional(),
  })),
  evidence: z.array(z.object({
    source: z.string().min(1),
    data_points: z.array(z.unknown()).optional(),
    correlation_strength: z.number().min(0).max(1).optional(),
  })),
});

export const StrategicRecommendationSchema = z.object({
  recommendation_id: z.string().uuid(),
  title: z.string().min(1).max(200),
  description: z.string().min(1),
  category: z.enum(['optimization', 'cost_reduction', 'risk_mitigation', 'performance_improvement', 'strategic_initiative']),
  priority: z.enum(['critical', 'high', 'medium', 'low']),
  confidence: RecommendationConfidenceSchema,
  trends: z.array(TrendAnalysisSchema),
  assessments: z.array(RiskOpportunityAssessmentSchema),
  expected_outcomes: z.array(z.object({
    metric: z.string().min(1),
    current_value: z.number().optional(),
    target_value: z.number(),
    timeframe: z.string().min(1),
    confidence: z.number().min(0).max(1),
  })),
  implementation_steps: z.array(z.object({
    step: z.number().int().positive(),
    description: z.string().min(1),
    dependencies: z.array(z.number().int()).optional(),
    estimated_duration: z.string().optional(),
  })).optional(),
  related_events: z.array(z.string().uuid()).optional(),
  generated_at: z.string().datetime(),
  expires_at: z.string().datetime().optional(),
});

// Type inference from Zod schemas
export type ValidatedDecisionEvent = z.infer<typeof DecisionEventSchema>;
export type ValidatedRecommendationConfidence = z.infer<typeof RecommendationConfidenceSchema>;
export type ValidatedTrendAnalysis = z.infer<typeof TrendAnalysisSchema>;
export type ValidatedRiskOpportunityAssessment = z.infer<typeof RiskOpportunityAssessmentSchema>;
export type ValidatedStrategicRecommendation = z.infer<typeof StrategicRecommendationSchema>;
