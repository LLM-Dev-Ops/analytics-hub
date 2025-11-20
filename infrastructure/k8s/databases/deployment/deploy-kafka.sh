#!/bin/bash
set -euo pipefail

# Kafka Deployment Script

ENVIRONMENT="${1:-dev}"
NAMESPACE="${2:-llm-analytics}"
K8S_BASE="/workspaces/llm-analytics-hub/infrastructure/core/kubernetes"
TIMEOUT=300

# Color output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m'

log_info() {
    echo -e "${BLUE}[Kafka]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[Kafka]${NC} $1"
}

log_error() {
    echo -e "${RED}[Kafka]${NC} $1"
}

# Deploy Kafka
log_info "Deploying Kafka..."

if [ -f "$K8S_BASE/databases/kafka/statefulset.yaml" ]; then
    # Apply all Kafka manifests
    kubectl apply -f "$K8S_BASE/databases/kafka/" -n "$NAMESPACE"

    # Wait for StatefulSet to be ready
    log_info "Waiting for Kafka StatefulSet..."
    kubectl rollout status statefulset/kafka -n "$NAMESPACE" --timeout="${TIMEOUT}s"

    # Wait for pods
    log_info "Waiting for Kafka pods to be ready..."
    kubectl wait --for=condition=ready pod -l app=kafka -n "$NAMESPACE" --timeout="${TIMEOUT}s"

    # Verify service
    if kubectl get svc kafka -n "$NAMESPACE" &>/dev/null; then
        log_success "Kafka service is available"
    fi

    log_success "Kafka deployed successfully"
else
    log_error "Kafka manifests not found at $K8S_BASE/databases/kafka/"
    exit 1
fi

# Wait for Kafka to be fully ready
log_info "Waiting for Kafka to be fully ready..."
sleep 15

# Test connection
log_info "Testing Kafka connection..."

POD=$(kubectl get pods -l app=kafka -n "$NAMESPACE" -o jsonpath='{.items[0].metadata.name}')
if [ -n "$POD" ]; then
    if kubectl exec "$POD" -n "$NAMESPACE" -- kafka-broker-api-versions.sh --bootstrap-server localhost:9092 &>/dev/null; then
        log_success "Kafka is accepting connections"
    else
        log_error "Kafka is not accepting connections"
        exit 1
    fi
fi

log_success "Kafka deployment complete"
