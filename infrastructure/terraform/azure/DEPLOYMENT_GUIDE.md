# Quick Start Deployment Guide

This guide provides a streamlined process to deploy the LLM Analytics Hub infrastructure on Azure.

## Prerequisites Checklist

- [ ] Azure CLI installed (`az --version`)
- [ ] Terraform 1.6+ installed (`terraform --version`)
- [ ] kubectl installed (`kubectl version --client`)
- [ ] Azure subscription with Contributor access
- [ ] Azure AD permissions (if using Azure AD RBAC)

## 5-Minute Quick Start

### 1. Login to Azure

```bash
az login
az account set --subscription "YOUR_SUBSCRIPTION_ID"
```

### 2. Create Backend Storage

```bash
# Run this script to create Terraform backend
export RESOURCE_GROUP_NAME="tfstate-rg"
export STORAGE_ACCOUNT_NAME="tfstate$(openssl rand -hex 4)"
export CONTAINER_NAME="tfstate"
export LOCATION="eastus2"

# Create resources
az group create --name $RESOURCE_GROUP_NAME --location $LOCATION
az storage account create \
  --resource-group $RESOURCE_GROUP_NAME \
  --name $STORAGE_ACCOUNT_NAME \
  --sku Standard_LRS \
  --encryption-services blob

ACCOUNT_KEY=$(az storage account keys list \
  --resource-group $RESOURCE_GROUP_NAME \
  --account-name $STORAGE_ACCOUNT_NAME \
  --query '[0].value' -o tsv)

az storage container create \
  --name $CONTAINER_NAME \
  --account-name $STORAGE_ACCOUNT_NAME \
  --account-key $ACCOUNT_KEY

echo "Storage Account: $STORAGE_ACCOUNT_NAME"
```

### 3. Configure Backend

Create `backend.hcl`:

```bash
cat > backend.hcl <<EOF
resource_group_name  = "$RESOURCE_GROUP_NAME"
storage_account_name = "$STORAGE_ACCOUNT_NAME"
container_name       = "$CONTAINER_NAME"
key                  = "llm-analytics-hub.terraform.tfstate"
EOF
```

### 4. Configure Variables

```bash
# Copy example and customize
cp terraform.tfvars.example dev.tfvars

# Edit dev.tfvars with your settings
nano dev.tfvars
```

**Minimum required changes in `dev.tfvars`**:

```hcl
resource_prefix = "llmhub"
environment     = "dev"
location        = "eastus2"

# IMPORTANT: Update these
security_contact_email = "your-email@example.com"
alert_email_address    = "your-alerts@example.com"
```

### 5. Deploy

```bash
# Initialize
terraform init -backend-config="backend.hcl"

# Validate
terraform validate

# Plan
terraform plan -var-file="dev.tfvars" -out=dev.tfplan

# Review the plan, then apply
terraform apply dev.tfplan
```

### 6. Connect to Cluster

```bash
# Get credentials
az aks get-credentials \
  --resource-group $(terraform output -raw resource_group_name) \
  --name $(terraform output -raw aks_cluster_name)

# Verify
kubectl get nodes
```

## Using Makefile (Recommended)

```bash
# Initialize
make init ENV=dev

# Deploy
make deploy ENV=dev

# Get kubeconfig
make kubeconfig ENV=dev

# Verify
make verify ENV=dev
```

## Environment-Specific Deployments

### Development Environment

```bash
# Create dev.tfvars with minimal resources
cat > dev.tfvars <<EOF
resource_prefix = "llmhub"
environment     = "dev"
location        = "eastus2"
aks_sku_tier    = "Free"

# Minimal node counts
system_node_pool_min_count = 1
system_node_pool_max_count = 3
app_node_pool_min_count    = 1
app_node_pool_max_count    = 3
db_node_pool_min_count     = 1
db_node_pool_max_count     = 3

# Disable optional features
enable_defender            = false
enable_spot_node_pool      = false
enable_gpu_node_pool       = false
enable_monitoring_node_pool = false

# Contact info
security_contact_email = "dev-team@example.com"
alert_email_address    = "dev-alerts@example.com"
EOF

# Deploy
make deploy ENV=dev
```

### Production Environment

```bash
# Create production.tfvars with HA configuration
cat > production.tfvars <<EOF
resource_prefix = "llmhub"
environment     = "production"
location        = "eastus2"
aks_sku_tier    = "Standard"

# Production node counts
system_node_pool_min_count = 3
system_node_pool_max_count = 5
app_node_pool_min_count    = 3
app_node_pool_max_count    = 10
db_node_pool_min_count     = 3
db_node_pool_max_count     = 6

# Enable security features
enable_private_cluster      = true
enable_defender             = true
enable_spot_node_pool       = true

# ACR geo-replication
acr_georeplications = ["westus2", "northeurope"]

# Extended retention
log_analytics_retention_days = 90

# Contact info
security_contact_email = "security@example.com"
alert_email_address    = "ops-alerts@example.com"

# Network restrictions
allowed_cidr_blocks = ["YOUR_CORPORATE_IP_RANGE/24"]
EOF

# Deploy with extra validation
make lint ENV=production
make plan ENV=production
# Review carefully before applying
make apply ENV=production
```

## Post-Deployment Steps

### 1. Install Essential Add-ons

