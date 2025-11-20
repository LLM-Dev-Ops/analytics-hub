# Azure AKS Infrastructure for LLM Analytics Hub

This Terraform configuration deploys a production-ready Azure Kubernetes Service (AKS) cluster optimized for the LLM Analytics Hub platform.

## Architecture Overview

The infrastructure includes:

- **AKS Cluster**: Kubernetes 1.28+ with multi-zone deployment
- **Node Pools**: System, Application, Database, Spot, GPU (optional), and Monitoring (optional)
- **Networking**: VNet with multiple subnets, NAT Gateway, NSGs, and private endpoints
- **Identity**: Managed identities with Azure AD RBAC and workload identity
- **Security**: Azure Defender, Azure Policy, private endpoints, and network policies
- **Storage**: Azure Disk CSI, Azure Files, multiple storage classes
- **Monitoring**: Azure Monitor, Log Analytics, Application Insights
- **Registry**: Azure Container Registry with geo-replication (Premium)

## Prerequisites

### Required Tools

1. **Azure CLI** (v2.50+)
   ```bash
   curl -sL https://aka.ms/InstallAzureCLIDeb | sudo bash
   az --version
   ```

2. **Terraform** (v1.6+)
   ```bash
   wget https://releases.hashicorp.com/terraform/1.6.6/terraform_1.6.6_linux_amd64.zip
   unzip terraform_1.6.6_linux_amd64.zip
   sudo mv terraform /usr/local/bin/
   terraform --version
   ```

3. **kubectl** (v1.28+)
   ```bash
   curl -LO "https://dl.k8s.io/release/v1.28.3/bin/linux/amd64/kubectl"
   sudo install -o root -g root -m 0755 kubectl /usr/local/bin/kubectl
   kubectl version --client
   ```

### Azure Permissions

Required Azure RBAC roles:
- **Contributor** on target subscription
- **User Access Administrator** for role assignments
- **Azure AD Group Administrator** (if using Azure AD RBAC)

### Azure Subscription Setup

1. **Login to Azure**:
   ```bash
   az login
   ```

2. **Set subscription** (if you have multiple):
   ```bash
   az account list --output table
   az account set --subscription "YOUR_SUBSCRIPTION_ID"
   ```

3. **Register required providers**:
   ```bash
   az provider register --namespace Microsoft.ContainerService
   az provider register --namespace Microsoft.OperationalInsights
   az provider register --namespace Microsoft.ContainerRegistry
   az provider register --namespace Microsoft.KeyVault
   az provider register --namespace Microsoft.Storage
   az provider register --namespace Microsoft.Network
   az provider register --namespace Microsoft.Security
   ```

4. **Verify registration**:
   ```bash
   az provider show -n Microsoft.ContainerService -o table
   az provider show -n Microsoft.OperationalInsights -o table
   ```

## Configuration

### 1. Backend Configuration

Create a `backend.hcl` file for remote state storage:

```hcl
resource_group_name  = "tfstate-rg"
storage_account_name = "tfstate<random_suffix>"
container_name       = "tfstate"
key                  = "llm-analytics-hub.terraform.tfstate"
```

**Create backend resources**:

```bash
# Variables
RESOURCE_GROUP_NAME="tfstate-rg"
STORAGE_ACCOUNT_NAME="tfstate$(openssl rand -hex 4)"
CONTAINER_NAME="tfstate"
LOCATION="eastus2"

# Create resource group
az group create --name $RESOURCE_GROUP_NAME --location $LOCATION

# Create storage account
az storage account create \
  --resource-group $RESOURCE_GROUP_NAME \
  --name $STORAGE_ACCOUNT_NAME \
  --sku Standard_LRS \
  --encryption-services blob \
  --min-tls-version TLS1_2

# Get storage account key
ACCOUNT_KEY=$(az storage account keys list \
  --resource-group $RESOURCE_GROUP_NAME \
  --account-name $STORAGE_ACCOUNT_NAME \
  --query '[0].value' -o tsv)

# Create container
az storage container create \
  --name $CONTAINER_NAME \
  --account-name $STORAGE_ACCOUNT_NAME \
  --account-key $ACCOUNT_KEY

# Enable versioning
az storage account blob-service-properties update \
  --account-name $STORAGE_ACCOUNT_NAME \
  --enable-versioning true

echo "Storage Account Name: $STORAGE_ACCOUNT_NAME"
```

