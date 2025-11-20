-- Create TimescaleDB Hypertables for LLM Analytics Hub
-- This script creates the core time-series tables with proper indexing and policies

\c llm_analytics

-- ============================================================================
-- METRICS SCHEMA - Core LLM metrics and performance data
-- ============================================================================

-- LLM Request Metrics
CREATE TABLE IF NOT EXISTS metrics.llm_requests (
    time TIMESTAMPTZ NOT NULL,
    request_id UUID NOT NULL,
    user_id TEXT,
    model_name TEXT NOT NULL,
    provider TEXT NOT NULL,
    endpoint TEXT,

    -- Request details
    prompt_tokens INTEGER,
    completion_tokens INTEGER,
    total_tokens INTEGER,

    -- Performance metrics
    latency_ms INTEGER,
    time_to_first_token_ms INTEGER,
    tokens_per_second DOUBLE PRECISION,

    -- Cost metrics
    cost_usd DOUBLE PRECISION,

    -- Quality metrics
    temperature DOUBLE PRECISION,
    max_tokens INTEGER,
    top_p DOUBLE PRECISION,

    -- Status
    status TEXT,
    error_message TEXT,

    -- Metadata
    metadata JSONB,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,

    -- Constraints
    PRIMARY KEY (time, request_id)
);

