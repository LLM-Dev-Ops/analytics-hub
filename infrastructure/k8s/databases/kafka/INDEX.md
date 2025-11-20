# Kafka Deployment - File Index

Quick reference guide to all files in the Kafka deployment.

## Documentation

| File | Description | Lines |
|------|-------------|-------|
| [README.md](./README.md) | Comprehensive documentation | 2,500+ |
| [DEPLOYMENT_GUIDE.md](./DEPLOYMENT_GUIDE.md) | Quick reference deployment guide | 800+ |
| [SUMMARY.md](./SUMMARY.md) | Implementation summary | 600+ |
| [INDEX.md](./INDEX.md) | This file | - |

## Core Configuration

| File | Purpose | Key Resources |
|------|---------|---------------|
| [namespace.yaml](./namespace.yaml) | Namespace, quotas, limits | Namespace, ResourceQuota, LimitRange |

## Zookeeper Ensemble

| File | Purpose | Key Resources |
|------|---------|---------------|
| [zookeeper/configmap.yaml](./zookeeper/configmap.yaml) | Zookeeper configuration | zoo.cfg, JVM settings, init scripts |
| [zookeeper/service.yaml](./zookeeper/service.yaml) | Zookeeper services | Headless, Client, Metrics |
| [zookeeper/statefulset.yaml](./zookeeper/statefulset.yaml) | Zookeeper StatefulSet | 3 replicas, PVCs, anti-affinity, PDB |

## Kafka Cluster

| File | Purpose | Key Resources |
|------|---------|---------------|
| [kafka/configmap.yaml](./kafka/configmap.yaml) | Kafka broker configuration | server.properties, JVM, JMX, init scripts |
| [kafka/secrets.yaml](./kafka/secrets.yaml) | Security credentials | SASL passwords, SSL certs, user creation |
| [kafka/services.yaml](./kafka/services.yaml) | Kafka services | Headless, Client, External, Per-broker, Metrics |
| [kafka/statefulset.yaml](./kafka/statefulset.yaml) | Kafka StatefulSet | 3 replicas, PVCs, anti-affinity, PDB |

## Topics

| File | Purpose | Key Resources |
|------|---------|---------------|
| [topics/topics.yaml](./topics/topics.yaml) | Topic definitions | 14 LLM Analytics topics, Creation job |
| [topics/topic-operator.yaml](./topics/topic-operator.yaml) | Strimzi Topic Operator | CRD, Deployment, KafkaTopic examples |

## Monitoring

| File | Purpose | Key Resources |
|------|---------|---------------|
| [monitoring/jmx-exporter.yaml](./monitoring/jmx-exporter.yaml) | Metrics exporters | JMX config, Kafka lag exporter |
| [monitoring/servicemonitor.yaml](./monitoring/servicemonitor.yaml) | Prometheus integration | ServiceMonitors, Grafana dashboards |
| [monitoring/alerts.yaml](./monitoring/alerts.yaml) | Alerting rules | 25+ PrometheusRule alerts |

## Security

| File | Purpose | Key Resources |
|------|---------|---------------|
| [security/network-policy.yaml](./security/network-policy.yaml) | Network isolation | NetworkPolicies for all components |
| [security/tls-certificates.yaml](./security/tls-certificates.yaml) | TLS certificates | cert-manager integration, JKS generation |

## Backup & DR

| File | Purpose | Key Resources |
|------|---------|---------------|
| [backup/mirror-maker.yaml](./backup/mirror-maker.yaml) | Cross-cluster replication | MirrorMaker 2.0 deployment |
| [backup/backup-cronjob.yaml](./backup/backup-cronjob.yaml) | Automated backups | CronJob, backup scripts, restore scripts |

## Scripts

| File | Purpose | Usage |
|------|---------|-------|
| [deploy.sh](./deploy.sh) | Automated deployment | `./deploy.sh` |
| [init-scripts/create-topics.sh](./init-scripts/create-topics.sh) | Topic creation | Run inside kafka-0 pod |
| [init-scripts/setup-acls.sh](./init-scripts/setup-acls.sh) | ACL configuration | Run inside kafka-0 pod |
| [init-scripts/verify-cluster.sh](./init-scripts/verify-cluster.sh) | Health verification | Run inside kafka-0 pod |
| [init-scripts/performance-test.sh](./init-scripts/performance-test.sh) | Performance testing | Run inside kafka-0 pod |

## Alternative Deployment

| File | Purpose | Usage |
|------|---------|-------|
| [helm-values.yaml](./helm-values.yaml) | Strimzi operator values | `helm install -f helm-values.yaml` |

## Quick Links by Use Case

### First Time Deployment
1. Read: [DEPLOYMENT_GUIDE.md](./DEPLOYMENT_GUIDE.md)
2. Update: [kafka/secrets.yaml](./kafka/secrets.yaml) with real passwords
3. Run: [deploy.sh](./deploy.sh)
4. Verify: [init-scripts/verify-cluster.sh](./init-scripts/verify-cluster.sh)

