# Database Operations Guide

## Overview

This guide provides comprehensive operational procedures for managing the LLM Analytics Hub database infrastructure, including TimescaleDB, Redis, and Kafka.

## Table of Contents

1. [Quick Start](#quick-start)
2. [Daily Operations](#daily-operations)
3. [Monitoring](#monitoring)
4. [Backup and Recovery](#backup-and-recovery)
5. [Performance Tuning](#performance-tuning)
6. [Troubleshooting](#troubleshooting)
7. [Security](#security)
8. [Disaster Recovery](#disaster-recovery)

## Quick Start

### Prerequisites

- `kubectl` configured with cluster access
- AWS CLI configured with S3 access
- Access to monitoring dashboards (Grafana)

### Initial Setup

```bash
# Deploy all database infrastructure
cd /workspaces/llm-analytics-hub/infrastructure/k8s/databases
./deploy-all.sh

# Verify deployment
./validate-all.sh

# Check health
./operations/health-check.sh
```

## Daily Operations

### Health Checks

Run comprehensive health checks daily:

```bash
./operations/health-check.sh
```

This checks:
- Database connectivity
- Replication status
- Disk usage
- Connection pools
- Backup status
- Monitoring systems

### Database Connections

#### TimescaleDB

```bash
# Connect to primary
./utils/connect-timescaledb.sh

# Connect to specific pod
POD=timescaledb-1 ./utils/connect-timescaledb.sh

# Connect to read replica
POD=timescaledb-read ./utils/connect-timescaledb.sh
```

#### Redis

```bash
# Connect to Redis cluster
./utils/connect-redis.sh

# Check cluster status
./utils/connect-redis.sh
> CLUSTER INFO
> CLUSTER NODES
```

#### Kafka

```bash
# Connect to Kafka broker
./utils/connect-kafka.sh

# List topics
kafka-topics --bootstrap-server localhost:9092 --list

# Describe consumer groups
kafka-consumer-groups --bootstrap-server localhost:9092 --list
```

### Routine Maintenance

#### Vacuum Operations (TimescaleDB)

```bash
# Run vacuum analyze
./operations/vacuum-maintenance.sh

# Schedule: Runs automatically daily at 2 AM
```

#### Redis Cluster Maintenance

```bash
# Check cluster health
kubectl exec -n llm-analytics-hub redis-cluster-0 -- redis-cli --pass $REDIS_PASSWORD CLUSTER INFO

# Rebalance cluster (if needed)
kubectl exec -n llm-analytics-hub redis-cluster-0 -- redis-cli --pass $REDIS_PASSWORD CLUSTER REBALANCE
```

#### Kafka Topic Management

```bash
# Clean up old topics
kubectl exec -n llm-analytics-hub kafka-0 -- kafka-topics --bootstrap-server localhost:9092 --delete --topic old-topic

# Increase partitions
kubectl exec -n llm-analytics-hub kafka-0 -- kafka-topics --bootstrap-server localhost:9092 --alter --topic my-topic --partitions 24
```

## Monitoring

### Grafana Dashboards

Access dashboards at: `http://grafana.llm-analytics-hub.svc.cluster.local`

#### Available Dashboards

1. **Database Overview** (`/d/database-overview`)
   - All databases at a glance
   - Resource utilization
   - Health status

2. **TimescaleDB Performance** (`/d/timescaledb-perf`)
   - Query performance (p50, p95, p99)
   - Replication lag
   - Cache hit ratio
   - Disk I/O

3. **Redis Performance** (`/d/redis-perf`)
   - Operations per second
   - Memory usage
   - Cache hit/miss ratio
   - Replication status

4. **Kafka Performance** (`/d/kafka-perf`)
   - Messages per second
   - Consumer lag
   - Under-replicated partitions
   - Broker metrics

### Prometheus Alerts

View active alerts:

```bash
kubectl port-forward -n llm-analytics-hub svc/prometheus 9090:9090
# Visit http://localhost:9090/alerts
```

#### Critical Alerts

- **TimescaleDBDown**: Database instance is down
- **RedisDown**: Redis instance is down
- **KafkaDown**: Kafka broker is down
- **ReplicationLagCritical**: Replication lag > 10s
- **DiskUsageCritical**: Disk usage > 85%
- **ConnectionPoolExhausted**: Connection pool at capacity

#### Warning Alerts

- **SlowQueries**: p95 query time > 1s
- **CacheHitRatioLow**: Cache hit ratio < 90%
- **HighCPU**: CPU usage > 80%
- **ConsumerLagHigh**: Kafka consumer lag > 1000

### Metrics Collection

Metrics are collected every 30 seconds by Prometheus from:
- Postgres Exporter (TimescaleDB)
- Redis Exporter (Redis)
- JMX Exporter (Kafka)
- Node Exporter (System metrics)

## Backup and Recovery

### Backup Schedule

- **TimescaleDB**: Daily full backups at 2 AM, continuous WAL archiving
- **Redis**: Hourly RDB snapshots, continuous AOF
- **Kafka**: Daily metadata backups at 3 AM

### Verify Backups

```bash
# Run backup verification
./backup/verify-backup.sh

# Monthly automated verification runs on the 1st at 4 AM
```

### Restore from Backup

#### TimescaleDB

```bash
# List available backups
./backup/backup-restore-scripts/restore-timescaledb.sh --list

# Restore latest backup
./backup/backup-restore-scripts/restore-timescaledb.sh

# Point-in-time recovery
./backup/backup-restore-scripts/restore-timescaledb.sh --pitr "2024-01-01 12:00:00"

# Restore and promote to production
./backup/backup-restore-scripts/restore-timescaledb.sh --promote
```

#### Redis

```bash
# Redis restore is handled automatically via AOF/RDB on pod restart
# For manual restore, see disaster-recovery/restore-procedure.md
```

#### Kafka

```bash
# Kafka topics are recreated from metadata backups
# See disaster-recovery/restore-procedure.md for full procedure
```

### Backup Retention

- **TimescaleDB**: 7 days full, 30 days incremental, 12 months archival
- **Redis**: 24 hours hourly, 7 days daily
- **Kafka**: 7 days metadata backups

Retention policies are enforced daily at 6 AM.

## Performance Tuning

### TimescaleDB Optimization

#### Query Performance

```sql
-- Enable query statistics
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;

-- Find slow queries
SELECT query, mean_exec_time, calls
FROM pg_stat_statements
ORDER BY mean_exec_time DESC
LIMIT 10;

-- Analyze query plan
EXPLAIN (ANALYZE, BUFFERS) SELECT ...;
```

#### Index Optimization

```sql
-- Find missing indexes
SELECT schemaname, tablename, attname, n_distinct, correlation
FROM pg_stats
WHERE schemaname = 'public'
AND n_distinct > 100
ORDER BY n_distinct DESC;

-- Create hypertable index
CREATE INDEX idx_metrics_time ON metrics (time DESC);
```

#### Compression

```sql
-- Enable compression on hypertable
ALTER TABLE metrics SET (
  timescaledb.compress,
  timescaledb.compress_segmentby = 'device_id',
  timescaledb.compress_orderby = 'time DESC'
);

-- Add compression policy
SELECT add_compression_policy('metrics', INTERVAL '7 days');

-- Check compression ratio
SELECT
  pg_size_pretty(before_compression_total_bytes) as before,
  pg_size_pretty(after_compression_total_bytes) as after,
  before_compression_total_bytes/after_compression_total_bytes as ratio
FROM timescaledb_information.compressed_hypertable_stats;
```

### Redis Optimization

#### Memory Management

```bash
# Check memory usage
redis-cli --pass $REDIS_PASSWORD INFO MEMORY

# Set maxmemory policy
redis-cli --pass $REDIS_PASSWORD CONFIG SET maxmemory-policy allkeys-lru

# Configure maxmemory
redis-cli --pass $REDIS_PASSWORD CONFIG SET maxmemory 2gb
```

#### Cache Hit Ratio

```bash
# Check hit ratio
redis-cli --pass $REDIS_PASSWORD INFO STATS | grep keyspace

# Target: > 80% hit ratio
```

### Kafka Optimization

#### Throughput Tuning

```bash
# Increase batch size
kafka-configs --bootstrap-server localhost:9092 \
  --alter --entity-type brokers --entity-default \
  --add-config batch.size=32768

# Adjust compression
kafka-configs --bootstrap-server localhost:9092 \
  --alter --entity-type topics --entity-name my-topic \
  --add-config compression.type=lz4
```

#### Consumer Lag

```bash
# Monitor consumer lag
kafka-consumer-groups --bootstrap-server localhost:9092 \
  --describe --group my-consumer-group

# Increase partitions to scale consumers
kafka-topics --bootstrap-server localhost:9092 \
  --alter --topic my-topic --partitions 24
```

## Security

### Credential Rotation

```bash
# Rotate database passwords
./operations/rotate-credentials.sh

# This will:
# 1. Generate new secure passwords
# 2. Update Kubernetes secrets
# 3. Rotate database credentials
# 4. Restart database pods
# 5. Verify connectivity
```

### TLS Certificates

```bash
# Check certificate expiration
kubectl get certificates -n llm-analytics-hub

# Certificates are auto-renewed by cert-manager
```

### Access Control

#### TimescaleDB

```sql
-- Create read-only user
CREATE USER readonly WITH PASSWORD 'secure-password';
GRANT CONNECT ON DATABASE llm_analytics TO readonly;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO readonly;

-- Create application user
CREATE USER app_user WITH PASSWORD 'secure-password';
GRANT CONNECT ON DATABASE llm_analytics TO app_user;
GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA public TO app_user;
```

#### Redis

```bash
# Configure ACL
redis-cli --pass $REDIS_PASSWORD ACL SETUSER readonly on >readonly-pass ~* -@all +@read
redis-cli --pass $REDIS_PASSWORD ACL SETUSER app_user on >app-pass ~* +@all
```

## Disaster Recovery

### RTO/RPO Targets

- **RTO (Recovery Time Objective)**: 15 minutes
- **RPO (Recovery Point Objective)**:
  - TimescaleDB: 1 hour (via PITR)
  - Redis: 1 hour (hourly snapshots)
  - Kafka: 24 hours (daily backups)

### Failover Procedures

#### Automated Failover

Database failover is automated using:
- TimescaleDB: Patroni for HA
- Redis: Redis Sentinel
- Kafka: Built-in partition rebalancing

#### Manual Failover

See `disaster-recovery/failover-playbook.md` for detailed procedures.

### Cross-Region Replication

For multi-region deployments:

```bash
kubectl apply -f disaster-recovery/cross-region-replication.yaml
```

## Common Procedures

### Scaling

#### Scale TimescaleDB

```bash
# Add read replicas
kubectl scale statefulset timescaledb -n llm-analytics-hub --replicas=5

# Verify replication
kubectl exec -n llm-analytics-hub timescaledb-0 -- \
  psql -U postgres -c "SELECT * FROM pg_stat_replication;"
```

#### Scale Redis

```bash
# Add nodes to cluster (must be multiples of 3)
kubectl scale statefulset redis-cluster -n llm-analytics-hub --replicas=9

# Rebalance cluster
kubectl exec -n llm-analytics-hub redis-cluster-0 -- \
  redis-cli --pass $REDIS_PASSWORD --cluster rebalance redis-cluster-service:6379
```

#### Scale Kafka

```bash
# Add brokers
kubectl scale statefulset kafka -n llm-analytics-hub --replicas=5

# Reassign partitions
kubectl exec -n llm-analytics-hub kafka-0 -- kafka-reassign-partitions.sh \
  --bootstrap-server localhost:9092 --execute --reassignment-json-file reassignment.json
```

### Upgrades

See detailed upgrade procedures in the respective sections:
- TimescaleDB: `docs/UPGRADE_TIMESCALEDB.md`
- Redis: `docs/UPGRADE_REDIS.md`
- Kafka: `docs/UPGRADE_KAFKA.md`

## Support

### Getting Help

1. Check this operations guide
2. Review troubleshooting guide: `docs/TROUBLESHOOTING.md`
3. Check monitoring dashboards
4. Review Prometheus alerts
5. Contact database team: database-ops@example.com

### On-Call Procedures

See `disaster-recovery/on-call-playbook.md` for incident response procedures.

## Appendix

### Useful Queries

#### TimescaleDB

```sql
-- Database size
SELECT pg_size_pretty(pg_database_size('llm_analytics'));

-- Table sizes
SELECT
  schemaname,
  tablename,
  pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;

-- Active queries
SELECT pid, age(clock_timestamp(), query_start), usename, query
FROM pg_stat_activity
WHERE state != 'idle' AND query NOT ILIKE '%pg_stat_activity%'
ORDER BY query_start;
```

#### Redis

```bash
# Keyspace info
redis-cli --pass $REDIS_PASSWORD INFO KEYSPACE

# Slow log
redis-cli --pass $REDIS_PASSWORD SLOWLOG GET 10

# Memory usage by key pattern
redis-cli --pass $REDIS_PASSWORD --bigkeys
```

#### Kafka

```bash
# Topic details
kafka-topics --bootstrap-server localhost:9092 --describe --topic my-topic

# Consumer lag
kafka-consumer-groups --bootstrap-server localhost:9092 \
  --describe --group my-group --members --verbose

# Log segments
kafka-log-dirs --bootstrap-server localhost:9092 --describe \
  --topic-list my-topic
```
