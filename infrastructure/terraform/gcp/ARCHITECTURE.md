# GCP GKE Infrastructure Architecture
## LLM Analytics Hub

## Overview

This document describes the architecture of the GCP GKE infrastructure for the LLM Analytics Hub, including design decisions, security considerations, and operational practices.

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                            GCP Project                                       │
│                         (llm-analytics-hub)                                  │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    │
┌───────────────────────────────────▼─────────────────────────────────────────┐
│                          Regional Resources                                  │
│                            (us-central1)                                     │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                               │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │                         VPC Network                                     │ │
│  │                    (llm-analytics-vpc)                                  │ │
│  ├────────────────────────────────────────────────────────────────────────┤ │
│  │                                                                          │ │
│  │  ┌──────────────────────────────────────────────────────────────────┐  │ │
│  │  │  Subnet (10.0.0.0/20)                                            │  │ │
│  │  │    Primary: Node IPs (4,096 addresses)                           │  │ │
│  │  │    Secondary (Pods): 10.4.0.0/14 (262,144 addresses)             │  │ │
│  │  │    Secondary (Services): 10.8.0.0/20 (4,096 addresses)           │  │ │
│  │  └──────────────────────────────────────────────────────────────────┘  │ │
│  │                                                                          │ │
│  │  ┌──────────────────────────────────────────────────────────────────┐  │ │
│  │  │  Cloud Router + Cloud NAT                                        │  │ │
│  │  │    - Provides outbound internet for private nodes               │  │ │
│  │  │    - 2 static NAT IPs for whitelisting                           │  │ │
│  │  └──────────────────────────────────────────────────────────────────┘  │ │
│  │                                                                          │ │
│  │  ┌──────────────────────────────────────────────────────────────────┐  │ │
│  │  │  Firewall Rules                                                  │  │ │
│  │  │    - Default deny all (Priority: 65534)                          │  │ │
│  │  │    - Allow internal (Priority: 1000)                             │  │ │
│  │  │    - Allow master to nodes (Priority: 1000)                      │  │ │
│  │  │    - Allow health checks (Priority: 1000)                        │  │ │
│  │  │    - Allow HTTPS ingress (Priority: 1000)                        │  │ │
│  │  └──────────────────────────────────────────────────────────────────┘  │ │
│  │                                                                          │ │
│  │  ┌──────────────────────────────────────────────────────────────────┐  │ │
│  │  │  Private DNS Zone                                                │  │ │
│  │  │    - llm-analytics.internal                                      │  │ │
│  │  │    - Internal service discovery                                  │  │ │
│  │  └──────────────────────────────────────────────────────────────────┘  │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                                                               │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │                     GKE Cluster (Regional)                             │ │
│  │                  (llm-analytics-cluster)                               │ │
│  ├────────────────────────────────────────────────────────────────────────┤ │
│  │                                                                          │ │
│  │  Control Plane                                                          │ │
│  │  ┌──────────────────────────────────────────────────────────────────┐  │ │
│  │  │  Master Nodes (GCP Managed)                                      │  │ │
│  │  │    - Private IP: 172.16.0.0/28                                   │  │ │
│  │  │    - Kubernetes Version: 1.28+                                   │  │ │
│  │  │    - Release Channel: STABLE                                     │  │ │
│  │  │    - HA across 3 zones                                           │  │ │
│  │  └──────────────────────────────────────────────────────────────────┘  │ │
│  │                                                                          │ │
│  │  Worker Nodes (Across 3 Zones)                                          │ │
│  │  ┌──────────────┬──────────────┬──────────────┬──────────────────────┐ │ │
│  │  │ System Pool  │  App Pool    │  DB Pool     │  Spot Pool           │ │ │
│  │  ├──────────────┼──────────────┼──────────────┼──────────────────────┤ │ │
│  │  │ Machine:     │ Machine:     │ Machine:     │ Machine:             │ │ │
│  │  │ n2-standard-4│ n2-standard-8│ n2-highmem-8 │ n2-standard-4        │ │ │
│  │  │              │              │              │                      │ │ │
│  │  │ Nodes: 2-4   │ Nodes: 3-10  │ Nodes: 3-6   │ Nodes: 0-10          │ │ │
│  │  │              │              │              │                      │ │ │
│  │  │ Disk:        │ Disk:        │ Disk:        │ Disk:                │ │ │
│  │  │ 100GB        │ 150GB        │ 200GB SSD    │ 100GB                │ │ │
│  │  │ pd-standard  │ pd-balanced  │ + 1 Local    │ pd-standard          │ │ │
│  │  │              │              │   SSD        │                      │ │ │
│  │  │              │              │              │                      │ │ │
│  │  │ Workload:    │ Workload:    │ Workload:    │ Workload:            │ │ │
│  │  │ - kube-dns   │ - API servers│ - Databases  │ - Batch jobs         │ │ │
│  │  │ - metrics    │ - Web apps   │ - InfluxDB   │ - ML training        │ │ │
│  │  │ - logging    │ - Workers    │ - PostgreSQL │ - Non-critical       │ │ │
│  │  │              │              │ - Redis      │                      │ │ │
│  │  │              │              │              │                      │ │ │
│  │  │ Taint:       │ Taint:       │ Taint:       │ Taint:               │ │ │
│  │  │ system       │ (none)       │ database     │ batch + spot         │ │ │
│  │  └──────────────┴──────────────┴──────────────┴──────────────────────┘ │ │
│  │                                                                          │ │
│  │  Features                                                                │ │
│  │  ┌──────────────────────────────────────────────────────────────────┐  │ │
│  │  │ ✓ Workload Identity                                              │  │ │
│  │  │ ✓ Binary Authorization                                           │  │ │
│  │  │ ✓ Shielded Nodes                                                 │  │ │
│  │  │ ✓ Network Policy (Calico)                                        │  │ │
│  │  │ ✓ Cloud Operations (Logging & Monitoring)                        │  │ │
│  │  │ ✓ Managed Prometheus                                             │  │ │
│  │  │ ✓ Vertical Pod Autoscaling                                       │  │ │
│  │  │ ✓ Horizontal Pod Autoscaling                                     │  │ │
│  │  │ ✓ Dataplane V2 (eBPF)                                            │  │ │
│  │  │ ✓ Gateway API                                                    │  │ │
│  │  └──────────────────────────────────────────────────────────────────┘  │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                                                               │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │                         Storage                                        │ │
│  ├────────────────────────────────────────────────────────────────────────┤ │
│  │                                                                          │ │
│  │  GCS Buckets                                                            │ │
│  │  ┌──────────────┬──────────────┬──────────────┬──────────────────────┐ │ │
│  │  │ app-data     │ logs         │ backups      │ ml-artifacts         │ │ │
│  │  │              │              │              │                      │ │ │
│  │  │ Lifecycle:   │ Lifecycle:   │ Lifecycle:   │ Lifecycle:           │ │ │
│  │  │ 90d→Nearline │ 30d→Nearline │ 7d→Nearline  │ Versioning           │ │ │
│  │  │ 365d→Coldline│ 90d→Delete   │ Retain       │                      │ │ │
│  │  └──────────────┴──────────────┴──────────────┴──────────────────────┘ │ │
│  │                                                                          │ │
│  │  Persistent Disks                                                        │ │
│  │  ┌──────────────┬──────────────┬──────────────────────────────────────┐ │ │
│  │  │ pd-standard  │ pd-balanced  │ pd-ssd                               │ │ │
│  │  │ (Default)    │              │ (High Performance)                   │ │ │
│  │  │              │              │                                      │ │ │
│  │  │ Regional:    │ Regional:    │ Regional:                            │ │ │
│  │  │ HA across 2  │ HA across 2  │ HA across 2 zones                    │ │ │
│  │  │ zones        │ zones        │                                      │ │ │
│  │  └──────────────┴──────────────┴──────────────────────────────────────┘ │ │
│  │                                                                          │ │
│  │  Artifact Registry                                                       │ │
│  │  ┌──────────────────────────────────────────────────────────────────┐  │ │
│  │  │ Docker Repository: Container images                              │  │ │
│  │  │ Helm Repository: Helm charts                                     │  │ │
│  │  │ Vulnerability Scanning: Enabled                                  │  │ │
│  │  └──────────────────────────────────────────────────────────────────┘  │ │
│  │                                                                          │ │
│  │  Filestore (Production Only)                                            │ │
│  │  ┌──────────────────────────────────────────────────────────────────┐  │ │
│  │  │ Tier: BASIC_HDD                                                  │  │ │
│  │  │ Capacity: 1TB                                                    │  │ │
│  │  │ Use Case: Shared storage for multiple pods                      │  │ │
│  │  └──────────────────────────────────────────────────────────────────┘  │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                                                               │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │                     IAM & Security                                     │ │
│  ├────────────────────────────────────────────────────────────────────────┤ │
│  │                                                                          │ │
│  │  Service Accounts (Workload Identity)                                   │ │
│  │  ┌──────────────────────────────────────────────────────────────────┐  │ │
│  │  │ • gke-nodes: Node service account                                │  │ │
│  │  │ • app-workload: Application pods                                 │  │ │
│  │  │ • db-workload: Database pods + Cloud SQL access                  │  │ │
│  │  │ • monitoring-workload: Prometheus metrics                        │  │ │
│  │  │ • secrets-workload: Secret Manager access                        │  │ │
│  │  │ • storage-workload: GCS access                                   │  │ │
│  │  │ • external-dns: DNS management                                   │  │ │
│  │  │ • cert-manager: Certificate management                           │  │ │
│  │  │ • cluster-autoscaler: Cluster autoscaling                        │  │ │
│  │  └──────────────────────────────────────────────────────────────────┘  │ │
│  │                                                                          │ │
│  │  Binary Authorization                                                    │ │
│  │  ┌──────────────────────────────────────────────────────────────────┐  │ │
│  │  │ Policy: REQUIRE_ATTESTATION                                      │  │ │
│  │  │ Whitelisted: GCR project images, GKE system images               │  │ │
│  │  │ Enforcement: ENFORCED_BLOCK_AND_AUDIT_LOG                        │  │ │
│  │  └──────────────────────────────────────────────────────────────────┘  │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                                                               │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │                   Monitoring & Logging                                 │ │
│  ├────────────────────────────────────────────────────────────────────────┤ │
│  │                                                                          │ │
│  │  Cloud Operations                                                        │ │
│  │  ┌──────────────────────────────────────────────────────────────────┐  │ │
│  │  │ Logging: SYSTEM_COMPONENTS + WORKLOADS                           │  │ │
│  │  │ Monitoring: SYSTEM_COMPONENTS + WORKLOADS                        │  │ │
│  │  │ Managed Prometheus: Enabled                                      │  │ │
│  │  │ Cloud Trace: Enabled                                             │  │ │
│  │  └──────────────────────────────────────────────────────────────────┘  │ │
│  │                                                                          │ │
│  │  Cost Allocation                                                         │ │
│  │  ┌──────────────────────────────────────────────────────────────────┐  │ │
│  │  │ BigQuery Dataset: gke_usage                                      │  │ │
│  │  │ Network Egress Metering: Enabled                                 │  │ │
│  │  │ Resource Consumption Metering: Enabled                           │  │ │
│  │  └──────────────────────────────────────────────────────────────────┘  │ │
│  │                                                                          │ │
│  │  Notifications                                                           │ │
│  │  ┌──────────────────────────────────────────────────────────────────┐  │ │
│  │  │ Pub/Sub Topic: gke-notifications                                │  │ │
│  │  │ Subscription: gke-notifications-sub                              │  │ │
│  │  └──────────────────────────────────────────────────────────────────┘  │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                                                               │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │                      Backup & DR                                       │ │
│  ├────────────────────────────────────────────────────────────────────────┤ │
│  │                                                                          │ │
│  │  GKE Backup                                                             │ │
│  │  ┌──────────────────────────────────────────────────────────────────┐  │ │
│  │  │ Schedule: Daily at 2 AM                                          │  │ │
│  │  │ Retention: 30 days                                               │  │ │
│  │  │ Scope: default, kube-system, llm-analytics namespaces            │  │ │
│  │  │ Encryption: KMS (90-day key rotation)                            │  │ │
│  │  └──────────────────────────────────────────────────────────────────┘  │ │
│  │                                                                          │ │
│  │  Disk Snapshots                                                          │ │
│  │  ┌──────────────────────────────────────────────────────────────────┐  │ │
│  │  │ Daily: 14-day retention                                          │  │ │
│  │  │ Weekly: 90-day retention                                         │  │ │
│  │  │ Regional storage                                                 │  │ │
│  │  └──────────────────────────────────────────────────────────────────┘  │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Design Decisions

