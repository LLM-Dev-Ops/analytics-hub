# TimescaleDB Deployment for LLM Analytics Hub

Production-grade TimescaleDB cluster with high availability, monitoring, and automated backups for time-series LLM analytics data.

## Architecture Overview

### Components

- **TimescaleDB Cluster**: 3-node PostgreSQL 15.5 + TimescaleDB 2.13.1 cluster
- **Patroni**: Automatic failover and leader election
- **etcd**: Distributed configuration store for Patroni
- **PgBouncer**: Connection pooling (3 replicas, autoscaling to 10)
- **pgBackRest**: Automated backup and recovery
- **Prometheus Exporters**: PostgreSQL and PgBouncer metrics
- **Network Policies**: Secure network isolation

### High Availability

- **3 replicas**: 1 primary + 2 synchronous replicas
- **Automatic failover**: Patroni manages leader election (30s TTL)
- **Streaming replication**: Synchronous mode with 1 standby
- **Zone distribution**: Pods spread across availability zones
- **Pod disruption budget**: Minimum 2 replicas available during updates

### Storage Architecture

Each pod uses 3 separate volumes:

1. **Data Volume** (500GB Premium SSD)
   - PostgreSQL data directory
   - IOPS: 10,000+
   - Compression enabled after 7 days

2. **WAL Volume** (50GB Premium SSD)
   - Write-Ahead Log for durability
   - No caching for maximum durability
   - Separate for I/O isolation

3. **Backup Volume** (200GB Standard SSD)
   - Local backup staging
   - Point-in-time recovery files

### Resource Allocation

Per pod:
- **CPU**: 4 cores (request) / 8 cores (limit)
- **Memory**: 16GB (request) / 32GB (limit)
- **Storage**: 750GB total (500GB + 50GB + 200GB)

Total cluster:
- **CPU**: 12-24 cores
- **Memory**: 48-96GB
- **Storage**: 2.25TB

## Prerequisites

### Required

1. **Kubernetes cluster** 1.28+
2. **Storage provisioner** with dynamic provisioning
3. **kubectl** configured with cluster access
4. **Sufficient cluster resources** (see above)

### Optional

- **Prometheus Operator** for ServiceMonitors
- **cert-manager** for TLS certificate management
- **S3-compatible storage** for backups (AWS S3, MinIO, etc.)

## Quick Start

### 1. Generate Secrets

```bash
# Generate strong passwords
POSTGRES_PASSWORD=$(openssl rand -base64 32)
REPLICATION_PASSWORD=$(openssl rand -base64 32)
APP_PASSWORD=$(openssl rand -base64 32)
PATRONI_PASSWORD=$(openssl rand -base64 32)
PGBOUNCER_PASSWORD=$(openssl rand -base64 32)

# Create secrets
kubectl create secret generic timescaledb-credentials \
  --from-literal=POSTGRES_PASSWORD="$POSTGRES_PASSWORD" \
  --from-literal=REPLICATION_PASSWORD="$REPLICATION_PASSWORD" \
  --from-literal=APP_PASSWORD="$APP_PASSWORD" \
  --from-literal=PATRONI_SUPERUSER_PASSWORD="$PATRONI_PASSWORD" \
  --from-literal=PATRONI_REPLICATION_PASSWORD="$REPLICATION_PASSWORD" \
  --from-literal=PGBOUNCER_PASSWORD="$PGBOUNCER_PASSWORD" \
  -n timescaledb
```

### 2. Generate TLS Certificates

```bash
# Generate self-signed certificate (or use cert-manager)
openssl req -x509 -newkey rsa:4096 -nodes \
  -keyout tls.key -out tls.crt -days 365 \
  -subj "/CN=timescaledb.timescaledb.svc.cluster.local"

# Create TLS secret
kubectl create secret tls timescaledb-tls \
  --cert=tls.crt --key=tls.key \
  -n timescaledb
```

### 3. Configure S3 Backup Storage (Optional)

```bash
# Create S3 credentials secret
kubectl create secret generic timescaledb-backup-s3 \
  --from-literal=AWS_ACCESS_KEY_ID="your-access-key" \
  --from-literal=AWS_SECRET_ACCESS_KEY="your-secret-key" \
  --from-literal=S3_BUCKET="timescaledb-backups" \
  --from-literal=S3_REGION="us-east-1" \
  --from-literal=S3_ENDPOINT="https://s3.amazonaws.com" \
  -n timescaledb
```

### 4. Deploy TimescaleDB

#### Option A: Using Kubernetes Manifests

