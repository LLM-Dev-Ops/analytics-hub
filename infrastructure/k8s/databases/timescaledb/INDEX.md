# TimescaleDB Documentation Index

Quick navigation guide for all documentation and files.

## Start Here

New to this deployment? Start with these:

1. **[DEPLOYMENT_SUMMARY.md](DEPLOYMENT_SUMMARY.md)** - Executive summary and feature overview
2. **[QUICKSTART.md](QUICKSTART.md)** - Get running in 5 minutes
3. **[README.md](README.md)** - Complete reference documentation

## Documentation Files

### Getting Started
- **[QUICKSTART.md](QUICKSTART.md)** - 5-minute deployment guide
  - One-command deployment
  - Manual step-by-step
  - Connection testing
  - Quick verification

### Complete Reference
- **[README.md](README.md)** - Full documentation (500+ lines)
  - Architecture overview
  - Installation guide
  - Operations manual
  - Troubleshooting
  - Performance tuning
  - Security guide

### Architecture & Design
- **[ARCHITECTURE.md](ARCHITECTURE.md)** - System architecture
  - Component diagrams
  - Data flow
  - Network topology
  - Resource allocation
  - HA guarantees
  - Scaling characteristics

### File Reference
- **[MANIFEST.md](MANIFEST.md)** - File inventory
  - Directory structure
  - File purposes
  - Component overview

### Summary
- **[DEPLOYMENT_SUMMARY.md](DEPLOYMENT_SUMMARY.md)** - Complete overview
  - All deliverables
  - Key features
  - Resource requirements
  - Validation results

## Kubernetes Manifests

### Core Infrastructure
- **[namespace.yaml](namespace.yaml)** - Namespace with quotas
- **[storageclass.yaml](storageclass.yaml)** - Storage classes (data, WAL, backup)
- **[secrets.yaml](secrets.yaml)** - Credentials template

### Configuration
- **[configmap.yaml](configmap.yaml)** - PostgreSQL configuration
- **[init-scripts-configmap.yaml](init-scripts-configmap.yaml)** - Initialization scripts
- **[patroni-config.yaml](patroni-config.yaml)** - Patroni + etcd for HA

### Workloads
- **[statefulset.yaml](statefulset.yaml)** - TimescaleDB cluster (3 replicas)
- **[pgbouncer.yaml](pgbouncer.yaml)** - Connection pooling

### Networking
- **[services.yaml](services.yaml)** - 6 services (headless, rw, ro, metrics, external)
- **[network-policy.yaml](network-policy.yaml)** - Network security policies

### Monitoring & Backup
- **[monitoring.yaml](monitoring.yaml)** - Prometheus + Grafana + alerts
- **[backup-cronjob.yaml](backup-cronjob.yaml)** - Automated backups

### Alternative Deployment
- **[helm-values.yaml](helm-values.yaml)** - Helm chart configuration

## Database Scripts

### Initialization
- **[init-scripts/01-init-database.sql](init-scripts/01-init-database.sql)**
  - Database creation
  - User and role setup
  - Schema creation
  - Permission grants

### Schema
- **[init-scripts/02-create-hypertables.sql](init-scripts/02-create-hypertables.sql)**
  - Hypertable creation
  - Index definitions
  - Compression policies
  - Retention policies
  - Continuous aggregates

## Automation

- **[deploy.sh](deploy.sh)** - Automated deployment script
  - Prerequisite checks
  - Secret generation
  - TLS certificate creation
  - Manifest deployment
  - Verification

## Quick Reference

### By Task

#### I want to deploy
- Start: [QUICKSTART.md](QUICKSTART.md)
- Automated: Run `./deploy.sh`
- Manual: Follow [README.md](README.md) installation section

