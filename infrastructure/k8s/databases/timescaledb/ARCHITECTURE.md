# TimescaleDB Architecture

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         LLM Analytics Hub                                │
│                    Application Layer (Kubernetes)                        │
└────────────────────────────┬────────────────────────────────────────────┘
                             │
                             │ PostgreSQL Protocol
                             │ (TLS encrypted)
                             ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                      Connection Pooling Layer                            │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │  PgBouncer (3-10 replicas with HPA)                              │   │
│  │  - Transaction pooling                                            │   │
│  │  - 1000 client → 100 DB connections                              │   │
│  │  - Session affinity                                               │   │
│  └──────────────────────────────────────────────────────────────────┘   │
└────────────────────────────┬────────────────────────────────────────────┘
                             │
          ┌──────────────────┼──────────────────┐
          │                  │                  │
          ▼                  ▼                  ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                    TimescaleDB Cluster (StatefulSet)                     │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐              │
│  │ Primary      │    │ Replica 1    │    │ Replica 2    │              │
│  │ timescaledb-0│◄───│ timescaledb-1│    │ timescaledb-2│              │
│  │              │    │              │    │              │              │
│  │ PostgreSQL   │    │ PostgreSQL   │    │ PostgreSQL   │              │
│  │ 15.5         │    │ 15.5         │    │ 15.5         │              │
│  │ TimescaleDB  │    │ TimescaleDB  │    │ TimescaleDB  │              │
│  │ 2.13.1       │    │ 2.13.1       │    │ 2.13.1       │              │
│  │              │    │              │    │              │              │
│  │ CPU: 4-8c    │    │ CPU: 4-8c    │    │ CPU: 4-8c    │              │
│  │ RAM: 16-32GB │    │ RAM: 16-32GB │    │ RAM: 16-32GB │              │
│  └──────┬───────┘    └──────┬───────┘    └──────┬───────┘              │
│         │ Patroni            │ Patroni            │ Patroni             │
│         └────────────────────┼────────────────────┘                     │
└──────────────────────────────┼──────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                    Consensus Layer (etcd)                                │
│  ┌──────────┐    ┌──────────┐    ┌──────────┐                          │
│  │  etcd-0  │◄──►│  etcd-1  │◄──►│  etcd-2  │                          │
│  │          │    │          │    │          │                          │
│  │ Leader   │    │ Follower │    │ Follower │                          │
│  │ election │    │ Sync     │    │ Sync     │                          │
│  └──────────┘    └──────────┘    └──────────┘                          │
└─────────────────────────────────────────────────────────────────────────┘

                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                        Storage Layer                                     │
│  ┌────────────────────────────────────────────────────────────────┐     │
│  │  Per TimescaleDB Pod:                                           │     │
│  │                                                                  │     │
│  │  ┌──────────────────────────────────────────────────────────┐  │     │
│  │  │ Data Volume (500GB Premium SSD)                          │  │     │
│  │  │ - PostgreSQL data directory                              │  │     │
│  │  │ - Hypertables (compressed after 7 days)                  │  │     │
│  │  │ - IOPS: 10,000+                                          │  │     │
│  │  └──────────────────────────────────────────────────────────┘  │     │
│  │                                                                  │     │
│  │  ┌──────────────────────────────────────────────────────────┐  │     │
│  │  │ WAL Volume (50GB Premium SSD)                            │  │     │
│  │  │ - Write-Ahead Log                                        │  │     │
│  │  │ - No caching (direct writes)                             │  │     │
│  │  │ - High durability                                        │  │     │
│  │  └──────────────────────────────────────────────────────────┘  │     │
│  │                                                                  │     │
│  │  ┌──────────────────────────────────────────────────────────┐  │     │
│  │  │ Backup Volume (200GB Standard SSD)                       │  │     │
│  │  │ - Local backup staging                                   │  │     │
│  │  │ - PITR files                                             │  │     │
│  │  └──────────────────────────────────────────────────────────┘  │     │
│  └────────────────────────────────────────────────────────────────┘     │
└─────────────────────────────────────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                    Backup & Archive Layer                                │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │  pgBackRest → S3-Compatible Storage                              │   │
│  │  - Full backups: Daily at 2 AM                                   │   │
│  │  - Differential: Every 6 hours                                   │   │
│  │  - WAL archiving: Continuous                                     │   │
│  │  - Retention: 7 daily, 4 weekly, 12 monthly                     │   │
│  │  - Encryption: AES-256-CBC                                       │   │
│  │  - Compression: LZ4                                              │   │
│  └──────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────┘

                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                    Monitoring & Observability                            │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │  Prometheus Exporters                                            │   │
