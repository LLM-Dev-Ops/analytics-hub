#!/bin/bash

################################################################################
# LLM Analytics Hub - Kubernetes Core Deployment Script
#
# Deploys core Kubernetes resources:
# - Namespace and RBAC
# - ConfigMaps and Secrets
# - Application deployments
# - Services and Ingress
# - HPA and PDB
# - Monitoring stack (Prometheus, Grafana)
#
# Usage: ./deploy-k8s-core.sh [environment]
# Example: ./deploy-k8s-core.sh production
################################################################################

set -euo pipefail

# Script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
INFRASTRUCTURE_DIR="${PROJECT_ROOT}/infrastructure"
K8S_DIR="${PROJECT_ROOT}/k8s"

# Configuration
ENVIRONMENT="${1:-dev}"
NAMESPACE="llm-analytics-hub"
CONFIG_FILE="${INFRASTRUCTURE_DIR}/config/${ENVIRONMENT}.yaml"

# Logging
LOG_FILE="${INFRASTRUCTURE_DIR}/logs/deploy-k8s-${ENVIRONMENT}-$(date +%Y%m%d-%H%M%S).log"
mkdir -p "${INFRASTRUCTURE_DIR}/logs"

################################################################################
# Functions
################################################################################

log() {
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] $*" | tee -a "${LOG_FILE}"
}

error() {
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] ERROR: $*" | tee -a "${LOG_FILE}" >&2
}

check_prerequisites() {
    log "Checking prerequisites..."

    # Check kubectl
    if ! command -v kubectl &> /dev/null; then
        error "kubectl not found. Please install kubectl."
        exit 1
    fi

    # Check cluster connectivity
    if ! kubectl cluster-info &> /dev/null; then
        error "Unable to connect to Kubernetes cluster"
        exit 1
    fi

    # Check helm
    if ! command -v helm &> /dev/null; then
        error "helm not found. Please install helm."
        exit 1
    fi

    log "Prerequisites check passed"
}

create_namespace() {
    log "Creating namespace..."

    kubectl create namespace "${NAMESPACE}" \
        --dry-run=client -o yaml | kubectl apply -f - 2>> "${LOG_FILE}"

    # Label namespace
    kubectl label namespace "${NAMESPACE}" \
        environment="${ENVIRONMENT}" \
        app=llm-analytics-hub \
        --overwrite 2>> "${LOG_FILE}"

    log "Namespace created: ${NAMESPACE}"
}

deploy_data_services() {
    log "Deploying data services (TimescaleDB, Redis, Kafka)..."

    # Deploy TimescaleDB
    if [ -f "${K8S_DIR}/timescaledb.yaml" ]; then
        kubectl apply -f "${K8S_DIR}/timescaledb.yaml" -n "${NAMESPACE}" 2>&1 | tee -a "${LOG_FILE}"
        log "TimescaleDB deployed"
    fi

    # Deploy Redis Cluster
    if [ -f "${K8S_DIR}/redis-cluster.yaml" ]; then
        kubectl apply -f "${K8S_DIR}/redis-cluster.yaml" -n "${NAMESPACE}" 2>&1 | tee -a "${LOG_FILE}"
        log "Redis Cluster deployed"
    fi

    # Deploy Kafka
    if [ -f "${K8S_DIR}/kafka.yaml" ]; then
        kubectl apply -f "${K8S_DIR}/kafka.yaml" -n "${NAMESPACE}" 2>&1 | tee -a "${LOG_FILE}"
        log "Kafka deployed"
    fi

    # Wait for data services to be ready
    log "Waiting for data services to be ready..."
    sleep 10

    kubectl wait --for=condition=ready pod \
        -l app=timescaledb \
        -n "${NAMESPACE}" \
        --timeout=300s 2>> "${LOG_FILE}" || true

    kubectl wait --for=condition=ready pod \
        -l app=redis \
        -n "${NAMESPACE}" \
        --timeout=300s 2>> "${LOG_FILE}" || true
}