-- Convert to hypertable
SELECT create_hypertable('metrics.llm_requests', 'time',
    chunk_time_interval => INTERVAL '1 day',
    if_not_exists => TRUE
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_llm_requests_user_id ON metrics.llm_requests(user_id, time DESC);
CREATE INDEX IF NOT EXISTS idx_llm_requests_model ON metrics.llm_requests(model_name, time DESC);
CREATE INDEX IF NOT EXISTS idx_llm_requests_provider ON metrics.llm_requests(provider, time DESC);
CREATE INDEX IF NOT EXISTS idx_llm_requests_status ON metrics.llm_requests(status, time DESC);
CREATE INDEX IF NOT EXISTS idx_llm_requests_metadata ON metrics.llm_requests USING GIN(metadata);

-- Enable compression
ALTER TABLE metrics.llm_requests SET (
    timescaledb.compress,
    timescaledb.compress_orderby = 'time DESC',
    timescaledb.compress_segmentby = 'model_name, provider, status'
);

-- Add compression policy (compress data older than 7 days)
SELECT add_compression_policy('metrics.llm_requests', INTERVAL '7 days');

-- Add retention policy (keep data for 365 days)
SELECT add_retention_policy('metrics.llm_requests', INTERVAL '365 days');

-- ============================================================================
-- Token Usage Metrics
CREATE TABLE IF NOT EXISTS metrics.token_usage (
    time TIMESTAMPTZ NOT NULL,
    user_id TEXT NOT NULL,
    model_name TEXT NOT NULL,
    provider TEXT NOT NULL,

    -- Token counts
    prompt_tokens INTEGER NOT NULL,
    completion_tokens INTEGER NOT NULL,
    total_tokens INTEGER NOT NULL,

    -- Aggregation window
    window_start TIMESTAMPTZ NOT NULL,
    window_end TIMESTAMPTZ NOT NULL,

    PRIMARY KEY (time, user_id, model_name, provider)
);

SELECT create_hypertable('metrics.token_usage', 'time',
    chunk_time_interval => INTERVAL '1 day',
    if_not_exists => TRUE
);

CREATE INDEX IF NOT EXISTS idx_token_usage_user ON metrics.token_usage(user_id, time DESC);
CREATE INDEX IF NOT EXISTS idx_token_usage_model ON metrics.token_usage(model_name, time DESC);

ALTER TABLE metrics.token_usage SET (
    timescaledb.compress,
    timescaledb.compress_orderby = 'time DESC',
    timescaledb.compress_segmentby = 'user_id, model_name, provider'
);

SELECT add_compression_policy('metrics.token_usage', INTERVAL '7 days');
SELECT add_retention_policy('metrics.token_usage', INTERVAL '365 days');

-- ============================================================================
-- Cost Metrics
CREATE TABLE IF NOT EXISTS metrics.cost_tracking (
    time TIMESTAMPTZ NOT NULL,
    user_id TEXT NOT NULL,
    model_name TEXT NOT NULL,
    provider TEXT NOT NULL,

    -- Cost details
    cost_usd DOUBLE PRECISION NOT NULL,
    token_count INTEGER NOT NULL,
    request_count INTEGER NOT NULL,

    -- Aggregation window
    window_start TIMESTAMPTZ NOT NULL,
    window_end TIMESTAMPTZ NOT NULL,

    PRIMARY KEY (time, user_id, model_name, provider)
);

SELECT create_hypertable('metrics.cost_tracking', 'time',
    chunk_time_interval => INTERVAL '1 day',
    if_not_exists => TRUE
);

CREATE INDEX IF NOT EXISTS idx_cost_tracking_user ON metrics.cost_tracking(user_id, time DESC);
CREATE INDEX IF NOT EXISTS idx_cost_tracking_model ON metrics.cost_tracking(model_name, time DESC);

ALTER TABLE metrics.cost_tracking SET (
    timescaledb.compress,
    timescaledb.compress_orderby = 'time DESC',
    timescaledb.compress_segmentby = 'user_id, model_name, provider'
);

SELECT add_compression_policy('metrics.cost_tracking', INTERVAL '30 days');
SELECT add_retention_policy('metrics.cost_tracking', INTERVAL '730 days');  -- 2 years for cost data

-- ============================================================================
-- EVENTS SCHEMA - System events and logs
-- ============================================================================

-- System Events
CREATE TABLE IF NOT EXISTS events.system_events (
    time TIMESTAMPTZ NOT NULL,
    event_id UUID NOT NULL DEFAULT uuid_generate_v4(),
    event_type TEXT NOT NULL,
    severity TEXT NOT NULL,
    source TEXT NOT NULL,

    -- Event details
    message TEXT,
    details JSONB,

    -- Context
    user_id TEXT,
    request_id UUID,
    trace_id TEXT,

    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY (time, event_id)
);

SELECT create_hypertable('events.system_events', 'time',
    chunk_time_interval => INTERVAL '1 day',
    if_not_exists => TRUE
);

CREATE INDEX IF NOT EXISTS idx_system_events_type ON events.system_events(event_type, time DESC);
CREATE INDEX IF NOT EXISTS idx_system_events_severity ON events.system_events(severity, time DESC);
CREATE INDEX IF NOT EXISTS idx_system_events_source ON events.system_events(source, time DESC);
CREATE INDEX IF NOT EXISTS idx_system_events_user ON events.system_events(user_id, time DESC) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_system_events_details ON events.system_events USING GIN(details);

ALTER TABLE events.system_events SET (
    timescaledb.compress,
    timescaledb.compress_orderby = 'time DESC',
    timescaledb.compress_segmentby = 'event_type, severity, source'
);

SELECT add_compression_policy('events.system_events', INTERVAL '7 days');
SELECT add_retention_policy('events.system_events', INTERVAL '90 days');

-- ============================================================================
-- Error Tracking
CREATE TABLE IF NOT EXISTS events.error_logs (
    time TIMESTAMPTZ NOT NULL,
    error_id UUID NOT NULL DEFAULT uuid_generate_v4(),
    error_type TEXT NOT NULL,
    error_code TEXT,

    -- Error details
    message TEXT NOT NULL,
    stack_trace TEXT,
    context JSONB,

    -- Request context
    request_id UUID,
    user_id TEXT,
    model_name TEXT,
    provider TEXT,

    -- Resolution
    resolved BOOLEAN DEFAULT FALSE,
    resolved_at TIMESTAMPTZ,
    resolution_notes TEXT,

    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY (time, error_id)
);

SELECT create_hypertable('events.error_logs', 'time',
    chunk_time_interval => INTERVAL '1 day',
    if_not_exists => TRUE
);

CREATE INDEX IF NOT EXISTS idx_error_logs_type ON events.error_logs(error_type, time DESC);
CREATE INDEX IF NOT EXISTS idx_error_logs_resolved ON events.error_logs(resolved, time DESC);
CREATE INDEX IF NOT EXISTS idx_error_logs_user ON events.error_logs(user_id, time DESC) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_error_logs_model ON events.error_logs(model_name, time DESC) WHERE model_name IS NOT NULL;

ALTER TABLE events.error_logs SET (
    timescaledb.compress,
    timescaledb.compress_orderby = 'time DESC',
    timescaledb.compress_segmentby = 'error_type, resolved'
);

SELECT add_compression_policy('events.error_logs', INTERVAL '14 days');
SELECT add_retention_policy('events.error_logs', INTERVAL '180 days');

-- ============================================================================
-- ANALYTICS SCHEMA - Aggregated analytics and insights
-- ============================================================================

-- Model Performance Analytics
CREATE TABLE IF NOT EXISTS analytics.model_performance (
    time TIMESTAMPTZ NOT NULL,
    model_name TEXT NOT NULL,
    provider TEXT NOT NULL,

    -- Performance metrics
    avg_latency_ms DOUBLE PRECISION,
    p50_latency_ms DOUBLE PRECISION,
    p95_latency_ms DOUBLE PRECISION,
    p99_latency_ms DOUBLE PRECISION,

    avg_tokens_per_second DOUBLE PRECISION,
    avg_time_to_first_token_ms DOUBLE PRECISION,

    -- Volume metrics
    request_count INTEGER,
    total_tokens INTEGER,
    total_cost_usd DOUBLE PRECISION,

    -- Quality metrics
    error_rate DOUBLE PRECISION,
    success_rate DOUBLE PRECISION,

    -- Aggregation window
    window_start TIMESTAMPTZ NOT NULL,
    window_end TIMESTAMPTZ NOT NULL,

    PRIMARY KEY (time, model_name, provider)
);

SELECT create_hypertable('analytics.model_performance', 'time',
    chunk_time_interval => INTERVAL '7 days',
    if_not_exists => TRUE
);

CREATE INDEX IF NOT EXISTS idx_model_performance_model ON analytics.model_performance(model_name, time DESC);
CREATE INDEX IF NOT EXISTS idx_model_performance_provider ON analytics.model_performance(provider, time DESC);

ALTER TABLE analytics.model_performance SET (
    timescaledb.compress,
    timescaledb.compress_orderby = 'time DESC',
    timescaledb.compress_segmentby = 'model_name, provider'
);

SELECT add_compression_policy('analytics.model_performance', INTERVAL '30 days');
SELECT add_retention_policy('analytics.model_performance', INTERVAL '730 days');

-- ============================================================================
-- AGGREGATES SCHEMA - Continuous aggregates for real-time dashboards
-- ============================================================================

-- Hourly request statistics
CREATE MATERIALIZED VIEW aggregates.hourly_request_stats
WITH (timescaledb.continuous) AS
SELECT
    time_bucket('1 hour', time) AS bucket,
    model_name,
    provider,
    status,
    COUNT(*) AS request_count,
    AVG(latency_ms) AS avg_latency_ms,
    PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY latency_ms) AS p50_latency_ms,
    PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY latency_ms) AS p95_latency_ms,
    PERCENTILE_CONT(0.99) WITHIN GROUP (ORDER BY latency_ms) AS p99_latency_ms,
    SUM(total_tokens) AS total_tokens,
    SUM(cost_usd) AS total_cost_usd,
    AVG(tokens_per_second) AS avg_tokens_per_second
