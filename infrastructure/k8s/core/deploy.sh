#!/bin/bash

# LLM Analytics Hub - Kubernetes Core Infrastructure Deployment Script
# This script deploys all core platform components to a Kubernetes cluster

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
NAMESPACE="llm-analytics"
MONITORING_NS="monitoring"
LOGGING_NS="logging"
SECURITY_NS="security"
STORAGE_NS="storage"

# Function to print colored output
print_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Function to check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Function to wait for deployment to be ready
wait_for_deployment() {
    local namespace=$1
    local deployment=$2
    local timeout=${3:-300}

    print_info "Waiting for deployment $deployment in namespace $namespace to be ready..."
    kubectl wait --for=condition=available --timeout=${timeout}s \
        deployment/$deployment -n $namespace || {
        print_error "Deployment $deployment failed to become ready"
        return 1
    }
}

# Function to wait for pods to be ready
wait_for_pods() {
    local namespace=$1
    local label=$2
    local timeout=${3:-300}

    print_info "Waiting for pods with label $label in namespace $namespace..."
    kubectl wait --for=condition=ready --timeout=${timeout}s \
        pod -l $label -n $namespace || {
        print_warn "Some pods with label $label may not be ready yet"
        return 0
    }
}

# Pre-flight checks
print_info "Running pre-flight checks..."

if ! command_exists kubectl; then
    print_error "kubectl is not installed. Please install kubectl first."
    exit 1
fi

if ! command_exists helm; then
    print_error "helm is not installed. Please install Helm 3+ first."
    exit 1
fi

# Check if cluster is accessible
if ! kubectl cluster-info &> /dev/null; then
    print_error "Cannot connect to Kubernetes cluster. Please check your kubeconfig."
    exit 1
fi

print_info "Pre-flight checks passed!"

# Step 1: Create namespaces
print_info "Creating namespaces..."
kubectl apply -f namespaces.yaml

# Step 2: Create storage classes
print_info "Creating storage classes..."
kubectl apply -f storage/storage-classes.yaml

# Step 3: Deploy cert-manager
print_info "Deploying cert-manager..."

# Add cert-manager Helm repo
helm repo add jetstack https://charts.jetstack.io
helm repo update

# Install cert-manager
helm upgrade --install cert-manager jetstack/cert-manager \
    --namespace cert-manager \
    --version v1.14.0 \
    --values cert-manager/helm-values.yaml \
    --wait \
    --timeout 10m

wait_for_deployment cert-manager cert-manager
wait_for_deployment cert-manager cert-manager-webhook
wait_for_deployment cert-manager cert-manager-cainjector

# Apply cluster issuers
print_info "Applying cert-manager cluster issuers..."
kubectl apply -f cert-manager/cluster-issuers.yaml

# Step 4: Deploy NGINX Ingress Controller
print_info "Deploying NGINX Ingress Controller..."

# Add ingress-nginx Helm repo
helm repo add ingress-nginx https://kubernetes.github.io/ingress-nginx
helm repo update

# Install NGINX Ingress
helm upgrade --install ingress-nginx ingress-nginx/ingress-nginx \
    --namespace ingress-nginx \
    --version 4.10.0 \
    --values ingress/helm-values.yaml \
    --wait \
    --timeout 10m

wait_for_deployment ingress-nginx ingress-nginx-controller

# Apply ingress configurations
print_info "Applying ingress configurations..."
kubectl apply -f ingress/rate-limit-middleware.yaml

# Step 5: Deploy Prometheus Stack
print_info "Deploying Prometheus monitoring stack..."

# Add prometheus-community Helm repo
helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
helm repo update

# Install kube-prometheus-stack
helm upgrade --install kube-prometheus-stack prometheus-community/kube-prometheus-stack \
    --namespace $MONITORING_NS \
    --version 56.0.0 \
    --values monitoring/prometheus/helm-values.yaml \
    --values monitoring/grafana/helm-values.yaml \
    --wait \
    --timeout 15m

wait_for_deployment $MONITORING_NS prometheus-operator-kube-state-metrics
wait_for_pods $MONITORING_NS app.kubernetes.io/name=prometheus

# Apply service monitors and prometheus rules
print_info "Applying Prometheus ServiceMonitors and rules..."
kubectl apply -f monitoring/prometheus/service-monitors.yaml
kubectl apply -f monitoring/grafana/dashboards.yaml

# Step 6: Deploy Loki logging stack
print_info "Deploying Loki logging stack..."

# Add grafana Helm repo
helm repo add grafana https://grafana.github.io/helm-charts
helm repo update

# Install Loki distributed
helm upgrade --install loki grafana/loki-distributed \
    --namespace $LOGGING_NS \
    --version 0.78.0 \
    --values logging/loki/helm-values.yaml \
    --wait \
    --timeout 15m

# Install Promtail
helm upgrade --install promtail grafana/promtail \
    --namespace $LOGGING_NS \
    --version 6.15.0 \
    --values logging/promtail/helm-values.yaml \
    --wait \
    --timeout 10m

# Apply log retention policies
kubectl apply -f logging/log-retention-policy.yaml

# Step 7: Deploy autoscaling components
print_info "Deploying autoscaling components..."

