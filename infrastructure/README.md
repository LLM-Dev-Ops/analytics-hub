# LLM Analytics Hub - Infrastructure

Production-ready infrastructure automation, deployment scripts, and operational tooling for the LLM Analytics Hub.

## Overview

This directory contains everything needed to deploy, operate, and maintain the LLM Analytics Hub across multiple cloud providers and environments.

### What's Included

- **Deployment Scripts**: Automated deployment for AWS, GCP, Azure, and Kubernetes
- **Validation Tools**: Pre-flight checks, post-deployment validation, and smoke tests
- **Configuration Management**: Environment-specific configurations and templates
- **Operational Runbooks**: Day-2 operations guides and procedures
- **Monitoring & Alerting**: Prometheus, Grafana dashboards, and alert rules
- **CI/CD Pipelines**: GitHub Actions workflows for automated deployments
- **Utilities**: Common functions, helpers, and automation tools

## Quick Start

### Prerequisites

Install required tools:

```bash
# macOS
brew install kubectl helm terraform awscli azure-cli google-cloud-sdk jq yq

# Linux (Ubuntu/Debian)
sudo apt-get install -y kubectl helm terraform awscli azure-cli google-cloud-sdk jq yq

# Verify installations
make check-tools
```

### Deploy to Cloud Provider

```bash
# AWS
make deploy-aws ENVIRONMENT=production

# GCP
make deploy-gcp ENVIRONMENT=production

# Azure
make deploy-azure ENVIRONMENT=production

# Kubernetes only (existing cluster)
make deploy-k8s ENVIRONMENT=production
```

### Validate Deployment

```bash
make validate ENVIRONMENT=production
make smoke-test ENVIRONMENT=production
```

## Directory Structure

```
infrastructure/
├── scripts/                    # Deployment and automation scripts
│   ├── deploy-aws.sh          # AWS deployment
│   ├── deploy-gcp.sh          # GCP deployment
│   ├── deploy-azure.sh        # Azure deployment
│   ├── deploy-k8s-core.sh     # Kubernetes core deployment
│   ├── validate.sh            # Deployment validation
│   ├── destroy.sh             # Infrastructure teardown
│   └── utils.sh               # Shared utilities
│
├── config/                     # Configuration files
│   ├── .env.example           # Environment variables template
│   ├── dev.yaml               # Development configuration
│   ├── staging.yaml           # Staging configuration
│   └── production.yaml        # Production configuration
│
├── docs/                       # Documentation
│   ├── DEPLOYMENT_GUIDE.md    # Step-by-step deployment guide
│   ├── OPERATIONS_RUNBOOK.md  # Day-2 operations
│   ├── TROUBLESHOOTING.md     # Common issues and solutions
│   ├── DISASTER_RECOVERY.md   # DR procedures
│   └── SCALING_GUIDE.md       # Scaling procedures
│
├── monitoring/                 # Monitoring configuration
│   ├── dashboards/            # Grafana dashboards
│   ├── alerts/                # AlertManager rules
│   └── prometheus-values.yaml # Prometheus configuration
│
├── .github/                    # GitHub Actions workflows
│   └── workflows/
│       └── infrastructure.yml # Infrastructure CI/CD
│
├── Makefile                    # Common operations
└── README.md                   # This file
```

## Common Operations

All operations use the `Makefile` for consistency and ease of use.

### Deployment

```bash
# Deploy to specific environment
make deploy ENVIRONMENT=production CLOUD_PROVIDER=aws

# Deploy only Kubernetes resources
make deploy-k8s ENVIRONMENT=production
```

### Validation

```bash
# Run full validation
make validate ENVIRONMENT=production

# Verbose validation
make validate-verbose ENVIRONMENT=production

# Quick smoke test
make smoke-test ENVIRONMENT=production
```

### Monitoring

```bash
# Access Grafana (http://localhost:3000)
make port-forward-grafana

# Access Prometheus (http://localhost:9090)
make port-forward-prometheus

# Access API (http://localhost:8080)
make port-forward-api
```

### Operations

```bash
# Check deployment status
make status ENVIRONMENT=production

# View logs
make logs ENVIRONMENT=production
make logs-api ENVIRONMENT=production
make logs-db ENVIRONMENT=production

# Show resource usage
make top

# View recent events
make events
```

### Scaling

```bash
# Manual scaling
make scale-up REPLICAS=10 ENVIRONMENT=production
make scale-down REPLICAS=3 ENVIRONMENT=production

# Enable autoscaling
make autoscale ENVIRONMENT=production
```

