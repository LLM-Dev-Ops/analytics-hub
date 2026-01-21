/**
 * Strategic Recommendation Agent - Entry Point
 *
 * Exports the main agent handler and supporting types.
 *
 * @module agents/strategic-recommendation
 */

export {
  analyze,
  aggregateSignals,
  analyzeTrends,
  detectCorrelations,
  synthesizeRecommendations,
  calculateConfidence,
  createDecisionEvent,
} from './agent';

export type {
  TimeRange,
  Signal,
  SignalAggregation,
  TrendAnalysis,
  TrendDirection,
  CrossDomainCorrelation,
  StrategicRecommendation,
  StrategicRecommendationInput,
  StrategicRecommendationOutput,
  RecommendationPriority,
  RecommendationCategory,
  SourceLayer,
} from './types';

export {
  TimeRangeSchema,
  SignalSchema,
  SignalAggregationSchema,
  TrendAnalysisSchema,
  CrossDomainCorrelationSchema,
  StrategicRecommendationSchema,
  StrategicRecommendationInputSchema,
  StrategicRecommendationOutputSchema,
} from './types';
