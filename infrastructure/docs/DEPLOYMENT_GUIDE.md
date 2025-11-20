# LLM Analytics Hub - Deployment Guide

Complete step-by-step guide for deploying the LLM Analytics Hub to production.

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Pre-Deployment Checklist](#pre-deployment-checklist)
3. [Deployment Steps](#deployment-steps)
4. [Post-Deployment Validation](#post-deployment-validation)
5. [Rollback Procedures](#rollback-procedures)
6. [Troubleshooting](#troubleshooting)

## Prerequisites

### Required Tools

Ensure the following tools are installed and configured:

- **kubectl** (v1.25+)
- **helm** (v3.10+)
- **terraform** (v1.5+) - if using IaC
- **Cloud CLI**:
  - AWS: `aws-cli` (v2.x)
  - GCP: `gcloud` SDK
  - Azure: `az` CLI
- **jq** - JSON processing
- **yq** - YAML processing

### Required Access

- Cloud provider account with admin privileges
- kubectl access to Kubernetes cluster
- Container registry access
- DNS management access (if configuring custom domains)

### Capacity Planning

Minimum recommended resources:

| Component | Dev | Staging | Production |
|-----------|-----|---------|------------|
| Nodes | 2-3 | 3-5 | 6-10+ |
| CPU per node | 4 cores | 8 cores | 16+ cores |
| Memory per node | 16 GB | 32 GB | 64+ GB |
| Storage | 100 GB | 500 GB | 1+ TB |

## Pre-Deployment Checklist

### 1. Configuration Review

```bash
# Review environment configuration
cat infrastructure/config/${ENVIRONMENT}.yaml

# Validate configuration
./infrastructure/scripts/validate-config.sh ${ENVIRONMENT}
```

### 2. Credentials Setup

```bash
# Copy environment template
cp infrastructure/config/.env.example .env

# Update with production values
# IMPORTANT: Never commit .env to version control
vim .env
```

Required secrets:
- [ ] Database passwords
- [ ] Redis authentication tokens
- [ ] API keys
- [ ] JWT secrets
- [ ] TLS certificates
- [ ] Cloud provider credentials

### 3. Network Planning

- [ ] VPC/VNet CIDR ranges defined
- [ ] Subnet allocation planned
- [ ] Security groups/firewall rules reviewed
- [ ] DNS records prepared
- [ ] Load balancer configuration ready

### 4. Backup Strategy

- [ ] Backup storage configured
- [ ] Backup schedule defined
- [ ] Retention policies set
- [ ] Restore procedures documented
- [ ] Disaster recovery plan reviewed

## Deployment Steps

### Option 1: Cloud-Specific Deployment

#### AWS Deployment

```bash
# Set environment variables
export ENVIRONMENT=production
export AWS_REGION=us-east-1

# Run pre-flight checks
./infrastructure/scripts/validate.sh ${ENVIRONMENT}

# Deploy infrastructure
./infrastructure/scripts/deploy-aws.sh ${ENVIRONMENT} ${AWS_REGION}

# Monitor deployment
kubectl get pods -n llm-analytics-hub -w
```

#### GCP Deployment

```bash
# Set environment variables
export ENVIRONMENT=production
export GCP_PROJECT=my-project-123
export GCP_REGION=us-central1

# Authenticate
gcloud auth login
gcloud config set project ${GCP_PROJECT}

# Deploy infrastructure
./infrastructure/scripts/deploy-gcp.sh ${ENVIRONMENT} ${GCP_PROJECT} ${GCP_REGION}

# Monitor deployment
kubectl get pods -n llm-analytics-hub -w
```

#### Azure Deployment

```bash
# Set environment variables
export ENVIRONMENT=production
export AZURE_SUBSCRIPTION=00000000-0000-0000-0000-000000000000
export AZURE_LOCATION=eastus

# Authenticate
az login
az account set --subscription ${AZURE_SUBSCRIPTION}

# Deploy infrastructure
./infrastructure/scripts/deploy-azure.sh ${ENVIRONMENT} ${AZURE_SUBSCRIPTION} ${AZURE_LOCATION}

# Monitor deployment
kubectl get pods -n llm-analytics-hub -w
```

### Option 2: Kubernetes-Only Deployment

If you already have a Kubernetes cluster:

```bash
# Set kubectl context
kubectl config use-context my-cluster

# Deploy core services
./infrastructure/scripts/deploy-k8s-core.sh ${ENVIRONMENT}

# Verify deployment
kubectl get all -n llm-analytics-hub
```

### Deployment Timeline

Typical deployment durations:

| Component | Duration |
|-----------|----------|
| VPC/Network Setup | 5-10 minutes |
| Kubernetes Cluster | 15-20 minutes |
| Database (RDS/CloudSQL) | 10-15 minutes |
| Redis/Cache | 5-10 minutes |
| Kafka/Event Hub | 10-15 minutes |
| Application Deployment | 5-10 minutes |
| **Total** | **50-80 minutes** |

## Post-Deployment Validation

### 1. Run Validation Script

```bash
./infrastructure/scripts/validate.sh ${ENVIRONMENT} --verbose
```

This performs:
- Cluster health checks
- Service availability verification
- Network connectivity tests
- Database connectivity validation
- API endpoint testing
- Resource utilization checks
- Security compliance verification

### 2. Manual Verification

#### Check Pod Status

```bash
# All pods should be Running
kubectl get pods -n llm-analytics-hub

# Check pod logs for errors
kubectl logs -n llm-analytics-hub -l app=analytics-api --tail=50
```

#### Test API Endpoints

```bash
# Get LoadBalancer IP
export API_URL=$(kubectl get svc -n llm-analytics-hub analytics-api-service -o jsonpath='{.status.loadBalancer.ingress[0].ip}')

# Health check
curl -f http://${API_URL}/health

# API version
curl http://${API_URL}/api/version
```

#### Verify Data Services

```bash
# TimescaleDB
kubectl exec -n llm-analytics-hub -it timescaledb-0 -- psql -U postgres -c "SELECT version();"

# Redis
kubectl exec -n llm-analytics-hub -it redis-0 -- redis-cli ping

# Kafka
kubectl exec -n llm-analytics-hub -it kafka-0 -- kafka-topics.sh --list --bootstrap-server localhost:9092
```

#### Check Monitoring

```bash
# Access Grafana
kubectl port-forward -n monitoring svc/prometheus-grafana 3000:80

# Access Prometheus
kubectl port-forward -n monitoring svc/prometheus-kube-prometheus-prometheus 9090:9090
```

Open browser:
- Grafana: http://localhost:3000
- Prometheus: http://localhost:9090

### 3. Smoke Tests

```bash
# Run smoke tests
./infrastructure/scripts/smoke-tests.sh ${ENVIRONMENT}
```

### 4. Performance Baseline

```bash
# Run performance tests
./infrastructure/scripts/performance-baseline.sh ${ENVIRONMENT}
```

## Rollback Procedures

### Complete Rollback

If deployment fails critically:

```bash
# Rollback to previous version
kubectl rollout undo deployment/analytics-api -n llm-analytics-hub

# Verify rollback
kubectl rollout status deployment/analytics-api -n llm-analytics-hub
```

### Partial Rollback

Rollback specific components:

```bash
# Rollback specific deployment
kubectl rollout undo deployment/<deployment-name> -n llm-analytics-hub --to-revision=<revision-number>

# Check rollout history
kubectl rollout history deployment/<deployment-name> -n llm-analytics-hub
```

### Database Rollback

```bash
# Restore from backup
./infrastructure/scripts/restore-backup.sh ${ENVIRONMENT} ${BACKUP_ID}
```

### Infrastructure Rollback

```bash
# Destroy current deployment
./infrastructure/scripts/destroy.sh ${ENVIRONMENT} ${CLOUD_PROVIDER}

# Redeploy previous version
git checkout <previous-version>
./infrastructure/scripts/deploy-${CLOUD_PROVIDER}.sh ${ENVIRONMENT}
```

## Troubleshooting

### Pods Not Starting

```bash
# Check pod status
kubectl describe pod <pod-name> -n llm-analytics-hub

# Check logs
kubectl logs <pod-name> -n llm-analytics-hub

# Common issues:
# - Image pull errors: Check container registry access
# - Resource limits: Adjust CPU/memory requests
# - Configuration errors: Validate ConfigMaps and Secrets
```

### Database Connection Issues

```bash
# Test database connectivity
kubectl run -it --rm debug --image=postgres:15 --restart=Never -- \
  psql -h timescaledb-service -U postgres -d llm_analytics

# Check database pod logs
kubectl logs -n llm-analytics-hub timescaledb-0

# Verify secrets
kubectl get secret analytics-hub-secrets -n llm-analytics-hub -o yaml
```

### Network Issues

```bash
# Test internal networking
kubectl run -it --rm debug --image=busybox --restart=Never -- \
  nslookup analytics-api-service.llm-analytics-hub.svc.cluster.local

# Check network policies
kubectl get networkpolicy -n llm-analytics-hub

# Verify ingress
kubectl get ingress -n llm-analytics-hub
kubectl describe ingress analytics-api-ingress -n llm-analytics-hub
```

### High Resource Usage

```bash
# Check node resources
kubectl top nodes

# Check pod resources
kubectl top pods -n llm-analytics-hub

# Scale down if needed
kubectl scale deployment analytics-api --replicas=2 -n llm-analytics-hub
```

### Certificate Issues

```bash
# Check cert-manager
kubectl get certificates -n llm-analytics-hub
kubectl describe certificate <cert-name> -n llm-analytics-hub

# Check certificate issuance
kubectl get certificaterequests -n llm-analytics-hub

# Manual certificate renewal
kubectl delete certificate <cert-name> -n llm-analytics-hub
# Certificate will be automatically re-issued
```

## Best Practices

1. **Always test in non-production first**: Deploy to dev/staging before production
2. **Use blue-green deployments**: Minimize downtime with parallel deployments
3. **Monitor deployments**: Watch logs and metrics during rollout
4. **Document changes**: Update runbooks with any modifications
5. **Communicate**: Notify team of deployment schedule and status
6. **Backup before changes**: Always create backups before major updates
7. **Have rollback plan**: Know how to quickly revert if needed
8. **Gradual rollout**: Use canary deployments for major changes

## Support

For issues during deployment:

1. Check this guide and troubleshooting section
2. Review logs: `infrastructure/logs/deploy-*.log`
3. Consult [TROUBLESHOOTING.md](TROUBLESHOOTING.md)
4. Contact DevOps team
5. Escalate to on-call engineer if critical

## Related Documentation

- [Operations Runbook](OPERATIONS_RUNBOOK.md)
- [Troubleshooting Guide](TROUBLESHOOTING.md)
- [Disaster Recovery](DISASTER_RECOVERY.md)
- [Scaling Guide](SCALING_GUIDE.md)
