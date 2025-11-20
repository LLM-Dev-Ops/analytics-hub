# Quick Start Guide - AWS EKS Infrastructure

Get your LLM Analytics Hub EKS cluster up and running in minutes.

## Prerequisites

```bash
# Install required tools
brew install terraform awscli kubectl helm jq  # macOS
# or
apt-get install terraform awscli kubectl helm jq  # Linux
```

## 5-Minute Setup

### 1. Configure AWS Credentials

```bash
aws configure
# Enter your AWS Access Key ID
# Enter your AWS Secret Access Key
# Default region: us-east-1
```

### 2. Setup Infrastructure

```bash
cd infrastructure/terraform/aws

# Run automated setup
make setup
# This creates S3 backend, DynamoDB table, and initializes Terraform
```

### 3. Configure Variables

```bash
# Edit configuration
vim terraform.tfvars

# Minimum required changes:
# - cluster_endpoint_public_access_cidrs = ["YOUR_IP/32"]
# - Update map_users with your IAM users
```

### 4. Deploy Cluster

```bash
# Full deployment (plan + apply)
make deploy

# Or step by step:
make plan     # Review changes
make apply    # Deploy infrastructure
```

Deployment takes 15-20 minutes.

### 5. Configure kubectl

```bash
# Automatically configure kubectl
make kubeconfig

# Verify access
kubectl get nodes
```

### 6. Install Add-ons

```bash
# Install essential add-ons
make addons

# This installs:
# - Metrics Server
# - Cluster Autoscaler
# - AWS Load Balancer Controller
# - Storage Classes
```

## Verify Deployment

```bash
# Check cluster health
make k8s-test

# View all resources
kubectl get all -A

# Check node metrics
kubectl top nodes
```

## Deploy Your Application

```bash
# Example deployment
kubectl apply -f - <<EOF
apiVersion: v1
kind: Namespace
metadata:
  name: llm-analytics
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: test-app
  namespace: llm-analytics
spec:
  replicas: 3
  selector:
    matchLabels:
      app: test-app
  template:
    metadata:
      labels:
        app: test-app
    spec:
      containers:
      - name: nginx
        image: nginx:latest
        ports:
        - containerPort: 80
        resources:
          requests:
            cpu: 100m
            memory: 128Mi
          limits:
            cpu: 500m
            memory: 512Mi
      nodeSelector:
        role: application
---
apiVersion: v1
kind: Service
metadata:
  name: test-app
  namespace: llm-analytics
spec:
  type: LoadBalancer
  selector:
    app: test-app
  ports:
  - port: 80
    targetPort: 80
EOF
```

## Common Commands

```bash
# Infrastructure
make plan              # Preview changes
make apply             # Apply changes
make output            # Show outputs
make destroy           # Destroy everything

# Kubernetes
make k8s-nodes         # List nodes
make k8s-pods          # List all pods
make k8s-services      # List all services

# Maintenance
make validate          # Validate config
make fmt               # Format code
make clean             # Clean temp files
```

## Cost Estimates

**Monthly Cost (Production):** ~$2,000

- EKS Control Plane: $72
- NAT Gateways (3): $97
- EC2 Instances: ~$1,850
- Data Transfer: Variable

**Cost Reduction Tips:**

```hcl
# For dev/staging, use single NAT gateway
single_nat_gateway = true  # Save ~$64/month

# Use Spot instances (already configured for app nodes)
# Saves ~70% on application workloads
```

## Troubleshooting

### Nodes not appearing?

```bash
# Check EKS cluster
aws eks describe-cluster --name $(terraform output -raw cluster_name)

# Check CloudWatch logs
aws logs tail /aws/eks/$(terraform output -raw cluster_name)/cluster --follow
```

### Can't connect to cluster?

```bash
# Update kubeconfig
make kubeconfig

# Verify AWS credentials
aws sts get-caller-identity

# Check security groups
terraform output cluster_security_group_id
```

### Pods not scheduling?

```bash
# Check node resources
kubectl describe nodes

# Check pod events
kubectl get events -A --sort-by='.lastTimestamp'

# Verify taints/tolerations
kubectl get nodes -o json | jq '.items[].spec.taints'
```

## Next Steps

1. **Security Hardening**
   - Restrict public endpoint access
   - Enable Pod Security Policies
   - Configure Network Policies

2. **Monitoring Setup**
   - Deploy Prometheus/Grafana
   - Configure CloudWatch Alarms
   - Set up log aggregation

3. **CI/CD Integration**
   - Configure GitHub Actions / GitLab CI
   - Set up automated deployments
   - Implement GitOps with ArgoCD

4. **Production Readiness**
   - Configure backups
   - Set up disaster recovery
   - Document runbooks

## Support

- Documentation: See [README.md](README.md)
- Issues: GitHub Issues
- Slack: #llm-analytics-hub

## Environment-Specific Configs

### Development

```hcl
# terraform.tfvars
environment        = "dev"
single_nat_gateway = true

system_node_desired_size = 1
app_node_desired_size    = 2
db_node_desired_size     = 1
```

### Staging

```hcl
# terraform.tfvars
environment        = "staging"
single_nat_gateway = false

system_node_desired_size = 2
app_node_desired_size    = 3
db_node_desired_size     = 2
```

### Production

```hcl
# terraform.tfvars
environment        = "prod"
single_nat_gateway = false

system_node_desired_size = 3
app_node_desired_size    = 5
db_node_desired_size     = 4

# Use ON_DEMAND for stability
app_node_capacity_type = "ON_DEMAND"
```

## Complete Workflow Example

```bash
# 1. Initial setup
cd infrastructure/terraform/aws
make setup

# 2. Configure for your environment
cp terraform.tfvars.example terraform.tfvars
vim terraform.tfvars

# 3. Deploy infrastructure
make plan
make apply

# 4. Configure kubectl
make kubeconfig

# 5. Install add-ons
make addons

# 6. Verify deployment
make k8s-test
kubectl get nodes
kubectl get pods -A

# 7. Deploy applications
kubectl apply -f ../../../k8s/

# 8. Monitor
kubectl top nodes
kubectl top pods -A

# 9. When done (optional)
make destroy
```

That's it! Your production-ready EKS cluster is up and running.