deploy_application() {
    log "Deploying application..."

    # Deploy main application
    if [ -f "${K8S_DIR}/deployment.yaml" ]; then
        kubectl apply -f "${K8S_DIR}/deployment.yaml" -n "${NAMESPACE}" 2>&1 | tee -a "${LOG_FILE}"
        log "Application deployment created"
    fi

    # Wait for application pods
    log "Waiting for application pods to be ready..."
    kubectl wait --for=condition=ready pod \
        -l app=analytics-api \
        -n "${NAMESPACE}" \
        --timeout=300s 2>> "${LOG_FILE}" || log "Warning: Some pods may not be ready yet"
}

setup_monitoring_stack() {
    log "Setting up monitoring stack..."

    # Add Prometheus community Helm repo
    helm repo add prometheus-community https://prometheus-community.github.io/helm-charts 2>> "${LOG_FILE}"
    helm repo add grafana https://grafana.github.io/helm-charts 2>> "${LOG_FILE}"
    helm repo update 2>> "${LOG_FILE}"

    # Install Prometheus
    helm upgrade --install prometheus prometheus-community/kube-prometheus-stack \
        --namespace monitoring \
        --create-namespace \
        --set prometheus.prometheusSpec.retention=30d \
        --set prometheus.prometheusSpec.storageSpec.volumeClaimTemplate.spec.resources.requests.storage=50Gi \
        --set grafana.enabled=true \
        --set grafana.adminPassword="$(generate_password)" \
        --set alertmanager.enabled=true \
        --values "${INFRASTRUCTURE_DIR}/monitoring/prometheus-values.yaml" 2>&1 | tee -a "${LOG_FILE}" || true

    log "Monitoring stack deployed"
}

setup_cert_manager() {
    log "Setting up cert-manager for TLS..."

    # Install cert-manager
    helm repo add jetstack https://charts.jetstack.io 2>> "${LOG_FILE}"
    helm repo update 2>> "${LOG_FILE}"

    helm upgrade --install cert-manager jetstack/cert-manager \
        --namespace cert-manager \
        --create-namespace \
        --set installCRDs=true 2>&1 | tee -a "${LOG_FILE}" || true

    # Wait for cert-manager to be ready
    kubectl wait --for=condition=ready pod \
        -l app.kubernetes.io/instance=cert-manager \
        -n cert-manager \
        --timeout=300s 2>> "${LOG_FILE}" || true

    # Create ClusterIssuer for Let's Encrypt
    cat <<EOF | kubectl apply -f - 2>> "${LOG_FILE}"
apiVersion: cert-manager.io/v1
kind: ClusterIssuer
metadata:
  name: letsencrypt-prod
spec:
  acme:
    server: https://acme-v02.api.letsencrypt.org/directory
    email: ops@example.com
    privateKeySecretRef:
      name: letsencrypt-prod
    solvers:
    - http01:
        ingress:
          class: nginx
EOF

    log "Cert-manager configured"
}

configure_network_policies() {
    log "Configuring network policies..."

    cat <<EOF | kubectl apply -f - 2>> "${LOG_FILE}"
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: analytics-api-network-policy
  namespace: ${NAMESPACE}
spec:
  podSelector:
    matchLabels:
      app: analytics-api
  policyTypes:
  - Ingress
  - Egress
  ingress:
  - from:
    - namespaceSelector:
        matchLabels:
          name: ingress-nginx
    ports:
    - protocol: TCP
      port: 3000
  egress:
  - to:
    - podSelector:
        matchLabels:
          app: timescaledb
    ports:
    - protocol: TCP
      port: 5432
  - to:
    - podSelector:
        matchLabels:
          app: redis
    ports:
    - protocol: TCP
      port: 6379
  - to:
    - podSelector:
        matchLabels:
          app: kafka
    ports:
    - protocol: TCP
      port: 9092
  - to:
    - namespaceSelector: {}
    ports:
    - protocol: TCP
      port: 53
    - protocol: UDP
      port: 53
EOF

    log "Network policies configured"
}

