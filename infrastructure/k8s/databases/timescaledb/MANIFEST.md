# TimescaleDB Deployment Manifest

Complete list of all files and their purposes for the production TimescaleDB deployment.

## Directory Structure

```
timescaledb/
├── deploy.sh                      # Automated deployment script
├── QUICKSTART.md                  # Quick start guide
├── README.md                      # Complete documentation
├── MANIFEST.md                    # This file
│
├── Core Kubernetes Manifests
├── namespace.yaml                 # Namespace with resource quotas
├── storageclass.yaml              # Premium SSD storage classes
├── secrets.yaml                   # Credentials template (base64)
├── configmap.yaml                 # PostgreSQL configuration
├── init-scripts-configmap.yaml    # Database initialization scripts
│
├── High Availability
├── patroni-config.yaml            # Patroni + etcd for HA
├── statefulset.yaml               # TimescaleDB StatefulSet (3 replicas)
│
├── Networking
├── services.yaml                  # 6 services (headless, rw, ro, lb, metrics, external)
├── pgbouncer.yaml                 # Connection pooling (3-10 replicas)
├── network-policy.yaml            # Network security policies
│
├── Monitoring & Alerting
├── monitoring.yaml                # ServiceMonitor, PrometheusRule, Grafana dashboard
│
├── Backup & Recovery
├── backup-cronjob.yaml            # pgBackRest automated backups
│
├── Alternative Deployment
├── helm-values.yaml               # Helm chart values
│
└── Initialization Scripts
    └── init-scripts/
        ├── 01-init-database.sql   # Database, users, schemas setup
        └── 02-create-hypertables.sql  # Hypertables, indexes, policies
