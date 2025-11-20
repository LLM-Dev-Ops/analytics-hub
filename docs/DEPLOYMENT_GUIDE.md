# LLM Analytics Hub - Deployment Guide

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Quick Start](#quick-start)
3. [Local Development](#local-development)
4. [Production Deployment](#production-deployment)
5. [CI/CD Pipeline](#cicd-pipeline)
6. [Monitoring and Operations](#monitoring-and-operations)
7. [Troubleshooting](#troubleshooting)

---

## Prerequisites

### Required Tools

- **Docker** (20.10+)
- **Kubernetes** (1.28+)
- **kubectl** (1.28+)
- **Helm** (3.12+)
- **Rust** (1.75+)
- **Node.js** (20+)
- **PostgreSQL/TimescaleDB** (15+)
- **Redis** (7+)
- **Kafka** (3.5+)

### Cloud Provider Accounts

- AWS (for EKS) **OR**
- GCP (for GKE) **OR**
- Azure (for AKS)

---

## Quick Start

### 1. Clone Repository

```bash
git clone https://github.com/llm-analytics/llm-analytics-hub.git
cd llm-analytics-hub
```

### 2. Build Docker Images

```bash
cd docker
./build-all.sh
```

### 3. Start Local Environment

```bash
docker-compose up -d
```

### 4. Verify Services

```bash
# Check all services are running
docker-compose ps

# Test event ingestion
curl -X POST http://localhost:8080/api/v1/events \
  -H "Content-Type: application/json" \
  -d '{
    "common": {
      "event_id": "test-1",
      "timestamp": "2025-01-01T00:00:00Z",
      "source_module": "test",
      "event_type": "telemetry",
      "schema_version": "1.0.0",
      "severity": "info",
      "environment": "dev",
      "tags": {}
    },
    "payload": {
      "custom_type": "test",
      "data": {"test": true}
    }
  }'

# Access dashboards
open http://localhost:80        # Frontend
open http://localhost:3000      # API
open http://localhost:3001      # Grafana (admin/admin)
```

---

## Local Development

### Build Rust Services

```bash
# Build all services
cargo build --release --bin event-ingestion
cargo build --release --bin metrics-aggregation
cargo build --release --bin correlation-engine
cargo build --release --bin anomaly-detection
cargo build --release --bin forecasting

# Run tests
cargo test --all-features

# Run single service
RUST_LOG=info ./target/release/event-ingestion
```

### Build API

```bash
cd api
npm install
npm run build
npm run dev  # Development mode with hot reload
```

### Build Frontend

```bash
cd frontend
npm install
npm run dev  # Development server on port 5173
npm run build
```

---

## Production Deployment

### Step 1: Provision Infrastructure

```bash
cd infrastructure/terraform

# Initialize Terraform
terraform init

# Plan deployment
terraform plan -var-file=prod.tfvars

# Deploy infrastructure
terraform apply -var-file=prod.tfvars
```

### Step 2: Configure kubectl

```bash
# AWS EKS
aws eks update-kubeconfig --name llm-analytics-prod --region us-east-1

# GCP GKE
gcloud container clusters get-credentials llm-analytics-prod --region us-central1

# Azure AKS
az aks get-credentials --resource-group llm-analytics --name llm-analytics-prod
```

### Step 3: Deploy Database Layer

```bash
kubectl apply -f infrastructure/k8s/databases/timescaledb/
kubectl apply -f infrastructure/k8s/databases/kafka/
```

### Step 4: Deploy Applications

```bash
# Create namespace
kubectl apply -f k8s/applications/namespace.yaml

# Deploy services
kubectl apply -f k8s/applications/event-ingestion/
kubectl apply -f k8s/applications/metrics-aggregation/
kubectl apply -f k8s/applications/correlation-engine/
kubectl apply -f k8s/applications/anomaly-detection/
kubectl apply -f k8s/applications/forecasting/
kubectl apply -f k8s/applications/api/
kubectl apply -f k8s/applications/frontend/

# Deploy ingress
kubectl apply -f k8s/applications/ingress.yaml
```

### Step 5: Verify Deployment

```bash
# Check all pods are running
kubectl get pods -n llm-analytics

# Check services
kubectl get svc -n llm-analytics

# Check ingress
kubectl get ingress -n llm-analytics

# View logs
kubectl logs -f deployment/event-ingestion -n llm-analytics
```

---

## CI/CD Pipeline

### GitHub Actions Workflows

The repository includes three main workflows:

#### 1. CI - Build and Test (`ci-build-test.yml`)

Triggers on: Push to `main`/`develop`, Pull Requests

- Builds Rust services
- Builds TypeScript API
- Builds React frontend
- Runs all tests
- Performs security scanning
- Runs code quality analysis

#### 2. CD - Build and Push Images (`cd-build-push.yml`)

Triggers on: Push to `main`, Release tags

- Builds Docker images for all 7 services
- Pushes to GitHub Container Registry
- Signs images with Cosign
- Scans images with Trivy
- Generates SBOM with Syft

#### 3. CD - Deploy (`cd-deploy.yml`)

Triggers on: Successful image build

- Deploys to staging environment
- Runs smoke tests
- (Manual approval) Deploys to production
- Implements blue-green deployment
- Monitors for 5 minutes
- Auto-rollback on failure

### Required GitHub Secrets

```bash
# Repository secrets
GITHUB_TOKEN              # Automatically provided
SONAR_TOKEN              # SonarCloud token
AWS_ROLE_ARN             # AWS IAM role for staging
AWS_PROD_ROLE_ARN        # AWS IAM role for production
SLACK_WEBHOOK            # Slack notifications
```

---

## Monitoring and Operations

### Prometheus Metrics

All services expose Prometheus metrics on port `:9090/metrics`

Key metrics:
- `llm_events_received_total` - Events received by ingestion service
- `llm_events_published_total` - Events published to Kafka
- `llm_metrics_aggregated_total` - Metrics aggregated
- `llm_correlations_detected_total` - Correlations detected
- `llm_anomalies_detected_total` - Anomalies detected

### Grafana Dashboards

Access Grafana: `https://grafana.llm-analytics.com`

Pre-configured dashboards:
- **API Performance** - Request rates, latency, errors
- **Event Processing** - Event throughput, Kafka lag
- **System Health** - CPU, memory, pod status
- **Business Metrics** - Events/sec, active users

### Logging

Logs are aggregated using Loki and queryable via Grafana.

View logs:
```bash
# Via kubectl
kubectl logs -f -l app=event-ingestion -n llm-analytics

# Via Grafana Explore
# Navigate to Grafana > Explore > Select Loki data source
```

### Alerts

AlertManager is configured to send alerts to:
- Slack (critical alerts)
- PagerDuty (on-call rotation)
- Email (warning alerts)

---

## Troubleshooting

### Common Issues

#### Pods Stuck in Pending

```bash
# Check resource availability
kubectl describe node

# Check pod events
kubectl describe pod <pod-name> -n llm-analytics
```

#### High Latency

```bash
# Check HPA status
kubectl get hpa -n llm-analytics

# Check pod CPU/memory
kubectl top pods -n llm-analytics

# Scale manually if needed
kubectl scale deployment/event-ingestion --replicas=10 -n llm-analytics
```

#### Database Connection Issues

```bash
# Check database pods
kubectl get pods -n llm-analytics -l app=timescaledb

# Test connection
kubectl run -it --rm debug --image=postgres:15 --restart=Never -- \
  psql -h timescaledb.llm-analytics.svc.cluster.local -U admin -d llm_analytics
```

#### Kafka Issues

```bash
# Check Kafka pods
kubectl get pods -n llm-analytics -l app=kafka

# Check topic lag
kubectl exec -it kafka-0 -n llm-analytics -- \
  kafka-consumer-groups.sh --bootstrap-server localhost:9092 --describe --all-groups
```

### Health Checks

```bash
# Check all service health endpoints
curl https://api.llm-analytics.com/health
curl https://ingest.llm-analytics.com/health
curl https://app.llm-analytics.com/health
```

### Rollback Deployment

```bash
# View rollout history
kubectl rollout history deployment/api -n llm-analytics

# Rollback to previous version
kubectl rollout undo deployment/api -n llm-analytics

# Rollback to specific revision
kubectl rollout undo deployment/api --to-revision=2 -n llm-analytics
```

### Performance Testing

```bash
# Install k6
brew install k6  # macOS
# or
sudo apt install k6  # Linux

# Run load test
k6 run tests/performance/load-test.js

# Run stress test
k6 run tests/performance/stress-test.js

# Run with custom parameters
k6 run -e BASE_URL=https://staging.llm-analytics.com tests/performance/load-test.js
```

---

## Support

For issues, questions, or feature requests:
- GitHub Issues: https://github.com/llm-analytics/llm-analytics-hub/issues
- Documentation: https://docs.llm-analytics.com
- Email: support@llm-analytics.com

---

## License

Apache License 2.0 - See LICENSE file for details