setup_pod_disruption_budgets() {
    log "Setting up Pod Disruption Budgets..."

    cat <<EOF | kubectl apply -f - 2>> "${LOG_FILE}"
apiVersion: policy/v1
kind: PodDisruptionBudget
metadata:
  name: analytics-api-pdb
  namespace: ${NAMESPACE}
spec:
  minAvailable: 2
  selector:
    matchLabels:
      app: analytics-api
---
apiVersion: policy/v1
kind: PodDisruptionBudget
metadata:
  name: timescaledb-pdb
  namespace: ${NAMESPACE}
spec:
  minAvailable: 1
  selector:
    matchLabels:
      app: timescaledb
---
apiVersion: policy/v1
kind: PodDisruptionBudget
metadata:
  name: redis-pdb
  namespace: ${NAMESPACE}
spec:
  minAvailable: 2
  selector:
    matchLabels:
      app: redis
EOF

    log "Pod Disruption Budgets configured"
}

setup_resource_quotas() {
    log "Setting up resource quotas..."

    cat <<EOF | kubectl apply -f - 2>> "${LOG_FILE}"
apiVersion: v1
kind: ResourceQuota
metadata:
  name: ${NAMESPACE}-quota
  namespace: ${NAMESPACE}
spec:
  hard:
    requests.cpu: "50"
    requests.memory: "100Gi"
    limits.cpu: "100"
    limits.memory: "200Gi"
    persistentvolumeclaims: "20"
    services.loadbalancers: "2"
EOF

    log "Resource quotas configured"
}

generate_password() {
    local length="${1:-16}"
    openssl rand -base64 32 | tr -d "=+/" | cut -c1-${length}
}

verify_deployment() {
    log "Verifying deployment..."

    # Check all pods
    log "Checking pod status..."
    kubectl get pods -n "${NAMESPACE}" -o wide 2>&1 | tee -a "${LOG_FILE}"

    # Check services
    log "Checking services..."
    kubectl get svc -n "${NAMESPACE}" 2>&1 | tee -a "${LOG_FILE}"

    # Check ingress
    log "Checking ingress..."
    kubectl get ingress -n "${NAMESPACE}" 2>&1 | tee -a "${LOG_FILE}"

    # Check HPA
    log "Checking HPA..."
    kubectl get hpa -n "${NAMESPACE}" 2>&1 | tee -a "${LOG_FILE}"

    log "Deployment verification complete"
}

print_access_info() {
    log "========================================="
    log "Access Information"
    log "========================================="

    # Get LoadBalancer IP for Ingress
    local ingress_ip=$(kubectl get svc -n ingress-nginx ingress-nginx-controller \
        -o jsonpath='{.status.loadBalancer.ingress[0].ip}' 2>/dev/null || echo "pending")

    log "API Endpoint: http://${ingress_ip}"
    log "Grafana: kubectl port-forward -n monitoring svc/prometheus-grafana 3000:80"
    log "Prometheus: kubectl port-forward -n monitoring svc/prometheus-kube-prometheus-prometheus 9090:9090"

    log ""
    log "Grafana admin password: Check the prometheus-grafana secret"
    log "kubectl get secret -n monitoring prometheus-grafana -o jsonpath='{.data.admin-password}' | base64 -d"
}

################################################################################
# Main
################################################################################

main() {
    log "========================================="
    log "LLM Analytics Hub - K8s Core Deployment"
    log "Environment: ${ENVIRONMENT}"
    log "Namespace: ${NAMESPACE}"
    log "========================================="

    check_prerequisites

    log "Starting Kubernetes deployment..."

    # Core setup
    create_namespace

    # Data layer
    deploy_data_services

    # Application layer
    deploy_application

    # Monitoring
    setup_monitoring_stack

    # Security
    setup_cert_manager
    configure_network_policies
    setup_pod_disruption_budgets
    setup_resource_quotas

    # Verification
    verify_deployment
    print_access_info

    log "========================================="
    log "Kubernetes deployment completed!"
    log "========================================="
}

# Run main function
main "$@"
