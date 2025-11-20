# Quick Reference Guide

## Essential Commands

### Terraform Operations

```bash
# Initialize
terraform init -backend-config="backend.hcl"

# Validate
terraform validate

# Format
terraform fmt -recursive

# Plan
terraform plan -var-file="production.tfvars" -out=production.tfplan

# Apply
terraform apply production.tfplan

# Destroy
terraform destroy -var-file="production.tfvars"

# Show current state
terraform show

# List resources
terraform state list

# Get outputs
terraform output
terraform output -json
terraform output -raw aks_cluster_name
```

### Makefile Shortcuts

```bash
# Deploy dev environment
make deploy ENV=dev

# Deploy production
make deploy ENV=production

# Get kubeconfig
make kubeconfig ENV=production

# Verify deployment
make verify ENV=production

# Show outputs
make output ENV=production

# Destroy environment
make destroy ENV=dev

# Cost estimate (requires infracost)
make cost-estimate ENV=production

# Security scan (requires tfsec)
make security-scan
```

### Azure CLI

```bash
# Login
az login

# Set subscription
az account set --subscription "SUBSCRIPTION_ID"

# List AKS clusters
az aks list -o table

# Get AKS credentials
az aks get-credentials \
  --resource-group llmhub-production-rg \
  --name llmhub-production-aks

# Show cluster info
az aks show -g llmhub-production-rg -n llmhub-production-aks

# Scale node pool
az aks nodepool scale \
  -g llmhub-production-rg \
  --cluster-name llmhub-production-aks \
  --name app \
  --node-count 5

# Upgrade cluster
az aks upgrade \
  -g llmhub-production-rg \
  -n llmhub-production-aks \
  --kubernetes-version 1.29.0

# Get available versions
az aks get-versions --location eastus2 -o table

# List node pools
az aks nodepool list \
  -g llmhub-production-rg \
  --cluster-name llmhub-production-aks -o table

# ACR login
az acr login --name llmhubproductionacr

# List ACR images
az acr repository list --name llmhubproductionacr -o table
```

### kubectl Commands

```bash
# Get cluster info
kubectl cluster-info

# Get nodes
kubectl get nodes
kubectl get nodes -o wide
kubectl describe node NODE_NAME

# Get pods
kubectl get pods -A
kubectl get pods -n NAMESPACE
kubectl describe pod POD_NAME -n NAMESPACE
kubectl logs POD_NAME -n NAMESPACE
kubectl logs -f POD_NAME -n NAMESPACE

# Get services
kubectl get svc -A
kubectl get svc -n NAMESPACE

# Get deployments
kubectl get deployments -A
kubectl get deployments -n NAMESPACE

# Get namespaces
kubectl get namespaces

# Get storage classes
kubectl get storageclass

# Get PVCs
kubectl get pvc -A

# Get ingress
kubectl get ingress -A

# Apply manifests
kubectl apply -f manifest.yaml
kubectl apply -f directory/

# Delete resources
kubectl delete -f manifest.yaml
kubectl delete pod POD_NAME -n NAMESPACE

# Execute commands in pod
kubectl exec -it POD_NAME -n NAMESPACE -- /bin/bash

# Port forward
kubectl port-forward POD_NAME 8080:80 -n NAMESPACE

# Top (resource usage)
kubectl top nodes
kubectl top pods -A

# Events
kubectl get events --sort-by='.lastTimestamp' -A

# Config
kubectl config view
kubectl config get-contexts
kubectl config use-context CONTEXT_NAME
```

### Monitoring & Debugging

```bash
# View logs in Azure Portal
az monitor log-analytics query \
  --workspace WORKSPACE_ID \
  --analytics-query "ContainerLog | limit 100"

# Check cluster diagnostics
az aks show -g RG_NAME -n CLUSTER_NAME --query "powerState"

# Collect diagnostics
az aks kollect -g RG_NAME -n CLUSTER_NAME

# View metrics
az monitor metrics list \
  --resource RESOURCE_ID \
  --metric-names "node_cpu_usage_percentage"

# Check autoscaler logs
kubectl logs -n kube-system -l app=cluster-autoscaler

# Check oms-agent (Container Insights)
kubectl get pods -n kube-system -l component=oms-agent

# Verify CSI drivers
kubectl get pods -n kube-system | grep csi
```

## Common Scenarios

### Deploy New Environment

```bash
# 1. Create backend
./setup-backend.sh

# 2. Create tfvars
cp terraform.tfvars.example dev.tfvars
nano dev.tfvars

# 3. Deploy
make deploy ENV=dev

# 4. Verify
./verify-deployment.sh
```

### Add Application to Cluster

```bash
# 1. Get kubeconfig
make kubeconfig ENV=production

# 2. Create namespace
kubectl create namespace my-app

# 3. Apply manifests
kubectl apply -f app-manifests/ -n my-app

# 4. Verify
kubectl get pods -n my-app
kubectl get svc -n my-app
```

### Scale Application

```bash
# Horizontal scaling
kubectl scale deployment my-app --replicas=5 -n my-app

# Or edit deployment
kubectl edit deployment my-app -n my-app

# Create HPA
kubectl autoscale deployment my-app \
  --cpu-percent=70 \
  --min=3 \
  --max=10 \
  -n my-app
```