### Configuration Changes
- **Kafka settings**: [kafka/configmap.yaml](./kafka/configmap.yaml)
- **Zookeeper settings**: [zookeeper/configmap.yaml](./zookeeper/configmap.yaml)
- **Resource limits**: [kafka/statefulset.yaml](./kafka/statefulset.yaml), [zookeeper/statefulset.yaml](./zookeeper/statefulset.yaml)
- **Storage size**: StatefulSet volumeClaimTemplates

### Security Setup
- **TLS certificates**: [security/tls-certificates.yaml](./security/tls-certificates.yaml)
- **Passwords**: [kafka/secrets.yaml](./kafka/secrets.yaml)
- **ACLs**: [init-scripts/setup-acls.sh](./init-scripts/setup-acls.sh)
- **Network policies**: [security/network-policy.yaml](./security/network-policy.yaml)

### Monitoring
- **Metrics**: [monitoring/jmx-exporter.yaml](./monitoring/jmx-exporter.yaml)
- **Dashboards**: [monitoring/servicemonitor.yaml](./monitoring/servicemonitor.yaml)
- **Alerts**: [monitoring/alerts.yaml](./monitoring/alerts.yaml)

### Topics
- **Create topics**: [init-scripts/create-topics.sh](./init-scripts/create-topics.sh)
- **Topic configs**: [topics/topics.yaml](./topics/topics.yaml)
- **Declarative management**: [topics/topic-operator.yaml](./topics/topic-operator.yaml)

### Backup & DR
- **Backup setup**: [backup/backup-cronjob.yaml](./backup/backup-cronjob.yaml)
- **Replication**: [backup/mirror-maker.yaml](./backup/mirror-maker.yaml)

### Troubleshooting
- **Verification**: [init-scripts/verify-cluster.sh](./init-scripts/verify-cluster.sh)
- **Performance**: [init-scripts/performance-test.sh](./init-scripts/performance-test.sh)
- **Logs**: `kubectl logs -n kafka <pod-name>`
- **Events**: `kubectl describe pod -n kafka <pod-name>`

## Component Dependencies

```
namespace.yaml
    ├── zookeeper/
    │   ├── configmap.yaml
    │   ├── service.yaml
    │   └── statefulset.yaml (depends on: configmap, service)
    │
    ├── kafka/
    │   ├── secrets.yaml
    │   ├── configmap.yaml
    │   ├── services.yaml
    │   └── statefulset.yaml (depends on: zookeeper, secrets, configmap, services)
    │
    ├── topics/
    │   ├── topic-operator.yaml (depends on: kafka)
    │   └── topics.yaml (depends on: kafka)
    │
    ├── monitoring/
    │   ├── jmx-exporter.yaml (depends on: kafka)
    │   ├── servicemonitor.yaml (depends on: kafka, prometheus-operator)
    │   └── alerts.yaml (depends on: servicemonitor)
    │
    ├── security/
    │   ├── tls-certificates.yaml (depends on: cert-manager)
    │   └── network-policy.yaml (depends on: kafka, zookeeper)
    │
    └── backup/
        ├── mirror-maker.yaml (depends on: kafka)
        └── backup-cronjob.yaml (depends on: kafka)
```

## Deployment Order

1. Prerequisites (cert-manager, Prometheus operator)
2. `namespace.yaml`
3. `kafka/secrets.yaml` (update with real passwords!)
4. `security/tls-certificates.yaml` (wait for Ready)
5. `zookeeper/` (all files)
6. Wait for Zookeeper ready
7. `kafka/` (all files)
8. Wait for Kafka ready
9. `topics/` (create topics)
10. `init-scripts/setup-acls.sh` (configure ACLs)
11. `monitoring/` (all files)
12. `security/network-policy.yaml`
13. `backup/` (all files)

Or simply run: `./deploy.sh`

## File Statistics

| Category | Files | Lines |
|----------|-------|-------|
| Documentation | 4 | 4,000+ |
| Zookeeper | 3 | 600+ |
| Kafka | 4 | 1,800+ |
| Topics | 2 | 600+ |
| Monitoring | 3 | 800+ |
| Security | 2 | 500+ |
| Backup | 2 | 600+ |
| Scripts | 4 | 1,500+ |
| Deployment | 2 | 700+ |
| **Total** | **26** | **6,443** |

## External References

- **Kafka Documentation**: https://kafka.apache.org/documentation/
- **Strimzi**: https://strimzi.io/docs/
- **Confluent**: https://docs.confluent.io/
- **cert-manager**: https://cert-manager.io/docs/
- **Prometheus Operator**: https://prometheus-operator.dev/

## Support

For detailed information, see:
- **[README.md](./README.md)** - Complete documentation
- **[DEPLOYMENT_GUIDE.md](./DEPLOYMENT_GUIDE.md)** - Quick start guide
- **[SUMMARY.md](./SUMMARY.md)** - Implementation summary

---

**Last Updated**: 2024-01-20
**Version**: 1.0.0
