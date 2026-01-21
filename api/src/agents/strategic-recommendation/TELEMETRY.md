# Strategic Recommendation Agent - Telemetry Module

## Overview

The telemetry module provides comprehensive telemetry emission for the Strategic Recommendation Agent, fully compatible with LLM-Observatory and OpenTelemetry standards. It tracks agent invocation metrics, recommendation generation, correlation detection, and decision event persistence.

## Architecture

The telemetry system consists of several key components:

### 1. Telemetry Context
Encapsulates execution context information for request tracing and correlation:

```typescript
interface TelemetryContext {
  executionId: string;              // Unique execution identifier
  correlationId: string;             // For tracing across services
  parentEventId?: string;            // For nested executions
  agentId: string;                   // Agent identifier
  agentVersion: string;              // Agent version
  environment: string;               // Environment (dev/prod)
  tags: Record<string, string>;     // Custom tags
}
```

### 2. Telemetry Manager
`StrategicRecommendationTelemetry` class handles all telemetry emission with methods for:

- **Agent Invocation Tracking**: Latency, input/output sizes, success/failure
- **Recommendation Generation**: Count, confidence distribution, categorization
- **Correlation Detection**: Performance metrics, strength distribution
- **Decision Event Persistence**: Audit logging and lifecycle tracking
- **Comprehensive Output Analysis**: Full signal analysis metrics

## Core APIs

### Create Telemetry Context

```typescript
import { createTelemetryContext } from './telemetry';

const context = createTelemetryContext(
  'strategic-recommendation-agent',
  '1.0.0',
  'production',
  { feature: 'analysis', region: 'us-west' }
);
```

### Initialize Telemetry Manager

```typescript
import { StrategicRecommendationTelemetry } from './telemetry';

const telemetry = new StrategicRecommendationTelemetry(context);
```

### Emit Agent Invocation Metrics

```typescript
// Track successful invocation
telemetry.emitAgentInvocation(
  input,          // Input data
  output,         // Output data
  durationMs,     // Duration in milliseconds
  true,           // Success flag
  undefined       // Optional error
);

// Track failed invocation
telemetry.emitAgentInvocation(
  input,
  output,
  durationMs,
  false,
  new Error('Processing failed')
);
```

**Emitted Metrics:**
- `total_latency_ms`: Total execution time
- `input_size`: Input data size in bytes
- `output_size`: Output data size in bytes
- `success`: Whether invocation succeeded
- `error_code` / `error_message`: Error details if applicable

### Emit Recommendation Generation Metrics

```typescript
telemetry.emitRecommendationGenerated(recommendations);
```

**Tracked Data:**
- Count of recommendations generated
- Confidence distribution:
  - Very Low: < 0.2
  - Low: 0.2 - 0.4
  - Medium: 0.4 - 0.6
  - High: 0.6 - 0.8
  - Very High: > 0.8
- Breakdown by category (cost-optimization, performance-improvement, etc.)
- Breakdown by priority (critical, high, medium, low)
- Average confidence score

### Emit Correlation Detection Metrics

```typescript
telemetry.emitCorrelationDetected(correlations, durationMs);
```

**Tracked Data:**
- Total correlations found
- Correlation strength distribution (weak, moderate, strong)
- Average correlation coefficient
- Detection duration in milliseconds

### Emit Decision Event Persistence Metrics

```typescript
telemetry.emitDecisionEventPersisted(
  decisionEvent,      // Decision event object
  persistenceDurationMs,  // Time to persist in ms
  success             // Whether persistence succeeded
);
```

**Use Cases:**
- Audit logging for compliance
- Tracking decision lifecycle
- Monitoring persistence performance
- Error tracking for persistence failures

### Emit Comprehensive Agent Output Analysis

```typescript
telemetry.emitAgentOutputAnalysis(output, durationMs);
```

**Includes:**
- Total signals analyzed
- Trends identified count
- Correlations found count
- Recommendations generated
- Overall confidence score
- Layers analyzed
- Processing duration

## LLM-Observatory Integration

The telemetry module emits events in the LLM-Observatory format with the following event types:

### Event Structure

All events follow the `AnalyticsEvent` interface:

```typescript
interface AnalyticsEvent extends CommonEventFields {
  event_id: UUID;
  timestamp: ISODateString;
  source_module: SourceModule.LlmAnalyticsHub;
  event_type: EventType;
  correlation_id?: UUID;
  parent_event_id?: UUID;
  schema_version: string;
  severity: Severity;
  environment: string;
  tags: Record<string, string>;
  payload: EventPayload;
}
```

### Event Types Emitted

1. **Telemetry Events**
   - `type: 'latency'`: Agent invocation and correlation detection latency
   - `type: 'token_usage'`: Recommendation and output analysis metrics

2. **Governance Events**
   - `type: 'audit'`: Decision event persistence tracking

3. **Lifecycle Events**
   - Tracked through base telemetry emitter
   - `agent_invocation_started`, `agent_invocation_completed`, `agent_invocation_failed`
   - `persistence_completed`, `persistence_failed`

## Distributed Tracing with OpenTelemetry

### Create Span Context

```typescript
import { OpenTelemetryBridge } from './telemetry';

const spanContext = OpenTelemetryBridge.createSpanContext(context);
// {
//   'trace-id': context.correlationId,
//   'span-id': context.executionId,
//   'parent-span-id': context.parentEventId,
//   'agent-id': context.agentId,
//   'agent-version': context.agentVersion
// }
```