### 1. Regional vs Zonal Deployment

**Decision:** Regional cluster across 3 zones

**Rationale:**
- High availability: Control plane replicated across zones
- Automatic failover: If one zone fails, workloads continue in other zones
- SLA: 99.95% uptime (vs 99.5% for zonal)
- Cost: ~10% more than zonal, justified by availability requirements

**Tradeoffs:**
- Higher cost than zonal
- Slightly higher network latency for cross-zone communication

### 2. Private vs Public Cluster

**Decision:** Private nodes with optional private endpoint

**Rationale:**
- Security: Nodes have no public IPs, reducing attack surface
- Compliance: Meets requirements for private infrastructure
- Flexibility: Master endpoint can be public or private based on needs
- NAT Gateway: Provides controlled outbound internet access

**Tradeoffs:**
- Complexity: Requires VPN or Cloud IAP for kubectl access with private endpoint
- Cost: Cloud NAT charges for outbound traffic

### 3. Node Pool Strategy

**Decision:** Separate node pools for different workload types

**Rationale:**
- **System Pool**: Dedicated resources for critical system components
- **App Pool**: Optimized for application workloads with autoscaling
- **DB Pool**: High-memory nodes with SSD for databases
- **Spot Pool**: Cost savings for fault-tolerant batch workloads

