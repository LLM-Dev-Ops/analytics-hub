# LLM Analytics Hub - AWS EKS Infrastructure

Production-ready AWS EKS infrastructure for the LLM Analytics Hub platform using Terraform.

## Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [Prerequisites](#prerequisites)
- [Infrastructure Components](#infrastructure-components)
- [Quick Start](#quick-start)
- [Deployment Guide](#deployment-guide)
- [Configuration](#configuration)
- [Node Groups](#node-groups)
- [Security](#security)
- [Monitoring](#monitoring)
- [Cost Optimization](#cost-optimization)
- [Maintenance](#maintenance)
- [Troubleshooting](#troubleshooting)
- [Additional Resources](#additional-resources)

## Overview

This Terraform configuration creates a production-grade Amazon EKS cluster with:

- **High Availability**: Multi-AZ deployment across 3 availability zones
- **Auto-scaling**: Cluster Autoscaler integration for dynamic scaling
- **Security**: IRSA (IAM Roles for Service Accounts), encryption at rest, VPC endpoints
- **Monitoring**: CloudWatch Container Insights, VPC Flow Logs, control plane logging
- **Cost Optimization**: Spot instances for non-critical workloads, right-sized node groups
- **Compliance**: Pod security policies, audit logging, encrypted volumes

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         AWS Region (us-east-1)                  │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │                    VPC (10.0.0.0/16)                      │ │
│  │                                                           │ │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐   │ │
│  │  │   AZ-1a      │  │   AZ-1b      │  │   AZ-1c      │   │ │
│  │  ├──────────────┤  ├──────────────┤  ├──────────────┤   │ │
│  │  │ Public       │  │ Public       │  │ Public       │   │ │
│  │  │ 10.0.48.0/24 │  │ 10.0.49.0/24 │  │ 10.0.50.0/24 │   │ │
│  │  │   ┌────┐     │  │   ┌────┐     │  │   ┌────┐     │   │ │
│  │  │   │NAT │     │  │   │NAT │     │  │   │NAT │     │   │ │
│  │  │   └────┘     │  │   └────┘     │  │   └────┘     │   │ │
│  │  ├──────────────┤  ├──────────────┤  ├──────────────┤   │ │
│  │  │ Private      │  │ Private      │  │ Private      │   │ │
│  │  │ 10.0.0.0/20  │  │ 10.0.16.0/20 │  │ 10.0.32.0/20 │   │ │
│  │  │              │  │              │  │              │   │ │
│  │  │ ┌──────────┐ │  │ ┌──────────┐ │  │ ┌──────────┐ │   │ │
│  │  │ │ EKS      │ │  │ │ EKS      │ │  │ │ EKS      │ │   │ │
│  │  │ │ Nodes    │ │  │ │ Nodes    │ │  │ │ Nodes    │ │   │ │
│  │  │ └──────────┘ │  │ └──────────┘ │  │ └──────────┘ │   │ │
│  │  └──────────────┘  └──────────────┘  └──────────────┘   │ │
│  │                                                           │ │
│  │  VPC Endpoints: S3, ECR, EC2, Logs, STS, ELB            │ │
│  └───────────────────────────────────────────────────────────┘ │
│                                                                 │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │                    EKS Control Plane                      │ │
│  │          (Managed by AWS - Multi-AZ HA)                  │ │
│  └───────────────────────────────────────────────────────────┘ │
│                                                                 │
│  Node Groups:                                                  │
│  • System:       2-4 nodes  (m5.xlarge)    - ON_DEMAND        │
│  • Application:  3-10 nodes (m5.2xlarge)   - SPOT             │
│  • Database:     3-6 nodes  (r5.2xlarge)   - ON_DEMAND        │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## Prerequisites

### Required Tools

1. **Terraform** >= 1.6.0
   ```bash
   # Install via tfenv (recommended)
   tfenv install 1.6.0
   tfenv use 1.6.0

   # Or download from terraform.io
   wget https://releases.hashicorp.com/terraform/1.6.0/terraform_1.6.0_linux_amd64.zip
   unzip terraform_1.6.0_linux_amd64.zip
   sudo mv terraform /usr/local/bin/
   ```

2. **AWS CLI** >= 2.0
   ```bash
   curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip"
   unzip awscliv2.zip
   sudo ./aws/install
   ```

3. **kubectl** >= 1.28
   ```bash
   curl -LO "https://dl.k8s.io/release/$(curl -L -s https://dl.k8s.io/release/stable.txt)/bin/linux/amd64/kubectl"
   chmod +x kubectl
   sudo mv kubectl /usr/local/bin/
   ```

4. **helm** >= 3.0 (optional, for add-ons)
   ```bash
   curl https://raw.githubusercontent.com/helm/helm/main/scripts/get-helm-3 | bash
   ```

### AWS Permissions

Your AWS credentials must have permissions to create:
- VPC and networking resources (subnets, route tables, NAT gateways, etc.)
- EKS clusters and node groups
- IAM roles and policies
- Security groups
- KMS keys
- CloudWatch log groups
- S3 buckets (for Terraform state)
- DynamoDB tables (for Terraform state locking)

### AWS Account Setup

1. **Configure AWS Credentials**
   ```bash
   aws configure
   # Or use environment variables
   export AWS_ACCESS_KEY_ID="your-access-key"
   export AWS_SECRET_ACCESS_KEY="your-secret-key"
   export AWS_DEFAULT_REGION="us-east-1"
   ```

2. **Create S3 Bucket for Terraform State**
   ```bash
   aws s3api create-bucket \
     --bucket your-terraform-state-bucket \
     --region us-east-1

   aws s3api put-bucket-versioning \
     --bucket your-terraform-state-bucket \
     --versioning-configuration Status=Enabled

   aws s3api put-bucket-encryption \
     --bucket your-terraform-state-bucket \
     --server-side-encryption-configuration '{
       "Rules": [{
         "ApplyServerSideEncryptionByDefault": {
           "SSEAlgorithm": "AES256"
         }
       }]
     }'
   ```

3. **Create DynamoDB Table for State Locking**
   ```bash
   aws dynamodb create-table \
     --table-name terraform-state-lock \
     --attribute-definitions AttributeName=LockID,AttributeType=S \
     --key-schema AttributeName=LockID,KeyType=HASH \
     --billing-mode PAY_PER_REQUEST \
     --region us-east-1
   ```

## Infrastructure Components

### Networking
- **VPC**: 10.0.0.0/16 CIDR with DNS support
- **Subnets**:
  - 3 Public subnets (one per AZ)
  - 3 Private subnets (one per AZ)
  - 3 Intra subnets (optional, for databases)
- **NAT Gateways**: High availability NAT across all AZs
- **VPC Endpoints**: S3, ECR, EC2, Logs, STS, ELB, Autoscaling
- **Security Groups**: Least privilege access controls

### EKS Cluster
- **Version**: Kubernetes 1.28+
- **Endpoint Access**: Public + Private (configurable)
- **Encryption**: Envelope encryption with KMS
- **Logging**: API, Audit, Authenticator, Controller Manager, Scheduler
- **Add-ons**: VPC-CNI, CoreDNS, kube-proxy, EBS CSI Driver

### Node Groups

#### System Node Group
- **Purpose**: Critical system components (CoreDNS, kube-proxy, monitoring agents)
- **Instance Type**: m5.xlarge (4 vCPU, 16GB RAM)
- **Capacity Type**: ON_DEMAND
- **Scaling**: 2-4 nodes
- **Disk**: 100GB gp3

#### Application Node Group
- **Purpose**: Application workloads, API servers, web services
- **Instance Types**: m5.2xlarge, m5a.2xlarge, m5n.2xlarge (8 vCPU, 32GB RAM)
- **Capacity Type**: SPOT (cost-optimized)
- **Scaling**: 3-10 nodes
- **Disk**: 200GB gp3

#### Database Node Group
- **Purpose**: Stateful workloads (PostgreSQL, InfluxDB, Redis)
- **Instance Type**: r5.2xlarge (8 vCPU, 64GB RAM)
- **Capacity Type**: ON_DEMAND
- **Scaling**: 3-6 nodes
- **Disk**: 500GB gp3, 3000 IOPS
- **Taints**: `workload=database:NoSchedule`

### IAM Roles & IRSA

The infrastructure creates IAM roles for:
- **EKS Cluster Role**: Manages EKS control plane
- **Node IAM Role**: EC2 instances in node groups
- **EBS CSI Driver**: Persistent volume management
- **Cluster Autoscaler**: Auto-scaling nodes
- **AWS Load Balancer Controller**: ALB/NLB provisioning

### Security

- **Encryption at Rest**: KMS encryption for EKS secrets
- **Encryption in Transit**: TLS for all communications
- **Network Policies**: Security groups with least privilege
- **IAM Policies**: Fine-grained access control
- **Audit Logging**: CloudWatch Logs for all API calls
- **VPC Flow Logs**: Network traffic monitoring

### Monitoring

- **CloudWatch Container Insights**: Cluster and pod-level metrics
- **Control Plane Logs**: API, audit, authenticator logs
- **VPC Flow Logs**: Network traffic analysis
- **Node Metrics**: CPU, memory, disk, network
- **Custom Metrics**: Application-specific metrics

## Quick Start

```bash
# 1. Clone the repository
git clone https://github.com/your-org/llm-analytics-hub.git
cd llm-analytics-hub/infrastructure/terraform/aws

# 2. Copy and customize variables
cp terraform.tfvars.example terraform.tfvars
vim terraform.tfvars

# 3. Copy and customize backend configuration
cp backend.hcl.example backend.hcl
vim backend.hcl

# 4. Initialize Terraform
terraform init -backend-config=backend.hcl

# 5. Review the plan
terraform plan -out=tfplan

# 6. Apply the configuration
terraform apply tfplan

# 7. Configure kubectl
aws eks update-kubeconfig --region us-east-1 --name llm-analytics-hub-prod-eks

# 8. Verify cluster access
kubectl get nodes
kubectl get pods -A
```

## Deployment Guide

### Step 1: Configure Variables

Edit `terraform.tfvars` with your settings:

```hcl
# Minimum required configuration
aws_region   = "us-east-1"
project_name = "llm-analytics-hub"
environment  = "prod"

# For production, restrict public access
cluster_endpoint_public_access_cidrs = ["YOUR_OFFICE_IP/32"]

# Add IAM users/roles that need access
map_users = [
  {
    userarn  = "arn:aws:iam::123456789012:user/admin"
    username = "admin"
    groups   = ["system:masters"]
  }
]
```

### Step 2: Initialize Terraform

```bash
# Initialize with backend configuration
terraform init -backend-config=backend.hcl

# Validate configuration
terraform validate

# Format code
terraform fmt -recursive
```

### Step 3: Plan Deployment

```bash
# Create execution plan
terraform plan -out=tfplan

# Review the plan carefully
# Expected resources: ~100+ resources
```

### Step 4: Deploy Infrastructure

```bash
# Apply the plan
terraform apply tfplan

# Deployment takes approximately 15-20 minutes
# The EKS cluster creation takes the longest
```

### Step 5: Configure kubectl Access

```bash
# Update kubeconfig
aws eks update-kubeconfig \
  --region us-east-1 \
  --name llm-analytics-hub-prod-eks

# Verify access
kubectl get nodes
kubectl get pods --all-namespaces
kubectl get svc --all-namespaces
```

### Step 6: Deploy Add-ons (Optional)

#### Install Cluster Autoscaler

```bash
kubectl apply -f https://raw.githubusercontent.com/kubernetes/autoscaler/master/cluster-autoscaler/cloudprovider/aws/examples/cluster-autoscaler-autodiscover.yaml

# Annotate the service account
kubectl annotate serviceaccount cluster-autoscaler \
  -n kube-system \
  eks.amazonaws.com/role-arn=$(terraform output -raw cluster_autoscaler_role_arn)

# Edit the deployment to add cluster name
kubectl edit deployment cluster-autoscaler -n kube-system
# Add: --node-group-auto-discovery=asg:tag=k8s.io/cluster-autoscaler/enabled,k8s.io/cluster-autoscaler/llm-analytics-hub-prod-eks
```

#### Install AWS Load Balancer Controller

```bash
# Add EKS Helm repository
helm repo add eks https://aws.github.io/eks-charts
helm repo update

# Install AWS Load Balancer Controller
helm install aws-load-balancer-controller eks/aws-load-balancer-controller \
  -n kube-system \
  --set clusterName=llm-analytics-hub-prod-eks \
  --set serviceAccount.create=true \
  --set serviceAccount.name=aws-load-balancer-controller \
  --set serviceAccount.annotations."eks\.amazonaws\.com/role-arn"=$(terraform output -raw aws_load_balancer_controller_role_arn)
```

#### Install Metrics Server

```bash
kubectl apply -f https://github.com/kubernetes-sigs/metrics-server/releases/latest/download/components.yaml
```

#### Install Storage Classes

```bash
cat <<EOF | kubectl apply -f -
apiVersion: storage.k8s.io/v1
kind: StorageClass
metadata:
  name: gp3
  annotations:
    storageclass.kubernetes.io/is-default-class: "true"
provisioner: ebs.csi.aws.com
parameters:
  type: gp3
  iops: "3000"
  throughput: "125"
  encrypted: "true"
volumeBindingMode: WaitForFirstConsumer
allowVolumeExpansion: true
---
apiVersion: storage.k8s.io/v1
kind: StorageClass
metadata:
  name: io2
provisioner: ebs.csi.aws.com
parameters:
  type: io2
  iops: "10000"
  encrypted: "true"
volumeBindingMode: WaitForFirstConsumer
allowVolumeExpansion: true
EOF
```

## Configuration

### Environment-Specific Configurations

#### Development Environment
```hcl
environment        = "dev"
single_nat_gateway = true  # Cost savings

system_node_min_size = 1
system_node_max_size = 2
app_node_min_size    = 1
app_node_max_size    = 3
db_node_min_size     = 1
db_node_max_size     = 2
```

#### Staging Environment
```hcl
environment        = "staging"
single_nat_gateway = false

system_node_min_size = 2
system_node_max_size = 3
app_node_min_size    = 2
app_node_max_size    = 5
db_node_min_size     = 2
db_node_max_size     = 4
```

#### Production Environment
```hcl
environment        = "prod"
single_nat_gateway = false

system_node_min_size = 2
system_node_max_size = 4
app_node_min_size    = 3
app_node_max_size    = 10
db_node_min_size     = 3
db_node_max_size     = 6

# Use ON_DEMAND for critical workloads
app_node_capacity_type = "ON_DEMAND"
```

### Networking Configuration

#### Custom VPC CIDR
```hcl
vpc_cidr = "172.16.0.0/16"  # Change if 10.0.0.0/16 conflicts
```

#### Private Cluster (No Public Endpoint)
```hcl
cluster_endpoint_public_access = false
cluster_endpoint_private_access = true
```

#### Restrict Public Access
```hcl
cluster_endpoint_public_access_cidrs = [
  "203.0.113.0/24",  # Office network
  "198.51.100.0/24"  # VPN network
]
```

## Node Groups

### Scaling Configuration

Nodes automatically scale based on:
- **Resource Requests**: CPU and memory requests from pods
- **Pending Pods**: Pods waiting for resources
- **Node Utilization**: Current CPU/memory usage

### Taints and Tolerations

Database nodes have taints to ensure only database workloads run on them:

```yaml
# Database pods must have this toleration
tolerations:
- key: "workload"
  operator: "Equal"
  value: "database"
  effect: "NoSchedule"

# And node affinity
affinity:
  nodeAffinity:
    requiredDuringSchedulingIgnoredDuringExecution:
      nodeSelectorTerms:
      - matchExpressions:
        - key: role
          operator: In
          values:
          - database
```

### Updating Node Groups

```bash
# Update to latest AMI
terraform apply -var="system_node_desired_size=4"  # Increase capacity
# Wait for new nodes
kubectl drain <old-node> --ignore-daemonsets --delete-emptydir-data
# Decrease capacity back
terraform apply -var="system_node_desired_size=3"
```

## Security

### Best Practices

1. **Enable Encryption**
   - EKS secrets encrypted with KMS
   - EBS volumes encrypted
   - S3 state bucket encrypted

2. **Restrict Network Access**
   - Use private subnets for nodes
   - Limit public endpoint access
   - Enable VPC endpoints

3. **IAM Least Privilege**
   - Use IRSA for pod-level permissions
   - Separate roles per workload
   - Regular permission audits

4. **Audit Logging**
   - Enable all control plane logs
   - Monitor CloudWatch Logs
   - Set up alerts for suspicious activity

5. **Regular Updates**
   - Keep Kubernetes version current
   - Update node AMIs monthly
   - Patch security vulnerabilities

### Security Checklist

- [ ] Enable encryption at rest (KMS)
- [ ] Enable audit logging
- [ ] Restrict API endpoint access
- [ ] Use private subnets for nodes
- [ ] Enable VPC Flow Logs
- [ ] Configure security groups properly
- [ ] Use IRSA for service accounts
- [ ] Enable pod security policies
- [ ] Regular security scans
- [ ] Implement network policies

## Monitoring

### CloudWatch Container Insights

Automatically enabled, provides:
- Cluster-level metrics (CPU, memory, network)
- Node-level metrics
- Pod-level metrics
- Service metrics

Access metrics:
```bash
# View in CloudWatch Console
# Metrics → Container Insights → Performance Monitoring
```

### Custom Metrics

Export custom metrics using CloudWatch agent:

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: cloudwatch-config
  namespace: amazon-cloudwatch
data:
  cwagentconfig.json: |
    {
      "metrics": {
        "namespace": "LLM-Analytics-Hub",
        "metrics_collected": {
          "statsd": {
            "service_address": ":8125",
            "metrics_aggregation_interval": 60
          }
        }
      }
    }
```

### Alerting

Create CloudWatch alarms:

```bash
aws cloudwatch put-metric-alarm \
  --alarm-name eks-high-cpu \
  --alarm-description "Alert when cluster CPU > 80%" \
  --metric-name node_cpu_utilization \
  --namespace ContainerInsights \
  --statistic Average \
  --period 300 \
  --threshold 80 \
  --comparison-operator GreaterThanThreshold \
  --evaluation-periods 2 \
  --dimensions Name=ClusterName,Value=llm-analytics-hub-prod-eks
```

## Cost Optimization

### Current Configuration Costs (Estimated)

**Monthly Cost Breakdown:**
- EKS Control Plane: $72/month
- NAT Gateways (3): ~$97/month
- EC2 Instances:
  - System (3x m5.xlarge): ~$374/month
  - Application (5x m5.2xlarge Spot): ~$310/month (70% savings)
  - Database (4x r5.2xlarge): ~$1,169/month
- Data Transfer: Variable
- **Total: ~$2,022/month**

### Cost Reduction Strategies

1. **Use Single NAT Gateway (Non-Prod)**
   ```hcl
   single_nat_gateway = true  # Save ~$64/month
   ```

2. **Use Spot Instances**
   ```hcl
   app_node_capacity_type = "SPOT"  # Already configured
   # Saves ~70% on application nodes
   ```

3. **Right-Size Node Groups**
   ```bash
   # Monitor actual usage
   kubectl top nodes

   # Adjust instance types accordingly
   ```

4. **Enable Cluster Autoscaler**
   - Automatically scales down unused nodes
   - Can save 30-50% during low traffic

5. **Use Reserved Instances**
   - 1-year commitment: 40% discount
   - 3-year commitment: 60% discount

6. **Optimize Storage**
   ```hcl
   # Use gp3 instead of gp2
   # gp3 is 20% cheaper with better performance
   ```

### Cost Monitoring

```bash
# Enable AWS Cost Explorer
# Tag all resources for cost allocation
# Review costs monthly
aws ce get-cost-and-usage \
  --time-period Start=2024-01-01,End=2024-01-31 \
  --granularity MONTHLY \
  --metrics BlendedCost \
  --filter file://filter.json
```

## Maintenance

### Upgrading Kubernetes Version

```bash
# 1. Check current version
kubectl version --short

# 2. Update terraform.tfvars
kubernetes_version = "1.29"

# 3. Apply changes
terraform plan
terraform apply

# 4. Update node groups one at a time
# System nodes first
# Then application nodes
# Finally database nodes

# 5. Update add-ons
kubectl apply -f <updated-addon-manifests>
```

### Rotating Credentials

```bash
# Rotate AWS credentials
aws iam create-access-key --user-name terraform-user

# Update backend credentials
# Re-run terraform init
terraform init -backend-config=backend.hcl -reconfigure
```

### Backup and Disaster Recovery

```bash
# Backup EKS cluster configuration
aws eks describe-cluster --name llm-analytics-hub-prod-eks > cluster-backup.json

# Backup Kubernetes resources
kubectl get all --all-namespaces -o yaml > k8s-backup.yaml

# Export Terraform state
terraform state pull > terraform.tfstate.backup

# Store backups in S3
aws s3 cp cluster-backup.json s3://your-backup-bucket/
aws s3 cp k8s-backup.yaml s3://your-backup-bucket/
aws s3 cp terraform.tfstate.backup s3://your-backup-bucket/
```

### Regular Maintenance Tasks

**Weekly:**
- Review CloudWatch metrics
- Check cluster health
- Review security scan results

**Monthly:**
- Update node AMIs
- Review and optimize costs
- Patch security vulnerabilities
- Review and rotate credentials

**Quarterly:**
- Upgrade Kubernetes version
- Review and update IAM policies
- Conduct security audit
- Review disaster recovery plan

## Troubleshooting

### Common Issues

#### 1. Nodes Not Joining Cluster

```bash
# Check node status
kubectl get nodes

# Check system logs
aws logs tail /aws/eks/llm-analytics-hub-prod-eks/cluster --follow

# Verify IAM role trust relationship
aws iam get-role --role-name llm-analytics-hub-prod-eks-node-role

# Check security groups
aws ec2 describe-security-groups --group-ids <sg-id>
```

#### 2. Pods Not Scheduling

```bash
# Check pod events
kubectl describe pod <pod-name>

# Check node resources
kubectl top nodes

# Check node conditions
kubectl describe node <node-name>

# Verify taints and tolerations
kubectl get nodes -o json | jq '.items[].spec.taints'
```

#### 3. Load Balancer Issues

```bash
# Check AWS Load Balancer Controller logs
kubectl logs -n kube-system deployment/aws-load-balancer-controller

# Verify IAM role
kubectl describe sa aws-load-balancer-controller -n kube-system

# Check security groups
aws elbv2 describe-load-balancers
```

#### 4. EBS Volume Mounting Issues

```bash
# Check EBS CSI driver
kubectl get pods -n kube-system -l app=ebs-csi-controller

# Check driver logs
kubectl logs -n kube-system <ebs-csi-controller-pod>

# Verify IAM role
kubectl describe sa ebs-csi-controller-sa -n kube-system
```

### Debug Commands

```bash
# Get cluster info
kubectl cluster-info
kubectl get componentstatuses

# Check all resources
kubectl get all -A

# Check events
kubectl get events --all-namespaces --sort-by='.lastTimestamp'

# Check node conditions
kubectl describe nodes | grep -i condition -A 10

# Check pod resource usage
kubectl top pods --all-namespaces

# Test DNS resolution
kubectl run -it --rm debug --image=busybox --restart=Never -- nslookup kubernetes.default
```

### Getting Support

1. **AWS Support**: For EKS-related issues
2. **GitHub Issues**: For Terraform module issues
3. **Kubernetes Slack**: For kubectl/K8s issues
4. **Internal Documentation**: Check team wiki

## Additional Resources

### Documentation
- [Amazon EKS Best Practices](https://aws.github.io/aws-eks-best-practices/)
- [Terraform AWS Provider](https://registry.terraform.io/providers/hashicorp/aws/latest/docs)
- [Kubernetes Documentation](https://kubernetes.io/docs/)

### Tools
- [eksctl](https://eksctl.io/) - EKS cluster management
- [k9s](https://k9scli.io/) - Kubernetes CLI manager
- [kubectx](https://github.com/ahmetb/kubectx) - Context switching
- [stern](https://github.com/stern/stern) - Multi-pod log tailing

### Monitoring & Observability
- [Prometheus](https://prometheus.io/) - Metrics collection
- [Grafana](https://grafana.com/) - Metrics visualization
- [Jaeger](https://www.jaegertracing.io/) - Distributed tracing
- [Fluentd](https://www.fluentd.org/) - Log aggregation

### Security
- [kube-bench](https://github.com/aquasecurity/kube-bench) - CIS Kubernetes Benchmark
- [Falco](https://falco.org/) - Runtime security
- [OPA](https://www.openpolicyagent.org/) - Policy engine
- [Trivy](https://github.com/aquasecurity/trivy) - Vulnerability scanner

## License

Apache 2.0 - See LICENSE file for details.

## Authors

Platform Team - LLM Analytics Hub

## Support

For issues or questions:
- Email: platform-team@example.com
- Slack: #llm-analytics-hub
- GitHub: https://github.com/your-org/llm-analytics-hub/issues