### 2. Variables Configuration

Copy and customize the example variables file:

```bash
cp terraform.tfvars.example terraform.tfvars
```

Edit `terraform.tfvars` with your values:

```hcl
resource_prefix = "llmhub"
environment     = "production"
location        = "eastus2"

# Update security contact information
security_contact_email = "security@yourcompany.com"
alert_email_address    = "alerts@yourcompany.com"

# Restrict API server access in production
allowed_cidr_blocks = ["YOUR_CORPORATE_IP_RANGE/CIDR"]

# Enable private cluster for enhanced security
enable_private_cluster = true
```

### 3. Environment-Specific Configurations

Create separate variable files for each environment:

**Development** (`dev.tfvars`):
```hcl
environment                = "dev"
aks_sku_tier              = "Free"
system_node_pool_min_count = 1
app_node_pool_min_count    = 1
db_node_pool_min_count     = 1
enable_defender           = false
log_analytics_retention_days = 30
```

**Staging** (`staging.tfvars`):
```hcl
environment                = "staging"
aks_sku_tier              = "Standard"
system_node_pool_min_count = 2
app_node_pool_min_count    = 2
db_node_pool_min_count     = 2
enable_defender           = true
log_analytics_retention_days = 60
```

**Production** (`production.tfvars`):
```hcl
environment                  = "production"
aks_sku_tier                = "Standard"
enable_private_cluster      = true
enable_defender             = true
log_analytics_retention_days = 90
acr_georeplications         = ["westus2", "northeurope"]
```

## Deployment

### Step 1: Initialize Terraform

```bash
terraform init -backend-config="backend.hcl"
```

### Step 2: Validate Configuration

```bash
terraform validate
terraform fmt -check
```

### Step 3: Plan Deployment

```bash
# For development
terraform plan -var-file="dev.tfvars" -out=dev.tfplan

# For production
terraform plan -var-file="production.tfvars" -out=production.tfplan
```

Review the plan carefully before applying.

### Step 4: Apply Configuration

```bash
# For development
terraform apply dev.tfplan

# For production
terraform apply production.tfplan
```

**Deployment time**: Approximately 10-15 minutes for initial deployment.

### Step 5: Verify Deployment

```bash
# Get outputs
terraform output

# Save kubeconfig
terraform output -raw aks_cluster_kube_config > ~/.kube/config-llmhub

# Or use Azure CLI
az aks get-credentials \
  --resource-group $(terraform output -raw resource_group_name) \
  --name $(terraform output -raw aks_cluster_name)

# Verify cluster access
kubectl get nodes
kubectl get pods --all-namespaces
```

## Post-Deployment Configuration

### 1. Configure kubectl Context

```bash
# Set context
kubectl config use-context $(terraform output -raw aks_cluster_name)

# Verify
kubectl cluster-info
kubectl get nodes -o wide
```

### 2. Install Storage Classes

```bash
# Apply storage classes
cat <<EOF | kubectl apply -f -
apiVersion: storage.k8s.io/v1
kind: StorageClass
metadata:
  name: managed-premium-retain
provisioner: disk.csi.azure.com
parameters:
  storageaccounttype: Premium_LRS
  kind: Managed
reclaimPolicy: Retain
allowVolumeExpansion: true
volumeBindingMode: WaitForFirstConsumer
---
apiVersion: storage.k8s.io/v1
kind: StorageClass
metadata:
  name: managed-premium-zrs
provisioner: disk.csi.azure.com
parameters:
  storageaccounttype: Premium_ZRS
  kind: Managed
reclaimPolicy: Delete
allowVolumeExpansion: true
volumeBindingMode: WaitForFirstConsumer
---
apiVersion: storage.k8s.io/v1
kind: StorageClass
metadata:
  name: azurefile
provisioner: file.csi.azure.com
parameters:
  storageaccounttype: Standard_LRS
  kind: StorageAccount
reclaimPolicy: Delete
allowVolumeExpansion: true
volumeBindingMode: Immediate
EOF
```