**Benefits:**
- Resource isolation
- Cost optimization
- Targeted scaling
- Workload-specific taints and tolerations

### 4. Workload Identity vs Node Service Account

**Decision:** Workload Identity for all workloads

**Rationale:**
- Fine-grained IAM: Pod-level permissions vs node-level
- Security: Least privilege principle
- Audit: Better tracking of which service accesses what
- Compliance: Meets security requirements

**Tradeoffs:**
- Setup complexity
- Requires K8s service account management

### 5. Storage Classes

**Decision:** Multiple storage classes with different performance tiers

**Rationale:**
- **pd-standard**: Cost-effective for logs, backups
- **pd-balanced**: Default for general workloads (good performance/cost ratio)
- **pd-ssd**: High-performance for databases
- **Regional PD**: HA for critical stateful workloads

**Cost optimization:**
- Match storage tier to workload requirements
- Use standard for non-critical data

### 6. Network Policy

**Decision:** Default deny with explicit allows

**Rationale:**
- Zero-trust network model
- Explicit control over pod communication
- Compliance requirement
- Defense in depth

**Implementation:**
- Calico CNI for network policy enforcement
- Namespace-level default deny
- Service-specific allow rules

### 7. Monitoring Strategy

**Decision:** Cloud Operations + Managed Prometheus + Custom metrics

