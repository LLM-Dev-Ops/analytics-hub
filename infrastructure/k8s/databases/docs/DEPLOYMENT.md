# Database Deployment Guide

Complete guide for deploying the LLM Analytics Hub database infrastructure.

## Table of Contents

- [Overview](#overview)
- [Prerequisites](#prerequisites)
- [Quick Start](#quick-start)
- [Deployment Steps](#deployment-steps)
- [Environment Configuration](#environment-configuration)
- [Troubleshooting](#troubleshooting)
- [Rollback Procedures](#rollback-procedures)

## Overview

The LLM Analytics Hub uses three primary databases:

- **TimescaleDB** - Time-series analytics and metrics storage
- **Redis** - Caching, session management, and rate limiting
- **Kafka** - Event streaming and message queuing

## Prerequisites

### Required Tools

- `kubectl` (v1.24+)
- `bash` (v4.0+)
- Kubernetes cluster (v1.24+)
- Storage provisioner (CSI driver or default storage class)

### Cluster Requirements

- **Minimum Nodes**: 3
- **CPU**: 8 cores total
- **Memory**: 16GB total
- **Storage**: 100GB available

### Permissions

The deployment user must have permissions to:
- Create namespaces
- Create and manage pods, services, statefulsets
- Create and bind PVCs
- View cluster resources

## Quick Start

### Using Makefile (Recommended)

```bash
# Full deployment with all checks
make full-deploy ENV=dev

# Or step by step
make pre-check ENV=dev
make deploy ENV=dev
make init
make post-check ENV=dev
make smoke-test
```

### Using Scripts Directly

```bash
cd /workspaces/llm-analytics-hub/infrastructure/k8s/databases

# Run pre-deployment checks
bash validation/pre-deploy-check.sh dev

# Deploy all databases
bash deployment/deploy-databases.sh dev

# Validate deployment
bash deployment/validate-deployment.sh llm-analytics

# Run smoke tests
bash validation/smoke-test.sh llm-analytics
```

## Deployment Steps

### Step 1: Pre-Deployment Validation

Run pre-deployment checks to ensure the cluster is ready:

```bash
make pre-check ENV=dev
```

This validates:
- Kubernetes cluster connectivity
- Node resources and status
- Storage classes availability
- Required permissions
- DNS configuration

### Step 2: Deploy Databases

Deploy all databases in the correct order:

```bash
make deploy ENV=dev
```

The deployment script:
1. Creates namespace (`llm-analytics`)
2. Deploys storage resources (PVCs)
3. Deploys Zookeeper (for Kafka)
4. Deploys TimescaleDB
5. Deploys Redis
6. Deploys Kafka

Each component waits for the previous one to be ready before proceeding.

### Step 3: Initialize Databases

Initialize schemas and configurations:

```bash
make init
```

This performs:

#### TimescaleDB Initialization
- Creates databases (analytics, metrics, events)
- Installs TimescaleDB extension
- Creates hypertables
- Sets up continuous aggregates
- Applies compression policies
- Creates indexes

#### Redis Initialization
- Configures memory limits
- Sets eviction policies
- Tests replication
- Creates cache namespaces

#### Kafka Initialization
- Creates topics (llm-events, llm-metrics, llm-alerts, llm-logs)
- Configures partitions and replication
- Sets retention policies
- Tests producer/consumer

### Step 4: Post-Deployment Validation

Validate the deployment:

```bash
make post-check ENV=dev
```

Validates:
- All pods are running and ready
- Services are accessible
- PVCs are bound
- Database connectivity

### Step 5: Run Smoke Tests

Execute smoke tests to verify basic functionality:

```bash
make smoke-test
```

Tests:
- Database connectivity
- CRUD operations
- Replication (if configured)
- Persistence

### Step 6: Run Integration Tests (Optional)

For production deployments, run integration tests:

```bash
make integration-test
```

Tests:
- End-to-end data flow
- Multi-database transactions
- Event streaming pipeline
- Backup capability

## Environment Configuration

### Development (dev)

```bash
ENV=dev make deploy
```

Configuration:
- Single replicas
- Minimal resources
- Fast deployment
- Relaxed retention policies

### Staging (staging)

```bash
ENV=staging make deploy
```

Configuration:
- Production-like setup
- Multi-replicas for testing
- Standard resources
- Production retention policies

### Production (prod)

```bash
ENV=prod make deploy
```

Configuration:
- High availability
- Multiple replicas
- Resource guarantees
- Strict retention and backup policies
- Monitoring enabled

## Deployment Options

### Deploy Individual Components

Deploy specific databases:

```bash
# TimescaleDB only
make deploy-timescaledb ENV=dev

# Redis only
make deploy-redis ENV=dev

# Kafka only
make deploy-kafka ENV=dev
```

### Initialize Individual Components

```bash
# TimescaleDB only
make init-timescaledb

# Redis only
make init-redis

# Kafka only
make init-kafka
```

## Monitoring Deployment

### Watch Deployment Progress

```bash
# Watch all resources
watch kubectl get all -n llm-analytics

# Watch pods
kubectl get pods -n llm-analytics -w

# Watch statefulsets
kubectl get statefulset -n llm-analytics -w
```

### Check Logs

```bash
# TimescaleDB logs
make logs DB=timescaledb

# Redis logs
make logs DB=redis

# Kafka logs
make logs DB=kafka
```

### Access Database Shells

```bash
# TimescaleDB shell
make shell DB=timescaledb

# Redis shell
make shell DB=redis

# Kafka shell
make shell DB=kafka
```

## Troubleshooting

### Pods Not Starting

```bash
# Check pod status
kubectl describe pod <pod-name> -n llm-analytics

# Check events
kubectl get events -n llm-analytics --sort-by='.lastTimestamp'

# Check resource quotas
kubectl describe namespace llm-analytics
```

### PVC Not Binding

```bash
# Check PVC status
kubectl get pvc -n llm-analytics

# Check storage classes
kubectl get storageclass

# Describe PVC
kubectl describe pvc <pvc-name> -n llm-analytics
```

### Service Not Accessible

```bash
# Check service endpoints
kubectl get endpoints -n llm-analytics

# Test service DNS
kubectl run -it --rm debug --image=busybox --restart=Never \
  -- nslookup timescaledb.llm-analytics.svc.cluster.local
```

### Database Not Accepting Connections

```bash
# Check database logs
kubectl logs -l app=timescaledb -n llm-analytics --tail=100

# Test connectivity from pod
kubectl exec -it <pod-name> -n llm-analytics -- psql -U postgres -c "SELECT 1;"
```

## Rollback Procedures

### Rollback Entire Deployment

```bash
make rollback ENV=dev
```

This will:
1. Delete all database StatefulSets
2. Delete all Services
3. Optionally delete PVCs (with confirmation)

### Rollback Individual Component

```bash
# Delete TimescaleDB
kubectl delete statefulset timescaledb -n llm-analytics
kubectl delete svc timescaledb -n llm-analytics

# Delete Redis
kubectl delete statefulset redis -n llm-analytics
kubectl delete svc redis-master redis-replicas -n llm-analytics

# Delete Kafka
kubectl delete statefulset kafka -n llm-analytics
kubectl delete svc kafka -n llm-analytics
```

### Preserve Data During Rollback

PVCs are not automatically deleted to preserve data. To manually delete:

```bash
# List PVCs
kubectl get pvc -n llm-analytics

# Delete specific PVC
kubectl delete pvc <pvc-name> -n llm-analytics

# Delete all PVCs
kubectl delete pvc --all -n llm-analytics
```

## Advanced Configuration

### Custom Namespace

```bash
NAMESPACE=custom-namespace make deploy ENV=dev
```

### Resource Limits

Edit the StatefulSet manifests to adjust resource limits:

```yaml
resources:
  limits:
    cpu: "2"
    memory: "4Gi"
  requests:
    cpu: "1"
    memory: "2Gi"
```

### Storage Size

Edit PVC manifests to adjust storage size:

```yaml
spec:
  resources:
    requests:
      storage: 100Gi
```

## Post-Deployment Tasks

### Configure Monitoring

```bash
# Deploy monitoring stack (if available)
kubectl apply -f monitoring/

# Access metrics
kubectl port-forward svc/prometheus 9090:9090 -n monitoring
```

### Set Up Backups

```bash
# Configure backup cronjob
kubectl apply -f backups/cronjob.yaml
```

### Configure Alerts

```bash
# Set up alerting rules
kubectl apply -f monitoring/alerts.yaml
```

## Connection Information

After successful deployment:

### TimescaleDB

```
Host: timescaledb.llm-analytics.svc.cluster.local
Port: 5432
Database: analytics
User: postgres
```

### Redis

```
Master: redis-master.llm-analytics.svc.cluster.local:6379
Replicas: redis-replicas.llm-analytics.svc.cluster.local:6379
```

### Kafka

```
Bootstrap Server: kafka.llm-analytics.svc.cluster.local:9092
```

## Next Steps

1. Review [INTEGRATION.md](INTEGRATION.md) for application integration
2. Review [TESTING.md](TESTING.md) for load testing
3. Review [MIGRATION.md](MIGRATION.md) for schema migrations
4. Set up monitoring and alerting
5. Configure backup and disaster recovery

## Support

For issues and questions:
- Check [TROUBLESHOOTING.md](TROUBLESHOOTING.md)
- Review logs: `make logs DB=<database>`
- Check cluster events: `kubectl get events -n llm-analytics`