### Update Application

```bash
# Update image
kubectl set image deployment/my-app \
  container-name=new-image:tag \
  -n my-app

# Check rollout status
kubectl rollout status deployment/my-app -n my-app

# View rollout history
kubectl rollout history deployment/my-app -n my-app

# Rollback
kubectl rollout undo deployment/my-app -n my-app
```

### Troubleshoot Pod Issues

```bash
# 1. Check pod status
kubectl get pods -n my-app
kubectl describe pod POD_NAME -n my-app

# 2. Check logs
kubectl logs POD_NAME -n my-app
kubectl logs POD_NAME -n my-app --previous  # Previous container logs

# 3. Check events
kubectl get events -n my-app --sort-by='.lastTimestamp'

# 4. Exec into pod
kubectl exec -it POD_NAME -n my-app -- /bin/sh

# 5. Check resources
kubectl top pod POD_NAME -n my-app
```

### Network Troubleshooting

```bash
# Test DNS
kubectl run -it --rm debug --image=busybox --restart=Never -- nslookup kubernetes.default

# Test connectivity
kubectl run -it --rm debug --image=nicolaka/netshoot --restart=Never -- bash
# Inside container:
# curl http://SERVICE_NAME.NAMESPACE.svc.cluster.local
# nslookup SERVICE_NAME.NAMESPACE.svc.cluster.local
# ping POD_IP

# Check network policies
kubectl get networkpolicies -A

# Check services
kubectl get svc -A
kubectl describe svc SERVICE_NAME -n NAMESPACE
```

### Storage Operations

```bash
# List storage classes
kubectl get storageclass

# Create PVC
cat <<EOF | kubectl apply -f -
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: my-pvc
spec:
  accessModes:
    - ReadWriteOnce
  storageClassName: managed-premium
  resources:
    requests:
      storage: 10Gi
EOF

# Check PVC
kubectl get pvc
kubectl describe pvc my-pvc

# Check PV
kubectl get pv
```

### Secrets Management

```bash
# Create secret from literal
kubectl create secret generic my-secret \
  --from-literal=username=admin \
  --from-literal=password=secret123 \
  -n my-app

# Create secret from file
kubectl create secret generic my-secret \
  --from-file=config.json \
  -n my-app

# Get secret
kubectl get secret my-secret -n my-app -o yaml

# Decode secret
kubectl get secret my-secret -n my-app -o jsonpath='{.data.username}' | base64 -d

# Using Key Vault (with CSI driver)
cat <<EOF | kubectl apply -f -
apiVersion: secrets-store.csi.x-k8s.io/v1
kind: SecretProviderClass
metadata:
  name: azure-keyvault
spec:
  provider: azure
  parameters:
    usePodIdentity: "false"
    useVMManagedIdentity: "true"
    keyvaultName: "YOUR_KEYVAULT_NAME"
    tenantId: "YOUR_TENANT_ID"
    objects: |
      array:
        - |
          objectName: secret1
          objectType: secret
EOF
```

### Backup & Restore (Velero)

```bash
# Install Velero
velero install \
  --provider azure \
  --bucket velero \
  --secret-file ./credentials-velero

# Create backup
velero backup create my-backup --include-namespaces my-app

# List backups
velero backup get

# Restore
velero restore create --from-backup my-backup

# Schedule backup
velero schedule create daily-backup \
  --schedule="0 2 * * *" \
  --include-namespaces my-app
```

## Important File Locations

```
# Terraform files
/workspaces/llm-analytics-hub/infrastructure/terraform/azure/

# Kubeconfig
~/.kube/config

# Azure CLI config
~/.azure/

# Terraform state (remote)
Azure Storage Account: tfstate<suffix>
Container: tfstate
Key: llm-analytics-hub.terraform.tfstate
```

## Environment Variables

```bash
# Azure
export ARM_SUBSCRIPTION_ID="..."
export ARM_TENANT_ID="..."
export ARM_CLIENT_ID="..."
export ARM_CLIENT_SECRET="..."

# Kubeconfig
export KUBECONFIG=~/.kube/config

# Terraform
export TF_LOG=DEBUG  # Enable debug logging
export TF_LOG_PATH=./terraform.log
```

## Default Ports

```
Kubernetes API: 443
HTTP: 80
HTTPS: 443
PostgreSQL: 5432
Redis: 6379
InfluxDB: 8086
Prometheus: 9090
Grafana: 3000
```

## Resource Limits & Quotas

```yaml
# Example pod resource limits
resources:
  requests:
    memory: "256Mi"
    cpu: "250m"
  limits:
    memory: "512Mi"
    cpu: "500m"

# Node pool max pods: 110
# Max nodes per pool: 1000
# Max node pools: 10
```

## Useful Links

- [Azure Portal](https://portal.azure.com)
- [AKS Documentation](https://docs.microsoft.com/azure/aks/)
- [Kubernetes Docs](https://kubernetes.io/docs/)
- [Terraform Registry](https://registry.terraform.io/)
- [Azure Status](https://status.azure.com/)

## Emergency Contacts

```
Azure Support: https://portal.azure.com (Create Support Request)
Critical Issues: P1 - 15 min response time
Standard Issues: P2-P3 - 2-8 hour response time
```
