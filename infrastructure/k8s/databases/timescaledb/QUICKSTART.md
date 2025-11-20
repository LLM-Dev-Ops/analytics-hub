# TimescaleDB Quick Start Guide

Get your production TimescaleDB cluster running in minutes.

## Prerequisites

- Kubernetes 1.28+ cluster
- kubectl configured
- 30+ CPU cores available
- 120GB+ RAM available
- 2TB+ storage available

## One-Command Deployment

```bash
cd /workspaces/llm-analytics-hub/infrastructure/k8s/databases/timescaledb
./deploy.sh
```

This automated script will:
1. Generate secure passwords
2. Create TLS certificates
3. Deploy all Kubernetes resources
4. Wait for cluster to be ready
5. Display connection information

## Manual Deployment (5 Minutes)

### Step 1: Create Namespace

```bash
kubectl apply -f namespace.yaml
```

### Step 2: Generate Secrets

```bash
# Generate passwords
POSTGRES_PASSWORD=$(openssl rand -base64 32)
APP_PASSWORD=$(openssl rand -base64 32)

# Create secret
kubectl create secret generic timescaledb-credentials \
  --from-literal=POSTGRES_PASSWORD="$POSTGRES_PASSWORD" \
  --from-literal=REPLICATION_PASSWORD="$(openssl rand -base64 32)" \
  --from-literal=APP_PASSWORD="$APP_PASSWORD" \
  --from-literal=PATRONI_SUPERUSER_PASSWORD="$(openssl rand -base64 32)" \
  --from-literal=PATRONI_REPLICATION_PASSWORD="$(openssl rand -base64 32)" \
  --from-literal=PGBOUNCER_PASSWORD="$(openssl rand -base64 32)" \
  -n timescaledb

# Save passwords
echo "POSTGRES_PASSWORD=$POSTGRES_PASSWORD" > .credentials
echo "APP_PASSWORD=$APP_PASSWORD" >> .credentials
```

### Step 3: Create TLS Certificate

```bash
# Generate self-signed cert
openssl req -x509 -newkey rsa:4096 -nodes \
  -keyout /tmp/tls.key -out /tmp/tls.crt -days 365 \
  -subj "/CN=timescaledb.timescaledb.svc.cluster.local"

# Create secret
kubectl create secret tls timescaledb-tls \
  --cert=/tmp/tls.crt --key=/tmp/tls.key \
  -n timescaledb

# Cleanup
rm /tmp/tls.{key,crt}
```

### Step 4: Deploy Infrastructure

```bash
# Deploy all manifests
kubectl apply -f storageclass.yaml
kubectl apply -f configmap.yaml
kubectl apply -f init-scripts-configmap.yaml
kubectl apply -f patroni-config.yaml
kubectl apply -f statefulset.yaml
kubectl apply -f services.yaml
kubectl apply -f pgbouncer.yaml
kubectl apply -f network-policy.yaml
kubectl apply -f monitoring.yaml
```

### Step 5: Wait for Cluster

```bash
# Wait for pods to be ready (5-10 minutes)
kubectl wait --for=condition=ready pod/timescaledb-0 -n timescaledb --timeout=600s
kubectl wait --for=condition=ready pod/timescaledb-1 -n timescaledb --timeout=600s
kubectl wait --for=condition=ready pod/timescaledb-2 -n timescaledb --timeout=600s

# Verify cluster
kubectl get pods -n timescaledb
```

Expected output:
```
NAME            READY   STATUS    RESTARTS   AGE
timescaledb-0   2/2     Running   0          5m
timescaledb-1   2/2     Running   0          4m
timescaledb-2   2/2     Running   0          3m
etcd-0          1/1     Running   0          5m
etcd-1          1/1     Running   0          4m
etcd-2          1/1     Running   0          3m
pgbouncer-xxx   2/2     Running   0          5m
```

## Connect to Database

### Get Application Password

```bash
APP_PASSWORD=$(kubectl get secret timescaledb-credentials -n timescaledb \
  -o jsonpath='{.data.APP_PASSWORD}' | base64 -d)
echo $APP_PASSWORD
```

### Connection Strings

**Primary (Read-Write):**
```
postgresql://llm_app:$APP_PASSWORD@timescaledb-rw.timescaledb.svc.cluster.local:5432/llm_analytics?sslmode=require
```

**Via PgBouncer (Recommended):**
```
postgresql://llm_app:$APP_PASSWORD@pgbouncer.timescaledb.svc.cluster.local:6432/llm_analytics
```

### Test Connection

```bash
# From within cluster
kubectl run -it --rm psql-test --image=postgres:15 -n timescaledb -- \
  psql "postgresql://llm_app:$APP_PASSWORD@pgbouncer.timescaledb.svc.cluster.local:6432/llm_analytics"
```

## Verify Installation