│  │  - PostgreSQL Exporter (port 9187)                              │   │
│  │  - PgBouncer Exporter (port 9127)                               │   │
│  │                                                                   │   │
│  │  Metrics:                                                         │   │
│  │  - Query performance, connection pools, replication lag          │   │
│  │  - TimescaleDB compression, chunk stats                          │   │
│  │  - Disk usage, CPU, memory                                       │   │
│  │                                                                   │   │
│  │  Alerts:                                                          │   │
│  │  - Database down, replication lag, connection exhaustion         │   │
│  │  - Disk space warnings, backup failures                          │   │
│  └──────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────┘
```

## Service Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          Service Layer                                   │
│                                                                           │
│  External Access (Optional)                                              │
│  ┌────────────────────────────────────────────────────────┐             │
│  │ timescaledb-external (LoadBalancer)                     │             │
│  │ - Public IP with source IP restrictions                │             │
│  │ - TLS required                                          │             │
│  └────────────────────────────────────────────────────────┘             │
│                                                                           │
│  Application Services                                                    │
│  ┌────────────────────────────────────────────────────────┐             │
│  │ pgbouncer (ClusterIP)                                  │             │
│  │ - Connection pooling                                   │             │
│  │ - Port: 6432                                           │             │
│  │ - Recommended for apps                                │             │
│  └────────────────────────────────────────────────────────┘             │
│                                                                           │
│  ┌────────────────────────────────────────────────────────┐             │
│  │ timescaledb-rw (ClusterIP)                             │             │
│  │ - Primary only (read-write)                            │             │
│  │ - Port: 5432                                           │             │
│  │ - Direct database access                              │             │
│  └────────────────────────────────────────────────────────┘             │
│                                                                           │
│  ┌────────────────────────────────────────────────────────┐             │
│  │ timescaledb-ro (ClusterIP)                             │             │
│  │ - Replicas only (read-only)                            │             │
│  │ - Port: 5432                                           │             │
│  │ - Analytics/reporting queries                          │             │
│  └────────────────────────────────────────────────────────┘             │
│                                                                           │
│  Internal Services                                                       │
│  ┌────────────────────────────────────────────────────────┐             │
│  │ timescaledb-headless (ClusterIP: None)                 │             │
│  │ - StatefulSet DNS                                      │             │
│  │ - Patroni cluster management                           │             │
│  └────────────────────────────────────────────────────────┘             │
│                                                                           │
│  Monitoring Services                                                     │
│  ┌────────────────────────────────────────────────────────┐             │
│  │ timescaledb-metrics (ClusterIP)                        │             │
│  │ - Prometheus scraping                                  │             │
│  │ - Port: 9187                                           │             │
│  └────────────────────────────────────────────────────────┘             │
└─────────────────────────────────────────────────────────────────────────┘
```

## Data Flow

### Write Path (Insert/Update)

```
Application
    │
    ▼
PgBouncer (connection pool)
    │
    ▼
Primary (timescaledb-0)
    │
    ├─► Write to WAL (50GB volume)
    │
    ├─► Write to data (500GB volume)
    │
    ├─► Stream to Replica 1 (async)
    │
    └─► Stream to Replica 2 (async)
         │
         ▼
    Acknowledge to client
```

### Read Path (Select)

```
Application
    │
    ▼
PgBouncer
    │
    ├─► Primary (for consistency)
    │
    └─► Replicas (for analytics)
         │
         ▼
    Query cache → Indexes → Hypertables
```

### Failover Flow

```
Primary fails
    │
    ▼
Patroni detects (30s TTL)
    │
    ▼
etcd coordinates leader election
    │
    ▼
Replica 1 promoted to primary
    │
    ├─► Update etcd state
    │
    ├─► Update Kubernetes labels
    │
    └─► Service endpoints updated
         │
         ▼
    Traffic routes to new primary
    │
    ▼
Total downtime: < 60 seconds
```

## Network Security

```
┌─────────────────────────────────────────────────────────────────────────┐
│                       Network Policies                                   │
│                                                                           │
│  Default: DENY ALL                                                       │
│                                                                           │
│  Allowed Ingress:                                                        │
│  ┌────────────────────────────────────────────────────────┐             │
│  │ From application pods (with label)          → Port 5432 │             │
│  │ From PgBouncer                              → Port 5432 │             │
│  │ From Prometheus (monitoring namespace)      → Port 9187 │             │
│  │ From backup jobs                            → Port 5432 │             │
│  │ TimescaleDB pods ↔ TimescaleDB pods        → Port 5432 │             │
│  │ TimescaleDB pods ↔ etcd                    → Port 2379 │             │
│  └────────────────────────────────────────────────────────┘             │
│                                                                           │
│  Allowed Egress:                                                         │
│  ┌────────────────────────────────────────────────────────┐             │
│  │ To etcd                                    → Port 2379  │             │
│  │ To other TimescaleDB pods                  → Port 5432  │             │
│  │ To S3 (backups)                           → Port 443   │             │
│  │ To DNS (kube-system)                      → Port 53    │             │
│  └────────────────────────────────────────────────────────┘             │
└─────────────────────────────────────────────────────────────────────────┘
```