**Rationale:**
- **Cloud Operations**: Native GCP integration, deep insights
- **Managed Prometheus**: Industry-standard metrics, Grafana compatibility
- **BigQuery**: Cost analysis and allocation
- **Pub/Sub**: Real-time notifications

## Security Architecture

### Defense in Depth

1. **Network Layer**
   - Private GKE cluster
   - VPC with custom subnets
   - Firewall rules (default deny)
   - Network policies

2. **Identity & Access**
   - Workload Identity
   - Service accounts with minimal permissions
   - Binary Authorization
   - Pod Security Standards

3. **Compute Layer**
   - Shielded nodes
   - Secure boot
   - Integrity monitoring
   - Container image scanning

4. **Data Layer**
   - Encrypted persistent disks
   - KMS for sensitive data
   - Secret Manager integration
   - Encrypted backups

### Security Posture

- **GKE Security Posture Dashboard**: Enabled
- **Vulnerability Scanning**: Enabled in Artifact Registry
- **Binary Authorization**: Required for production
- **Pod Security**: Restricted policy for production workloads

## Scalability

### Horizontal Scaling

- **Cluster Autoscaler**: Automatically adds/removes nodes
- **HPA**: Automatically scales pod replicas based on metrics
- **VPA**: Automatically adjusts pod resource requests

