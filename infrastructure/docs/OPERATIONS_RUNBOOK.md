# LLM Analytics Hub - Operations Runbook

Day-2 operations guide for maintaining and operating the LLM Analytics Hub.

## Table of Contents

1. [Daily Operations](#daily-operations)
2. [Monitoring & Alerting](#monitoring--alerting)
3. [Incident Response](#incident-response)
4. [Maintenance Tasks](#maintenance-tasks)
5. [Scaling Operations](#scaling-operations)
6. [Backup & Recovery](#backup--recovery)

## Daily Operations

### Morning Health Check

```bash
# Run daily health check
./infrastructure/scripts/health-check.sh production

# Check for pending alerts
kubectl get prometheusrules -n monitoring

# Review overnight logs
kubectl logs -n llm-analytics-hub -l app=analytics-api --since=24h | grep ERROR
```

### Key Metrics to Monitor

| Metric | Threshold | Action |
|--------|-----------|--------|
| API Error Rate | > 1% | Investigate logs |
| API Latency P95 | > 500ms | Check database/cache |
| Pod Restart Count | > 5/hour | Check pod logs |
| Database CPU | > 80% | Consider scaling |
| Memory Usage | > 85% | Check for leaks |
| Disk Usage | > 80% | Clean up or expand |

### Common Commands

```bash
# Check pod status
kubectl get pods -n llm-analytics-hub

# View logs (last 100 lines)
kubectl logs -n llm-analytics-hub -l app=analytics-api --tail=100

# Exec into pod
kubectl exec -it <pod-name> -n llm-analytics-hub -- /bin/sh

# Port forward for debugging
kubectl port-forward -n llm-analytics-hub <pod-name> 8080:3000

# Check resource usage
kubectl top pods -n llm-analytics-hub
kubectl top nodes

# View events
kubectl get events -n llm-analytics-hub --sort-by='.lastTimestamp'
```

## Monitoring & Alerting

### Access Monitoring Dashboards

```bash
# Grafana
kubectl port-forward -n monitoring svc/prometheus-grafana 3000:80
# Access: http://localhost:3000

# Prometheus
kubectl port-forward -n monitoring svc/prometheus-kube-prometheus-prometheus 9090:9090
# Access: http://localhost:9090

# AlertManager
kubectl port-forward -n monitoring svc/prometheus-kube-prometheus-alertmanager 9093:9093
# Access: http://localhost:9093
```

### Key Dashboards

1. **Cluster Overview**: Overall cluster health and resource usage
2. **Application Metrics**: API performance, error rates, latency
3. **Database Metrics**: Query performance, connections, replication lag
4. **Kafka Metrics**: Throughput, consumer lag, partition health
5. **Network Metrics**: Ingress/egress traffic, latency

### Alert Severity Levels

- **P1 - Critical**: Service down, data loss risk, immediate action required
- **P2 - High**: Degraded performance, potential outage, action within 1 hour
- **P3 - Medium**: Non-critical issues, action within 24 hours
- **P4 - Low**: Informational, review during business hours

## Incident Response

### P1: Service Down

```bash
# 1. Acknowledge alert
# 2. Check pod status
kubectl get pods -n llm-analytics-hub

# 3. Check recent changes
kubectl rollout history deployment/analytics-api -n llm-analytics-hub

# 4. Check logs
kubectl logs -n llm-analytics-hub -l app=analytics-api --tail=200

# 5. Check events
kubectl get events -n llm-analytics-hub --sort-by='.lastTimestamp' | head -20

# 6. If recent deployment, rollback
kubectl rollout undo deployment/analytics-api -n llm-analytics-hub

# 7. If database issue
kubectl exec -n llm-analytics-hub timescaledb-0 -- pg_isready -U postgres

# 8. Restart pods if needed (last resort)
kubectl rollout restart deployment/analytics-api -n llm-analytics-hub
```

### P2: High Latency

```bash
# 1. Check database performance
kubectl exec -n llm-analytics-hub timescaledb-0 -- \
  psql -U postgres -c "SELECT * FROM pg_stat_activity WHERE state = 'active';"

# 2. Check Redis
kubectl exec -n llm-analytics-hub redis-0 -- redis-cli INFO stats

# 3. Check Kafka consumer lag
kubectl exec -n llm-analytics-hub kafka-0 -- \
  kafka-consumer-groups.sh --bootstrap-server localhost:9092 --describe --group analytics-consumers

# 4. Scale up if needed
kubectl scale deployment analytics-api --replicas=10 -n llm-analytics-hub

# 5. Check slow queries
kubectl logs -n llm-analytics-hub -l app=analytics-api | grep "slow query"
```

### P3: Resource Pressure

```bash
# 1. Identify resource hog
kubectl top pods -n llm-analytics-hub --sort-by=memory
kubectl top pods -n llm-analytics-hub --sort-by=cpu

# 2. Check node pressure
kubectl describe nodes | grep -A5 Conditions

# 3. Scale horizontally
kubectl scale deployment analytics-api --replicas=8 -n llm-analytics-hub

# 4. Or adjust resource limits
kubectl edit deployment analytics-api -n llm-analytics-hub
```

## Maintenance Tasks

### Weekly Tasks

```bash
# Update Helm charts
helm repo update
helm list -A

# Check for pod restarts
kubectl get pods -n llm-analytics-hub -o custom-columns=NAME:.metadata.name,RESTARTS:.status.containerStatuses[0].restartCount

# Review resource quotas
kubectl describe resourcequota -n llm-analytics-hub

# Clean up completed jobs
kubectl delete jobs -n llm-analytics-hub --field-selector status.successful=1
```

### Monthly Tasks

```bash
# Review and rotate logs
./infrastructure/scripts/rotate-logs.sh

# Update node AMIs/images
# (Cloud provider specific - requires maintenance window)

# Review and optimize database
kubectl exec -n llm-analytics-hub timescaledb-0 -- \
  psql -U postgres -d llm_analytics -c "VACUUM ANALYZE;"

# Review and update alerts
kubectl edit prometheusrules -n monitoring

# Security patching
kubectl set image deployment/analytics-api \
  api=llm-analytics-hub/api:v1.2.3 -n llm-analytics-hub
```

### Quarterly Tasks

```bash
# Disaster recovery drill
./infrastructure/scripts/dr-drill.sh production

# Capacity planning review
./infrastructure/scripts/capacity-report.sh production

# Security audit
./infrastructure/scripts/security-audit.sh production

# Cost optimization review
./infrastructure/scripts/cost-report.sh production
```

## Scaling Operations

### Horizontal Scaling (Add Replicas)

```bash
# Manual scaling
kubectl scale deployment analytics-api --replicas=10 -n llm-analytics-hub

# Auto-scaling (HPA)
kubectl autoscale deployment analytics-api \
  --min=3 --max=15 --cpu-percent=70 -n llm-analytics-hub

# Check HPA status
kubectl get hpa -n llm-analytics-hub
```

### Vertical Scaling (More Resources)

```bash
# Update resource limits
kubectl set resources deployment analytics-api \
  --limits=cpu=2,memory=4Gi \
  --requests=cpu=1,memory=2Gi \
  -n llm-analytics-hub
```

### Node Scaling

```bash
# AWS (eksctl)
eksctl scale nodegroup --cluster=llm-analytics-hub-prod --nodes=10 --name=ng-1

# GCP
gcloud container clusters resize llm-analytics-hub-prod --num-nodes=10

# Azure
az aks nodepool scale --cluster-name llm-analytics-hub-prod \
  --name nodepool1 --node-count 10
```

## Backup & Recovery

### Create Manual Backup

```bash
# Database backup
kubectl exec -n llm-analytics-hub timescaledb-0 -- \
  pg_dump -U postgres llm_analytics > backup-$(date +%Y%m%d).sql

# Upload to S3
aws s3 cp backup-$(date +%Y%m%d).sql s3://backups/llm-analytics/

# Full backup script
./infrastructure/scripts/backup.sh production
```

### Restore from Backup

```bash
# List available backups
./infrastructure/scripts/list-backups.sh production

# Restore specific backup
./infrastructure/scripts/restore.sh production <backup-id>

# Verify restore
./infrastructure/scripts/validate.sh production
```

### Verify Backups

```bash
# Check last backup
kubectl get cronjobs -n llm-analytics-hub

# Test restore in non-prod
./infrastructure/scripts/test-restore.sh dev <backup-id>
```

## Emergency Contacts

| Role | Contact | Escalation Path |
|------|---------|-----------------|
| On-Call Engineer | oncall@example.com | PagerDuty |
| DevOps Lead | devops-lead@example.com | Direct |
| Database Admin | dba@example.com | Slack #database |
| Security Team | security@example.com | security-escalation@example.com |

## Related Documentation

- [Deployment Guide](DEPLOYMENT_GUIDE.md)
- [Troubleshooting](TROUBLESHOOTING.md)
- [Disaster Recovery](DISASTER_RECOVERY.md)
- [Scaling Guide](SCALING_GUIDE.md)
