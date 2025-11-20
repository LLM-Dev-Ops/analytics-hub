# GCP GKE Infrastructure for LLM Analytics Hub

This Terraform configuration deploys a production-ready Google Kubernetes Engine (GKE) cluster on Google Cloud Platform (GCP) for the LLM Analytics Hub.

## Table of Contents

- [Architecture Overview](#architecture-overview)
- [Prerequisites](#prerequisites)
- [Features](#features)
- [Quick Start](#quick-start)
- [Configuration](#configuration)
- [Deployment](#deployment)
- [Post-Deployment](#post-deployment)
- [Kubernetes Setup](#kubernetes-setup)
- [Monitoring & Logging](#monitoring--logging)
- [Security](#security)
- [Cost Optimization](#cost-optimization)
- [Disaster Recovery](#disaster-recovery)
- [Troubleshooting](#troubleshooting)
- [Cleanup](#cleanup)

## Architecture Overview

This infrastructure creates:

```
┌─────────────────────────────────────────────────────────────────┐
│                        GCP Project                               │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │                    VPC Network                             │ │
│  │  ┌──────────────────────────────────────────────────────┐ │ │
│  │  │  Subnet (10.0.0.0/20)                                │ │ │
│  │  │    - Pods: 10.4.0.0/14                               │ │ │
│  │  │    - Services: 10.8.0.0/20                           │ │ │
│  │  └──────────────────────────────────────────────────────┘ │ │
│  │                                                            │ │
│  │  ┌──────────────────────────────────────────────────────┐ │ │
│  │  │  GKE Cluster (Regional - 3 Zones)                    │ │ │
│  │  │                                                        │ │ │
│  │  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  │ │ │
│  │  │  │ System Pool │  │  App Pool   │  │   DB Pool   │  │ │ │
│  │  │  │  2-4 nodes  │  │  3-10 nodes │  │  3-6 nodes  │  │ │ │
│  │  │  │ n2-standard │  │ n2-standard │  │ n2-highmem  │  │ │ │
│  │  │  │     -4      │  │     -8      │  │     -8      │  │ │ │
│  │  │  └─────────────┘  └─────────────┘  └─────────────┘  │ │ │
│  │  │                                                        │ │ │
│  │  │  ┌─────────────┐                                      │ │ │
│  │  │  │  Spot Pool  │                                      │ │ │
│  │  │  │ 0-10 nodes  │                                      │ │ │
│  │  │  │ n2-standard │                                      │ │ │
│  │  │  │     -4      │                                      │ │ │
│  │  │  └─────────────┘                                      │ │ │
│  │  └──────────────────────────────────────────────────────┘ │ │
│  │                                                            │ │
│  │  ┌──────────────────────────────────────────────────────┐ │ │
│  │  │  Cloud NAT                                           │ │ │
│  │  └──────────────────────────────────────────────────────┘ │ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                   │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │  Storage                                                   │ │
│  │    - GCS Buckets (app-data, logs, backups, ml-artifacts) │ │
│  │    - Artifact Registry (Docker, Helm)                    │ │
│  │    - Filestore (Shared storage)                          │ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                   │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │  Monitoring & Logging                                      │ │
│  │    - Cloud Operations (Stackdriver)                       │ │
│  │    - Managed Prometheus                                   │ │
│  │    - BigQuery (Cost allocation)                           │ │
│  └────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

## Prerequisites

### Required Tools

1. **Terraform** >= 1.6.0
   ```bash
   terraform version
   ```

2. **Google Cloud SDK (gcloud)** >= 400.0.0
   ```bash
   gcloud version
   ```

3. **kubectl** >= 1.28.0
   ```bash
   kubectl version --client
   ```

4. **helm** >= 3.12.0 (optional, for Kubernetes deployments)
   ```bash
   helm version
   ```

### GCP Account Setup

1. **GCP Project**
   - Create a new GCP project or use an existing one
   - Enable billing on the project

2. **Authentication**
   ```bash
   # Login to GCP
   gcloud auth login

   # Set default project
   gcloud config set project YOUR_PROJECT_ID

   # Create application default credentials
   gcloud auth application-default login
   ```

3. **Required IAM Permissions**

   Your user or service account needs the following roles:
   - `roles/owner` (for initial setup) OR the following granular roles:
   - `roles/compute.admin`
   - `roles/container.admin`
   - `roles/iam.serviceAccountAdmin`
   - `roles/resourcemanager.projectIamAdmin`
   - `roles/storage.admin`
   - `roles/dns.admin`

4. **Enable Required APIs**
   ```bash
   gcloud services enable \
     compute.googleapis.com \
     container.googleapis.com \
     cloudresourcemanager.googleapis.com \
     iam.googleapis.com \
     logging.googleapis.com \
     monitoring.googleapis.com
   ```

5. **Terraform State Bucket**
   ```bash
   # Create a GCS bucket for Terraform state
   gsutil mb -p YOUR_PROJECT_ID -l us-central1 gs://llm-analytics-hub-terraform-state

   # Enable versioning
   gsutil versioning set on gs://llm-analytics-hub-terraform-state
   ```

## Features

### Network & Security
- ✅ Private GKE cluster (nodes without public IPs)
- ✅ VPC-native cluster with alias IPs
- ✅ Cloud NAT for outbound internet access
- ✅ Firewall rules with least privilege
- ✅ Network policies enabled
- ✅ Private Google Access enabled

### GKE Cluster
- ✅ Regional cluster (high availability across 3 zones)
- ✅ GKE 1.28+ with stable release channel
- ✅ Workload Identity enabled
- ✅ Binary Authorization for image signing
- ✅ Shielded GKE nodes
- ✅ Advanced datapath (Dataplane V2)
- ✅ Gateway API support

### Node Pools
- ✅ **System Pool**: Dedicated for system components (2-4 nodes, n2-standard-4)
- ✅ **Application Pool**: For application workloads (3-10 nodes, n2-standard-8)
- ✅ **Database Pool**: For stateful workloads (3-6 nodes, n2-highmem-8, SSD)
- ✅ **Spot Pool**: For cost-optimized batch workloads (0-10 nodes, preemptible)

### IAM & Service Accounts
- ✅ Dedicated service accounts with minimal permissions
- ✅ Workload Identity for pod-level IAM
- ✅ Service accounts for external-dns, cert-manager, monitoring
- ✅ Custom IAM roles for fine-grained access

### Storage
- ✅ GCS buckets (app-data, logs, backups, ml-artifacts)
- ✅ Artifact Registry (Docker, Helm)
- ✅ Filestore for shared storage (production only)
- ✅ Regional persistent disks for HA
- ✅ Automated snapshot schedules

### Monitoring & Logging
- ✅ Cloud Operations (formerly Stackdriver)
- ✅ Managed Prometheus
- ✅ Cloud Trace integration
- ✅ BigQuery cost allocation
- ✅ Pub/Sub notifications for cluster events

### Backup & DR
- ✅ GKE Backup for workload protection
- ✅ Automated backup plans (daily)
- ✅ KMS encryption for backups
- ✅ Cross-region snapshot replication

## Quick Start

### 1. Clone and Navigate

```bash
cd /workspaces/llm-analytics-hub/infrastructure/terraform/gcp
```

### 2. Configure Variables

```bash
# Copy example variables file
cp terraform.tfvars.example terraform.tfvars

# Edit with your values
vim terraform.tfvars
```

**Minimum required variables:**
```hcl
project_id  = "your-gcp-project-id"
region      = "us-central1"
environment = "prod"
```

### 3. Initialize Terraform

```bash
terraform init
```

### 4. Review Plan

```bash
terraform plan
```

### 5. Deploy Infrastructure

```bash
terraform apply
```

**Deployment takes approximately 15-20 minutes.**

### 6. Configure kubectl

```bash
# Get credentials
gcloud container clusters get-credentials $(terraform output -raw cluster_name) \
  --region $(terraform output -raw region) \
  --project $(terraform output -raw project_id)

# Verify connection
kubectl get nodes
```

## Configuration

### Environment-Specific Configurations

#### Production (Recommended)

```hcl
environment = "prod"

system_pool_config = {
  machine_type = "n2-standard-4"
  min_nodes    = 2
  max_nodes    = 4
}

app_pool_config = {
  machine_type = "n2-standard-8"
  min_nodes    = 3
  max_nodes    = 10
}

db_pool_config = {
  machine_type = "n2-highmem-8"
  min_nodes    = 3
  max_nodes    = 6
}

enable_backup_restore  = true
enable_cost_allocation = true
```

#### Staging

```hcl
environment = "staging"

system_pool_config = {
  machine_type = "n2-standard-2"
  min_nodes    = 1
  max_nodes    = 3
}

app_pool_config = {
  machine_type = "n2-standard-4"
  min_nodes    = 2
  max_nodes    = 6
}

db_pool_config = {
  machine_type = "n2-highmem-4"
  min_nodes    = 2
  max_nodes    = 4
}

backup_plan_retention_days = 14
```

#### Development

```hcl
environment = "dev"

system_pool_config = {
  machine_type = "n2-standard-2"
  min_nodes    = 1
  max_nodes    = 2
}

app_pool_config = {
  machine_type = "n2-standard-4"
  min_nodes    = 1
  max_nodes    = 3
  spot         = true  # Use spot instances for cost savings
}

db_pool_config = {
  machine_type = "n2-highmem-4"
  min_nodes    = 1
  max_nodes    = 2
}

enable_backup_restore  = false
enable_cost_allocation = false
```

### Network Configuration

#### Custom CIDR Ranges

```hcl
subnet_cidr         = "10.0.0.0/20"     # 4096 IPs
pods_cidr_range     = "10.4.0.0/14"     # 262,144 IPs
services_cidr_range = "10.8.0.0/20"     # 4096 IPs
master_ipv4_cidr_block = "172.16.0.0/28" # 16 IPs
```

#### Master Authorized Networks

```hcl
master_authorized_networks = [
  {
    cidr_block   = "203.0.113.0/24"
    display_name = "Office Network"
  },
  {
    cidr_block   = "198.51.100.0/24"
    display_name = "VPN Gateway"
  }
]
```

### Security Configuration

#### Workload Identity

Workload Identity allows Kubernetes service accounts to act as GCP service accounts:

```hcl
enable_workload_identity = true
```

To use Workload Identity in your pods:

```yaml
apiVersion: v1
kind: ServiceAccount
metadata:
  name: app-service-account
  namespace: llm-analytics
  annotations:
    iam.gke.io/gcp-service-account: prod-app-workload@PROJECT_ID.iam.gserviceaccount.com
```

#### Binary Authorization

Enable image signing and validation:

```hcl
enable_binary_authorization = true
```

## Deployment

### Step-by-Step Deployment

#### 1. Pre-Deployment Checklist

- [ ] GCP project created and billing enabled
- [ ] Required APIs enabled
- [ ] Terraform state bucket created
- [ ] Variables configured in `terraform.tfvars`
- [ ] Network CIDR ranges don't conflict with existing networks
- [ ] Master authorized networks configured (if needed)

#### 2. Validate Configuration

```bash
# Validate Terraform syntax
terraform validate

# Format configuration files
terraform fmt

# Check for security issues (optional)
# Install: https://github.com/aquasecurity/tfsec
tfsec .
```

#### 3. Plan Deployment

```bash
# Generate and review execution plan
terraform plan -out=tfplan

# Review the plan carefully
# Check resource counts, changes, and costs
```

#### 4. Deploy Infrastructure

```bash
# Apply the plan
terraform apply tfplan

# Or apply directly with approval
terraform apply

# Type 'yes' when prompted
```

#### 5. Verify Deployment

```bash
# Check Terraform outputs
terraform output

# Get cluster credentials
gcloud container clusters get-credentials $(terraform output -raw cluster_name) \
  --region $(terraform output -raw region) \
  --project $(terraform output -raw project_id)

# Verify nodes are running
kubectl get nodes

# Check node pools
kubectl get nodes --label-columns=node-pool,workload-type

# Verify system pods
kubectl get pods -n kube-system
```

### Deployment Time Estimates

| Component | Estimated Time |
|-----------|---------------|
| Network & Subnets | 2-3 minutes |
| GKE Control Plane | 5-7 minutes |
| Node Pools | 5-8 minutes |
| IAM & Service Accounts | 1-2 minutes |
| Storage Resources | 2-3 minutes |
| **Total** | **15-20 minutes** |

## Post-Deployment

### 1. Install Essential Kubernetes Components

Create a file `k8s-essentials.sh`:

```bash
#!/bin/bash
# Install essential Kubernetes components

# Add Helm repositories
helm repo add ingress-nginx https://kubernetes.github.io/ingress-nginx
helm repo add jetstack https://charts.jetstack.io
helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
helm repo add bitnami https://charts.bitnami.com/bitnami
helm repo update

# Create namespaces
kubectl create namespace ingress-nginx
kubectl create namespace cert-manager
kubectl create namespace monitoring
kubectl create namespace llm-analytics

# Install NGINX Ingress Controller
helm install ingress-nginx ingress-nginx/ingress-nginx \
  --namespace ingress-nginx \
  --set controller.service.type=LoadBalancer \
  --set controller.metrics.enabled=true

# Install Cert Manager
helm install cert-manager jetstack/cert-manager \
  --namespace cert-manager \
  --set installCRDs=true

# Install Prometheus & Grafana
helm install kube-prometheus-stack prometheus-community/kube-prometheus-stack \
  --namespace monitoring \
  --set prometheus.prometheusSpec.serviceMonitorSelectorNilUsesHelmValues=false

echo "Essential components installed!"
```

```bash
chmod +x k8s-essentials.sh
./k8s-essentials.sh
```

### 2. Configure Workload Identity

Create Kubernetes service accounts and bind them to GCP service accounts:

```bash
# Application workload
kubectl create serviceaccount app-service-account -n llm-analytics

kubectl annotate serviceaccount app-service-account \
  -n llm-analytics \
  iam.gke.io/gcp-service-account=$(terraform output -raw app_workload_service_account_email)

# Database workload
kubectl create serviceaccount db-service-account -n llm-analytics

kubectl annotate serviceaccount db-service-account \
  -n llm-analytics \
  iam.gke.io/gcp-service-account=$(terraform output -raw db_workload_service_account_email)

# Monitoring workload
kubectl create serviceaccount prometheus-service-account -n monitoring

kubectl annotate serviceaccount prometheus-service-account \
  -n monitoring \
  iam.gke.io/gcp-service-account=$(terraform output -raw monitoring_workload_service_account_email)
```

### 3. Configure Storage Classes

Create `storage-classes.yaml`:

```yaml
# Standard persistent disk
apiVersion: storage.k8s.io/v1
kind: StorageClass
metadata:
  name: pd-standard
provisioner: pd.csi.storage.gke.io
parameters:
  type: pd-standard
  replication-type: none
volumeBindingMode: WaitForFirstConsumer
allowVolumeExpansion: true
---
# Balanced persistent disk
apiVersion: storage.k8s.io/v1
kind: StorageClass
metadata:
  name: pd-balanced
provisioner: pd.csi.storage.gke.io
parameters:
  type: pd-balanced
  replication-type: none
volumeBindingMode: WaitForFirstConsumer
allowVolumeExpansion: true
---
# SSD persistent disk
apiVersion: storage.k8s.io/v1
kind: StorageClass
metadata:
  name: pd-ssd
provisioner: pd.csi.storage.gke.io
parameters:
  type: pd-ssd
  replication-type: none
volumeBindingMode: WaitForFirstConsumer
allowVolumeExpansion: true
---
# Regional persistent disk (HA)
apiVersion: storage.k8s.io/v1
kind: StorageClass
metadata:
  name: pd-ssd-regional
provisioner: pd.csi.storage.gke.io
parameters:
  type: pd-ssd
  replication-type: regional-pd
volumeBindingMode: WaitForFirstConsumer
allowVolumeExpansion: true
```

```bash
kubectl apply -f storage-classes.yaml
```

### 4. Set Up Network Policies

Create `network-policies.yaml`:

```yaml
# Default deny all ingress
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: default-deny-ingress
  namespace: llm-analytics
spec:
  podSelector: {}
  policyTypes:
  - Ingress
---
# Allow ingress from same namespace
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: allow-same-namespace
  namespace: llm-analytics
spec:
  podSelector: {}
  policyTypes:
  - Ingress
  ingress:
  - from:
    - podSelector: {}
---
# Allow ingress from ingress controller
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: allow-from-ingress
  namespace: llm-analytics
spec:
  podSelector:
    matchLabels:
      app.kubernetes.io/exposed: "true"
  policyTypes:
  - Ingress
  ingress:
  - from:
    - namespaceSelector:
        matchLabels:
          name: ingress-nginx
```

```bash
kubectl apply -f network-policies.yaml
```

## Kubernetes Setup

### Pod Security Standards

Apply pod security standards:

```yaml
apiVersion: v1
kind: Namespace
metadata:
  name: llm-analytics
  labels:
    pod-security.kubernetes.io/enforce: restricted
    pod-security.kubernetes.io/audit: restricted
    pod-security.kubernetes.io/warn: restricted
```

### Resource Quotas

```yaml
apiVersion: v1
kind: ResourceQuota
metadata:
  name: llm-analytics-quota
  namespace: llm-analytics
spec:
  hard:
    requests.cpu: "100"
    requests.memory: 200Gi
    limits.cpu: "200"
    limits.memory: 400Gi
    persistentvolumeclaims: "20"
```

### Limit Ranges

```yaml
apiVersion: v1
kind: LimitRange
metadata:
  name: llm-analytics-limits
  namespace: llm-analytics
spec:
  limits:
  - max:
      cpu: "4"
      memory: 16Gi
    min:
      cpu: "100m"
      memory: 128Mi
    type: Container
  - max:
      cpu: "8"
      memory: 32Gi
    min:
      cpu: "200m"
      memory: 256Mi
    type: Pod
```

## Monitoring & Logging

### Access Cloud Console

- **GKE Cluster**: https://console.cloud.google.com/kubernetes/list
- **Cloud Operations**: https://console.cloud.google.com/logs
- **Monitoring**: https://console.cloud.google.com/monitoring

### View Cluster Metrics

```bash
# Get cluster info
gcloud container clusters describe $(terraform output -raw cluster_name) \
  --region $(terraform output -raw region)

# View node pool autoscaling events
gcloud logging read "resource.type=k8s_cluster AND log_name=projects/$(terraform output -raw project_id)/logs/events" \
  --limit 50 \
  --format json

# Query BigQuery cost data (if cost allocation enabled)
bq query --use_legacy_sql=false '
SELECT
  namespace,
  SUM(cost) as total_cost
FROM `PROJECT_ID.prod_gke_usage.gke_cluster_resource_usage`
WHERE DATE(usage_start_time) >= DATE_SUB(CURRENT_DATE(), INTERVAL 7 DAY)
GROUP BY namespace
ORDER BY total_cost DESC
'
```

### Prometheus Queries

Access Prometheus:

```bash
kubectl port-forward -n monitoring svc/kube-prometheus-stack-prometheus 9090:9090
```

Open http://localhost:9090

Useful queries:
- Node CPU usage: `100 - (avg by (instance) (irate(node_cpu_seconds_total{mode="idle"}[5m])) * 100)`
- Pod memory usage: `sum(container_memory_usage_bytes{namespace="llm-analytics"}) by (pod)`
- Network I/O: `rate(container_network_transmit_bytes_total[5m])`

### Grafana Dashboards

Access Grafana:

```bash
kubectl port-forward -n monitoring svc/kube-prometheus-stack-grafana 3000:80
```

Default credentials:
- Username: `admin`
- Password: Get with `kubectl get secret -n monitoring kube-prometheus-stack-grafana -o jsonpath="{.data.admin-password}" | base64 -d`

## Security

### Image Scanning

Enable vulnerability scanning in Artifact Registry:

```bash
gcloud artifacts repositories describe $(terraform output -raw docker_registry_url | cut -d'/' -f2) \
  --location=$(terraform output -raw region) \
  --format="get(scanConfig)"
```

### Pod Security Policies

Apply restrictive pod security policies for production workloads.

### Secrets Management

Use Google Secret Manager:

```bash
# Create a secret
echo -n "my-secret-value" | gcloud secrets create my-secret --data-file=-

# Grant access to workload identity
gcloud secrets add-iam-policy-binding my-secret \
  --member="serviceAccount:$(terraform output -raw secrets_workload_service_account_email)" \
  --role="roles/secretmanager.secretAccessor"
```

### Network Security

- All nodes are private (no external IPs)
- Master endpoint can be private (set `enable_private_endpoint = true`)
- Network policies enabled
- Firewall rules follow least privilege

## Cost Optimization

### Cost Breakdown (Estimated Monthly)

Production configuration (us-central1):

| Component | Resources | Monthly Cost |
|-----------|-----------|--------------|
| GKE Management Fee | 1 cluster | $73 |
| System Pool | 2-4 n2-standard-4 | $300-$600 |
| App Pool | 3-10 n2-standard-8 | $900-$3,000 |
| DB Pool | 3-6 n2-highmem-8 | $1,200-$2,400 |
| Spot Pool | 0-10 n2-standard-4 | $0-$300 |
| Persistent Disks | ~2 TB | $200 |
| Load Balancers | 2-3 | $50-$75 |
| **Estimated Total** | | **$2,723-$6,648/mo** |

### Cost Savings Tips

1. **Use Spot Instances**: Enable for non-critical workloads
   ```hcl
   preemptible_pool_config = {
     spot = true
   }
   ```

2. **Right-size Node Pools**: Start small and scale up
   ```hcl
   app_pool_config = {
     min_nodes = 1  # Start with minimum
     max_nodes = 10
   }
   ```

3. **Use Committed Use Discounts**: Purchase 1 or 3-year commitments for 37-57% savings

4. **Enable Cluster Autoscaling**: Only pay for what you use

5. **Set Resource Requests/Limits**: Prevent over-provisioning

6. **Use Development Environment for Testing**: Much cheaper configuration

### Monitor Costs

```bash
# View current month's costs
gcloud billing accounts list

# Export billing data to BigQuery
# Then query cost breakdown by label
```

## Disaster Recovery

### Backup Strategy

1. **GKE Backup**: Automated daily backups (configured in Terraform)

2. **Manual Backup**:
   ```bash
   # Backup entire cluster config
   kubectl get all --all-namespaces -o yaml > cluster-backup.yaml

   # Backup specific namespace
   kubectl get all -n llm-analytics -o yaml > llm-analytics-backup.yaml
   ```

3. **etcd Snapshots**: Managed automatically by GKE

### Restore Procedures

```bash
# Restore from GKE Backup
gcloud container backup-restore restores create RESTORE_NAME \
  --location=REGION \
  --backup=BACKUP_NAME \
  --cluster=projects/PROJECT_ID/locations/REGION/clusters/CLUSTER_NAME
```

### Multi-Region DR

For critical production:

1. Deploy to multiple regions
2. Use Global Load Balancer
3. Set up Cloud DNS for failover
4. Replicate data across regions

## Troubleshooting

### Common Issues

#### 1. Cluster Creation Fails

**Error**: "Insufficient regional quota"

**Solution**:
```bash
# Request quota increase
gcloud compute regions describe us-central1 | grep quota

# Request increase in Cloud Console:
# IAM & Admin > Quotas
```

#### 2. Nodes Not Ready

```bash
# Check node status
kubectl get nodes
kubectl describe node NODE_NAME

# Check node pool status
gcloud container node-pools describe POOL_NAME \
  --cluster=CLUSTER_NAME \
  --region=REGION
```

#### 3. Pods Can't Pull Images

**Solution**: Verify Artifact Registry permissions

```bash
# Check service account permissions
gcloud projects get-iam-policy PROJECT_ID \
  --flatten="bindings[].members" \
  --filter="bindings.members:serviceAccount:prod-gke-nodes@*"
```

#### 4. Network Connectivity Issues

```bash
# Test DNS resolution
kubectl run -it --rm debug --image=nicolaka/netshoot --restart=Never -- nslookup kubernetes.default

# Test network policies
kubectl run -it --rm debug --image=nicolaka/netshoot --restart=Never -- curl http://SERVICE_NAME
```

### Debugging Commands

```bash
# View cluster events
kubectl get events --all-namespaces --sort-by=.metadata.creationTimestamp

# Check node logs
gcloud logging read "resource.type=k8s_node" --limit 50

# View pod logs
kubectl logs -f POD_NAME -n NAMESPACE

# Execute commands in pod
kubectl exec -it POD_NAME -n NAMESPACE -- /bin/bash

# Port forward for debugging
kubectl port-forward POD_NAME LOCAL_PORT:POD_PORT
```

### Support Resources

- GKE Documentation: https://cloud.google.com/kubernetes-engine/docs
- GCP Support: https://cloud.google.com/support
- Community: https://googlecloudplatform.slack.com

## Cleanup

### Destroy Infrastructure

**Warning**: This will delete all resources including data. Ensure backups are taken.

```bash
# Review what will be destroyed
terraform plan -destroy

# Destroy all resources
terraform destroy

# Type 'yes' when prompted
```

### Manual Cleanup (if needed)

```bash
# Delete GKE cluster
gcloud container clusters delete $(terraform output -raw cluster_name) \
  --region $(terraform output -raw region)

# Delete network
gcloud compute networks delete $(terraform output -raw network_name)

# Delete GCS buckets
gsutil -m rm -r gs://$(terraform output -raw app_data_bucket_name)
gsutil -m rm -r gs://$(terraform output -raw logs_bucket_name)
gsutil -m rm -r gs://$(terraform output -raw backups_bucket_name)
```

### Cost After Cleanup

After running `terraform destroy`:
- All compute resources will be deleted
- Persistent data in GCS may remain (if force_destroy=false)
- Snapshots may incur minimal storage costs

## Additional Resources

### Terraform Documentation
- [Google Provider](https://registry.terraform.io/providers/hashicorp/google/latest/docs)
- [GKE Resources](https://registry.terraform.io/providers/hashicorp/google/latest/docs/resources/container_cluster)

### GCP Documentation
- [GKE Best Practices](https://cloud.google.com/kubernetes-engine/docs/best-practices)
- [Workload Identity](https://cloud.google.com/kubernetes-engine/docs/how-to/workload-identity)
- [GKE Security Hardening](https://cloud.google.com/kubernetes-engine/docs/how-to/hardening-your-cluster)

### LLM Analytics Hub
- Main Repository: `/workspaces/llm-analytics-hub`
- Documentation: `README.md`

## License

Apache 2.0 - See LICENSE file

## Support

For issues and questions:
- Create an issue in the repository
- Contact: platform-team@example.com