### 3. Configure Pod Security Standards

```bash
# Label namespaces with pod security standards
kubectl label namespace default pod-security.kubernetes.io/enforce=restricted
kubectl label namespace default pod-security.kubernetes.io/audit=restricted
kubectl label namespace default pod-security.kubernetes.io/warn=restricted
```

### 4. Install NGINX Ingress Controller

```bash
# Add Helm repo
helm repo add ingress-nginx https://kubernetes.github.io/ingress-nginx
helm repo update

# Install ingress controller
helm install ingress-nginx ingress-nginx/ingress-nginx \
  --namespace ingress-nginx \
  --create-namespace \
  --set controller.replicaCount=3 \
  --set controller.nodeSelector."kubernetes\\.io/os"=linux \
  --set controller.service.annotations."service\\.beta\\.kubernetes\\.io/azure-load-balancer-health-probe-request-path"=/healthz \
  --set controller.affinity.podAntiAffinity.requiredDuringSchedulingIgnoredDuringExecution[0].labelSelector.matchExpressions[0].key=app\\.kubernetes\\.io/name \
  --set controller.affinity.podAntiAffinity.requiredDuringSchedulingIgnoredDuringExecution[0].labelSelector.matchExpressions[0].operator=In \
  --set controller.affinity.podAntiAffinity.requiredDuringSchedulingIgnoredDuringExecution[0].labelSelector.matchExpressions[0].values[0]=ingress-nginx \
  --set controller.affinity.podAntiAffinity.requiredDuringSchedulingIgnoredDuringExecution[0].topologyKey=kubernetes.io/hostname
```

### 5. Configure Cert-Manager (for TLS)

```bash
# Install cert-manager
kubectl apply -f https://github.com/cert-manager/cert-manager/releases/download/v1.13.3/cert-manager.yaml

# Wait for cert-manager to be ready
kubectl wait --for=condition=ready pod -l app.kubernetes.io/instance=cert-manager -n cert-manager --timeout=300s

# Create ClusterIssuer for Let's Encrypt
cat <<EOF | kubectl apply -f -
apiVersion: cert-manager.io/v1
kind: ClusterIssuer
metadata:
  name: letsencrypt-prod
spec:
  acme:
    server: https://acme-v02.api.letsencrypt.org/directory
    email: admin@example.com
    privateKeySecretRef:
      name: letsencrypt-prod
    solvers:
    - http01:
        ingress:
          class: nginx
EOF
```

### 6. Configure Azure AD Workload Identity

```bash
# Install Azure AD Workload Identity
helm repo add azure-workload-identity https://azure.github.io/azure-workload-identity/charts
helm repo update
helm install workload-identity-webhook azure-workload-identity/workload-identity-webhook \
  --namespace azure-workload-identity-system \
  --create-namespace

# Example: Create service account with workload identity
cat <<EOF | kubectl apply -f -
apiVersion: v1
kind: ServiceAccount
metadata:
  name: app-backend-sa
  namespace: default
  annotations:
    azure.workload.identity/client-id: $(terraform output -json workload_identities | jq -r '.["app-backend"].client_id')
EOF
```

### 7. Configure Monitoring

```bash
# Verify Container Insights is enabled
az aks show \
  --resource-group $(terraform output -raw resource_group_name) \
  --name $(terraform output -raw aks_cluster_name) \
  --query addonProfiles.omsagent.enabled

# Create custom dashboard in Azure Portal or use:
# Portal > Monitor > Containers > Select your cluster
```

## Node Pool Management

### Scaling Node Pools

```bash
# Manual scaling
az aks nodepool scale \
  --resource-group $(terraform output -raw resource_group_name) \
  --cluster-name $(terraform output -raw aks_cluster_name) \
  --name app \
  --node-count 5

# Update auto-scaler settings
az aks nodepool update \
  --resource-group $(terraform output -raw resource_group_name) \
  --cluster-name $(terraform output -raw aks_cluster_name) \
  --name app \
  --min-count 3 \
  --max-count 15
```

### Adding Custom Node Pool

