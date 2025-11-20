-- TimescaleDB Initialization Script
-- LLM Analytics Hub Database Schema

-- ============================================
-- Database Creation
-- ============================================

-- Create analytics database
CREATE DATABASE IF NOT EXISTS analytics;
\c analytics;

-- Create TimescaleDB extension
CREATE EXTENSION IF NOT EXISTS timescaledb;

-- Create additional extensions
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ============================================
-- Metrics Database
-- ============================================

CREATE DATABASE IF NOT EXISTS metrics;
\c metrics;

CREATE EXTENSION IF NOT EXISTS timescaledb;
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;

-- ============================================
-- Events Database
-- ============================================

CREATE DATABASE IF NOT EXISTS events;
\c events;

CREATE EXTENSION IF NOT EXISTS timescaledb;
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;

-- ============================================
-- Analytics Database Schema
-- ============================================

\c analytics;

-- LLM Usage Metrics
CREATE TABLE IF NOT EXISTS llm_usage_metrics (
    time TIMESTAMPTZ NOT NULL,
    model_id VARCHAR(255) NOT NULL,
    provider VARCHAR(100) NOT NULL,
    request_count INTEGER DEFAULT 0,
    token_input INTEGER DEFAULT 0,
    token_output INTEGER DEFAULT 0,
    token_total INTEGER DEFAULT 0,
    cost_usd NUMERIC(10, 6) DEFAULT 0,
    avg_latency_ms NUMERIC(10, 2) DEFAULT 0,
    error_count INTEGER DEFAULT 0,
    success_count INTEGER DEFAULT 0,
    user_id VARCHAR(255),
    application_id VARCHAR(255),
    environment VARCHAR(50),
    metadata JSONB
);

-- Create hypertable
SELECT create_hypertable('llm_usage_metrics', 'time', if_not_exists => TRUE);

-- Add indexes
CREATE INDEX IF NOT EXISTS idx_llm_usage_model ON llm_usage_metrics (model_id, time DESC);
CREATE INDEX IF NOT EXISTS idx_llm_usage_provider ON llm_usage_metrics (provider, time DESC);
CREATE INDEX IF NOT EXISTS idx_llm_usage_user ON llm_usage_metrics (user_id, time DESC);
CREATE INDEX IF NOT EXISTS idx_llm_usage_app ON llm_usage_metrics (application_id, time DESC);
CREATE INDEX IF NOT EXISTS idx_llm_usage_env ON llm_usage_metrics (environment, time DESC);

-- Performance Metrics
CREATE TABLE IF NOT EXISTS performance_metrics (
    time TIMESTAMPTZ NOT NULL,
    metric_name VARCHAR(255) NOT NULL,
    metric_value NUMERIC(20, 6) NOT NULL,
    metric_type VARCHAR(50) NOT NULL,
    model_id VARCHAR(255),
    provider VARCHAR(100),
    endpoint VARCHAR(255),
    percentile INTEGER,
    tags JSONB,
    metadata JSONB
);

SELECT create_hypertable('performance_metrics', 'time', if_not_exists => TRUE);

CREATE INDEX IF NOT EXISTS idx_perf_metric_name ON performance_metrics (metric_name, time DESC);
CREATE INDEX IF NOT EXISTS idx_perf_model ON performance_metrics (model_id, time DESC);
CREATE INDEX IF NOT EXISTS idx_perf_provider ON performance_metrics (provider, time DESC);

-- Cost Analytics
CREATE TABLE IF NOT EXISTS cost_analytics (
    time TIMESTAMPTZ NOT NULL,
    cost_type VARCHAR(100) NOT NULL,
    amount_usd NUMERIC(12, 6) NOT NULL,
    model_id VARCHAR(255),
    provider VARCHAR(100),
    user_id VARCHAR(255),
    application_id VARCHAR(255),
    department VARCHAR(100),
    project VARCHAR(100),
    environment VARCHAR(50),
    metadata JSONB
);

SELECT create_hypertable('cost_analytics', 'time', if_not_exists => TRUE);

CREATE INDEX IF NOT EXISTS idx_cost_type ON cost_analytics (cost_type, time DESC);
CREATE INDEX IF NOT EXISTS idx_cost_model ON cost_analytics (model_id, time DESC);
CREATE INDEX IF NOT EXISTS idx_cost_user ON cost_analytics (user_id, time DESC);
CREATE INDEX IF NOT EXISTS idx_cost_app ON cost_analytics (application_id, time DESC);
CREATE INDEX IF NOT EXISTS idx_cost_dept ON cost_analytics (department, time DESC);

-- ============================================
-- Continuous Aggregates
-- ============================================

-- Hourly aggregates for LLM usage
CREATE MATERIALIZED VIEW IF NOT EXISTS llm_usage_hourly
WITH (timescaledb.continuous) AS
SELECT
    time_bucket('1 hour', time) AS hour,
    model_id,
    provider,
    environment,
    SUM(request_count) AS total_requests,
    SUM(token_input) AS total_input_tokens,
    SUM(token_output) AS total_output_tokens,
    SUM(token_total) AS total_tokens,
    SUM(cost_usd) AS total_cost,
    AVG(avg_latency_ms) AS avg_latency,
    SUM(error_count) AS total_errors,
    SUM(success_count) AS total_success
FROM llm_usage_metrics
GROUP BY hour, model_id, provider, environment;

