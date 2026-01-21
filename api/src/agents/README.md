# Strategic Recommendation Agent - Type System

This directory contains TypeScript types and Zod validation schemas for the Strategic Recommendation Agent system.

## Overview

The Strategic Recommendation Agent analyzes signals from multiple data sources (Observatory, Sentinel, CostOps, Governance, Registry, Policy Engine) to generate actionable strategic recommendations.

## File Structure

```
agents/
├── types.ts                          # Core agent types (DecisionEvent, StrategicRecommendation, etc.)
├── strategic-recommendation/
│   └── types.ts                      # Agent-specific types (Input/Output, SignalAggregation, etc.)
├── index.ts                          # Main export file
└── README.md                         # This file
```

## Core Types (`types.ts`)

### DecisionEvent

Captures all agent decisions for auditability and continuous learning:

```typescript
interface DecisionEvent {
  agent_id: string;
  agent_version: string;
  decision_type: DecisionType;
  inputs_hash: string;           // SHA-256 hash for reproducibility
  outputs: Record<string, unknown>;
  confidence: number;            // 0.0 to 1.0
  constraints_applied: ConstraintType[];
  execution_ref?: string;
  timestamp: ISODateString;
  metadata?: Record<string, unknown>;
}
```

### StrategicRecommendation

Main recommendation output with confidence metrics, trends, and assessments:

```typescript
interface StrategicRecommendation {
  recommendation_id: UUID;
  title: string;
  description: string;
  category: 'optimization' | 'cost_reduction' | 'risk_mitigation' | 'performance_improvement' | 'strategic_initiative';
  priority: 'critical' | 'high' | 'medium' | 'low';
  confidence: RecommendationConfidence;
  trends: TrendAnalysis[];
  assessments: RiskOpportunityAssessment[];
  expected_outcomes: Array<{...}>;
  implementation_steps?: Array<{...}>;
  generated_at: ISODateString;
}
```

### TrendAnalysis

Statistical trend analysis with projections:

```typescript
interface TrendAnalysis {
  metric: string;
  period: { start: ISODateString; end: ISODateString };
  direction: 'increasing' | 'decreasing' | 'stable' | 'volatile';
  rate_of_change: number;
  significance: number;          // p-value
  projection?: {
    next_period: number;
    confidence_interval: [number, number];
  };
  seasonality?: {...};
  anomalies?: Array<{...}>;
}
```

### RiskOpportunityAssessment

Risk and opportunity identification with mitigation strategies:

```typescript
interface RiskOpportunityAssessment {
  type: 'risk' | 'opportunity';
  category: 'cost' | 'performance' | 'security' | 'compliance' | 'operational' | 'strategic';
  severity: 'critical' | 'high' | 'medium' | 'low';
  description: string;
  likelihood: number;
  impact: {...};
  timeframe: 'immediate' | 'short_term' | 'medium_term' | 'long_term';
  recommended_actions: Array<{...}>;
  evidence: Array<{...}>;
}
```

## Agent-Specific Types (`strategic-recommendation/types.ts`)

### SignalAggregation

Aggregates signals from multiple data sources:

```typescript
interface SignalAggregation {
  aggregation_id: UUID;
  time_window: {
    start: ISODateString;
    end: ISODateString;
    granularity: 'minute' | 'hour' | 'day' | 'week' | 'month';
  };
  by_source: Array<{
    source: DataSource;
    signal_count: number;
    avg_severity: number;
    dominant_categories: string[];
    key_metrics: Record<string, number>;
  }>;
  aggregated_metrics: {...};
  statistics: {...};
  temporal_patterns?: Array<{...}>;
}
```

### CrossDomainCorrelation

Identifies relationships across cost, security, performance, and governance:

```typescript
interface CrossDomainCorrelation {
  correlation_id: UUID;
  domains: Array<{
    domain: 'cost' | 'security' | 'performance' | 'governance' | 'compliance';
    metrics: string[];
  }>;
  correlations: Array<{
    metric_a: string;
    metric_b: string;
    correlation_coefficient: number;
    p_value: number;
    is_significant: boolean;
    relationship_type: 'positive' | 'negative' | 'none';
  }>;
  causal_relationships?: Array<{...}>;
  insights: Array<{...}>;
  anomalous_correlations?: Array<{...}>;
}
```

### StrategicRecommendationInput

Agent input specification:

```typescript
interface StrategicRecommendationInput {
  request_id: UUID;
  time_range: { start: ISODateString; end: ISODateString };
  data_sources?: DataSource[];
  focus_areas?: Array<'cost' | 'security' | 'performance' | 'governance' | 'compliance' | 'operations'>;
  constraints?: Array<{...}>;
  min_confidence?: number;
  max_recommendations?: number;
  include_details?: boolean;
  context?: {...};
}
```

### StrategicRecommendationOutput

Complete agent response with system health and KPIs:

```typescript
interface StrategicRecommendationOutput {
  request_id: UUID;
  recommendations: StrategicRecommendation[];
  signal_aggregation: SignalAggregation;
  cross_domain_correlations: CrossDomainCorrelation[];
  system_health: {...};
  kpis: Array<{...}>;
  decision_event: DecisionEvent;
  metadata: {...};
}
```

## Validation with Zod

All types have corresponding Zod schemas for runtime validation:

```typescript
import { DecisionEventSchema, StrategicRecommendationSchema } from './types';
import { StrategicRecommendationInputSchema } from './strategic-recommendation/types';

// Validate input
const validInput = StrategicRecommendationInputSchema.parse(rawInput);

// Validate output
const validOutput = StrategicRecommendationOutputSchema.parse(agentOutput);
```

## Usage Example

```typescript
import {
  StrategicRecommendationInput,
  StrategicRecommendationOutput,
  DataSource,
  ConstraintType,
} from '@llm-dev-ops/llm-analytics-api/agents';

// Create input
const input: StrategicRecommendationInput = {
  request_id: crypto.randomUUID(),
  time_range: {
    start: '2024-01-01T00:00:00Z',
    end: '2024-01-31T23:59:59Z',
  },
  data_sources: [
    DataSource.Observatory,
    DataSource.CostOps,
    DataSource.Sentinel,
  ],
  focus_areas: ['cost', 'performance', 'security'],
  min_confidence: 0.7,
  max_recommendations: 10,
};

// Agent processes input and returns output
const output: StrategicRecommendationOutput = await strategicAgent.analyze(input);

// Access recommendations
for (const rec of output.recommendations) {
  console.log(`${rec.priority}: ${rec.title}`);
  console.log(`Confidence: ${rec.confidence.overall}`);
}
```

## Type Safety Benefits

1. **Compile-time validation**: Catch type errors during development
2. **Runtime validation**: Zod schemas validate data at runtime
3. **Auto-completion**: IDEs provide intelligent suggestions
4. **Documentation**: Types serve as living documentation
5. **Refactoring safety**: TypeScript prevents breaking changes

## Integration with Frontend

The types in this directory match the event schema in `/frontend/src/types/events.ts`, ensuring type consistency across the full stack.

## Testing

Validate types with Zod schemas:

```typescript
import { StrategicRecommendationInputSchema } from './strategic-recommendation/types';

try {
  const validated = StrategicRecommendationInputSchema.parse(input);
  // Input is valid
} catch (error) {
  // Handle validation errors
  console.error(error.errors);
}
```

## Future Enhancements

- [ ] Add machine learning model types
- [ ] Extend causal inference capabilities
- [ ] Add real-time streaming support
- [ ] Implement federated learning types
- [ ] Add explanation/interpretability metadata