```bash
# Deploy in order
kubectl apply -f namespace.yaml
kubectl apply -f storageclass.yaml
kubectl apply -f secrets.yaml
kubectl apply -f configmap.yaml
kubectl apply -f init-scripts-configmap.yaml
kubectl apply -f patroni-config.yaml
kubectl apply -f statefulset.yaml
kubectl apply -f services.yaml
kubectl apply -f pgbouncer.yaml
kubectl apply -f network-policy.yaml
kubectl apply -f monitoring.yaml
kubectl apply -f backup-cronjob.yaml
```

#### Option B: Using Helm

```bash
# Add TimescaleDB Helm repository
helm repo add timescale https://charts.timescale.com/
helm repo update

# Install with custom values
helm install timescaledb timescale/timescaledb-single \
  -f helm-values.yaml \
  -n timescaledb \
  --create-namespace
```

### 5. Verify Deployment

```bash
# Check pods
kubectl get pods -n timescaledb

# Expected output:
# NAME            READY   STATUS    RESTARTS   AGE
# timescaledb-0   2/2     Running   0          5m
# timescaledb-1   2/2     Running   0          4m
# timescaledb-2   2/2     Running   0          3m
# etcd-0          1/1     Running   0          5m
# etcd-1          1/1     Running   0          4m
# etcd-2          1/1     Running   0          3m
# pgbouncer-xxx   2/2     Running   0          5m

# Check services
kubectl get svc -n timescaledb

# Check patroni cluster status
kubectl exec -it timescaledb-0 -n timescaledb -- patronictl list
```

## Connection Strings

### Primary (Read-Write)

```bash
# Direct connection
postgresql://llm_app:APP_PASSWORD@timescaledb-rw.timescaledb.svc.cluster.local:5432/llm_analytics?sslmode=require

# Via PgBouncer (recommended)
postgresql://llm_app:APP_PASSWORD@pgbouncer.timescaledb.svc.cluster.local:6432/llm_analytics
```

### Replica (Read-Only)

```bash
postgresql://llm_app:APP_PASSWORD@timescaledb-ro.timescaledb.svc.cluster.local:5432/llm_analytics?sslmode=require
```

### From Application Pods

```yaml
env:
  - name: DATABASE_URL
    value: "postgresql://llm_app:APP_PASSWORD@pgbouncer.timescaledb.svc.cluster.local:6432/llm_analytics"
```

## Database Schema

### Schemas

1. **metrics**: Core LLM metrics and performance data
   - `llm_requests`: Individual request metrics
   - `token_usage`: Token usage aggregates
   - `cost_tracking`: Cost tracking by user/model

2. **events**: System events and logs
   - `system_events`: Application events
   - `error_logs`: Error tracking and debugging

3. **analytics**: Aggregated analytics
   - `model_performance`: Model performance statistics

4. **aggregates**: Continuous aggregates (materialized views)
   - `hourly_request_stats`: Hourly request statistics
   - `daily_cost_summary`: Daily cost summaries
   - `error_rate_by_model`: Real-time error rates

### Hypertables

All time-series tables are converted to TimescaleDB hypertables with:
- **Chunk interval**: 1 day for high-frequency data
- **Compression**: Enabled after 7 days
- **Retention**: 30-365 days depending on table
- **Indexes**: Optimized for time-based queries

### Example Queries

```sql
-- Recent requests (last 24 hours)
SELECT * FROM analytics.recent_requests LIMIT 100;

-- Top models by usage (last 7 days)
SELECT * FROM analytics.top_models_by_usage;

-- Cost by user (today)
SELECT
  user_id,
  SUM(total_cost_usd) AS total_cost,
  COUNT(*) AS request_count
FROM metrics.llm_requests
WHERE time > CURRENT_DATE
GROUP BY user_id
ORDER BY total_cost DESC;

-- Average latency by model (last hour)
SELECT
  model_name,
  AVG(latency_ms) AS avg_latency,
  PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY latency_ms) AS p95_latency
FROM metrics.llm_requests
WHERE time > NOW() - INTERVAL '1 hour'
GROUP BY model_name;

-- System health check
SELECT * FROM analytics.system_health_check();
```

## Operations

### Monitoring

#### Grafana Dashboards

Import the provided dashboard:
```bash
kubectl apply -f monitoring.yaml
```

Access Grafana and import the TimescaleDB dashboard from ConfigMap.

#### Prometheus Alerts

Key alerts configured:
- Database down
- High replication lag (>60s warning, >300s critical)
- Connection pool exhaustion (>180 connections)
- Disk space warnings (<20% warning, <10% critical)
- Slow queries (>5s average)
- Backup failures
- High CPU/memory usage