#### I want to understand the architecture
- Overview: [DEPLOYMENT_SUMMARY.md](DEPLOYMENT_SUMMARY.md#architecture-overview)
- Detailed: [ARCHITECTURE.md](ARCHITECTURE.md)
- Components: [README.md](README.md#architecture-overview)

#### I want to configure something
- PostgreSQL: [configmap.yaml](configmap.yaml)
- High availability: [patroni-config.yaml](patroni-config.yaml)
- Connection pooling: [pgbouncer.yaml](pgbouncer.yaml)
- Backups: [backup-cronjob.yaml](backup-cronjob.yaml)
- Monitoring: [monitoring.yaml](monitoring.yaml)

#### I want to operate/maintain
- Operations: [README.md](README.md#operations)
- Monitoring: [README.md](README.md#monitoring)
- Backups: [README.md](README.md#backups)
- Scaling: [README.md](README.md#scaling)
- Troubleshooting: [README.md](README.md#troubleshooting)

#### I want to customize
- Resources: [statefulset.yaml](statefulset.yaml) (line 150+)
- Storage: [storageclass.yaml](storageclass.yaml)
- Network: [network-policy.yaml](network-policy.yaml)
- Database schema: [init-scripts/02-create-hypertables.sql](init-scripts/02-create-hypertables.sql)

### By Component

#### TimescaleDB Cluster
- StatefulSet: [statefulset.yaml](statefulset.yaml)
- Configuration: [configmap.yaml](configmap.yaml)
- Services: [services.yaml](services.yaml)
- Documentation: [README.md](README.md#timescaledb-cluster)

#### High Availability
- Patroni config: [patroni-config.yaml](patroni-config.yaml)
- etcd cluster: [patroni-config.yaml](patroni-config.yaml#L160)
- Failover: [ARCHITECTURE.md](ARCHITECTURE.md#failover-flow)

#### Connection Pooling
- PgBouncer: [pgbouncer.yaml](pgbouncer.yaml)
- Configuration: [pgbouncer.yaml](pgbouncer.yaml#L15)
- Autoscaling: [pgbouncer.yaml](pgbouncer.yaml#L150)

#### Storage
- Storage classes: [storageclass.yaml](storageclass.yaml)
- Volumes: [statefulset.yaml](statefulset.yaml#L400)
- Architecture: [ARCHITECTURE.md](ARCHITECTURE.md#storage-layer)

#### Security
- Network policies: [network-policy.yaml](network-policy.yaml)
- Secrets: [secrets.yaml](secrets.yaml)
- TLS: [README.md](README.md#security)

#### Monitoring
- Prometheus: [monitoring.yaml](monitoring.yaml)
- Alerts: [monitoring.yaml](monitoring.yaml#L200)
- Grafana: [monitoring.yaml](monitoring.yaml#L450)

#### Backup
- CronJobs: [backup-cronjob.yaml](backup-cronjob.yaml)
- Configuration: [backup-cronjob.yaml](backup-cronjob.yaml#L15)
- Recovery: [README.md](README.md#recovery)

### By Role

#### Database Administrator
1. [ARCHITECTURE.md](ARCHITECTURE.md) - Understand the system
2. [README.md](README.md#operations) - Daily operations
3. [configmap.yaml](configmap.yaml) - PostgreSQL tuning
4. [backup-cronjob.yaml](backup-cronjob.yaml) - Backup management

#### DevOps Engineer
1. [QUICKSTART.md](QUICKSTART.md) - Quick deployment
2. [deploy.sh](deploy.sh) - Automation
3. [statefulset.yaml](statefulset.yaml) - Workload config
4. [monitoring.yaml](monitoring.yaml) - Observability

#### Application Developer
1. [README.md](README.md#connection-strings) - Connect to DB
2. [init-scripts/02-create-hypertables.sql](init-scripts/02-create-hypertables.sql) - Schema reference
3. [README.md](README.md#database-schema) - Schema documentation
4. [README.md](README.md#example-queries) - Query examples

#### Site Reliability Engineer
1. [ARCHITECTURE.md](ARCHITECTURE.md#high-availability-guarantees) - SLAs
2. [monitoring.yaml](monitoring.yaml) - Alerts
3. [README.md](README.md#troubleshooting) - Issue resolution
4. [backup-cronjob.yaml](backup-cronjob.yaml) - DR procedures

## File Structure

```
timescaledb/
├── Documentation (5 files)
│   ├── INDEX.md                    ← You are here
│   ├── DEPLOYMENT_SUMMARY.md       ← Start here
│   ├── QUICKSTART.md               ← Quick start
│   ├── README.md                   ← Complete reference
│   ├── ARCHITECTURE.md             ← Architecture deep dive
│   └── MANIFEST.md                 ← File inventory
│
├── Kubernetes Manifests (13 files)
│   ├── namespace.yaml
│   ├── storageclass.yaml
│   ├── secrets.yaml
│   ├── configmap.yaml
│   ├── init-scripts-configmap.yaml
│   ├── patroni-config.yaml
│   ├── statefulset.yaml
│   ├── services.yaml
│   ├── pgbouncer.yaml
│   ├── network-policy.yaml
│   ├── monitoring.yaml
│   ├── backup-cronjob.yaml
│   └── helm-values.yaml
│
├── Database Scripts (2 files)
│   └── init-scripts/
│       ├── 01-init-database.sql
│       └── 02-create-hypertables.sql
│
└── Automation (1 file)
    └── deploy.sh
```

## Common Workflows

### First-Time Deployment
1. Read [DEPLOYMENT_SUMMARY.md](DEPLOYMENT_SUMMARY.md)
2. Review [QUICKSTART.md](QUICKSTART.md)
3. Run `./deploy.sh`
4. Follow [README.md](README.md#verify-deployment)

### Production Deployment
1. Read [README.md](README.md) completely
2. Review [ARCHITECTURE.md](ARCHITECTURE.md)
3. Customize [storageclass.yaml](storageclass.yaml) for your cloud
4. Generate secrets (see [QUICKSTART.md](QUICKSTART.md#step-2))
5. Deploy manifests one by one
6. Set up monitoring
7. Configure backups
8. Test failover

### Troubleshooting
1. Check [README.md](README.md#troubleshooting)
2. Review pod logs
3. Check [monitoring.yaml](monitoring.yaml) alerts
4. Consult [ARCHITECTURE.md](ARCHITECTURE.md) for design

### Upgrading
1. Review [README.md](README.md#rolling-updates)
2. Test in staging
3. Update [statefulset.yaml](statefulset.yaml) image
4. Apply rolling update
5. Monitor [monitoring.yaml](monitoring.yaml) metrics

## External Resources

### TimescaleDB
- [Official Documentation](https://docs.timescale.com/)
- [Getting Started](https://docs.timescale.com/getting-started/latest/)
- [API Reference](https://docs.timescale.com/api/latest/)

### Patroni
- [Documentation](https://patroni.readthedocs.io/)
- [Configuration](https://patroni.readthedocs.io/en/latest/SETTINGS.html)

### pgBackRest
- [User Guide](https://pgbackrest.org/user-guide.html)
- [Configuration](https://pgbackrest.org/configuration.html)

### Kubernetes
- [StatefulSets](https://kubernetes.io/docs/concepts/workloads/controllers/statefulset/)
- [Services](https://kubernetes.io/docs/concepts/services-networking/service/)
- [Network Policies](https://kubernetes.io/docs/concepts/services-networking/network-policies/)

## Version Information

- **Documentation Version**: 1.0.0
- **PostgreSQL**: 15.5
- **TimescaleDB**: 2.13.1
- **Patroni**: Latest (bundled with timescaledb-ha image)
- **etcd**: 3.5.11
- **PgBouncer**: 1.21.0
- **pgBackRest**: 2.49
- **Kubernetes**: 1.28+

---

**Last Updated**: 2025-11-20
**Maintained By**: LLM Analytics Hub Team