```bash
az aks nodepool add \
  --resource-group $(terraform output -raw resource_group_name) \
  --cluster-name $(terraform output -raw aks_cluster_name) \
  --name custom \
  --node-count 3 \
  --node-vm-size Standard_D4s_v5 \
  --zones 1 2 3 \
  --enable-cluster-autoscaler \
  --min-count 3 \
  --max-count 10 \
  --labels workload=custom environment=$(terraform output -raw environment) \
  --tags Component=Custom
```

## Cost Optimization

### 1. Use Spot Instances

The configuration includes spot instance node pools for non-critical workloads:

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: batch-job
spec:
  nodeSelector:
    kubernetes.azure.com/scalesetpriority: spot
  tolerations:
  - key: kubernetes.azure.com/scalesetpriority
    operator: Equal
    value: spot
    effect: NoSchedule
  containers:
  - name: batch-container
    image: your-image
```

### 2. Enable Cluster Auto-Scaler

Auto-scaler is enabled by default. Monitor it:

```bash
kubectl logs -n kube-system -l app=cluster-autoscaler
```

### 3. Right-Size Node Pools

Monitor resource usage:

```bash
kubectl top nodes
kubectl top pods --all-namespaces
```

### 4. Review Azure Advisor Recommendations

```bash
az advisor recommendation list --output table
```

## Security Best Practices

### 1. Network Policies

Apply network policies to restrict pod-to-pod communication:

```yaml
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
---
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: allow-dns
  namespace: default
spec:
  podSelector: {}
  policyTypes:
  - Egress
  egress:
  - to:
    - namespaceSelector:
        matchLabels:
          name: kube-system
    ports:
    - protocol: UDP
      port: 53
```

### 2. Pod Security Standards

Enforce restricted pod security:

```bash
kubectl label namespace production \
  pod-security.kubernetes.io/enforce=restricted \
  pod-security.kubernetes.io/audit=restricted \
  pod-security.kubernetes.io/warn=restricted
```

### 3. Image Scanning

Enable Defender for Containers image scanning:

```bash
az security pricing create \
  --name Containers \
  --tier Standard
```

### 4. Secrets Management

Use Azure Key Vault Secrets Provider:

```yaml
apiVersion: secrets-store.csi.x-k8s.io/v1
kind: SecretProviderClass
metadata:
  name: azure-keyvault
spec:
  provider: azure
  parameters:
    usePodIdentity: "false"
    useVMManagedIdentity: "true"
    userAssignedIdentityID: "CLIENT_ID"
    keyvaultName: "KEY_VAULT_NAME"
    tenantId: "TENANT_ID"
    objects: |
      array:
        - |
          objectName: secret1
          objectType: secret
          objectVersion: ""
```

## Monitoring and Logging

### Access Logs

```bash
# Query cluster logs
az monitor log-analytics query \
  --workspace $(terraform output -raw log_analytics_workspace_workspace_id) \
  --analytics-query "ContainerLog | where TimeGenerated > ago(1h) | limit 100"

# Stream logs
kubectl logs -f deployment/your-deployment -n your-namespace
```

### View Metrics

```bash
# In Azure Portal
# Navigate to: Monitor > Metrics
# Select: AKS Cluster resource
# Add metrics: CPU, Memory, Pod count, etc.

# Or use kubectl
kubectl top nodes
kubectl top pods -A
```

### Alerts

Configure custom alerts in Azure Monitor for:
- High CPU/Memory usage
- Pod failures
- Node health
- API server latency

## Backup and Disaster Recovery

### 1. Velero Backup

Install Velero for cluster backup:

```bash
# Install Velero
curl -L https://github.com/vmware-tanzu/velero/releases/download/v1.12.0/velero-v1.12.0-linux-amd64.tar.gz -o velero.tar.gz
tar -xvf velero.tar.gz
sudo mv velero-v1.12.0-linux-amd64/velero /usr/local/bin/

# Create storage account for backups
az storage account create \
  --name velerobackup$(openssl rand -hex 4) \
  --resource-group $(terraform output -raw resource_group_name) \
  --sku Standard_LRS

# Configure Velero
velero install \
  --provider azure \
  --plugins velero/velero-plugin-for-microsoft-azure:v1.8.0 \
  --bucket velero \
  --secret-file ./credentials-velero \
  --backup-location-config resourceGroup=RESOURCE_GROUP,storageAccount=STORAGE_ACCOUNT