#### Health Checks

```bash
# Check cluster health
kubectl exec -it timescaledb-0 -n timescaledb -- \
  psql -U postgres -c "SELECT * FROM analytics.system_health_check();"

# Check replication status
kubectl exec -it timescaledb-0 -n timescaledb -- \
  psql -U postgres -c "SELECT * FROM pg_stat_replication;"

# Check Patroni cluster
kubectl exec -it timescaledb-0 -n timescaledb -- patronictl list
```

### Backups

#### Automated Backups

Configured CronJobs:
- **Full backup**: Daily at 2 AM UTC
- **Differential backup**: Every 6 hours
- **Backup verification**: Weekly on Sunday at 4 AM

#### Manual Backup

```bash
# Trigger full backup
kubectl create job --from=cronjob/timescaledb-backup-full \
  timescaledb-backup-manual-$(date +%Y%m%d-%H%M%S) \
  -n timescaledb

# Check backup status
kubectl get jobs -n timescaledb

# View backup logs
kubectl logs -l app.kubernetes.io/name=pgbackrest -n timescaledb
```

#### List Available Backups

```bash
kubectl exec -it timescaledb-0 -n timescaledb -- \
  pgbackrest --stanza=timescaledb info
```

### Recovery

#### Point-in-Time Recovery (PITR)

```bash
# Restore to specific timestamp
RESTORE_TARGET="2024-01-15 12:00:00"

# Scale down cluster
kubectl scale statefulset timescaledb --replicas=0 -n timescaledb

# Wait for pods to terminate
kubectl wait --for=delete pod/timescaledb-0 -n timescaledb --timeout=120s

# Restore from backup
kubectl exec -it timescaledb-0 -n timescaledb -- \
  pgbackrest --stanza=timescaledb \
  --type=time \
  --target="$RESTORE_TARGET" \
  --target-action=promote \
  restore

# Scale up cluster
kubectl scale statefulset timescaledb --replicas=3 -n timescaledb
```

#### Restore Latest Backup

```bash
# Scale down
kubectl scale statefulset timescaledb --replicas=0 -n timescaledb

# Restore
kubectl exec -it timescaledb-0 -n timescaledb -- \
  pgbackrest --stanza=timescaledb restore

# Scale up
kubectl scale statefulset timescaledb --replicas=3 -n timescaledb
```

### Scaling

#### Vertical Scaling (Resources)

Edit StatefulSet resources:
```bash
kubectl edit statefulset timescaledb -n timescaledb
```

Update CPU/memory limits and restart pods one by one.

#### Horizontal Scaling (Replicas)

```bash
# Add more replicas (not recommended beyond 5)
kubectl scale statefulset timescaledb --replicas=5 -n timescaledb

# Verify replication
kubectl exec -it timescaledb-0 -n timescaledb -- patronictl list
```

#### Storage Expansion

```bash
# Expand PVC (if storage class supports it)
kubectl patch pvc data-timescaledb-0 -n timescaledb \
  -p '{"spec":{"resources":{"requests":{"storage":"1Ti"}}}}'

# Repeat for all replicas
```

### Maintenance

#### Rolling Updates

```bash
# Update image version
kubectl set image statefulset/timescaledb \
  timescaledb=timescale/timescaledb-ha:pg15.6-ts2.14.0-all \
  -n timescaledb

# Monitor rollout
kubectl rollout status statefulset/timescaledb -n timescaledb
```

#### Manual Failover

```bash
# Trigger failover (switch primary)
kubectl exec -it timescaledb-0 -n timescaledb -- \
  patronictl switchover --master timescaledb-0 --candidate timescaledb-1
```

#### Vacuum and Analyze

```bash
# Full vacuum (during maintenance window)
kubectl exec -it timescaledb-0 -n timescaledb -- \
  psql -U postgres llm_analytics -c "VACUUM FULL ANALYZE;"

# Regular vacuum
kubectl exec -it timescaledb-0 -n timescaledb -- \
  psql -U postgres llm_analytics -c "VACUUM ANALYZE;"
```

#### Reindex

```bash
# Reindex database
kubectl exec -it timescaledb-0 -n timescaledb -- \
  psql -U postgres llm_analytics -c "REINDEX DATABASE llm_analytics;"
```

## Troubleshooting

### Pod Not Starting

```bash
# Check pod events
kubectl describe pod timescaledb-0 -n timescaledb

# Check logs
kubectl logs timescaledb-0 -c timescaledb -n timescaledb

# Check PVC status
kubectl get pvc -n timescaledb
```

