# ADR-002: Database Schema Design

**Status**: Accepted
**Date**: 2025-11-20
**Decision Makers**: SWARM Coordinator, Backend Agent, Database Engineer
**Context**: TimescaleDB schema design for events and metrics storage

---

## Context

The analytics hub must store:
- 8.64 billion events/day (100,000/sec sustained)
- Multiple event types (telemetry, security, cost, governance)
- Time-series metrics with high-cardinality dimensions
- Correlation data and graph relationships
- Metadata and enrichment data

Query patterns:
- Time-range queries (last 24h, 7d, 30d)
- Aggregations by time buckets (1m, 5m, 1h, 1d)
- Filtering by asset_id, event_type, severity
- Cross-module correlation queries
- Trend analysis and forecasting

## Decision

We will use a hybrid schema design optimizing for both raw events and aggregated metrics:

### Schema 1: Events Hypertable (Raw Data)

```sql
CREATE TABLE events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    timestamp TIMESTAMPTZ NOT NULL,
    source_module VARCHAR(50) NOT NULL,
    event_type VARCHAR(50) NOT NULL,
    correlation_id UUID,
    parent_event_id UUID,
    asset_id VARCHAR(100),
    severity VARCHAR(20) NOT NULL,
    environment VARCHAR(50) NOT NULL,
    tenant_id VARCHAR(100) NOT NULL,  -- For multi-tenancy
    payload JSONB NOT NULL,           -- Flexible payload for different event types
    metadata JSONB,                   -- Enrichment data
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Convert to hypertable (partitioned by time)
SELECT create_hypertable('events', 'timestamp',
    chunk_time_interval => INTERVAL '1 day',
    if_not_exists => TRUE
);

-- Add space partitioning for multi-tenancy
SELECT add_dimension('events', 'tenant_id',
    number_partitions => 4,
    if_not_exists => TRUE
);

-- Indexes for common query patterns
CREATE INDEX idx_events_asset_time ON events (asset_id, timestamp DESC);
CREATE INDEX idx_events_type_time ON events (event_type, timestamp DESC);
CREATE INDEX idx_events_tenant_time ON events (tenant_id, timestamp DESC);
CREATE INDEX idx_events_correlation ON events (correlation_id) WHERE correlation_id IS NOT NULL;
CREATE INDEX idx_events_severity ON events (severity, timestamp DESC);
CREATE INDEX idx_events_payload_gin ON events USING GIN (payload);  -- For JSONB queries

-- Compression policy (compress chunks older than 7 days)
SELECT add_compression_policy('events', INTERVAL '7 days');

-- Retention policy (drop chunks older than 365 days)
SELECT add_retention_policy('events', INTERVAL '365 days');
```

### Schema 2: Metrics Hypertable (Pre-Aggregated)

