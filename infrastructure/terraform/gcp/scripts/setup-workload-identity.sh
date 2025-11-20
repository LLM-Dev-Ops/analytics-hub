#!/bin/bash
################################################################################
# Setup Workload Identity for GKE
# LLM Analytics Hub - GCP GKE Infrastructure
################################################################################

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}Setting up Workload Identity${NC}"
echo -e "${GREEN}========================================${NC}"

# Get Terraform outputs
echo -e "\n${YELLOW}Reading Terraform outputs...${NC}"
PROJECT_ID=$(terraform output -raw project_id 2>/dev/null || echo "")
APP_SA=$(terraform output -raw app_workload_service_account_email 2>/dev/null || echo "")
DB_SA=$(terraform output -raw db_workload_service_account_email 2>/dev/null || echo "")
MONITORING_SA=$(terraform output -raw monitoring_workload_service_account_email 2>/dev/null || echo "")
SECRETS_SA=$(terraform output -raw secrets_workload_service_account_email 2>/dev/null || echo "")
STORAGE_SA=$(terraform output -raw storage_workload_service_account_email 2>/dev/null || echo "")
EXTERNAL_DNS_SA=$(terraform output -raw external_dns_service_account_email 2>/dev/null || echo "")
CERT_MANAGER_SA=$(terraform output -raw cert_manager_service_account_email 2>/dev/null || echo "")

if [ -z "$PROJECT_ID" ]; then
    echo -e "${RED}Error: Could not read Terraform outputs. Run 'terraform apply' first.${NC}"
    exit 1
fi

echo "Project ID: $PROJECT_ID"

# Create namespaces if they don't exist
echo -e "\n${GREEN}Creating namespaces...${NC}"
kubectl create namespace llm-analytics --dry-run=client -o yaml | kubectl apply -f -
kubectl create namespace monitoring --dry-run=client -o yaml | kubectl apply -f -
kubectl create namespace kube-system --dry-run=client -o yaml | kubectl apply -f -
kubectl create namespace cert-manager --dry-run=client -o yaml | kubectl apply -f -

# Setup App Workload Identity
echo -e "\n${GREEN}Setting up App Workload Identity...${NC}"
kubectl create serviceaccount app-service-account -n llm-analytics --dry-run=client -o yaml | kubectl apply -f -
kubectl annotate serviceaccount app-service-account \
  -n llm-analytics \
  iam.gke.io/gcp-service-account=$APP_SA \
  --overwrite

# Setup DB Workload Identity
echo -e "\n${GREEN}Setting up DB Workload Identity...${NC}"
kubectl create serviceaccount db-service-account -n llm-analytics --dry-run=client -o yaml | kubectl apply -f -
kubectl annotate serviceaccount db-service-account \
  -n llm-analytics \
  iam.gke.io/gcp-service-account=$DB_SA \
  --overwrite

# Setup Monitoring Workload Identity
echo -e "\n${GREEN}Setting up Monitoring Workload Identity...${NC}"
kubectl create serviceaccount prometheus-service-account -n monitoring --dry-run=client -o yaml | kubectl apply -f -
kubectl annotate serviceaccount prometheus-service-account \
  -n monitoring \
  iam.gke.io/gcp-service-account=$MONITORING_SA \
  --overwrite

# Setup Secrets Workload Identity
echo -e "\n${GREEN}Setting up Secrets Workload Identity...${NC}"
kubectl create serviceaccount secrets-service-account -n llm-analytics --dry-run=client -o yaml | kubectl apply -f -
kubectl annotate serviceaccount secrets-service-account \
  -n llm-analytics \
  iam.gke.io/gcp-service-account=$SECRETS_SA \
  --overwrite

# Setup Storage Workload Identity
echo -e "\n${GREEN}Setting up Storage Workload Identity...${NC}"
kubectl create serviceaccount storage-service-account -n llm-analytics --dry-run=client -o yaml | kubectl apply -f -
kubectl annotate serviceaccount storage-service-account \
  -n llm-analytics \
  iam.gke.io/gcp-service-account=$STORAGE_SA \
  --overwrite

# Setup External DNS Workload Identity
echo -e "\n${GREEN}Setting up External DNS Workload Identity...${NC}"
kubectl create serviceaccount external-dns -n kube-system --dry-run=client -o yaml | kubectl apply -f -
kubectl annotate serviceaccount external-dns \
  -n kube-system \
  iam.gke.io/gcp-service-account=$EXTERNAL_DNS_SA \
  --overwrite

# Setup Cert Manager Workload Identity
echo -e "\n${GREEN}Setting up Cert Manager Workload Identity...${NC}"
kubectl create serviceaccount cert-manager -n cert-manager --dry-run=client -o yaml | kubectl apply -f -
kubectl annotate serviceaccount cert-manager \
  -n cert-manager \
  iam.gke.io/gcp-service-account=$CERT_MANAGER_SA \
  --overwrite

# Verify setup
echo -e "\n${GREEN}Verifying Workload Identity setup...${NC}"
echo -e "\n${YELLOW}Service Accounts created:${NC}"
kubectl get serviceaccounts -n llm-analytics
kubectl get serviceaccounts -n monitoring
kubectl get serviceaccounts -n kube-system | grep external-dns
kubectl get serviceaccounts -n cert-manager | grep cert-manager

# Summary
echo -e "\n${GREEN}========================================${NC}"
echo -e "${GREEN}Workload Identity Setup Complete!${NC}"
echo -e "${GREEN}========================================${NC}"

echo -e "\n${YELLOW}Service Account Bindings:${NC}"
echo "✓ app-service-account (llm-analytics) → $APP_SA"
echo "✓ db-service-account (llm-analytics) → $DB_SA"
echo "✓ prometheus-service-account (monitoring) → $MONITORING_SA"
echo "✓ secrets-service-account (llm-analytics) → $SECRETS_SA"
echo "✓ storage-service-account (llm-analytics) → $STORAGE_SA"
echo "✓ external-dns (kube-system) → $EXTERNAL_DNS_SA"
echo "✓ cert-manager (cert-manager) → $CERT_MANAGER_SA"

echo -e "\n${YELLOW}Usage in Pods:${NC}"
cat <<EOF

Add this to your pod spec to use Workload Identity:

spec:
  serviceAccountName: app-service-account  # or other service account
  containers:
  - name: my-app
    image: my-image
    # App can now access GCP resources with the bound service account
EOF

echo -e "\n${YELLOW}Test Workload Identity:${NC}"
cat <<'EOF'

kubectl run -it --rm test-wi \
  --image=google/cloud-sdk:slim \
  --serviceaccount=app-service-account \
  -n llm-analytics \
  --restart=Never \
  -- gcloud auth list

EOF

echo -e "${GREEN}Done!${NC}"
