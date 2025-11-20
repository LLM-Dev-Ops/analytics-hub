-- TimescaleDB Initialization Script
-- This script sets up the initial database structure for LLM Analytics Hub

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS timescaledb CASCADE;
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create application database
CREATE DATABASE llm_analytics
    WITH
    ENCODING = 'UTF8'
    LC_COLLATE = 'en_US.UTF-8'
    LC_CTYPE = 'en_US.UTF-8'
    TEMPLATE = template0;

-- Connect to the application database
\c llm_analytics

-- Enable extensions in application database
CREATE EXTENSION IF NOT EXISTS timescaledb CASCADE;
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create roles
CREATE ROLE llm_app_readonly;
CREATE ROLE llm_app_readwrite;
CREATE ROLE llm_app WITH LOGIN PASSWORD :'APP_PASSWORD';

-- Grant role memberships
GRANT llm_app_readonly TO llm_app;
GRANT llm_app_readwrite TO llm_app;

-- Create schemas
CREATE SCHEMA IF NOT EXISTS analytics AUTHORIZATION llm_app;
CREATE SCHEMA IF NOT EXISTS metrics AUTHORIZATION llm_app;
CREATE SCHEMA IF NOT EXISTS events AUTHORIZATION llm_app;
CREATE SCHEMA IF NOT EXISTS aggregates AUTHORIZATION llm_app;

-- Set search path
ALTER DATABASE llm_analytics SET search_path TO analytics, metrics, events, aggregates, public;

-- Grant schema permissions
GRANT USAGE ON SCHEMA analytics TO llm_app_readonly;
GRANT USAGE ON SCHEMA metrics TO llm_app_readonly;
GRANT USAGE ON SCHEMA events TO llm_app_readonly;
GRANT USAGE ON SCHEMA aggregates TO llm_app_readonly;

GRANT USAGE, CREATE ON SCHEMA analytics TO llm_app_readwrite;
GRANT USAGE, CREATE ON SCHEMA metrics TO llm_app_readwrite;
GRANT USAGE, CREATE ON SCHEMA events TO llm_app_readwrite;
GRANT USAGE, CREATE ON SCHEMA aggregates TO llm_app_readwrite;

-- Set default privileges
ALTER DEFAULT PRIVILEGES IN SCHEMA analytics GRANT SELECT ON TABLES TO llm_app_readonly;
ALTER DEFAULT PRIVILEGES IN SCHEMA metrics GRANT SELECT ON TABLES TO llm_app_readonly;
ALTER DEFAULT PRIVILEGES IN SCHEMA events GRANT SELECT ON TABLES TO llm_app_readonly;
ALTER DEFAULT PRIVILEGES IN SCHEMA aggregates GRANT SELECT ON TABLES TO llm_app_readonly;

ALTER DEFAULT PRIVILEGES IN SCHEMA analytics GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO llm_app_readwrite;
ALTER DEFAULT PRIVILEGES IN SCHEMA metrics GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO llm_app_readwrite;
ALTER DEFAULT PRIVILEGES IN SCHEMA events GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO llm_app_readwrite;
ALTER DEFAULT PRIVILEGES IN SCHEMA aggregates GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO llm_app_readwrite;

ALTER DEFAULT PRIVILEGES IN SCHEMA analytics GRANT USAGE, SELECT ON SEQUENCES TO llm_app_readwrite;
ALTER DEFAULT PRIVILEGES IN SCHEMA metrics GRANT USAGE, SELECT ON SEQUENCES TO llm_app_readwrite;
ALTER DEFAULT PRIVILEGES IN SCHEMA events GRANT USAGE, SELECT ON SEQUENCES TO llm_app_readwrite;
ALTER DEFAULT PRIVILEGES IN SCHEMA aggregates GRANT USAGE, SELECT ON SEQUENCES TO llm_app_readwrite;

-- Create audit log function
CREATE OR REPLACE FUNCTION analytics.audit_trigger_func()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        NEW.created_at = CURRENT_TIMESTAMP;
        NEW.updated_at = CURRENT_TIMESTAMP;
    ELSIF TG_OP = 'UPDATE' THEN
        NEW.updated_at = CURRENT_TIMESTAMP;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create helper function for compression
CREATE OR REPLACE FUNCTION analytics.enable_compression(
    schema_name TEXT,
    table_name TEXT,
    segment_by TEXT DEFAULT NULL,
    order_by TEXT DEFAULT 'time DESC'
)
RETURNS VOID AS $$
BEGIN
    EXECUTE format(
        'ALTER TABLE %I.%I SET (
            timescaledb.compress,
            timescaledb.compress_orderby = %L,
            timescaledb.compress_segmentby = %L
        )',
        schema_name,
        table_name,
        order_by,
        COALESCE(segment_by, '')
    );
