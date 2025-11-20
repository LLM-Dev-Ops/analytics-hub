#!/bin/bash
set -euo pipefail

# TimescaleDB Deployment Script

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
    echo -e "${BLUE}[TimescaleDB]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[TimescaleDB]${NC} $1"
}

log_error() {
    echo -e "${RED}[TimescaleDB]${NC} $1"
}

# Deploy TimescaleDB
log_info "Deploying TimescaleDB..."

if [ -f "$K8S_BASE/databases/timescaledb/statefulset.yaml" ]; then
    # Apply all TimescaleDB manifests
    kubectl apply -f "$K8S_BASE/databases/timescaledb/" -n "$NAMESPACE"

    # Wait for StatefulSet to be ready
    log_info "Waiting for TimescaleDB StatefulSet..."
    kubectl rollout status statefulset/timescaledb -n "$NAMESPACE" --timeout="${TIMEOUT}s"

    # Wait for pods
    log_info "Waiting for TimescaleDB pods to be ready..."
    kubectl wait --for=condition=ready pod -l app=timescaledb -n "$NAMESPACE" --timeout="${TIMEOUT}s"

    # Verify service
    if kubectl get svc timescaledb -n "$NAMESPACE" &>/dev/null; then
        log_success "TimescaleDB service is available"
    fi

    log_success "TimescaleDB deployed successfully"
else
    log_error "TimescaleDB manifests not found at $K8S_BASE/databases/timescaledb/"
    exit 1
fi

# Test connection
log_info "Testing TimescaleDB connection..."
sleep 5

POD=$(kubectl get pods -l app=timescaledb -n "$NAMESPACE" -o jsonpath='{.items[0].metadata.name}')
if [ -n "$POD" ]; then
    if kubectl exec "$POD" -n "$NAMESPACE" -- psql -U postgres -c "SELECT version();" &>/dev/null; then
        log_success "TimescaleDB is accepting connections"
    else
        log_error "TimescaleDB is not accepting connections"
        exit 1
    fi
fi

log_success "TimescaleDB deployment complete"