### Replication Lag

```bash
# Check replication status
kubectl exec -it timescaledb-0 -n timescaledb -- \
  psql -U postgres -c "SELECT * FROM pg_stat_replication;"

# Check Patroni lag
kubectl exec -it timescaledb-0 -n timescaledb -- patronictl list
```

### Connection Issues

```bash
# Test connection from pod
kubectl run -it --rm psql-test --image=postgres:15 -n timescaledb -- \
  psql postgresql://llm_app:APP_PASSWORD@timescaledb-rw.timescaledb.svc.cluster.local:5432/llm_analytics

# Check PgBouncer status
kubectl logs -l app.kubernetes.io/name=pgbouncer -n timescaledb

# Check network policies
kubectl get networkpolicies -n timescaledb
```

### High CPU/Memory

```bash
# Check top queries
kubectl exec -it timescaledb-0 -n timescaledb -- \
  psql -U postgres llm_analytics -c "
    SELECT query, calls, total_time, mean_time
    FROM pg_stat_statements
    ORDER BY mean_time DESC
    LIMIT 20;"

# Check connections
kubectl exec -it timescaledb-0 -n timescaledb -- \
  psql -U postgres -c "
    SELECT datname, state, COUNT(*)
    FROM pg_stat_activity
    GROUP BY datname, state;"
```

### Backup Failures

```bash
# Check backup job logs
kubectl logs -l backup-type=full -n timescaledb --tail=100

# Verify S3 credentials
kubectl get secret timescaledb-backup-s3 -n timescaledb -o yaml

# Test S3 connectivity
kubectl run -it --rm aws-cli --image=amazon/aws-cli -n timescaledb -- \
  s3 ls s3://your-bucket-name/
```

## Security

### TLS/SSL

All connections use TLS encryption. Certificate is stored in `timescaledb-tls` secret.

### Authentication

- **SCRAM-SHA-256**: Modern password authentication
- **TLS required**: All external connections must use SSL
- **Network policies**: Restrict access to authorized pods only

### Secrets Management

All passwords stored in Kubernetes secrets:
- `timescaledb-credentials`: Database passwords
- `timescaledb-tls`: TLS certificates
- `timescaledb-backup-s3`: S3 credentials

### Network Isolation

Network policies restrict traffic to:
- Application pods (with label `app.kubernetes.io/part-of: llm-analytics-hub`)
- Monitoring pods (Prometheus)
- Internal cluster communication

## Performance Tuning

### PostgreSQL Configuration

Optimized for time-series workloads:
- **shared_buffers**: 8GB (25% of RAM)
- **effective_cache_size**: 24GB (75% of RAM)
- **work_mem**: 64MB
- **random_page_cost**: 1.1 (SSD optimized)
- **effective_io_concurrency**: 200

### TimescaleDB Settings

- **Compression**: Automatic after 7 days (saves 90%+ storage)
- **Retention**: Automatic cleanup (30-365 days)
- **Chunk interval**: 1 day (optimal for high-frequency data)
- **Continuous aggregates**: Pre-computed hourly/daily stats

### Connection Pooling

PgBouncer configuration:
- **Pool mode**: Transaction (best for microservices)
- **Max connections**: 1000 clients → 100 database connections
- **Default pool size**: 25 per database
- **Autoscaling**: 3-10 replicas based on CPU

## Cost Optimization

### Storage Compression

TimescaleDB compression reduces storage by 90%+:
- Automatically compresses data older than 7 days
- Transparent to applications
- Significant cost savings on storage

### Retention Policies

Automatic data cleanup:
- **Events**: 30-90 days
- **Metrics**: 365 days
- **Analytics**: 730 days
- **Continuous aggregates**: Indefinite (small size)

### Resource Right-Sizing

Monitor and adjust:
- Start with 4CPU/16GB per pod
- Scale based on actual usage
- Use PgBouncer to reduce connection overhead

## Support

### Documentation

- [TimescaleDB Docs](https://docs.timescale.com/)
- [Patroni Documentation](https://patroni.readthedocs.io/)
- [pgBackRest Documentation](https://pgbackrest.org/user-guide.html)

### Monitoring

- Prometheus metrics: `http://timescaledb-metrics.timescaledb.svc.cluster.local:9187/metrics`
- Grafana dashboards: Import from `monitoring.yaml`

### Community

- [TimescaleDB Slack](https://timescale.com/slack)
- [PostgreSQL Mailing Lists](https://www.postgresql.org/list/)

## License

This deployment configuration is part of the LLM Analytics Hub project.