# Install Vertical Pod Autoscaler (VPA)
print_info "Installing VPA..."
kubectl apply -f https://github.com/kubernetes/autoscaler/releases/download/vertical-pod-autoscaler-1.0.0/vpa-v1-crd-gen.yaml || true

# Install KEDA
print_info "Installing KEDA..."
helm repo add kedacore https://kedacore.github.io/charts
helm repo update

helm upgrade --install keda kedacore/keda \
    --namespace keda \
    --create-namespace \
    --version 2.13.0 \
    --wait \
    --timeout 10m

# Apply HPA and VPA configurations
kubectl apply -f autoscaling/hpa-configurations.yaml
kubectl apply -f autoscaling/vpa-configurations.yaml
kubectl apply -f autoscaling/keda-configurations.yaml

# Step 8: Deploy security components
print_info "Deploying security components..."

# Install OPA Gatekeeper
helm repo add gatekeeper https://open-policy-agent.github.io/gatekeeper/charts
helm repo update

helm upgrade --install gatekeeper gatekeeper/gatekeeper \
    --namespace gatekeeper-system \
    --create-namespace \
    --version 3.15.0 \
    --wait \
    --timeout 10m

# Apply security policies
kubectl apply -f security/pod-security-standards.yaml
kubectl apply -f security/network-policies.yaml
kubectl apply -f security/opa-gatekeeper.yaml

# Step 9: Deploy Istio service mesh (optional)
read -p "Do you want to deploy Istio service mesh? (y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    print_info "Deploying Istio service mesh..."

    # Check if istioctl is installed
    if ! command_exists istioctl; then
        print_warn "istioctl is not installed. Skipping Istio deployment."
        print_info "Please install istioctl from: https://istio.io/latest/docs/setup/getting-started/"
    else
        # Install Istio
        istioctl install -f service-mesh/istio/istio-operator.yaml -y

        # Apply traffic management configs
        kubectl apply -f service-mesh/istio/traffic-management.yaml

        # Label namespace for sidecar injection
        kubectl label namespace $NAMESPACE istio-injection=enabled --overwrite
    fi
fi

# Step 10: Verify deployments
print_info "Verifying deployments..."

echo ""
echo "=== Namespace Status ==="
kubectl get namespaces

echo ""
echo "=== Storage Classes ==="
kubectl get storageclasses

echo ""
echo "=== Cert-manager Status ==="
kubectl get pods -n cert-manager

echo ""
echo "=== Ingress Controller Status ==="
kubectl get pods -n ingress-nginx
kubectl get svc -n ingress-nginx

echo ""
echo "=== Monitoring Stack Status ==="
kubectl get pods -n $MONITORING_NS

echo ""
echo "=== Logging Stack Status ==="
kubectl get pods -n $LOGGING_NS

echo ""
echo "=== Autoscaling Components ==="
kubectl get hpa -A
kubectl get vpa -A 2>/dev/null || print_warn "VPA not found"

echo ""
echo "=== Security Components ==="
kubectl get constrainttemplates.templates.gatekeeper.sh 2>/dev/null || print_warn "Gatekeeper not found"
kubectl get networkpolicies -A

# Step 11: Print access information
print_info "Deployment complete!"

echo ""
echo "========================================="
echo "  Access Information"
echo "========================================="
echo ""

# Get LoadBalancer IP/hostname
INGRESS_IP=$(kubectl get svc ingress-nginx-controller -n ingress-nginx -o jsonpath='{.status.loadBalancer.ingress[0].ip}' 2>/dev/null)
INGRESS_HOSTNAME=$(kubectl get svc ingress-nginx-controller -n ingress-nginx -o jsonpath='{.status.loadBalancer.ingress[0].hostname}' 2>/dev/null)

if [ -n "$INGRESS_IP" ]; then
    echo "Ingress LoadBalancer IP: $INGRESS_IP"
elif [ -n "$INGRESS_HOSTNAME" ]; then
    echo "Ingress LoadBalancer Hostname: $INGRESS_HOSTNAME"
else
    print_warn "LoadBalancer IP/Hostname not yet assigned. Check: kubectl get svc -n ingress-nginx"
fi

echo ""
echo "Update your DNS records to point to the LoadBalancer IP/Hostname:"
echo "  - grafana.llm-analytics.io"
echo "  - prometheus.llm-analytics.io"
echo "  - alertmanager.llm-analytics.io"
echo "  - loki.llm-analytics.io"
echo "  - api.llm-analytics.io"
echo "  - llm-analytics.io"
echo ""

# Print credentials
echo "========================================="
echo "  Default Credentials (CHANGE THESE!)"
echo "========================================="
echo ""
echo "Grafana:"
echo "  URL: https://grafana.llm-analytics.io"
echo "  Username: admin"
echo "  Password: changeme"
echo ""

print_warn "IMPORTANT: Change all default passwords immediately!"
print_warn "IMPORTANT: Update cert-manager email in cluster-issuers.yaml"
print_warn "IMPORTANT: Configure your cloud provider credentials for DNS-01 challenges"
print_warn "IMPORTANT: Update Slack/PagerDuty webhook URLs in alertmanager configuration"

echo ""
print_info "For next steps, see README.md"

exit 0