FROM metrics.llm_requests
GROUP BY bucket, model_name, provider, status
WITH NO DATA;

-- Add refresh policy (refresh every hour, aggregate last 2 hours)
SELECT add_continuous_aggregate_policy('aggregates.hourly_request_stats',
    start_offset => INTERVAL '2 hours',
    end_offset => INTERVAL '1 hour',
    schedule_interval => INTERVAL '1 hour'
);

-- Daily cost summary
CREATE MATERIALIZED VIEW aggregates.daily_cost_summary
WITH (timescaledb.continuous) AS
SELECT
    time_bucket('1 day', time) AS bucket,
    user_id,
    model_name,
    provider,
    COUNT(*) AS request_count,
    SUM(total_tokens) AS total_tokens,
    SUM(cost_usd) AS total_cost_usd,
    AVG(cost_usd) AS avg_cost_per_request
FROM metrics.llm_requests
WHERE user_id IS NOT NULL
GROUP BY bucket, user_id, model_name, provider
WITH NO DATA;

SELECT add_continuous_aggregate_policy('aggregates.daily_cost_summary',
    start_offset => INTERVAL '7 days',
    end_offset => INTERVAL '1 day',
    schedule_interval => INTERVAL '1 day'
);

-- Error rate by model
CREATE MATERIALIZED VIEW aggregates.error_rate_by_model
WITH (timescaledb.continuous) AS
SELECT
    time_bucket('15 minutes', time) AS bucket,
    model_name,
    provider,
    COUNT(*) AS total_requests,
    SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END) AS error_count,
    (SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END)::FLOAT / COUNT(*)::FLOAT * 100) AS error_rate
