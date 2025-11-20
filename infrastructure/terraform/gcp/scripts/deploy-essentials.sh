#!/bin/bash
################################################################################
# Deploy Essential Kubernetes Components
# LLM Analytics Hub - GCP GKE Infrastructure
################################################################################

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}Deploying Essential K8s Components${NC}"
echo -e "${GREEN}========================================${NC}"

# Check if kubectl is configured
if ! kubectl cluster-info &> /dev/null; then
    echo -e "${RED}Error: kubectl is not configured or cluster is not reachable${NC}"
    exit 1
fi

echo -e "${YELLOW}Current cluster:${NC}"
kubectl config current-context

# Add Helm repositories
echo -e "\n${GREEN}Adding Helm repositories...${NC}"
helm repo add ingress-nginx https://kubernetes.github.io/ingress-nginx
helm repo add jetstack https://charts.jetstack.io
helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
helm repo add bitnami https://charts.bitnami.com/bitnami
helm repo update

# Create namespaces
echo -e "\n${GREEN}Creating namespaces...${NC}"
kubectl create namespace ingress-nginx --dry-run=client -o yaml | kubectl apply -f -
kubectl create namespace cert-manager --dry-run=client -o yaml | kubectl apply -f -
kubectl create namespace monitoring --dry-run=client -o yaml | kubectl apply -f -
kubectl create namespace llm-analytics --dry-run=client -o yaml | kubectl apply -f -

# Label namespaces for pod security
echo -e "\n${GREEN}Applying pod security labels...${NC}"
kubectl label namespace llm-analytics \
  pod-security.kubernetes.io/enforce=restricted \
  pod-security.kubernetes.io/audit=restricted \
  pod-security.kubernetes.io/warn=restricted \
  --overwrite

# Install NGINX Ingress Controller
echo -e "\n${GREEN}Installing NGINX Ingress Controller...${NC}"
helm upgrade --install ingress-nginx ingress-nginx/ingress-nginx \
  --namespace ingress-nginx \
  --set controller.service.type=LoadBalancer \
  --set controller.metrics.enabled=true \
  --set controller.podSecurityPolicy.enabled=false \
  --wait

# Install Cert Manager
echo -e "\n${GREEN}Installing Cert Manager...${NC}"
helm upgrade --install cert-manager jetstack/cert-manager \
  --namespace cert-manager \
  --set installCRDs=true \
  --set global.leaderElection.namespace=cert-manager \
  --wait

# Install Prometheus & Grafana
echo -e "\n${GREEN}Installing Prometheus & Grafana...${NC}"
helm upgrade --install kube-prometheus-stack prometheus-community/kube-prometheus-stack \
  --namespace monitoring \
  --set prometheus.prometheusSpec.serviceMonitorSelectorNilUsesHelmValues=false \
  --set prometheus.prometheusSpec.podMonitorSelectorNilUsesHelmValues=false \
  --set grafana.adminPassword=admin \
  --wait

# Get LoadBalancer IP
echo -e "\n${GREEN}Waiting for LoadBalancer IP...${NC}"
for i in {1..30}; do
  EXTERNAL_IP=$(kubectl get svc -n ingress-nginx ingress-nginx-controller -o jsonpath='{.status.loadBalancer.ingress[0].ip}')
  if [ -n "$EXTERNAL_IP" ]; then
    break
  fi
  echo "Waiting for LoadBalancer IP... ($i/30)"
  sleep 10
done

# Summary
echo -e "\n${GREEN}========================================${NC}"
echo -e "${GREEN}Deployment Complete!${NC}"
echo -e "${GREEN}========================================${NC}"

echo -e "\n${YELLOW}Installed Components:${NC}"
echo "✓ NGINX Ingress Controller (namespace: ingress-nginx)"
echo "✓ Cert Manager (namespace: cert-manager)"
echo "✓ Prometheus & Grafana (namespace: monitoring)"

if [ -n "$EXTERNAL_IP" ]; then
  echo -e "\n${YELLOW}LoadBalancer IP:${NC} $EXTERNAL_IP"
  echo -e "\nConfigure DNS records to point to this IP"
else
  echo -e "\n${RED}Warning: LoadBalancer IP not assigned yet${NC}"
  echo "Run: kubectl get svc -n ingress-nginx ingress-nginx-controller"
fi

echo -e "\n${YELLOW}Access Grafana:${NC}"
echo "kubectl port-forward -n monitoring svc/kube-prometheus-stack-grafana 3000:80"
echo "Username: admin"
echo "Password: admin"

echo -e "\n${YELLOW}Access Prometheus:${NC}"
echo "kubectl port-forward -n monitoring svc/kube-prometheus-stack-prometheus 9090:9090"

echo -e "\n${YELLOW}Next Steps:${NC}"
echo "1. Configure Workload Identity: ./scripts/setup-workload-identity.sh"
echo "2. Apply storage classes: kubectl apply -f manifests/storage-classes.yaml"
echo "3. Apply network policies: kubectl apply -f manifests/network-policies.yaml"
echo "4. Deploy your applications to the llm-analytics namespace"

echo -e "\n${GREEN}Done!${NC}"
