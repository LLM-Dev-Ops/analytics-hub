# LLM Analytics Hub - Kubernetes Core Infrastructure

Production-ready Kubernetes platform components for the LLM Analytics Hub, including ingress, monitoring, logging, autoscaling, security, and service mesh capabilities.

## Table of Contents

- [Overview](#overview)
- [Prerequisites](#prerequisites)
- [Architecture](#architecture)
- [Components](#components)
- [Quick Start](#quick-start)
- [Detailed Setup](#detailed-setup)
- [Configuration](#configuration)
- [Monitoring and Observability](#monitoring-and-observability)
- [Security](#security)
- [Troubleshooting](#troubleshooting)
- [Maintenance](#maintenance)

## Overview

This infrastructure deployment provides:

- **Ingress**: NGINX Ingress Controller with TLS termination, rate limiting, and WAF
- **Certificate Management**: Automated TLS with cert-manager and Let's Encrypt
- **Monitoring**: Prometheus, Grafana, and AlertManager with pre-configured dashboards
- **Logging**: Loki and Promtail for centralized log aggregation
- **Autoscaling**: HPA, VPA, and KEDA for event-driven scaling
- **Security**: Pod Security Standards, Network Policies, and OPA Gatekeeper
- **Storage**: Dynamic volume provisioning with multiple storage tiers
- **Service Mesh**: Istio for mTLS, traffic management, and observability

## Prerequisites

### Required Tools

- **Kubernetes cluster** (1.28+)
  - Minimum 3 nodes (recommended: 5+ nodes)
  - Total resources: 32 CPU, 64GB RAM minimum
- **kubectl** (1.28+)
- **Helm** (3.12+)
- **istioctl** (1.20+) - Optional, for service mesh

### Cloud Provider Requirements

#### AWS
- EKS cluster with IRSA enabled
- Route53 hosted zone for DNS-01 challenges
- EBS CSI driver installed
- ALB/NLB support

#### GCP
- GKE cluster with Workload Identity enabled
- Cloud DNS zone
- Compute Engine persistent disk CSI driver

#### Azure
- AKS cluster with managed identity
- Azure DNS zone
- Azure Disk CSI driver

### Network Requirements

- Outbound internet access for pulling images
- DNS resolution for cluster domains
- LoadBalancer service support
- Optional: VPN or bastion for secure access

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    External Traffic                      │
└─────────────────────┬───────────────────────────────────┘
                      │
                      ▼
            ┌─────────────────┐
            │  Load Balancer  │
            └────────┬────────┘
                     │
                     ▼
        ┌────────────────────────┐
        │  NGINX Ingress         │
        │  - TLS Termination     │
        │  - Rate Limiting       │
        │  - WAF (ModSecurity)   │
        └───────────┬────────────┘
                    │
    ┌───────────────┼───────────────┐
    │               │               │
    ▼               ▼               ▼
┌────────┐   ┌─────────┐   ┌──────────┐
│  API   │   │Frontend │   │  Other   │
└────────┘   └─────────┘   └──────────┘
    │
    └─────────────┬──────────────┐
                  │              │
                  ▼              ▼
          ┌──────────────┐  ┌──────────┐
          │ TimescaleDB  │  │  Redis   │
          └──────────────┘  └──────────┘
                  │              │
                  └──────┬───────┘
                         │
                         ▼
                  ┌─────────────┐
                  │   Kafka     │
                  └─────────────┘

Observability Layer:
┌─────────────┐  ┌──────────┐  ┌────────────┐
│ Prometheus  │  │ Grafana  │  │    Loki    │
└─────────────┘  └──────────┘  └────────────┘
```

## Components

### 1. Ingress Controller

**Location**: `ingress/`

- NGINX Ingress Controller with high availability (3+ replicas)
- Automatic TLS termination via cert-manager
- Rate limiting per endpoint
- ModSecurity WAF with OWASP CRS
- HTTP/2 and WebSocket support
- Session affinity

**Key Features**:
- 100 req/s global rate limit
- 50 req/s API rate limit
- 10 req/min authentication rate limit
- Custom security headers (HSTS, CSP, X-Frame-Options)

### 2. Certificate Management

**Location**: `cert-manager/`

- Automated TLS certificate provisioning
- Let's Encrypt integration (staging + production)
- HTTP-01 and DNS-01 challenge support
- Automatic certificate renewal
- Certificate expiration monitoring

**Supported Providers**:
- Let's Encrypt (recommended)
- Self-signed (development)
- Custom CA

### 3. Monitoring Stack

**Location**: `monitoring/prometheus/` and `monitoring/grafana/`

#### Prometheus
- High availability setup (2 replicas)
- 30-day retention
- ServiceMonitor auto-discovery
- Pre-configured alerting rules
- Remote write to long-term storage

#### Grafana
- Pre-built dashboards for:
  - Kubernetes cluster overview
  - Application metrics
  - Kafka, Redis, TimescaleDB
  - NGINX Ingress
- OIDC/OAuth integration support
- Alert notification channels

#### AlertManager
- Multi-channel alerting (Slack, PagerDuty, Email)
- Alert routing by team and severity
- Alert grouping and deduplication

### 4. Logging Stack

**Location**: `logging/loki/` and `logging/promtail/`

- Loki for log aggregation
- Promtail DaemonSet for log collection
- 31-day default retention
- Automatic log parsing and labeling
- Grafana integration

### 5. Autoscaling

**Location**: `autoscaling/`

#### HorizontalPodAutoscaler (HPA)
- CPU and memory-based scaling
- Custom metrics (request rate, queue depth)
- Configurable scale-up/down policies

#### VerticalPodAutoscaler (VPA)
- Automatic resource recommendation
- In-place or recreation update modes
- Per-container resource tuning

#### KEDA
- Event-driven autoscaling
- Kafka consumer lag scaling
- Redis queue depth scaling
- Scheduled scaling for predictable loads

### 6. Security

**Location**: `security/`

#### Pod Security Standards
- Restricted policy for application workloads
- Baseline policy for infrastructure components
- Automatic enforcement via admission controller

#### Network Policies
- Default deny-all policies
- Explicit allow rules per service
- Namespace isolation
- Monitoring and logging exceptions

#### OPA Gatekeeper
- Policy enforcement for:
  - Required labels
  - Allowed container registries
  - No latest tags
  - Resource limits required
  - No privileged containers
  - Read-only root filesystem

### 7. Storage

**Location**: `storage/`

- **fast-ssd**: High-performance SSD (16K IOPS) for databases
- **standard-ssd**: General-purpose SSD (3K IOPS)
- **standard-hdd**: Cold storage and archival
- **nfs-storage**: Shared storage for multi-pod access
- **local-ssd**: Ultra-low latency for critical workloads

Volume snapshots enabled for backup and recovery.

### 8. Service Mesh (Optional)

**Location**: `service-mesh/istio/`

- Automatic mTLS between services
- Traffic management (canary, blue-green)
- Circuit breaking and retry policies
- Distributed tracing with Zipkin
- Service-to-service authorization

## Quick Start

### 1. Clone and Configure

```bash
cd /workspaces/llm-analytics-hub/infrastructure/k8s/core

# Review and update configuration files
# - Update email in cert-manager/cluster-issuers.yaml
# - Update domain names in ingress/rate-limit-middleware.yaml
# - Update Slack/PagerDuty webhooks in monitoring/prometheus/helm-values.yaml
```

### 2. Deploy All Components

```bash
./deploy.sh
```

This script will:
1. Create namespaces
2. Deploy storage classes
3. Install cert-manager
4. Install NGINX Ingress
5. Deploy Prometheus stack
6. Deploy Loki logging
7. Install autoscaling components
8. Apply security policies
9. Optionally deploy Istio

### 3. Verify Deployment

```bash
# Check all pods are running
kubectl get pods -A

# Check ingress controller
kubectl get svc -n ingress-nginx

# Check monitoring
kubectl get pods -n monitoring

# Check logging
kubectl get pods -n logging
```

## Detailed Setup

### Manual Component Installation

If you prefer to install components individually:

#### 1. Namespaces

```bash
kubectl apply -f namespaces.yaml
```

#### 2. Storage Classes

```bash
kubectl apply -f storage/storage-classes.yaml
```

#### 3. cert-manager

```bash
helm repo add jetstack https://charts.jetstack.io
helm repo update

helm install cert-manager jetstack/cert-manager \
  --namespace cert-manager \
  --version v1.14.0 \
  --values cert-manager/helm-values.yaml \
  --wait

kubectl apply -f cert-manager/cluster-issuers.yaml
```

#### 4. NGINX Ingress

```bash
helm repo add ingress-nginx https://kubernetes.github.io/ingress-nginx
helm repo update

helm install ingress-nginx ingress-nginx/ingress-nginx \
  --namespace ingress-nginx \
  --version 4.10.0 \
  --values ingress/helm-values.yaml \
  --wait

kubectl apply -f ingress/rate-limit-middleware.yaml
```

#### 5. Monitoring Stack

```bash
helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
helm repo update

helm install kube-prometheus-stack prometheus-community/kube-prometheus-stack \
  --namespace monitoring \
  --version 56.0.0 \
  --values monitoring/prometheus/helm-values.yaml \
  --values monitoring/grafana/helm-values.yaml \
  --wait

kubectl apply -f monitoring/prometheus/service-monitors.yaml
kubectl apply -f monitoring/grafana/dashboards.yaml
```

#### 6. Logging Stack

```bash
helm repo add grafana https://grafana.github.io/helm-charts
helm repo update

helm install loki grafana/loki-distributed \
  --namespace logging \
  --version 0.78.0 \
  --values logging/loki/helm-values.yaml \
  --wait

helm install promtail grafana/promtail \
  --namespace logging \
  --version 6.15.0 \
  --values logging/promtail/helm-values.yaml \
  --wait

kubectl apply -f logging/log-retention-policy.yaml
```

#### 7. Autoscaling

```bash
# Install KEDA
helm repo add kedacore https://kedacore.github.io/charts
helm repo update

helm install keda kedacore/keda \
  --namespace keda \
  --create-namespace \
  --version 2.13.0 \
  --wait

# Apply autoscaling configs
kubectl apply -f autoscaling/hpa-configurations.yaml
kubectl apply -f autoscaling/vpa-configurations.yaml
kubectl apply -f autoscaling/keda-configurations.yaml
```

#### 8. Security

```bash
# Install OPA Gatekeeper
helm repo add gatekeeper https://open-policy-agent.github.io/gatekeeper/charts
helm repo update

helm install gatekeeper gatekeeper/gatekeeper \
  --namespace gatekeeper-system \
  --create-namespace \
  --version 3.15.0 \
  --wait

# Apply policies
kubectl apply -f security/pod-security-standards.yaml
kubectl apply -f security/network-policies.yaml
kubectl apply -f security/opa-gatekeeper.yaml
```

#### 9. Istio Service Mesh

```bash
# Install Istio
istioctl install -f service-mesh/istio/istio-operator.yaml -y

# Apply traffic management
kubectl apply -f service-mesh/istio/traffic-management.yaml

# Enable sidecar injection
kubectl label namespace llm-analytics istio-injection=enabled
```

## Configuration

### DNS Configuration

Update your DNS provider to point these domains to the LoadBalancer IP:

```
# Get LoadBalancer IP
kubectl get svc ingress-nginx-controller -n ingress-nginx

# Add DNS A records:
grafana.llm-analytics.io       -> <LoadBalancer-IP>
prometheus.llm-analytics.io    -> <LoadBalancer-IP>
alertmanager.llm-analytics.io  -> <LoadBalancer-IP>
loki.llm-analytics.io          -> <LoadBalancer-IP>
api.llm-analytics.io           -> <LoadBalancer-IP>
llm-analytics.io               -> <LoadBalancer-IP>
```

### TLS Certificates

The system uses Let's Encrypt for automatic certificate provisioning.

**For Production**:
1. Update email in `cert-manager/cluster-issuers.yaml`
2. Configure DNS-01 challenge (recommended for wildcard certs)
3. Set up cloud provider credentials

**AWS Route53 Example**:
```yaml
# In cluster-issuers.yaml
dns01:
  route53:
    region: us-east-1
    # Use IRSA (recommended)
    # OR provide credentials via secret
```

### Monitoring Configuration

**Grafana Access**:
- URL: `https://grafana.llm-analytics.io`
- Default user: `admin`
- Default password: `changeme` (CHANGE THIS!)

**Update Alerting**:
Edit `monitoring/prometheus/helm-values.yaml`:
```yaml
alertmanager:
  config:
    global:
      slack_api_url: 'https://hooks.slack.com/services/YOUR/WEBHOOK'
    receivers:
    - name: 'pagerduty'
      pagerduty_configs:
      - service_key: 'YOUR_PAGERDUTY_KEY'
```

### Storage Configuration

Choose appropriate storage class based on workload:

- **Databases** (TimescaleDB, Redis): `fast-ssd`
- **Application logs**: `standard-ssd`
- **Backups**: `standard-hdd`
- **Shared configs**: `nfs-storage`

## Monitoring and Observability

### Pre-configured Dashboards

Grafana includes dashboards for:

1. **Kubernetes Cluster Overview**
   - Node CPU/Memory usage
   - Pod status by namespace
   - Storage utilization

2. **LLM Analytics API**
   - Request rate and latency
   - Error rate
   - Database connection pool

3. **Infrastructure Components**
   - Kafka: messages/sec, consumer lag
   - Redis: operations/sec, hit rate
   - TimescaleDB: query performance
   - NGINX Ingress: request rate, SSL expiry

### Alert Rules

Key alerts configured:

- **Critical**:
  - Pod crash looping
  - High error rate (>5%)
  - Certificate expiring (<7 days)
  - Database connection pool exhausted

- **Warning**:
  - High memory usage (>90%)
  - High CPU usage (>80%)
  - Persistent volume almost full (>85%)
  - Kafka consumer lag growing

### Accessing Logs

Via Grafana Explore:
1. Navigate to Grafana → Explore
2. Select Loki datasource
3. Query examples:
   ```
   {namespace="llm-analytics", app="llm-analytics-api"}
   {namespace="llm-analytics"} |= "error"
   {app="kafka"} | json | line_format "{{.message}}"
   ```

Via kubectl:
```bash
# Get logs for specific pod
kubectl logs -n llm-analytics <pod-name> -f

# Get logs for all pods with label
kubectl logs -n llm-analytics -l app=llm-analytics-api -f --tail=100
```

## Security

### Best Practices

1. **Change Default Passwords**
   ```bash
   # Grafana admin password
   kubectl create secret generic grafana-admin \
     --from-literal=admin-user=admin \
     --from-literal=admin-password=<NEW_PASSWORD> \
     -n monitoring
   ```

2. **Enable RBAC**
   - Use least-privilege service accounts
   - Restrict cluster-admin access
   - Regular audit of permissions

3. **Network Policies**
   - All namespaces have default deny-all
   - Explicit allow rules per service
   - Review and update regularly

4. **Pod Security**
   - Enforce restricted PSS for applications
   - No privileged containers
   - Read-only root filesystem
   - Drop all capabilities

5. **Secrets Management**
   - Use external secret managers (AWS Secrets Manager, Vault)
   - Never commit secrets to git
   - Rotate credentials regularly

### Security Scanning

```bash
# Scan images for vulnerabilities
trivy image <image-name>

# Check cluster security
kube-bench run --targets master,node

# Audit cluster policies
kubectl get psp,networkpolicies,constrainttemplates -A
```

## Troubleshooting

### Common Issues

#### Pods Stuck in Pending

```bash
# Check events
kubectl describe pod <pod-name> -n <namespace>

# Check node resources
kubectl top nodes

# Check PVC status
kubectl get pvc -A
```

#### Certificate Not Issuing

```bash
# Check cert-manager logs
kubectl logs -n cert-manager -l app=cert-manager

# Check certificate status
kubectl get certificate -A
kubectl describe certificate <cert-name> -n <namespace>

# Check challenge status
kubectl get challenges -A
```

#### Ingress Not Working

```bash
# Check ingress controller logs
kubectl logs -n ingress-nginx -l app.kubernetes.io/component=controller

# Check ingress status
kubectl get ingress -A
kubectl describe ingress <ingress-name> -n <namespace>

# Test backend service
kubectl run test --rm -it --image=curlimages/curl -- sh
curl http://<service-name>.<namespace>.svc:8080
```

#### High Memory Usage

```bash
# Check pod memory
kubectl top pods -A --sort-by=memory

# Check for memory leaks
kubectl logs <pod-name> -n <namespace> --previous

# Adjust VPA recommendations
kubectl get vpa -A
```

## Maintenance

### Regular Tasks

#### Daily
- Check pod status: `kubectl get pods -A`
- Review critical alerts in AlertManager
- Check disk usage: `kubectl top nodes`

#### Weekly
- Review Grafana dashboards
- Check certificate expiration
- Update Docker images (security patches)

#### Monthly
- Review and update resource requests/limits
- Analyze cost optimization opportunities
- Test disaster recovery procedures
- Update Helm charts to latest versions

### Upgrading Components

#### Kubernetes Version
```bash
# Check current version
kubectl version

# Plan upgrade (cloud-specific)
# AWS: eksctl upgrade cluster
# GCP: gcloud container clusters upgrade
# Azure: az aks upgrade
```

#### Helm Charts
```bash
# Update Helm repos
helm repo update

# Check available versions
helm search repo <chart-name> --versions

# Upgrade with values
helm upgrade <release-name> <chart-name> \
  --version <new-version> \
  --values <values-file> \
  --namespace <namespace>
```

### Backup and Recovery

#### Backup etcd (for self-managed clusters)
```bash
ETCDCTL_API=3 etcdctl snapshot save snapshot.db \
  --endpoints=https://127.0.0.1:2379 \
  --cacert=/etc/kubernetes/pki/etcd/ca.crt \
  --cert=/etc/kubernetes/pki/etcd/server.crt \
  --key=/etc/kubernetes/pki/etcd/server.key
```

#### Backup Persistent Volumes
```bash
# Using volume snapshots
kubectl get volumesnapshotclass
kubectl create -f volume-snapshot.yaml

# Or use Velero
velero backup create <backup-name> --include-namespaces llm-analytics
```

### Disaster Recovery

1. **Document Recovery Procedures**
2. **Test Regularly** (quarterly)
3. **Maintain Off-Site Backups**
4. **Have Runbooks Ready**

## Support and Contributing

For issues and questions:
- GitHub Issues: https://github.com/llm-analytics/llm-analytics-hub/issues
- Documentation: https://docs.llm-analytics.io
- Slack: #platform-team

## License

See LICENSE file in repository root.