FROM metrics.llm_requests
GROUP BY bucket, model_name, provider
WITH NO DATA;

SELECT add_continuous_aggregate_policy('aggregates.error_rate_by_model',
    start_offset => INTERVAL '1 hour',
    end_offset => INTERVAL '15 minutes',
    schedule_interval => INTERVAL '15 minutes'
);

-- ============================================================================
-- Grant permissions
-- ============================================================================

GRANT SELECT ON ALL TABLES IN SCHEMA metrics TO llm_app_readonly;
GRANT SELECT ON ALL TABLES IN SCHEMA events TO llm_app_readonly;
GRANT SELECT ON ALL TABLES IN SCHEMA analytics TO llm_app_readonly;
GRANT SELECT ON ALL TABLES IN SCHEMA aggregates TO llm_app_readonly;

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA metrics TO llm_app_readwrite;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA events TO llm_app_readwrite;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA analytics TO llm_app_readwrite;

-- ============================================================================
-- Create helpful views
-- ============================================================================

-- Recent requests view (last 24 hours)
CREATE OR REPLACE VIEW analytics.recent_requests AS
SELECT
    time,
    request_id,
    user_id,
    model_name,
    provider,
    latency_ms,
    total_tokens,
    cost_usd,
    status
FROM metrics.llm_requests
WHERE time > NOW() - INTERVAL '24 hours'
ORDER BY time DESC;

-- Top models by usage (last 7 days)
CREATE OR REPLACE VIEW analytics.top_models_by_usage AS
SELECT
    model_name,
    provider,
    COUNT(*) AS request_count,
    SUM(total_tokens) AS total_tokens,
    SUM(cost_usd) AS total_cost_usd,
    AVG(latency_ms) AS avg_latency_ms
FROM metrics.llm_requests
WHERE time > NOW() - INTERVAL '7 days'
GROUP BY model_name, provider
ORDER BY request_count DESC;

GRANT SELECT ON analytics.recent_requests TO llm_app_readonly;
GRANT SELECT ON analytics.top_models_by_usage TO llm_app_readonly;

-- Log completion
INSERT INTO analytics.metadata (key, value) VALUES
    ('hypertables_created', to_jsonb(CURRENT_TIMESTAMP))
ON CONFLICT (key) DO UPDATE SET value = to_jsonb(CURRENT_TIMESTAMP);

-- Refresh statistics
ANALYZE;