### Vertical Scaling

- Node pools can be resized
- Machine types can be changed (requires node pool recreation)
- Storage can be expanded dynamically

### Limits

| Resource | Limit |
|----------|-------|
| Max nodes per cluster | 15,000 |
| Max pods per node | 110 |
| Max pods per cluster | 200,000 |
| Max services | 10,000 |

## High Availability

### Cluster Level

- Regional control plane (3 zones)
- Multi-zone node pools
- Automatic master failover

### Application Level

- Pod anti-affinity
- PodDisruptionBudgets
- Multiple replicas
- Health checks

### Data Level

- Regional persistent disks
- GCS with multi-region replication
- Automated backups
- Point-in-time recovery

## Disaster Recovery

### RPO/RTO Targets

| Component | RPO | RTO |
|-----------|-----|-----|
| Cluster config | 24 hours | 4 hours |
| Application data | 1 hour | 2 hours |
| Database | 5 minutes | 30 minutes |

### Backup Strategy

1. **GKE Backup**: Daily automated backups
2. **Disk Snapshots**: Daily and weekly
3. **GCS Versioning**: Enabled for critical buckets
4. **GitOps**: Infrastructure as code in version control

### Recovery Procedures

1. Cluster recreation from Terraform
2. Workload restoration from GKE Backup
3. Data restoration from snapshots
4. Application redeployment from CI/CD

## Cost Optimization

### Strategies

1. **Right-sizing**
   - Start with minimum node counts
   - Use autoscaling to handle peaks
   - Monitor and adjust resource requests

2. **Spot Instances**
   - Use for batch workloads
   - 60-91% cost savings
   - Automatic replacement on preemption

3. **Storage Tiering**
   - Use appropriate storage class
   - Lifecycle policies for GCS
   - Delete unused snapshots

4. **Committed Use Discounts**
   - 37% savings for 1-year commitment
   - 57% savings for 3-year commitment
   - Suitable for baseline capacity

### Cost Monitoring

- BigQuery for usage analysis
- Cost allocation by namespace
- Budget alerts
- Resource quotas

## Performance Optimization

### Network

- Dataplane V2 (eBPF) for faster networking
- GVNIC for higher throughput
- Intranode visibility for debugging

### Storage

- Local SSDs for databases
- Regional PD for HA
- Preprovisioned IOPS

### Compute

- Disable hyperthreading for database nodes
- CPU pinning for latency-sensitive workloads
- Node auto-provisioning for optimal sizing

## Operational Excellence

### GitOps

- Infrastructure as Code (Terraform)
- Version controlled
- Peer reviewed changes
- Automated CI/CD

### Monitoring

- SLO-based monitoring
- Custom dashboards
- Proactive alerting
- Capacity planning

### Maintenance

- Automated security patches
- Planned maintenance windows
- Blue/green deployments
- Canary releases

## Compliance

### Standards

- SOC 2
- ISO 27001
- HIPAA (if healthcare data)
- GDPR (if EU users)

### Controls

- Audit logging
- Access controls
- Data encryption
- Network isolation

## Future Enhancements

1. **Multi-region deployment** for global DR
2. **Service mesh** (Istio/Anthos) for advanced traffic management
3. **GitOps** with ArgoCD or Flux
4. **Policy enforcement** with OPA/Gatekeeper
5. **Advanced observability** with Jaeger for distributed tracing
6. **ML workloads** with GPU node pools
7. **Serverless integration** with Cloud Run for Anthos

## References

- [GKE Best Practices](https://cloud.google.com/kubernetes-engine/docs/best-practices)
- [GKE Security Best Practices](https://cloud.google.com/kubernetes-engine/docs/how-to/hardening-your-cluster)
- [Terraform GCP Provider Docs](https://registry.terraform.io/providers/hashicorp/google/latest/docs)
- [Kubernetes Documentation](https://kubernetes.io/docs/)
