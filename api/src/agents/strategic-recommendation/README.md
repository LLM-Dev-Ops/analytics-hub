# Strategic Recommendation Agent

## Overview

The Strategic Recommendation Agent aggregates DecisionEvents from multiple source layers (Observatory, CostOps, Governance), performs trend analysis, detects cross-domain correlations, and generates strategic recommendations.

## Responsibilities

### What the Agent DOES

1. **Signal Aggregation**: Collects and aggregates signals from multiple source layers
2. **Trend Analysis**: Analyzes temporal patterns across time windows
3. **Correlation Detection**: Identifies relationships between different signal types
4. **Recommendation Generation**: Synthesizes actionable strategic recommendations
5. **Confidence Calculation**: Computes confidence scores for each recommendation
6. **Event Emission**: Emits exactly ONE DecisionEvent per invocation

### What the Agent DOES NOT Do

- Modify execution behavior
- Enforce constraints or policies
- Trigger workflows or retries
- Execute other agents
- Apply optimizations autonomously

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                 Strategic Recommendation Agent               │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  1. aggregateSignals()                                      │
│     ├─ Fetch DecisionEvents from source layers             │
│     └─ Group by layer and metric type                      │
│                                                              │
│  2. analyzeTrends()                                         │
│     ├─ Calculate linear regression                         │
│     ├─ Detect anomalies (>2σ from mean)                    │
│     ├─ Determine trend direction                           │
│     └─ Calculate velocity (rate of change)                 │
│                                                              │
│  3. detectCorrelations()                                    │
│     ├─ Compare trends across layers                        │
│     ├─ Calculate correlation coefficients                  │
│     └─ Classify strength (weak/moderate/strong)            │
│                                                              │
│  4. synthesizeRecommendations()                             │
│     ├─ Generate recommendations from correlations          │
│     ├─ Categorize by type                                  │
│     ├─ Prioritize by impact                                │
│     └─ Calculate expected outcomes                         │
│                                                              │
│  5. calculateConfidence()                                   │
│     └─ Aggregate confidence across recommendations         │
│                                                              │
│  6. createDecisionEvent()                                   │
│     └─ Emit audit trail with full traceability            │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

## Core Functions

### `analyze(input: StrategicRecommendationInput)`

Main handler that orchestrates the complete analysis pipeline.

**Input Schema:**
```typescript
{
  timeWindow: { startTime: string, endTime: string },
  sourceLayers: string[],              // e.g., ['observatory', 'cost-ops', 'governance']
  minConfidence: number,                // 0-1, default: 0.5
  maxRecommendations: number,           // default: 10
  focusCategories?: string[],           // optional filter
  executionRef: string                  // UUID for traceability
}
```

**Output Schema:**
```typescript
{
  recommendations: StrategicRecommendation[],
  totalSignalsAnalyzed: number,
  trendsIdentified: number,
  correlationsFound: number,
  overallConfidence: number,
  analysisMetadata: {
    timeWindow: TimeRange,
    layersAnalyzed: string[],
    processingDuration: number
  }
}
```

### `aggregateSignals(timeWindow: TimeRange, sourceLayers: string[])`

Fetches and aggregates signals from multiple source layers within a time window.

### `analyzeTrends(signals: SignalAggregation)`

Performs trend analysis on aggregated signals:
- Linear regression for direction
- Anomaly detection (>2 standard deviations)
- Velocity calculation (rate of change)
- Volatility assessment

### `detectCorrelations(trends: TrendAnalysis[])`

Detects cross-domain correlations between trends:
- Compares trends from different layers
- Calculates correlation coefficients
- Classifies strength (weak/moderate/strong)
- Infers potential causality

### `synthesizeRecommendations(correlations: CrossDomainCorrelation[])`

Generates strategic recommendations from correlations:
- Categorizes by type (cost, performance, risk, etc.)
- Prioritizes by impact (critical/high/medium/low)
- Calculates expected outcomes
- Sorts by priority and confidence

### `calculateConfidence(recommendations: StrategicRecommendation[])`

Calculates overall confidence score across all recommendations.

### `createDecisionEvent(input, output, confidence)`

Creates the DecisionEvent for audit and traceability.

## Usage Example

```typescript
import { analyze } from './agents/strategic-recommendation';

const input = {
  timeWindow: {
    startTime: '2024-01-01T00:00:00Z',
    endTime: '2024-01-31T23:59:59Z',
  },
  sourceLayers: ['observatory', 'cost-ops', 'governance'],
  minConfidence: 0.6,
  maxRecommendations: 5,
  executionRef: '123e4567-e89b-12d3-a456-426614174000',
};

const { output, event } = await analyze(input);

console.log(`Found ${output.recommendations.length} recommendations`);
console.log(`Overall confidence: ${output.overallConfidence}`);

// Emit DecisionEvent for audit trail
await emitDecisionEvent(event);
```

## Recommendation Categories

1. **cost-optimization**: Opportunities to reduce costs
2. **performance-improvement**: Ways to enhance performance
3. **risk-mitigation**: Actions to reduce risk
4. **capacity-planning**: Scaling and capacity insights
5. **governance-compliance**: Compliance and policy recommendations
6. **strategic-initiative**: Long-term strategic actions

## Priority Levels

- **critical**: Requires immediate attention (strong correlation + high magnitude)
- **high**: Important but not urgent (strong correlation or high magnitude)
- **medium**: Moderate impact (moderate correlation)
- **low**: Nice to have (weak correlation)

## Time Horizons

- **immediate**: Act within hours/days
- **short-term**: Act within weeks
- **medium-term**: Plan for months
- **long-term**: Strategic planning (quarters/years)

## Trend Analysis

### Direction Detection
- **increasing**: Positive slope with low volatility
- **decreasing**: Negative slope with low volatility
- **stable**: Minimal slope (|slope| < 0.05)
- **volatile**: High coefficient of variation (>0.3)

### Anomaly Detection
Values >2 standard deviations from mean are flagged as anomalies.

### Velocity Calculation
Rate of change per hour: `(lastValue - firstValue) / timeDelta`

## Correlation Analysis

### Correlation Coefficient
- Positive correlation: Same direction trends
- Negative correlation: Opposite direction trends
- Threshold: |r| > 0.3 for significance

### Strength Classification
- **weak**: 0.3 ≤ |r| < 0.5
- **moderate**: 0.5 ≤ |r| < 0.7
- **strong**: |r| ≥ 0.7

### Causality Inference
- **none**: |r| < 0.5
- **potential**: 0.5 ≤ |r| < 0.7
- **likely**: |r| ≥ 0.7

## DecisionEvent Schema

```typescript
{
  agent_id: 'strategic-recommendation-agent',
  agent_version: '1.0.0',
  decision_type: 'strategic_recommendation_summary',
  inputs_hash: string,                    // SHA-256 hash for reproducibility
  outputs: StrategicRecommendationOutput,
  confidence: number,                     // 0-1
  constraints_applied: ConstraintApplied[],
  execution_ref: string,                  // UUID
  timestamp: string                       // ISO 8601
}
```

## Integration Points

### Input Sources
- Observatory Agent DecisionEvents (performance metrics)
- CostOps Agent DecisionEvents (cost metrics)
- Governance Agent DecisionEvents (compliance metrics)
- Consensus Agent DecisionEvents (aggregated signals)

### Output Consumers
- Strategic dashboards
- Executive reporting systems
- Alerting and notification systems
- Workflow orchestration engines (read-only)

## Testing

See `/tests/agents/strategic-recommendation.test.ts` for comprehensive unit tests.

## License

MIT
