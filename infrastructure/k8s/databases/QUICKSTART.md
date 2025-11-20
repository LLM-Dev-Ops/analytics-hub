# Quick Start Guide

Get the LLM Analytics Hub databases up and running in 5 minutes.

## Prerequisites

- Kubernetes cluster (local or cloud)
- kubectl configured
- 8GB+ RAM, 4+ CPU cores, 50GB+ storage available

## 1. Deploy Databases (2 minutes)

```bash
cd /workspaces/llm-analytics-hub/infrastructure/k8s/databases

# Deploy all databases
make deploy ENV=dev
```

This will:
- Create the `llm-analytics` namespace
- Deploy TimescaleDB, Redis, and Kafka
- Wait for all pods to be ready

## 2. Initialize Databases (1 minute)

```bash
# Initialize schemas and configurations
make init
```

This will:
- Create TimescaleDB schemas and hypertables
- Configure Redis cluster
- Create Kafka topics

## 3. Validate Deployment (1 minute)

```bash
# Run validation checks
make validate

# Run smoke tests
make smoke-test
```

## 4. Verify Everything is Working (1 minute)

```bash
# Check status
make status

# Should see all pods running
kubectl get pods -n llm-analytics
```

Expected output:
```
NAME              READY   STATUS    RESTARTS   AGE
timescaledb-0     1/1     Running   0          2m
redis-0           1/1     Running   0          2m
kafka-0           1/1     Running   0          2m
zookeeper-0       1/1     Running   0          2m
```

## 5. Test Connections

### TimescaleDB

```bash
# Port forward
kubectl port-forward svc/timescaledb 5432:5432 -n llm-analytics &

# Connect with psql
psql -h localhost -U postgres -d analytics
```

### Redis

```bash
# Port forward
kubectl port-forward svc/redis-master 6379:6379 -n llm-analytics &

# Connect with redis-cli
redis-cli -h localhost
```

### Kafka

```bash
# Port forward
kubectl port-forward svc/kafka 9092:9092 -n llm-analytics &

# List topics
kubectl exec -it kafka-0 -n llm-analytics -- kafka-topics.sh \
  --bootstrap-server localhost:9092 --list
```

## Next Steps

### Run Integration Tests

```bash
make integration-test
```

### Run Load Tests

```bash
make load-test-timescaledb
make load-test-redis
make load-test-kafka
```

### Use Example Code

```bash
# Python examples
cd examples/python

# TimescaleDB example
python3 timescaledb_example.py

# Redis example
python3 redis_example.py

# Kafka example
python3 kafka_example.py
```

### View Documentation

- [Deployment Guide](docs/DEPLOYMENT.md) - Complete deployment documentation
- [Integration Guide](docs/INTEGRATION.md) - How to integrate with applications
- [Testing Guide](docs/TESTING.md) - Testing and benchmarking
- [Troubleshooting](docs/TROUBLESHOOTING.md) - Common issues and solutions

## Common Commands

```bash
# View logs
make logs DB=timescaledb
make logs DB=redis
make logs DB=kafka

# Access database shell
make shell DB=timescaledb
make shell DB=redis
make shell DB=kafka

# Check deployment status
make status

# Rollback if needed
make rollback ENV=dev
```

## Troubleshooting

### Pods not starting?

```bash
# Check pod events
kubectl describe pod <pod-name> -n llm-analytics

# Check cluster resources
kubectl top nodes
```

### PVCs not binding?

```bash
# Check storage class
kubectl get storageclass

# Check PVC status
kubectl get pvc -n llm-analytics
```

### Connection refused?

```bash
# Check service endpoints
kubectl get endpoints -n llm-analytics

# Verify pods are ready
kubectl get pods -n llm-analytics
```

## Clean Up

To remove everything:

```bash
make rollback ENV=dev
```

This will delete all deployments but preserve PVCs (data) by default.

## Getting Help

- Check [README.md](README.md) for overview
- Read [docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md) for detailed help
- Review logs: `make logs DB=<database>`
- Check Kubernetes events: `kubectl get events -n llm-analytics`