```sql
CREATE TABLE metrics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    timestamp TIMESTAMPTZ NOT NULL,
    time_bucket INTERVAL NOT NULL,    -- 1m, 5m, 1h, 1d, etc.
    asset_id VARCHAR(100) NOT NULL,
    metric_type VARCHAR(100) NOT NULL,
    metric_name VARCHAR(100) NOT NULL,
    tenant_id VARCHAR(100) NOT NULL,

    -- Statistical measures
    value_count BIGINT NOT NULL,
    value_sum DOUBLE PRECISION,
    value_avg DOUBLE PRECISION,
    value_min DOUBLE PRECISION,
    value_max DOUBLE PRECISION,
    value_p50 DOUBLE PRECISION,
    value_p95 DOUBLE PRECISION,
    value_p99 DOUBLE PRECISION,
    value_stddev DOUBLE PRECISION,

    -- Dimensions for grouping
    dimensions JSONB,

    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Convert to hypertable
SELECT create_hypertable('metrics', 'timestamp',
    chunk_time_interval => INTERVAL '1 day',
    if_not_exists => TRUE
);

-- Add space partitioning
SELECT add_dimension('metrics', 'asset_id',
    number_partitions => 8,
    if_not_exists => TRUE
);

-- Indexes
CREATE INDEX idx_metrics_asset_time ON metrics (asset_id, metric_name, timestamp DESC);
CREATE INDEX idx_metrics_tenant_time ON metrics (tenant_id, timestamp DESC);
CREATE INDEX idx_metrics_type ON metrics (metric_type, metric_name, timestamp DESC);

-- Continuous aggregate for hourly rollups
CREATE MATERIALIZED VIEW metrics_hourly
WITH (timescaledb.continuous) AS
SELECT
    time_bucket('1 hour', timestamp) AS bucket,
    asset_id,
    metric_type,
    metric_name,
    tenant_id,
    COUNT(*) AS count,
    AVG(value_avg) AS avg_value,
    MIN(value_min) AS min_value,
    MAX(value_max) AS max_value,
    percentile_cont(0.95) WITHIN GROUP (ORDER BY value_p95) AS p95_value,
    percentile_cont(0.99) WITHIN GROUP (ORDER BY value_p99) AS p99_value
FROM metrics
WHERE time_bucket = '5m'  -- Aggregate from 5-minute buckets
GROUP BY bucket, asset_id, metric_type, metric_name, tenant_id;

-- Refresh policy for continuous aggregate
SELECT add_continuous_aggregate_policy('metrics_hourly',
    start_offset => INTERVAL '2 hours',
    end_offset => INTERVAL '1 hour',
    schedule_interval => INTERVAL '1 hour'
);

-- Compression for metrics (older than 30 days)
SELECT add_compression_policy('metrics', INTERVAL '30 days');
```

### Schema 3: Correlations Table

```sql
CREATE TABLE correlations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    timestamp TIMESTAMPTZ NOT NULL,
    correlation_type VARCHAR(50) NOT NULL,  -- causal, temporal, anomaly, etc.
    primary_event_id UUID NOT NULL,
    related_event_id UUID NOT NULL,
    strength DOUBLE PRECISION NOT NULL,     -- 0.0 to 1.0
    confidence DOUBLE PRECISION NOT NULL,   -- 0.0 to 1.0
    tenant_id VARCHAR(100) NOT NULL,
    metadata JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW(),

    FOREIGN KEY (primary_event_id) REFERENCES events(id),
    FOREIGN KEY (related_event_id) REFERENCES events(id)
);

-- Convert to hypertable
SELECT create_hypertable('correlations', 'timestamp',
    chunk_time_interval => INTERVAL '1 day',
    if_not_exists => TRUE
);

-- Indexes
CREATE INDEX idx_corr_primary ON correlations (primary_event_id, timestamp DESC);
CREATE INDEX idx_corr_related ON correlations (related_event_id, timestamp DESC);
CREATE INDEX idx_corr_type ON correlations (correlation_type, timestamp DESC);
CREATE INDEX idx_corr_strength ON correlations (strength DESC);

-- Retention (90 days)
SELECT add_retention_policy('correlations', INTERVAL '90 days');
```

### Schema 4: Asset Metadata Cache

```sql
CREATE TABLE asset_metadata (
    asset_id VARCHAR(100) PRIMARY KEY,
    asset_name VARCHAR(255) NOT NULL,
    asset_type VARCHAR(50) NOT NULL,
    version VARCHAR(50),
    owner_id VARCHAR(100),
    team_id VARCHAR(100),
    tenant_id VARCHAR(100) NOT NULL,
    tags JSONB,
    metadata JSONB,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL,
    last_seen TIMESTAMPTZ,

    INDEX idx_asset_tenant (tenant_id),
    INDEX idx_asset_type (asset_type),
    INDEX idx_asset_owner (owner_id)
);

-- This is a regular table (not hypertable) as it's reference data
```

## Partitioning Strategy

### Time Partitioning (Hypertables)
- **Chunk Size**: 1 day
- **Rationale**:
  - Balances query performance with chunk management
  - Queries typically filter by recent time ranges (24h, 7d)
  - Allows efficient compression and retention policies
  - Easy to drop old chunks for retention

### Space Partitioning
- **Events**: 4 partitions by `tenant_id`
  - Supports up to 40 tenants efficiently (10 per partition)
  - Can be increased as tenant count grows