```bash
# NGINX Ingress Controller
kubectl apply -f https://raw.githubusercontent.com/kubernetes/ingress-nginx/controller-v1.8.2/deploy/static/provider/cloud/deploy.yaml

# Cert-Manager
kubectl apply -f https://github.com/cert-manager/cert-manager/releases/download/v1.13.3/cert-manager.yaml

# Metrics Server (if not already installed)
kubectl apply -f https://github.com/kubernetes-sigs/metrics-server/releases/latest/download/components.yaml
```

### 2. Configure Storage Classes

```bash
kubectl apply -f - <<EOF
apiVersion: storage.k8s.io/v1
kind: StorageClass
metadata:
  name: managed-premium-retain
provisioner: disk.csi.azure.com
parameters:
  storageaccounttype: Premium_LRS
reclaimPolicy: Retain
allowVolumeExpansion: true
EOF
```

### 3. Set up Monitoring

```bash
# Verify Container Insights
kubectl get pods -n kube-system | grep omsagent

# Create custom namespace for monitoring
kubectl create namespace monitoring
```

### 4. Configure Network Policies

```bash
# Default deny all
kubectl apply -f - <<EOF
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: default-deny-all
  namespace: default
spec:
  podSelector: {}
  policyTypes:
  - Ingress
  - Egress
EOF
```

## Validation Checklist

After deployment, verify:

- [ ] All nodes are in Ready state: `kubectl get nodes`
- [ ] System pods are running: `kubectl get pods -n kube-system`
- [ ] Storage classes available: `kubectl get storageclass`
- [ ] Ingress controller running: `kubectl get pods -n ingress-nginx`
- [ ] Container Insights enabled: Check Azure Portal > Monitor
- [ ] ACR accessible: `az acr login --name $(terraform output -raw acr_name)`
- [ ] Key Vault accessible: `az keyvault list`

## Troubleshooting Common Issues

### Issue: Terraform backend not accessible

```bash
# Verify backend configuration
cat backend.hcl

# Check storage account
az storage account show --name STORAGE_ACCOUNT_NAME

# Re-initialize
terraform init -reconfigure -backend-config="backend.hcl"
```

### Issue: Insufficient permissions

```bash
# Check current role assignments
az role assignment list --assignee $(az account show --query user.name -o tsv)

# Required roles:
# - Contributor (on subscription)
# - User Access Administrator (for role assignments)
```

### Issue: Nodes not ready

```bash
# Check node status
kubectl describe node <node-name>

# Check AKS diagnostics
az aks show -g RESOURCE_GROUP -n CLUSTER_NAME --query "powerState"

# Check node pool
az aks nodepool list -g RESOURCE_GROUP --cluster-name CLUSTER_NAME -o table
```

### Issue: Can't connect to cluster

```bash
# Get credentials again
az aks get-credentials \
  --resource-group $(terraform output -raw resource_group_name) \
  --name $(terraform output -raw aks_cluster_name) \
  --overwrite-existing

# Verify context
kubectl config current-context

# Test connection
kubectl cluster-info
```

## Resource Cleanup

### Destroy Development Environment

```bash
# Using Makefile
make destroy-plan ENV=dev
make destroy ENV=dev

# Or using Terraform directly
terraform plan -destroy -var-file="dev.tfvars"
terraform destroy -var-file="dev.tfvars"
```

### Destroy Production Environment (DANGER!)

```bash
# Take backups first!
# Export important data
# Document the process

# Then destroy
make destroy ENV=production
```

## Cost Optimization Tips

1. **Use Spot Instances** for non-critical workloads (up to 80% savings)
2. **Right-size node pools** based on actual usage
3. **Enable auto-scaling** to scale down during off-hours
4. **Use Azure Reservations** for predictable workloads (up to 72% savings)
5. **Monitor costs** in Azure Cost Management

### Example: Minimal Development Setup

Approximate cost: **$200-300/month**

```hcl
# Minimal dev configuration
aks_sku_tier               = "Free"
system_node_pool_vm_size   = "Standard_D2s_v5"
app_node_pool_vm_size      = "Standard_D4s_v5"
db_node_pool_vm_size       = "Standard_E4s_v5"
acr_sku                    = "Basic"
log_analytics_retention_days = 30

# All pools min 1 node
system_node_pool_min_count = 1
app_node_pool_min_count    = 1
db_node_pool_min_count     = 1
```

## Next Steps

1. **Deploy Applications**: Use the AKS cluster to deploy LLM Analytics Hub components
2. **Configure CI/CD**: Set up Azure DevOps or GitHub Actions
3. **Enable GitOps**: Configure Flux for declarative deployments
4. **Set up Alerts**: Configure Azure Monitor alerts for critical metrics
5. **Implement Backup**: Set up Velero for cluster backups
6. **Review Security**: Run security scans and implement network policies
7. **Performance Testing**: Load test your applications
8. **Documentation**: Document your specific configuration and procedures

## Getting Help

- **Terraform Issues**: Check [Terraform Azure Provider Docs](https://registry.terraform.io/providers/hashicorp/azurerm/latest/docs)
- **AKS Issues**: See [AKS Troubleshooting Guide](https://docs.microsoft.com/azure/aks/troubleshooting)
- **Azure Support**: Open ticket in [Azure Portal](https://portal.azure.com)
- **Community**: Ask on [Stack Overflow](https://stackoverflow.com/questions/tagged/azure-aks)

## Additional Resources

- [Azure Architecture Center](https://docs.microsoft.com/azure/architecture/)
- [AKS Best Practices](https://docs.microsoft.com/azure/aks/best-practices)
- [Kubernetes Documentation](https://kubernetes.io/docs/)
- [Terraform Best Practices](https://www.terraform-best-practices.com/)