END;
$$ LANGUAGE plpgsql;

-- Create helper function for retention policy
CREATE OR REPLACE FUNCTION analytics.set_retention_policy(
    schema_name TEXT,
    table_name TEXT,
    retention_days INTEGER
)
RETURNS VOID AS $$
BEGIN
    PERFORM add_retention_policy(
        format('%I.%I', schema_name, table_name)::regclass,
        INTERVAL '1 day' * retention_days
    );
END;
$$ LANGUAGE plpgsql;

-- Create helper function for compression policy
CREATE OR REPLACE FUNCTION analytics.set_compression_policy(
    schema_name TEXT,
    table_name TEXT,
    compress_after_days INTEGER DEFAULT 7
)
RETURNS VOID AS $$
BEGIN
    PERFORM add_compression_policy(
        format('%I.%I', schema_name, table_name)::regclass,
        INTERVAL '1 day' * compress_after_days
    );
END;
$$ LANGUAGE plpgsql;

-- Create metadata table
CREATE TABLE IF NOT EXISTS analytics.metadata (
    key TEXT PRIMARY KEY,
    value JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Insert initial metadata
INSERT INTO analytics.metadata (key, value) VALUES
    ('schema_version', '"1.0.0"'::jsonb),
    ('initialized_at', to_jsonb(CURRENT_TIMESTAMP)),
    ('timescaledb_version', to_jsonb(extversion) FROM pg_extension WHERE extname = 'timescaledb')
ON CONFLICT (key) DO NOTHING;

-- Create system health check function
CREATE OR REPLACE FUNCTION analytics.system_health_check()
RETURNS TABLE (
    check_name TEXT,
    status TEXT,
    details JSONB
) AS $$
BEGIN
    -- Check TimescaleDB extension
    RETURN QUERY
    SELECT
        'timescaledb_extension'::TEXT,
        CASE WHEN COUNT(*) > 0 THEN 'OK' ELSE 'ERROR' END::TEXT,
        jsonb_build_object('version', MAX(extversion))
    FROM pg_extension
    WHERE extname = 'timescaledb';

    -- Check hypertables
    RETURN QUERY
    SELECT
        'hypertables'::TEXT,
        'OK'::TEXT,
        jsonb_build_object(
            'count', COUNT(*),
            'total_size', SUM(total_bytes)
        )
    FROM timescaledb_information.hypertables;

    -- Check compression
    RETURN QUERY
    SELECT
        'compression'::TEXT,
        'OK'::TEXT,
        jsonb_build_object(
            'enabled_hypertables', COUNT(*),
            'avg_compression_ratio', AVG(
                CASE
                    WHEN uncompressed_total_bytes > 0
                    THEN (uncompressed_total_bytes - compressed_total_bytes)::FLOAT / uncompressed_total_bytes * 100
                    ELSE 0
                END
            )
        )
    FROM timescaledb_information.compressed_hypertable_stats;

    -- Check replication status (if replica)
    RETURN QUERY
    SELECT
        'replication'::TEXT,
        CASE
            WHEN pg_is_in_recovery() THEN 'REPLICA'
            ELSE 'PRIMARY'
        END::TEXT,
        jsonb_build_object(
            'is_replica', pg_is_in_recovery(),
            'lag_bytes', pg_wal_lsn_diff(pg_last_wal_receive_lsn(), pg_last_wal_replay_lsn())
        );
END;
$$ LANGUAGE plpgsql;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION analytics.system_health_check() TO llm_app;
GRANT EXECUTE ON FUNCTION analytics.enable_compression(TEXT, TEXT, TEXT, TEXT) TO llm_app;
GRANT EXECUTE ON FUNCTION analytics.set_retention_policy(TEXT, TEXT, INTEGER) TO llm_app;
GRANT EXECUTE ON FUNCTION analytics.set_compression_policy(TEXT, TEXT, INTEGER) TO llm_app;

-- Create index on metadata
CREATE INDEX IF NOT EXISTS idx_metadata_created_at ON analytics.metadata(created_at DESC);

-- Log completion
INSERT INTO analytics.metadata (key, value) VALUES
    ('initialization_complete', to_jsonb(CURRENT_TIMESTAMP))
ON CONFLICT (key) DO UPDATE SET value = to_jsonb(CURRENT_TIMESTAMP);

-- Vacuum analyze all tables
VACUUM ANALYZE;