- **Metrics**: 8 partitions by `asset_id`
  - High cardinality dimension (1000s of assets)
  - Distributes data for parallel processing

## Query Patterns & Optimization

### Pattern 1: Recent Events by Asset
```sql
-- Optimized with idx_events_asset_time
SELECT * FROM events
WHERE asset_id = 'gpt-4'
  AND timestamp >= NOW() - INTERVAL '24 hours'
ORDER BY timestamp DESC
LIMIT 1000;
```

### Pattern 2: Aggregated Metrics
```sql
-- Uses continuous aggregate for fast results
SELECT
    bucket,
    avg_value,
    p95_value,
    p99_value
FROM metrics_hourly
WHERE asset_id = 'gpt-4'
  AND metric_name = 'latency'
  AND bucket >= NOW() - INTERVAL '7 days'
ORDER BY bucket DESC;
```

### Pattern 3: Cross-Module Correlation
```sql
-- Find correlated events
SELECT
    e1.id as primary_event,
    e1.event_type as primary_type,
    e2.id as related_event,
    e2.event_type as related_type,
    c.correlation_type,
    c.strength
FROM correlations c
JOIN events e1 ON c.primary_event_id = e1.id
JOIN events e2 ON c.related_event_id = e2.id
WHERE c.timestamp >= NOW() - INTERVAL '1 hour'
  AND c.strength > 0.8
ORDER BY c.strength DESC;
```

## Alternatives Considered

### Single Wide Table
- **Pros**: Simpler schema, no joins
- **Cons**: Poor compression, inefficient for aggregations
- **Decision**: Separate events and metrics for better performance

### Columnar Storage (ClickHouse)
- **Pros**: Excellent compression, fast aggregations
- **Cons**: Limited update/delete support, steeper learning curve
- **Decision**: TimescaleDB chosen for PostgreSQL ecosystem, can migrate later if needed

### NoSQL (MongoDB, Cassandra)
- **Pros**: Flexible schema, horizontal scaling
- **Cons**: Limited query capabilities, eventual consistency
- **Decision**: Need ACID guarantees and complex queries, SQL is better fit

## Performance Targets

| Operation | Target | Strategy |
|-----------|--------|----------|
| Insert throughput | 100k events/sec | Batch inserts (1000 rows), connection pooling |
| Query latency (recent) | <25ms (p50) | Time-based indexing, chunk exclusion |
| Query latency (aggregate) | <50ms (p95) | Continuous aggregates, materialized views |
| Storage efficiency | <1KB/event avg | Compression after 7 days |
| Compression ratio | 4:1 | TimescaleDB native compression |

## Migration Strategy

### Phase 1: MVP (Simple Schema)
- Events table only
- Basic indexes
- No continuous aggregates
- 30-day retention

### Phase 2: Beta (Optimized Schema)
- Add metrics table
- Continuous aggregates for common queries
- Compression policies
- 90-day retention

### Phase 3: V1.0 (Production Schema)
- Multi-tenancy partitioning
- Advanced indexes (GIN for JSONB)
- Multiple retention tiers
- Automated backup and restore

## Monitoring & Maintenance

### Daily Tasks
- Monitor chunk creation and compression
- Track query performance metrics
- Check compression ratios

### Weekly Tasks
- Analyze slow queries
- Review retention policies
- Optimize indexes based on query patterns

### Monthly Tasks
- Vacuum and analyze tables
- Review storage growth
- Plan scaling adjustments

## Related ADRs
- ADR-001: Technology Stack
- ADR-003: API Design
- ADR-005: Multi-Tenancy Architecture
- ADR-006: Data Retention Policies

## References
- [TimescaleDB Hypertable Docs](https://docs.timescale.com/timescaledb/latest/how-to-guides/hypertables/)
- [Continuous Aggregates](https://docs.timescale.com/timescaledb/latest/how-to-guides/continuous-aggregates/)
- [Compression Best Practices](https://docs.timescale.com/timescaledb/latest/how-to-guides/compression/)
