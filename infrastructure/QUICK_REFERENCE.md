# LLM Analytics Hub - Quick Reference Card

## Essential Commands

### Deployment

```bash
# AWS
make deploy-aws ENVIRONMENT=production

# GCP
make deploy-gcp ENVIRONMENT=production

# Azure
make deploy-azure ENVIRONMENT=production

# Kubernetes only
make deploy-k8s ENVIRONMENT=production
```

### Validation

```bash
# Quick validation
make validate ENVIRONMENT=production

# Verbose validation
make validate-verbose ENVIRONMENT=production

# Smoke test
make smoke-test ENVIRONMENT=production
```

### Operations

```bash
# Status
make status ENVIRONMENT=production

# Logs
make logs ENVIRONMENT=production

# Resource usage
make top

# Events
make events
```

### Scaling

```bash
# Scale up
make scale-up REPLICAS=10 ENVIRONMENT=production

# Scale down
make scale-down REPLICAS=3 ENVIRONMENT=production

# Autoscale
make autoscale ENVIRONMENT=production
```

### Monitoring

```bash
# Grafana (http://localhost:3000)
make port-forward-grafana

# Prometheus (http://localhost:9090)
make port-forward-prometheus

# API (http://localhost:8080)
make port-forward-api
```

### Troubleshooting

```bash
# Debug
make debug ENVIRONMENT=production

# Shell into API pod
make shell ENVIRONMENT=production

# Database shell
make exec-db ENVIRONMENT=production

# Redis shell
make exec-redis ENVIRONMENT=production
```

### Backup & Recovery

```bash
# Create backup
make backup ENVIRONMENT=production

# List backups
make list-backups ENVIRONMENT=production

# Restore
make restore ENVIRONMENT=production BACKUP_ID=<id>
```

### Maintenance

```bash
# Restart
make restart ENVIRONMENT=production

# Rollback
make rollback ENVIRONMENT=production

# Update image
make update-image IMAGE=myimage:v1.2.3
```

## File Locations

```
/workspaces/llm-analytics-hub/infrastructure/
├── scripts/         # Deployment scripts
├── config/          # Configuration files
├── docs/            # Documentation
├── monitoring/      # Monitoring configs
├── .github/         # CI/CD workflows
└── Makefile         # Command shortcuts
```

## Key Scripts

| Script | Purpose | Usage |
|--------|---------|-------|
| deploy-aws.sh | Deploy to AWS | `./scripts/deploy-aws.sh prod us-east-1` |
| deploy-gcp.sh | Deploy to GCP | `./scripts/deploy-gcp.sh prod project-id region` |
| deploy-azure.sh | Deploy to Azure | `./scripts/deploy-azure.sh prod sub-id location` |
| deploy-k8s-core.sh | Deploy K8s | `./scripts/deploy-k8s-core.sh prod` |
| validate.sh | Validate | `./scripts/validate.sh prod` |
| destroy.sh | Teardown | `./scripts/destroy.sh prod aws` |

## Configuration Files

| File | Purpose |
|------|---------|
| .env.example | Environment template |
| dev.yaml | Dev configuration |
| production.yaml | Production configuration |

## Documentation

| Document | Content |
|----------|---------|
| DEPLOYMENT_GUIDE.md | Deployment steps |
| OPERATIONS_RUNBOOK.md | Day-2 operations |
| README.md | Master guide |
| DEVOPS_AUTOMATION_COMPLETE.md | Summary |

## Important kubectl Commands

```bash
# Get pods
kubectl get pods -n llm-analytics-hub

# Logs
kubectl logs -n llm-analytics-hub -l app=analytics-api

# Describe pod
kubectl describe pod <pod-name> -n llm-analytics-hub

# Exec into pod
kubectl exec -it <pod-name> -n llm-analytics-hub -- /bin/sh

# Port forward
kubectl port-forward -n llm-analytics-hub <pod-name> 8080:3000
```

## Emergency Contacts

| Role | Contact |
|------|---------|
| On-Call | PagerDuty |
| DevOps Lead | devops-lead@example.com |
| Security | security@example.com |

## Quick Diagnostics

```bash
# Health check
kubectl get pods -n llm-analytics-hub
kubectl get svc -n llm-analytics-hub
kubectl get ingress -n llm-analytics-hub

# Resource usage
kubectl top nodes
kubectl top pods -n llm-analytics-hub

# Events
kubectl get events -n llm-analytics-hub --sort-by='.lastTimestamp' | head -20

# Logs
kubectl logs -n llm-analytics-hub -l app=analytics-api --tail=100
```

## Common Issues

| Issue | Solution |
|-------|----------|
| Pods not starting | `kubectl describe pod <name>` |
| DB connection failed | Check secrets and network policies |
| High latency | Check DB, cache, scale up |
| Out of memory | Increase limits or scale |

## Useful Aliases

```bash
# Add to ~/.bashrc or ~/.zshrc
alias k='kubectl'
alias kgp='kubectl get pods -n llm-analytics-hub'
alias kgs='kubectl get svc -n llm-analytics-hub'
alias kl='kubectl logs -n llm-analytics-hub'
alias kx='kubectl exec -it -n llm-analytics-hub'
```

## Environment Variables

Key environment variables in `.env`:

- `ENVIRONMENT`: dev, staging, production
- `CLOUD_PROVIDER`: aws, gcp, azure
- `DB_PASSWORD`: Database password
- `REDIS_PASSWORD`: Redis password
- `JWT_SECRET`: JWT secret key

## URLs

- Grafana: http://localhost:3000 (via port-forward)
- Prometheus: http://localhost:9090 (via port-forward)
- API: http://localhost:8080 (via port-forward)

## Help

```bash
# Makefile help
make help

# Script help
./scripts/deploy-aws.sh --help
./scripts/validate.sh --help
```

## Support

1. Check docs in `docs/`
2. Run `make debug`
3. Review logs
4. Contact DevOps team