### Backup & Recovery

```bash
# Create backup
make backup ENVIRONMENT=production

# List backups
make list-backups ENVIRONMENT=production

# Restore from backup
make restore ENVIRONMENT=production BACKUP_ID=20240101-120000
```

### Troubleshooting

```bash
# Debug deployment issues
make debug ENVIRONMENT=production

# Get shell in API pod
make shell ENVIRONMENT=production

# Connect to database
make exec-db ENVIRONMENT=production

# Connect to Redis
make exec-redis ENVIRONMENT=production
```

### Maintenance

```bash
# Restart application
make restart ENVIRONMENT=production

# Rollback deployment
make rollback ENVIRONMENT=production

# View deployment history
make history ENVIRONMENT=production

# Update container image
make update-image IMAGE=myimage:v1.2.3 ENVIRONMENT=production

# Clean up completed jobs
make clean-jobs ENVIRONMENT=production
```

## Supported Cloud Providers

### AWS

**Services Used:**
- EKS (Elastic Kubernetes Service)
- RDS PostgreSQL with TimescaleDB
- ElastiCache for Redis
- MSK (Managed Streaming for Kafka)
- VPC, subnets, security groups
- CloudWatch for monitoring

**Deployment:**
```bash
./scripts/deploy-aws.sh production us-east-1
```

### GCP

**Services Used:**
- GKE (Google Kubernetes Engine)
- Cloud SQL for PostgreSQL
- Cloud Memorystore for Redis
- Cloud Pub/Sub (alternative to Kafka)
- VPC, subnets, firewall rules
- Cloud Monitoring & Logging

**Deployment:**
```bash
./scripts/deploy-gcp.sh production my-project-id us-central1
```

### Azure

**Services Used:**
- AKS (Azure Kubernetes Service)
- Azure Database for PostgreSQL
- Azure Cache for Redis
- Azure Event Hubs (Kafka-compatible)
- VNet, subnets, NSGs
- Azure Monitor & Log Analytics

**Deployment:**
```bash
./scripts/deploy-azure.sh production subscription-id eastus
```

## Environments

### Development (dev)

- **Purpose**: Local development and testing
- **Resources**: Minimal (2-3 nodes, smaller instances)
- **Backup**: Disabled
- **High Availability**: No
- **Cost**: ~$200-300/month

### Staging

- **Purpose**: Pre-production testing
- **Resources**: Medium (3-5 nodes, medium instances)
- **Backup**: 3-day retention
- **High Availability**: Optional
- **Cost**: ~$500-800/month

### Production

- **Purpose**: Live production workload
- **Resources**: Large (6-20 nodes, large instances)
- **Backup**: 30-day retention, cross-region
- **High Availability**: Yes (multi-AZ)
- **Cost**: ~$2000-5000/month

## Configuration

### Environment Variables

Copy and configure environment variables:

```bash
cp config/.env.example .env
vim .env
```

Key variables:
- `ENVIRONMENT`: dev, staging, production
- `CLOUD_PROVIDER`: aws, gcp, azure
- Database credentials
- API keys and secrets
- Resource limits
- Feature flags

### Environment-Specific Config

Each environment has a YAML configuration file:

```bash
config/
├── dev.yaml         # Development settings
├── staging.yaml     # Staging settings
└── production.yaml  # Production settings
```

Edit configuration:
```bash
vim config/production.yaml
```

## Monitoring & Alerting

### Dashboards

Pre-configured Grafana dashboards:
- Cluster Overview
- Application Metrics
- Database Performance
- Kafka Metrics
- Network Traffic

Access: `make port-forward-grafana`

### Alerts

Alert rules configured for:
- High error rates (>5%)
- High latency (P95 >500ms)
- Pod failures
- Resource exhaustion
- Database issues

View alerts: `make port-forward-prometheus`

### Alert Severity

- **P1 (Critical)**: Service down, immediate response
- **P2 (High)**: Degraded performance, 1-hour response
- **P3 (Medium)**: Non-critical, 24-hour response
- **P4 (Low)**: Informational, review during business hours

## CI/CD

### GitHub Actions Workflows

Automated pipelines for:
- Infrastructure validation
- Security scanning
- Automated deployments
- Drift detection

Workflow: `.github/workflows/infrastructure.yml`

### Deployment Pipeline

```
PR → Validate → Security Scan → Test
  ↓
Merge → Deploy Dev → Validate
  ↓
  → Deploy Staging → Validate → Smoke Tests
  ↓
  → Manual Approval
  ↓
  → Deploy Production → Validate → Performance Tests
```