### Add Context to Span Attributes

```typescript
OpenTelemetryBridge.addContextAsSpanAttributes(span, context);

// Adds attributes:
// 'agent.id': string
// 'agent.version': string
// 'execution.id': string
// 'correlation.id': string
// 'environment': string
// 'tag.*': custom tags
```

## Nested Execution Tracing

For multi-level agent calls, use child telemetry contexts:

```typescript
import { createChildTelemetryContext } from './telemetry';

// Parent execution
const parentContext = createTelemetryContext('parent-agent', '1.0.0');
const parentTelemetry = new StrategicRecommendationTelemetry(parentContext);

// Child execution
const childContext = createChildTelemetryContext(
  parentContext,
  'child-agent',
  '1.0.0'
);
const childTelemetry = new StrategicRecommendationTelemetry(childContext);

// Child telemetry inherits:
// - Same correlationId (for trace continuity)
// - Parent executionId as parentEventId
// - Parent tags are preserved
```

## Usage Example

```typescript
import {
  StrategicRecommendationTelemetry,
  createTelemetryContext,
} from './telemetry';
import { agent } from './agent';

async function executeAgentWithTelemetry(input) {
  // Create telemetry context
  const telemetryContext = createTelemetryContext(
    'strategic-recommendation-agent',
    '1.0.0',
    process.env.NODE_ENV || 'development',
    { request_id: input.executionRef }
  );

  const telemetry = new StrategicRecommendationTelemetry(telemetryContext);

  const startTime = Date.now();
  let output;
  let success = true;
  let error;

  try {
    // Execute agent
    output = await agent.execute(input);

    // Emit comprehensive metrics
    telemetry.emitAgentOutputAnalysis(output, Date.now() - startTime);

    // Emit recommendation metrics
    telemetry.emitRecommendationGenerated(output.recommendations);

    // Emit correlation metrics if correlations exist
    if (output.correlationsFound > 0) {
      telemetry.emitCorrelationDetected([], Date.now() - startTime);
    }

    // Persist decision event
    await persistDecisionEvent(output);
    telemetry.emitDecisionEventPersisted(output, 100, true);

  } catch (err) {
    success = false;
    error = err as Error;
    telemetry.emitDecisionEventPersisted(output, 100, false);
  } finally {
    // Emit overall invocation metrics
    telemetry.emitAgentInvocation(
      input,
      output,
      Date.now() - startTime,
      success,
      error
    );

    // Flush remaining events
    await telemetry.flush();
  }

  return output;
}
```

## Integration with Existing Metrics

The telemetry module integrates with existing Prometheus metrics via the base `TelemetryEmitter`:

```typescript
// The emitter batches events and sends to Observatory
// Prometheus metrics are collected separately via prom-client
// Both systems work in parallel for comprehensive observability
```

## Configuration

### Environment Variables

```bash
# LLM-Observatory endpoint
OBSERVATORY_ENDPOINT=http://localhost:9090

# Optional API key for Observatory
OBSERVATORY_API_KEY=your-api-key

# Enable/disable telemetry
TELEMETRY_ENABLED=true

# Node environment
NODE_ENV=production
```

### Telemetry Emitter Configuration

```typescript
const telemetry = new StrategicRecommendationTelemetry(
  context,
  {
    endpoint: 'http://observatory:9090',
    apiKey: process.env.OBSERVATORY_API_KEY,
    enabled: true,
    batchSize: 100,        // Events per batch
    flushIntervalMs: 5000, // Flush interval
  }
);
```

## Performance Considerations

1. **Asynchronous Emission**: Events are batched and sent asynchronously
2. **Memory Efficient**: Data size is calculated using JSON serialization
3. **Error Resilience**: Failures in telemetry emission don't affect agent execution
4. **Graceful Degradation**: Telemetry can be disabled via environment variable

## Monitoring Telemetry Health

Monitor these metrics in LLM-Observatory:

- **Agent Invocation Latency**: `latency_ms` percentiles (p50, p95, p99)
- **Recommendation Generation**: Distribution of confidence scores
- **Correlation Detection**: Strength distribution and correlation coefficients
- **Decision Persistence**: Success rate and persistence latency
- **Overall Agent Confidence**: Aggregate confidence across executions

## Best Practices

1. **Always flush on shutdown**: Call `telemetry.flush()` in cleanup handlers
2. **Use correlation IDs**: Enables request tracing across services
3. **Add custom tags**: Include request IDs, user IDs, features for filtering
4. **Monitor edge cases**: Track low-confidence recommendations and correlations
5. **Regular audits**: Review decision event persistence for compliance

## Troubleshooting

### Events not appearing in Observatory

1. Check `OBSERVATORY_ENDPOINT` is correct
2. Verify `TELEMETRY_ENABLED` is true
3. Check network connectivity to Observatory
4. Review logs for flush errors

### High latency metrics

1. Check if batch sizes are too large (increase `flushIntervalMs`)
2. Verify network latency to Observatory
3. Monitor agent processing time separately

### Missing correlation IDs

1. Ensure `createTelemetryContext` is called
2. Verify child contexts inherit parent `correlationId`
3. Check OpenTelemetry span context propagation

## References

- [LLM-Observatory Event Schema](../../types/events.ts)
- [Telemetry Emitter](../../services/telemetry-emitter.ts)
- [Strategic Recommendation Agent](./agent.ts)
- [OpenTelemetry Specification](https://opentelemetry.io/docs/)
