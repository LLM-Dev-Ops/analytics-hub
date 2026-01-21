# Strategic Recommendation Agent - Type Hierarchy

## Type Dependency Graph

```
┌─────────────────────────────────────────────────────────────────┐
│                        Core Agent Types                          │
│                     (agents/types.ts)                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  DecisionEvent ─────────────────┐                               │
│    ├─ agent_id                  │                               │
│    ├─ agent_version             │                               │
│    ├─ decision_type             │                               │
│    ├─ inputs_hash               │                               │
│    ├─ outputs                   │                               │
│    ├─ confidence                │                               │
│    ├─ constraints_applied       │                               │
│    └─ timestamp                 │                               │
│                                 │                               │
│  RecommendationConfidence       │                               │
│    ├─ overall                   │                               │
│    ├─ data_quality              │                               │
│    ├─ trend_strength            │                               │
│    ├─ correlation_strength      │                               │
│    └─ level                     │                               │
│                                 │                               │
│  TrendAnalysis                  │                               │
│    ├─ metric                    │                               │
│    ├─ period                    │                               │
│    ├─ direction                 │                               │
│    ├─ rate_of_change            │                               │
│    ├─ significance              │                               │
│    ├─ projection                │                               │
│    └─ anomalies                 │                               │
│                                 │                               │
│  RiskOpportunityAssessment      │                               │
│    ├─ type                      │                               │
│    ├─ category                  │                               │
│    ├─ severity                  │                               │
│    ├─ likelihood                │                               │
│    ├─ impact                    │                               │
│    └─ recommended_actions       │                               │
│                                 │                               │
│  StrategicRecommendation        │                               │
│    ├─ recommendation_id         │                               │
│    ├─ title                     │                               │
│    ├─ description               │                               │
│    ├─ category                  │                               │
│    ├─ priority                  │                               │
│    ├─ confidence ───────────────┼─► RecommendationConfidence    │
│    ├─ trends ───────────────────┼─► TrendAnalysis[]            │
│    ├─ assessments ──────────────┼─► RiskOpportunityAssessment[] │
│    └─ expected_outcomes         │                               │
│                                 │                               │
└─────────────────────────────────┼───────────────────────────────┘
                                  │
                                  │ Used By
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────┐
│                  Agent-Specific Types                            │
│            (strategic-recommendation/types.ts)                   │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  DataSource (enum)                                              │
│    ├─ Observatory                                               │
│    ├─ Sentinel                                                  │
│    ├─ CostOps                                                   │
│    ├─ Governance                                                │
│    ├─ Registry                                                  │
│    └─ PolicyEngine                                              │
│                                                                  │
│  SignalAggregation                                              │
│    ├─ aggregation_id                                            │
│    ├─ time_window                                               │
│    ├─ by_source ────────────────► DataSource                    │
│    ├─ aggregated_metrics                                        │
│    ├─ statistics                                                │
│    └─ temporal_patterns                                         │
│                                                                  │
│  CrossDomainCorrelation                                         │
│    ├─ correlation_id                                            │
│    ├─ domains                                                   │
│    ├─ correlations                                              │
│    ├─ causal_relationships                                      │
│    ├─ insights                                                  │
│    └─ anomalous_correlations                                    │
│                                                                  │
│  StrategicRecommendationInput                                   │
│    ├─ request_id                                                │
│    ├─ time_range                                                │
│    ├─ data_sources ─────────────► DataSource[]                  │
│    ├─ focus_areas                                               │
│    ├─ constraints                                               │
│    └─ context                                                   │
│                                                                  │
│  StrategicRecommendationOutput                                  │
│    ├─ request_id                                                │
│    ├─ recommendations ──────────► StrategicRecommendation[]     │
│    ├─ signal_aggregation ───────► SignalAggregation             │
│    ├─ cross_domain_correlations ► CrossDomainCorrelation[]      │
│    ├─ system_health                                             │
│    ├─ kpis ─────────────────────► TrendAnalysis[]              │
│    ├─ decision_event ───────────► DecisionEvent                 │
│    └─ metadata                                                  │
│                                                                  │
│  StrategicRecommendationAgentConfig                             │
│    ├─ agent_id                                                  │
│    ├─ version                                                   │
│    ├─ model                                                     │
│    ├─ default_constraints                                       │
│    ├─ confidence_thresholds                                     │
│    └─ features                                                  │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

## Type Flow

```
User Request
     │
     ▼
StrategicRecommendationInput
     │
     ▼
Strategic Recommendation Agent
     │
     ├──► Signal Aggregation ──────► SignalAggregation
     │         │
     │         ▼
     │    Data from Multiple Sources
     │         │
     │         ▼
     ├──► Trend Analysis ───────────► TrendAnalysis[]
     │
     ├──► Cross-Domain Correlation ─► CrossDomainCorrelation[]
     │
     ├──► Risk Assessment ──────────► RiskOpportunityAssessment[]
     │
     ├──► Recommendation Generation ► StrategicRecommendation[]
     │
     └──► Decision Logging ─────────► DecisionEvent
     │
     ▼
StrategicRecommendationOutput
     │
     ▼
User Response
```

## Validation Flow

```
Raw Input Data
     │
     ▼
StrategicRecommendationInputSchema.parse()
     │
     ├─ Success ─────► ValidatedStrategicRecommendationInput
     │
     └─ Failure ─────► ZodError with detailed error messages
                            │
                            ▼
                       Error Response
```

## Confidence Calculation

```
RecommendationConfidence
     │
     ├─ data_quality ◄───────── Data completeness, freshness, accuracy
     │
     ├─ trend_strength ◄──────── Statistical significance, consistency
     │
     ├─ correlation_strength ◄─ Cross-domain correlation strength
     │
     ├─ historical_accuracy ◄── Past recommendation success rate
     │
     └─ overall ◄────────────── Weighted combination of above
          │
          ▼
     ConfidenceLevel
     (very_low | low | medium | high | very_high)
```

## Enum Types

### DecisionType
- `strategic_recommendation`
- `trend_analysis`
- `risk_assessment`
- `opportunity_identification`
- `cross_domain_correlation`
- `anomaly_detection`
- `predictive_insight`

### ConfidenceLevel
- `very_low` (0.0-0.2)
- `low` (0.2-0.4)
- `medium` (0.4-0.6)
- `high` (0.6-0.8)
- `very_high` (0.8-1.0)

### ConstraintType
- `budget_limit`
- `time_constraint`
- `risk_tolerance`
- `compliance_requirement`
- `data_availability`
- `resource_capacity`

### DataSource
- `llm-observatory`
- `llm-sentinel`
- `llm-cost-ops`
- `llm-governance-dashboard`
- `llm-registry`
- `llm-policy-engine`
