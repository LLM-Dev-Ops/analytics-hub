# Quick Start Guide
## GCP GKE Infrastructure - LLM Analytics Hub

Get your GKE cluster up and running in 15 minutes!

## Prerequisites

- GCP account with billing enabled
- Project created
- Tools installed: `terraform`, `gcloud`, `kubectl`, `helm`

## 5-Step Deployment

### Step 1: Setup GCP (5 minutes)

```bash
# Login and set project
gcloud auth login
gcloud config set project YOUR_PROJECT_ID
gcloud auth application-default login

# Enable APIs and create state bucket
make full-setup
# Or manually:
# make enable-apis
# make create-state-bucket
```

### Step 2: Configure Variables (2 minutes)

```bash
# Copy and edit config file
cp terraform.tfvars.example terraform.tfvars

# Minimum required:
# project_id  = "your-project-id"
# region      = "us-central1"
# environment = "prod"

vim terraform.tfvars
```

### Step 3: Deploy Infrastructure (15 minutes)

```bash
# Initialize Terraform
make init

# Review plan
make plan

# Deploy (this takes ~15-20 minutes)
make apply
```

### Step 4: Configure kubectl (1 minute)

```bash
# Get cluster credentials
make get-credentials

# Verify
kubectl get nodes
```

### Step 5: Deploy Essentials (5 minutes)

```bash
# Install NGINX, Cert Manager, Prometheus
make deploy-essentials

# Setup Workload Identity
make setup-workload-identity

# Apply storage and network configs
make setup-storage-classes
make setup-network-policies
```

## Verification

```bash
# Check cluster
kubectl cluster-info

# Check nodes (should see 9-20 nodes)
kubectl get nodes

# Check namespaces
kubectl get namespaces

# Check essential pods
kubectl get pods -n ingress-nginx
kubectl get pods -n cert-manager
kubectl get pods -n monitoring
```

## Access Monitoring

```bash
# Grafana (default password: admin)
kubectl port-forward -n monitoring svc/kube-prometheus-stack-grafana 3000:80
# Open http://localhost:3000

# Prometheus
kubectl port-forward -n monitoring svc/kube-prometheus-stack-prometheus 9090:9090
# Open http://localhost:9090
```

## Deploy Your First Application

```bash
# Update image in manifests/example-deployment.yaml
# Then deploy
kubectl apply -f manifests/example-deployment.yaml

# Check deployment
kubectl get pods -n llm-analytics
kubectl get svc -n llm-analytics

# Get LoadBalancer IP
kubectl get svc -n ingress-nginx ingress-nginx-controller
```

## Useful Commands

```bash
# All in one setup
make full-setup init plan apply deploy-essentials

# Get all outputs
make output

# Open GCP console
make gke-console

# Check cluster status
make verify-cluster

# View logs
kubectl logs -f -n llm-analytics -l app=llm-analytics-app
```

## Troubleshooting

### Issue: API not enabled

```bash
make enable-apis
```

### Issue: Quota exceeded

```bash
# Check quotas in Cloud Console
# IAM & Admin > Quotas
```

### Issue: kubectl not configured

```bash
make get-credentials
```

### Issue: Pods pending

```bash
kubectl describe pod POD_NAME -n NAMESPACE
# Check node resources and taints
```

## Clean Up

```bash
# WARNING: This deletes everything!
make destroy
```

## Cost Estimate

**Production (default config):**
- GKE cluster fee: ~$73/month
- Nodes: ~$2,650-$6,575/month
- Storage: ~$200/month
- Load balancers: ~$50/month
- **Total: ~$3,000-$6,900/month**

**Development (cost-optimized):**
- Reduce node counts and use spot instances
- **Total: ~$500-$1,500/month**

## Next Steps

1. Review [README.md](README.md) for detailed documentation
2. Check [ARCHITECTURE.md](ARCHITECTURE.md) for design decisions
3. Follow [DEPLOYMENT_GUIDE.md](DEPLOYMENT_GUIDE.md) for complete setup
4. Deploy your applications
5. Set up CI/CD pipeline
6. Configure monitoring alerts
7. Implement backup/DR procedures

## Support

- Documentation: See README.md
- Issues: Create GitHub issue
- GCP Support: https://cloud.google.com/support

## Quick Reference

| Command | Description |
|---------|-------------|
| `make help` | Show all available commands |
| `make init` | Initialize Terraform |
| `make plan` | Show execution plan |
| `make apply` | Deploy infrastructure |
| `make destroy` | Delete all resources |
| `make get-credentials` | Configure kubectl |
| `make output` | Show Terraform outputs |
| `make verify-cluster` | Verify cluster access |
| `make gke-console` | Open GKE in browser |

---

**You're ready to deploy!**

Run `make full-setup init plan apply` to get started.
