/**
 * Strategic Recommendation Agent - Main Export
 *
 * Aggregates and exports all agent-related types, schemas, and utilities
 * for the Analytics Hub agent system.
 */

// Core agent types (base types)
export * from './types';

// Strategic recommendation agent types (re-export without duplicates)
export {
  TimeRangeSchema,
  TimeRange,
  DataSource,
  SourceLayer,
  SignalSchema,
  Signal,
  SignalAggregationSchema,
  SignalAggregation,
  TrendDirection,
  // Rename to avoid conflict with base types
  TrendAnalysisSchema as SRTrendAnalysisSchema,
  TrendAnalysis as SRTrendAnalysis,
  CrossDomainCorrelationSchema,
  CrossDomainCorrelation,
  RecommendationPriority,
  RecommendationCategory,
  StrategicRecommendationSchema as SRRecommendationSchema,
  StrategicRecommendation as SRRecommendation,
  DataSourceSchema,
  StrategicRecommendationInputSchema,
  StrategicRecommendationInput,
  StrategicRecommendationOutputSchema,
  StrategicRecommendationOutput,
  StrategicRecommendationAgentConfigSchema,
  StrategicRecommendationAgentConfig,
  ValidatedSignalAggregation,
  ValidatedCrossDomainCorrelation,
  ValidatedStrategicRecommendationInput,
  ValidatedStrategicRecommendationOutput,
  ValidatedStrategicRecommendationAgentConfig,
} from './strategic-recommendation/types';