## Database Schema Architecture

```
llm_analytics (Database)
│
├── analytics (Schema)
│   ├── metadata (Regular table)
│   ├── model_performance (Hypertable, 7-day chunks)
│   ├── recent_requests (View)
│   └── top_models_by_usage (View)
│
├── metrics (Schema)
│   ├── llm_requests (Hypertable, 1-day chunks)
│   │   ├── Compression: After 7 days
│   │   ├── Retention: 365 days
│   │   └── Indexes: user_id, model, provider, status
│   │
│   ├── token_usage (Hypertable, 1-day chunks)
│   │   ├── Compression: After 7 days
│   │   └── Retention: 365 days
│   │
│   └── cost_tracking (Hypertable, 1-day chunks)
│       ├── Compression: After 30 days
│       └── Retention: 730 days
│
├── events (Schema)
│   ├── system_events (Hypertable, 1-day chunks)
│   │   ├── Compression: After 7 days
│   │   └── Retention: 90 days
│   │
│   └── error_logs (Hypertable, 1-day chunks)
│       ├── Compression: After 14 days
│       └── Retention: 180 days
│
└── aggregates (Schema)
    ├── hourly_request_stats (Continuous aggregate)
    │   └── Refresh: Every 1 hour
    │
    ├── daily_cost_summary (Continuous aggregate)
    │   └── Refresh: Every 1 day
    │
    └── error_rate_by_model (Continuous aggregate)
        └── Refresh: Every 15 minutes
```

## Resource Allocation

### Per-Pod Resources

```
TimescaleDB Pod:
├── Containers
│   ├── timescaledb
│   │   ├── CPU: 4000m - 8000m
│   │   └── Memory: 16Gi - 32Gi
│   └── postgres-exporter
│       ├── CPU: 100m - 500m
│       └── Memory: 128Mi - 512Mi
│
└── Volumes
    ├── data: 500Gi (Premium SSD)
    ├── wal: 50Gi (Premium SSD)
    └── backup: 200Gi (Standard SSD)

PgBouncer Pod:
├── Containers
│   ├── pgbouncer
│   │   ├── CPU: 500m - 2000m
│   │   └── Memory: 512Mi - 2Gi
│   └── pgbouncer-exporter
│       ├── CPU: 100m - 200m
│       └── Memory: 64Mi - 128Mi
│
└── No persistent volumes

etcd Pod:
├── Container
│   ├── CPU: 500m - 1000m
│   └── Memory: 1Gi - 2Gi
│
└── Volumes
    └── data: 10Gi (Premium SSD)
```

### Total Cluster Resources

```
Minimum:
- CPU: 15 cores (3 × TimescaleDB + 3 × PgBouncer + 3 × etcd)
- Memory: 54GB
- Storage: 2.28TB

Maximum (with scaling):
- CPU: 40+ cores
- Memory: 120GB
- Storage: 2.28TB (+ growth)
```

## High Availability Guarantees

```
Component Availability:
├── TimescaleDB: 99.95% (3 replicas, auto-failover)
├── etcd: 99.9% (3 replicas, Raft consensus)
├── PgBouncer: 99.9% (3-10 replicas, HPA)
└── Storage: 99.99% (cloud provider SLA)

Failure Scenarios:
├── Single pod failure: < 30s failover (Patroni)
├── Node failure: < 60s (pod rescheduling)
├── Zone failure: Continues (pod anti-affinity)
└── Primary failure: < 60s (automatic promotion)

RTO/RPO:
├── RTO (Recovery Time): < 5 minutes
└── RPO (Recovery Point): < 5 minutes (PITR)
```

## Scaling Characteristics

```
Vertical Scaling (Resources):
├── CPU: Linear performance up to 16 cores
├── Memory: Affects cache hit ratio
└── Storage: Online expansion supported

Horizontal Scaling (Replicas):
├── Read scaling: Linear (add replicas)
├── Write scaling: Single primary (vertical only)
├── Recommended: 3-5 replicas max
└── Connection pooling: 3-10 PgBouncer replicas

Data Scaling:
├── Time-series: Automatic partitioning (chunks)
├── Compression: 90% reduction after 7 days
├── Retention: Automatic cleanup
└── Capacity: Petabyte-scale with proper tuning
```