## Security

### Best Practices

- Secrets stored in Kubernetes Secrets (not in code)
- Network policies restrict pod-to-pod communication
- TLS encryption for all external traffic
- RBAC configured for least privilege
- Regular security scanning with Trivy
- Audit logging enabled
- Encryption at rest for all data stores

### Compliance

- GDPR compliant (data retention, encryption)
- SOC2 Type II ready
- Audit logs retained for 90 days
- Regular security assessments

## Disaster Recovery

### Backup Strategy

- **Database**: Daily backups, 30-day retention
- **Configuration**: Version controlled in Git
- **Secrets**: Backed up to secure vault
- **Frequency**: Daily at 2 AM UTC

### Recovery Procedures

```bash
# List backups
make list-backups ENVIRONMENT=production

# Restore from backup
make restore ENVIRONMENT=production BACKUP_ID=20240101-020000

# Validate restore
make validate ENVIRONMENT=production
```

### RTO & RPO

- **RTO** (Recovery Time Objective): 4 hours
- **RPO** (Recovery Point Objective): 1 hour

See [DISASTER_RECOVERY.md](docs/DISASTER_RECOVERY.md) for details.

## Cost Optimization

### Cost Breakdown

Typical monthly costs by component:

| Component | Dev | Staging | Production |
|-----------|-----|---------|------------|
| Kubernetes | $100 | $300 | $1200 |
| Database | $50 | $200 | $800 |
| Redis | $30 | $100 | $400 |
| Kafka | $20 | $150 | $600 |
| **Total** | **~$200** | **~$750** | **~$3000** |

### Cost Optimization Tips

1. Use spot/preemptible instances for non-prod
2. Right-size instances based on actual usage
3. Enable autoscaling to match demand
4. Use reserved instances for production
5. Enable cost allocation tags
6. Regular cost reviews and optimization

```bash
# Generate cost report
./scripts/cost-report.sh production
```

## Troubleshooting

### Quick Diagnostics

```bash
# Run comprehensive validation
make validate-verbose ENVIRONMENT=production

# Check pod status
make status ENVIRONMENT=production

# View recent errors
make logs ENVIRONMENT=production | grep ERROR

# Debug specific issues
make debug ENVIRONMENT=production
```

### Common Issues

| Issue | Solution |
|-------|----------|
| Pods not starting | Check image, resources, secrets |
| Database connection failed | Verify credentials, network policies |
| High latency | Check database, cache, scaling |
| Out of memory | Increase limits or scale horizontally |

See [TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md) for detailed solutions.

## Documentation

### Guides

- **[Deployment Guide](docs/DEPLOYMENT_GUIDE.md)**: Step-by-step deployment instructions
- **[Operations Runbook](docs/OPERATIONS_RUNBOOK.md)**: Day-2 operations procedures
- **[Troubleshooting](docs/TROUBLESHOOTING.md)**: Common issues and solutions
- **[Disaster Recovery](docs/DISASTER_RECOVERY.md)**: Backup and recovery procedures
- **[Scaling Guide](docs/SCALING_GUIDE.md)**: Scaling procedures and best practices

### Scripts

All scripts include comprehensive help:
```bash
./scripts/deploy-aws.sh --help
./scripts/validate.sh --help
./scripts/destroy.sh --help
```

## Support

### Getting Help

1. Check documentation in `docs/`
2. Review logs: `make logs`
3. Run diagnostics: `make debug`
4. Consult troubleshooting guide
5. Contact DevOps team

### Emergency Contacts

- **On-Call Engineer**: PagerDuty escalation
- **DevOps Lead**: devops-lead@example.com
- **Security Team**: security@example.com

## Contributing

### Making Changes

1. Create feature branch
2. Make changes
3. Test in dev environment
4. Run validation: `make ci-test`
5. Submit pull request
6. Deploy to staging for testing
7. Get approval for production

### Testing Changes

```bash
# Test locally
make dev-setup
make dev-deploy
make dev-test

# Validate changes
make ci-validate
```

## License

Apache License 2.0 - See [LICENSE](../LICENSE) file for details.

## Related Projects

- **LLM-Observatory**: Performance monitoring
- **LLM-Sentinel**: Security monitoring
- **LLM-CostOps**: Cost optimization
- **LLM-Governance-Dashboard**: Governance and compliance

## Changelog

### v0.1.0 (Current)

- Initial infrastructure automation
- Support for AWS, GCP, Azure
- Automated deployment scripts
- Monitoring and alerting setup
- CI/CD pipelines
- Comprehensive documentation