```

### 2. Database Backups

For stateful workloads, use Azure Backup or application-specific backup solutions.

## Upgrading

### Upgrade Kubernetes Version

```bash
# Check available versions
az aks get-upgrades \
  --resource-group $(terraform output -raw resource_group_name) \
  --name $(terraform output -raw aks_cluster_name) \
  --output table

# Update terraform.tfvars
# kubernetes_version = "1.29.0"

# Plan and apply
terraform plan -var-file="production.tfvars"
terraform apply -var-file="production.tfvars"
```

### Upgrade Node Pool

```bash
# Upgrade node pool image
az aks nodepool upgrade \
  --resource-group $(terraform output -raw resource_group_name) \
  --cluster-name $(terraform output -raw aks_cluster_name) \
  --name app \
  --node-image-only
```

## Troubleshooting

### Common Issues

**1. Nodes not ready**
```bash
kubectl get nodes
kubectl describe node <node-name>
az aks show --resource-group RG_NAME --name CLUSTER_NAME
```

**2. Pods pending**
```bash
kubectl describe pod <pod-name>
kubectl get events --sort-by='.lastTimestamp'
```

**3. Networking issues**
```bash
# Test DNS
kubectl run -it --rm debug --image=busybox --restart=Never -- nslookup kubernetes.default

# Test connectivity
kubectl run -it --rm debug --image=nicolaka/netshoot --restart=Never -- bash
```

**4. Authentication issues**
```bash
# Re-authenticate
az aks get-credentials \
  --resource-group $(terraform output -raw resource_group_name) \
  --name $(terraform output -raw aks_cluster_name) \
  --overwrite-existing
```

### Get Support

```bash
# Check cluster health
az aks show \
  --resource-group $(terraform output -raw resource_group_name) \
  --name $(terraform output -raw aks_cluster_name) \
  --query "powerState"

# Run diagnostics
az aks kollect \
  --resource-group $(terraform output -raw resource_group_name) \
  --name $(terraform output -raw aks_cluster_name)
```

## Cleanup

### Destroy Infrastructure

```bash
# Plan destroy
terraform plan -destroy -var-file="production.tfvars"

# Destroy all resources
terraform destroy -var-file="production.tfvars"
```

**Warning**: This will delete all resources including data. Ensure backups are taken before destroying.

## Cost Estimation

Estimated monthly costs (East US 2, Pay-as-you-go):

| Component | Configuration | Monthly Cost (USD) |
|-----------|--------------|-------------------|
| AKS Cluster | Standard tier | $73 |
| System Node Pool | 3x Standard_D4s_v5 | $280 |
| App Node Pool | 3x Standard_D8s_v5 | $560 |
| Database Node Pool | 3x Standard_E8s_v5 | $600 |
| ACR Premium | 500 GB storage | $200 |
| Log Analytics | 10 GB/day | $150 |
| NAT Gateway | 3 instances | $100 |
| Load Balancer | Standard | $20 |
| **Total** | **Base deployment** | **~$1,983/month** |

Add:
- Spot instances: Up to 80% savings on compatible workloads
- GPU nodes: $1,000-$3,000/month per node
- Egress bandwidth: $0.05-$0.08 per GB

Use [Azure Pricing Calculator](https://azure.microsoft.com/pricing/calculator/) for accurate estimates.

## References

- [AKS Documentation](https://docs.microsoft.com/azure/aks/)
- [Terraform Azure Provider](https://registry.terraform.io/providers/hashicorp/azurerm/latest/docs)
- [Azure Architecture Center](https://docs.microsoft.com/azure/architecture/)
- [AKS Best Practices](https://docs.microsoft.com/azure/aks/best-practices)
- [Azure Well-Architected Framework](https://docs.microsoft.com/azure/architecture/framework/)

## License

Apache 2.0 License - see LICENSE file for details.

## Support

For issues and questions:
- GitHub Issues: [LLM Analytics Hub Issues](https://github.com/your-org/llm-analytics-hub/issues)
- Azure Support: [Azure Portal](https://portal.azure.com)