-- Daily aggregates for LLM usage
CREATE MATERIALIZED VIEW IF NOT EXISTS llm_usage_daily
WITH (timescaledb.continuous) AS
SELECT
    time_bucket('1 day', time) AS day,
    model_id,
    provider,
    environment,
    SUM(request_count) AS total_requests,
    SUM(token_input) AS total_input_tokens,
    SUM(token_output) AS total_output_tokens,
    SUM(token_total) AS total_tokens,
    SUM(cost_usd) AS total_cost,
    AVG(avg_latency_ms) AS avg_latency,
    SUM(error_count) AS total_errors,
    SUM(success_count) AS total_success
FROM llm_usage_metrics
GROUP BY day, model_id, provider, environment;

-- Hourly cost aggregates
CREATE MATERIALIZED VIEW IF NOT EXISTS cost_hourly
WITH (timescaledb.continuous) AS
SELECT
    time_bucket('1 hour', time) AS hour,
    cost_type,
    provider,
    department,
    SUM(amount_usd) AS total_cost,
    COUNT(*) AS transaction_count
FROM cost_analytics
GROUP BY hour, cost_type, provider, department;

-- Daily cost aggregates
CREATE MATERIALIZED VIEW IF NOT EXISTS cost_daily
WITH (timescaledb.continuous) AS
SELECT
    time_bucket('1 day', time) AS day,
    cost_type,
    provider,
    department,
    SUM(amount_usd) AS total_cost,
    COUNT(*) AS transaction_count
FROM cost_analytics
GROUP BY day, cost_type, provider, department;

-- ============================================
-- Compression Policies
-- ============================================

-- Compress data older than 7 days
SELECT add_compression_policy('llm_usage_metrics', INTERVAL '7 days', if_not_exists => TRUE);
SELECT add_compression_policy('performance_metrics', INTERVAL '7 days', if_not_exists => TRUE);
SELECT add_compression_policy('cost_analytics', INTERVAL '7 days', if_not_exists => TRUE);

-- ============================================
-- Retention Policies
-- ============================================

-- Drop raw data older than 90 days
SELECT add_retention_policy('llm_usage_metrics', INTERVAL '90 days', if_not_exists => TRUE);
SELECT add_retention_policy('performance_metrics', INTERVAL '90 days', if_not_exists => TRUE);
SELECT add_retention_policy('cost_analytics', INTERVAL '90 days', if_not_exists => TRUE);

-- ============================================
-- Refresh Policies for Continuous Aggregates
-- ============================================

SELECT add_continuous_aggregate_policy('llm_usage_hourly',
    start_offset => INTERVAL '3 hours',
    end_offset => INTERVAL '1 hour',
    schedule_interval => INTERVAL '1 hour',
    if_not_exists => TRUE
);

SELECT add_continuous_aggregate_policy('llm_usage_daily',
    start_offset => INTERVAL '3 days',
    end_offset => INTERVAL '1 day',
    schedule_interval => INTERVAL '1 day',
    if_not_exists => TRUE
);

SELECT add_continuous_aggregate_policy('cost_hourly',
    start_offset => INTERVAL '3 hours',
    end_offset => INTERVAL '1 hour',
    schedule_interval => INTERVAL '1 hour',
    if_not_exists => TRUE
);

SELECT add_continuous_aggregate_policy('cost_daily',
    start_offset => INTERVAL '3 days',
    end_offset => INTERVAL '1 day',
    schedule_interval => INTERVAL '1 day',
    if_not_exists => TRUE
);

-- ============================================
-- Events Database Schema
-- ============================================

\c events;

-- LLM Events
CREATE TABLE IF NOT EXISTS llm_events (
    time TIMESTAMPTZ NOT NULL,
    event_id UUID DEFAULT gen_random_uuid(),
    event_type VARCHAR(100) NOT NULL,
    model_id VARCHAR(255),
    provider VARCHAR(100),
    user_id VARCHAR(255),
    application_id VARCHAR(255),
    request_id VARCHAR(255),
    session_id VARCHAR(255),
    prompt_tokens INTEGER,
    completion_tokens INTEGER,
    total_tokens INTEGER,
    latency_ms INTEGER,
    cost_usd NUMERIC(10, 6),
    status VARCHAR(50),
    error_message TEXT,
    metadata JSONB,
    PRIMARY KEY (time, event_id)
);

SELECT create_hypertable('llm_events', 'time', if_not_exists => TRUE);

CREATE INDEX IF NOT EXISTS idx_events_type ON llm_events (event_type, time DESC);
CREATE INDEX IF NOT EXISTS idx_events_model ON llm_events (model_id, time DESC);
CREATE INDEX IF NOT EXISTS idx_events_user ON llm_events (user_id, time DESC);
CREATE INDEX IF NOT EXISTS idx_events_request ON llm_events (request_id, time DESC);
CREATE INDEX IF NOT EXISTS idx_events_session ON llm_events (session_id, time DESC);

-- Compression and retention for events
SELECT add_compression_policy('llm_events', INTERVAL '7 days', if_not_exists => TRUE);
SELECT add_retention_policy('llm_events', INTERVAL '30 days', if_not_exists => TRUE);

-- ============================================
-- Grant Permissions
-- ============================================

\c analytics;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO postgres;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO postgres;

\c metrics;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO postgres;

\c events;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO postgres;

-- ============================================
-- Summary
-- ============================================

\c analytics;
SELECT 'TimescaleDB initialization complete!' AS status;
SELECT table_name, row_count FROM (
    SELECT 'llm_usage_metrics' AS table_name, COUNT(*) AS row_count FROM llm_usage_metrics
    UNION ALL
    SELECT 'performance_metrics', COUNT(*) FROM performance_metrics
    UNION ALL
    SELECT 'cost_analytics', COUNT(*) FROM cost_analytics
) t;