```bash
# Check Patroni cluster
kubectl exec -it timescaledb-0 -n timescaledb -- patronictl list

# Run system health check
kubectl exec -it timescaledb-0 -n timescaledb -- \
  psql -U postgres llm_analytics -c "SELECT * FROM analytics.system_health_check();"

# Check hypertables
kubectl exec -it timescaledb-0 -n timescaledb -- \
  psql -U postgres llm_analytics -c "SELECT * FROM timescaledb_information.hypertables;"
```

## Enable Backups (Optional)

### Configure S3

```bash
kubectl create secret generic timescaledb-backup-s3 \
  --from-literal=AWS_ACCESS_KEY_ID="your-key" \
  --from-literal=AWS_SECRET_ACCESS_KEY="your-secret" \
  --from-literal=S3_BUCKET="timescaledb-backups" \
  --from-literal=S3_REGION="us-east-1" \
  --from-literal=S3_ENDPOINT="https://s3.amazonaws.com" \
  -n timescaledb
```

### Deploy Backup CronJobs

```bash
kubectl apply -f backup-cronjob.yaml
```

### Verify Backups

```bash
# Check backup jobs
kubectl get cronjobs -n timescaledb

# Trigger manual backup
kubectl create job --from=cronjob/timescaledb-backup-full \
  timescaledb-backup-manual -n timescaledb
```

## Monitor Your Cluster

### Prometheus Metrics

```bash
# Port-forward to metrics endpoint
kubectl port-forward svc/timescaledb-metrics 9187:9187 -n timescaledb

# Access metrics
curl http://localhost:9187/metrics
```

### Grafana Dashboard

```bash
# Import dashboard from monitoring.yaml ConfigMap
kubectl get configmap timescaledb-dashboard -n timescaledb -o jsonpath='{.data.timescaledb-dashboard\.json}'
```

### View Logs

```bash
# TimescaleDB logs
kubectl logs -f timescaledb-0 -c timescaledb -n timescaledb

# Patroni logs
kubectl logs -f timescaledb-0 -c patroni -n timescaledb

# PgBouncer logs
kubectl logs -f -l app.kubernetes.io/name=pgbouncer -n timescaledb
```

## Common Operations

### Insert Sample Data

```bash
kubectl exec -it timescaledb-0 -n timescaledb -- \
  psql -U postgres llm_analytics << 'EOF'
INSERT INTO metrics.llm_requests (
    time, request_id, model_name, provider,
    prompt_tokens, completion_tokens, total_tokens,
    latency_ms, cost_usd, status
) VALUES (
    NOW(), gen_random_uuid(), 'gpt-4', 'openai',
    100, 200, 300, 1500, 0.05, 'success'
);
EOF
```

### Query Data

```bash
kubectl exec -it timescaledb-0 -n timescaledb -- \
  psql -U postgres llm_analytics -c "SELECT * FROM analytics.recent_requests LIMIT 10;"
```

### Check Performance

```bash
kubectl exec -it timescaledb-0 -n timescaledb -- \
  psql -U postgres llm_analytics -c "SELECT * FROM analytics.top_models_by_usage;"
```

## Troubleshooting

### Pods Not Starting

```bash
# Check pod status
kubectl describe pod timescaledb-0 -n timescaledb

# Check logs
kubectl logs timescaledb-0 -n timescaledb

# Check PVC
kubectl get pvc -n timescaledb
```

### Connection Refused

```bash
# Check service
kubectl get svc -n timescaledb

# Test from within cluster
kubectl run -it --rm debug --image=postgres:15 -n timescaledb -- bash
```

### High Replication Lag

```bash
# Check replication status
kubectl exec -it timescaledb-0 -n timescaledb -- \
  psql -U postgres -c "SELECT * FROM pg_stat_replication;"
```

## Next Steps

1. **Configure Application**: Update your app to use the connection string
2. **Set up Monitoring**: Import Grafana dashboards
3. **Configure Alerts**: Review and customize Prometheus alerts
4. **Plan Backups**: Test backup and restore procedures
5. **Read Full Docs**: See [README.md](README.md) for complete documentation

## Production Checklist

- [ ] Passwords generated and stored securely
- [ ] TLS certificates configured
- [ ] Storage class configured for your cloud provider
- [ ] Backup storage configured (S3/MinIO)
- [ ] Network policies reviewed and applied
- [ ] Monitoring dashboards imported
- [ ] Alert rules configured
- [ ] Backup/restore tested
- [ ] Connection pooling verified
- [ ] Performance baseline established

## Support

For detailed documentation, see [README.md](README.md)

For issues or questions:
- Check logs: `kubectl logs -n timescaledb`
- Review events: `kubectl get events -n timescaledb`
- Describe resources: `kubectl describe pod timescaledb-0 -n timescaledb`
