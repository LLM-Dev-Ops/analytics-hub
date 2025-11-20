# GCP GKE Deployment Guide
## LLM Analytics Hub Infrastructure

This guide provides step-by-step instructions for deploying the complete GKE infrastructure.

## Table of Contents

1. [Pre-Deployment Checklist](#pre-deployment-checklist)
2. [Initial Setup](#initial-setup)
3. [Terraform Deployment](#terraform-deployment)
4. [Post-Deployment Configuration](#post-deployment-configuration)
5. [Application Deployment](#application-deployment)
6. [Verification](#verification)
7. [Troubleshooting](#troubleshooting)

## Pre-Deployment Checklist

### 1. Prerequisites Installed

- [ ] Terraform >= 1.6.0
- [ ] gcloud CLI >= 400.0.0
- [ ] kubectl >= 1.28.0
- [ ] helm >= 3.12.0

```bash
# Verify installations
terraform version
gcloud version
kubectl version --client
helm version
```

### 2. GCP Account Setup

- [ ] GCP project created
- [ ] Billing enabled on project
- [ ] Sufficient quotas for resources
- [ ] User has required IAM permissions

### 3. Configuration Ready

- [ ] `terraform.tfvars` file configured
- [ ] Network CIDR ranges planned
- [ ] DNS domains configured (if using custom domains)
- [ ] Service account emails noted

## Initial Setup

### Step 1: Authenticate with GCP

```bash
# Login to GCP
gcloud auth login

# Set default project
gcloud config set project YOUR_PROJECT_ID

# Create application default credentials
gcloud auth application-default login
```

### Step 2: Enable Required APIs

```bash
# Using Makefile
make enable-apis

# Or manually
gcloud services enable \
  compute.googleapis.com \
  container.googleapis.com \
  cloudresourcemanager.googleapis.com \
  iam.googleapis.com \
  logging.googleapis.com \
  monitoring.googleapis.com \
  cloudtrace.googleapis.com \
  binaryauthorization.googleapis.com \
  secretmanager.googleapis.com \
  artifactregistry.googleapis.com
```

### Step 3: Create Terraform State Bucket

```bash
# Using Makefile
make create-state-bucket

# Or manually
gsutil mb -p YOUR_PROJECT_ID -l us-central1 gs://llm-analytics-hub-terraform-state
gsutil versioning set on gs://llm-analytics-hub-terraform-state
```

### Step 4: Configure Variables

```bash
# Copy example file
cp terraform.tfvars.example terraform.tfvars

# Edit with your values
vim terraform.tfvars
```

**Minimum Required Variables:**

```hcl
project_id  = "your-gcp-project-id"
region      = "us-central1"
environment = "prod"
```

## Terraform Deployment

### Step 1: Initialize Terraform

```bash
# Using Makefile
make init

# Or manually
terraform init
```

Expected output:
```
Terraform has been successfully initialized!
```

### Step 2: Validate Configuration

```bash
# Using Makefile
make validate

# Or manually
terraform validate
```

### Step 3: Review Execution Plan

```bash
# Using Makefile
make plan

# Or manually
terraform plan -out=tfplan
```

**Review the plan carefully:**
- Check resource counts (should be ~50-60 resources)
- Verify network configurations
- Confirm node pool settings
- Check IAM bindings

### Step 4: Apply Infrastructure

```bash
# Using Makefile
make apply

# Or manually
terraform apply tfplan
```

**Deployment Timeline:**
- Network & Subnets: 2-3 minutes
- GKE Control Plane: 5-7 minutes
- Node Pools: 5-8 minutes
- IAM & Storage: 2-3 minutes
- **Total: 15-20 minutes**

### Step 5: Verify Terraform Outputs

```bash
# Using Makefile
make output

# Or manually
terraform output
```

Expected outputs:
- cluster_name
- cluster_endpoint
- network_name
- All service account emails
- Storage bucket names

## Post-Deployment Configuration

### Step 1: Configure kubectl

```bash
# Using Makefile
make get-credentials

# Or manually
gcloud container clusters get-credentials $(terraform output -raw cluster_name) \
  --region $(terraform output -raw region) \
  --project $(terraform output -raw project_id)
```

Verify:
```bash
kubectl cluster-info
kubectl get nodes
```

Expected output: 9-20 nodes across all node pools

### Step 2: Deploy Essential Components

```bash
# Using Makefile
make deploy-essentials

# Or manually
./scripts/deploy-essentials.sh
```

This installs:
- NGINX Ingress Controller
- Cert Manager
- Prometheus & Grafana

**Wait for all pods to be ready:**
```bash
kubectl get pods -n ingress-nginx
kubectl get pods -n cert-manager
kubectl get pods -n monitoring
```

### Step 3: Setup Workload Identity

```bash
# Using Makefile
make setup-workload-identity

# Or manually
./scripts/setup-workload-identity.sh
```

Verify:
```bash
kubectl get serviceaccounts -n llm-analytics
kubectl describe serviceaccount app-service-account -n llm-analytics
```

### Step 4: Apply Storage Classes

```bash
# Using Makefile
make setup-storage-classes

# Or manually
kubectl apply -f manifests/storage-classes.yaml
```

Verify:
```bash
kubectl get storageclass
```

Expected output:
- pd-standard
- pd-balanced (default)
- pd-ssd
- pd-ssd-regional
- pd-balanced-regional

### Step 5: Apply Network Policies

```bash
# Using Makefile
make setup-network-policies

# Or manually
kubectl apply -f manifests/network-policies.yaml
```

Verify:
```bash
kubectl get networkpolicies -n llm-analytics
```

## Application Deployment

### Step 1: Build and Push Container Image

```bash
# Authenticate with Artifact Registry
gcloud auth configure-docker $(terraform output -raw region)-docker.pkg.dev

# Build image
docker build -t $(terraform output -raw docker_registry_url)/llm-analytics-app:v1.0.0 .

# Push image
docker push $(terraform output -raw docker_registry_url)/llm-analytics-app:v1.0.0
```

### Step 2: Deploy Application

```bash
# Update the image in manifests/example-deployment.yaml
# Then apply
kubectl apply -f manifests/example-deployment.yaml
```

### Step 3: Verify Deployment

```bash
# Check deployment status
kubectl get deployments -n llm-analytics

# Check pods
kubectl get pods -n llm-analytics

# Check service
kubectl get svc -n llm-analytics

# Check ingress
kubectl get ingress -n llm-analytics
```

### Step 4: Get LoadBalancer IP

```bash
kubectl get svc -n ingress-nginx ingress-nginx-controller

# Or
EXTERNAL_IP=$(kubectl get svc -n ingress-nginx ingress-nginx-controller -o jsonpath='{.status.loadBalancer.ingress[0].ip}')
echo "LoadBalancer IP: $EXTERNAL_IP"
```

### Step 5: Configure DNS

Point your domain to the LoadBalancer IP:

```
A record: app.example.com → EXTERNAL_IP
```

## Verification

### 1. Verify Cluster Health

```bash
# Cluster info
kubectl cluster-info

# Node status
kubectl get nodes

# Component status
kubectl get componentstatuses
```

### 2. Verify Node Pools

```bash
# List nodes by pool
kubectl get nodes -L node-pool,workload-type

# Should see:
# - system pool (2-4 nodes)
# - app pool (3-10 nodes)
# - db pool (3-6 nodes)
# - spot pool (0-10 nodes)
```

### 3. Verify Workload Identity

```bash
# Test workload identity
kubectl run -it --rm test-wi \
  --image=google/cloud-sdk:slim \
  --serviceaccount=app-service-account \
  -n llm-analytics \
  --restart=Never \
  -- gcloud auth list

# Should show the GCP service account
```

### 4. Verify Storage

```bash
# List storage classes
kubectl get sc

# Create test PVC
cat <<EOF | kubectl apply -f -
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: test-pvc
  namespace: llm-analytics
spec:
  accessModes:
  - ReadWriteOnce
  storageClassName: pd-balanced
  resources:
    requests:
      storage: 1Gi
EOF

# Check PVC
kubectl get pvc -n llm-analytics test-pvc

# Cleanup
kubectl delete pvc test-pvc -n llm-analytics
```

### 5. Verify Networking

```bash
# Test DNS resolution
kubectl run -it --rm debug \
  --image=nicolaka/netshoot \
  --restart=Never \
  -- nslookup kubernetes.default

# Test external connectivity
kubectl run -it --rm debug \
  --image=nicolaka/netshoot \
  --restart=Never \
  -- curl -I https://www.google.com
```

### 6. Verify Monitoring

```bash
# Access Grafana
kubectl port-forward -n monitoring svc/kube-prometheus-stack-grafana 3000:80

# Open http://localhost:3000
# Username: admin
# Password: admin

# Access Prometheus
kubectl port-forward -n monitoring svc/kube-prometheus-stack-prometheus 9090:9090

# Open http://localhost:9090
```

### 7. Verify Logging

```bash
# View cluster logs in Cloud Console
gcloud logging read "resource.type=k8s_cluster" --limit 10

# View pod logs
kubectl logs -n llm-analytics -l app=llm-analytics-app --tail=100
```

## Troubleshooting

### Issue: Cluster Creation Fails

**Error:** "Insufficient regional quota"

**Solution:**
```bash
# Check current quotas
gcloud compute regions describe us-central1

# Request increase in Cloud Console:
# IAM & Admin > Quotas > Filter by "Compute Engine API"
```

### Issue: Nodes Not Ready

**Symptoms:** Nodes in NotReady state

**Diagnosis:**
```bash
kubectl get nodes
kubectl describe node NODE_NAME
```

**Common causes:**
- Network configuration issues
- Insufficient resources
- Node pool misconfiguration

**Solution:**
```bash
# Check node pool status
gcloud container node-pools describe POOL_NAME \
  --cluster=CLUSTER_NAME \
  --region=REGION

# Restart nodes
gcloud container node-pools update POOL_NAME \
  --cluster=CLUSTER_NAME \
  --region=REGION
```

### Issue: Pods Can't Pull Images

**Error:** "ImagePullBackOff"

**Solution:**
```bash
# Verify Artifact Registry permissions
gcloud artifacts repositories get-iam-policy REPO_NAME \
  --location=REGION

# Add node service account
gcloud artifacts repositories add-iam-policy-binding REPO_NAME \
  --location=REGION \
  --member="serviceAccount:$(terraform output -raw gke_nodes_service_account_email)" \
  --role="roles/artifactregistry.reader"
```

### Issue: Workload Identity Not Working

**Symptoms:** Pods can't access GCP resources

**Diagnosis:**
```bash
kubectl describe serviceaccount app-service-account -n llm-analytics
```

**Solution:**
```bash
# Re-run workload identity setup
./scripts/setup-workload-identity.sh

# Verify annotation
kubectl get serviceaccount app-service-account -n llm-analytics -o yaml
```

### Issue: Network Policy Blocking Traffic

**Symptoms:** Pods can't communicate

**Diagnosis:**
```bash
kubectl get networkpolicies -n llm-analytics
```

**Solution:**
```bash
# Temporarily remove network policies for debugging
kubectl delete networkpolicies --all -n llm-analytics

# Re-apply after fixing
kubectl apply -f manifests/network-policies.yaml
```

### Issue: High Costs

**Solution:**
```bash
# Review current usage
gcloud billing accounts list

# Scale down non-production environments
# Update terraform.tfvars:
app_pool_config = {
  min_nodes = 1
  max_nodes = 3
}

terraform apply

# Use spot instances
preemptible_pool_config = {
  spot = true
}
```

## Support and Resources

### Documentation
- [GKE Documentation](https://cloud.google.com/kubernetes-engine/docs)
- [Terraform GCP Provider](https://registry.terraform.io/providers/hashicorp/google/latest/docs)
- [Kubernetes Documentation](https://kubernetes.io/docs/)

### Useful Commands

```bash
# Check cluster events
kubectl get events --all-namespaces --sort-by=.metadata.creationTimestamp

# View logs
kubectl logs -f POD_NAME -n NAMESPACE

# Execute in pod
kubectl exec -it POD_NAME -n NAMESPACE -- /bin/bash

# Port forward
kubectl port-forward POD_NAME LOCAL_PORT:POD_PORT -n NAMESPACE

# Scale deployment
kubectl scale deployment DEPLOYMENT_NAME --replicas=5 -n NAMESPACE

# Update image
kubectl set image deployment/DEPLOYMENT_NAME CONTAINER_NAME=NEW_IMAGE -n NAMESPACE

# Rollback deployment
kubectl rollout undo deployment/DEPLOYMENT_NAME -n NAMESPACE

# View rollout status
kubectl rollout status deployment/DEPLOYMENT_NAME -n NAMESPACE
```

### Monitoring URLs

```bash
# Get monitoring URLs
echo "Monitoring Dashboard: https://console.cloud.google.com/monitoring/dashboards?project=$(terraform output -raw project_id)"
echo "Logs Viewer: https://console.cloud.google.com/logs/query?project=$(terraform output -raw project_id)"
echo "GKE Console: https://console.cloud.google.com/kubernetes/list?project=$(terraform output -raw project_id)"
```

## Next Steps

1. **Security Hardening**
   - Review and update network policies
   - Configure Binary Authorization policies
   - Set up Secret Manager for sensitive data
   - Enable Security Command Center

2. **Monitoring & Alerting**
   - Create custom Grafana dashboards
   - Set up alerting rules in Prometheus
   - Configure Cloud Monitoring alerts
   - Set up Pub/Sub notifications

3. **CI/CD Integration**
   - Set up Cloud Build or GitHub Actions
   - Configure automated deployments
   - Implement GitOps with ArgoCD or Flux

4. **Disaster Recovery**
   - Test backup and restore procedures
   - Set up multi-region deployment
   - Configure DNS failover
   - Document DR procedures

5. **Cost Optimization**
   - Set up cost allocation labels
   - Review and optimize resource requests
   - Implement pod autoscaling
   - Use committed use discounts

## Conclusion

You now have a fully functional, production-ready GKE cluster for the LLM Analytics Hub. Regular maintenance and monitoring will ensure optimal performance and security.

For questions or issues, refer to the main README.md or contact the platform team.
