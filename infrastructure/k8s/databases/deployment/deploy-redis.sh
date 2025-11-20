#!/bin/bash
set -euo pipefail

# Redis Deployment Script

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
    echo -e "${BLUE}[Redis]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[Redis]${NC} $1"
}

log_error() {
    echo -e "${RED}[Redis]${NC} $1"
}

# Deploy Redis
log_info "Deploying Redis..."

if [ -f "$K8S_BASE/databases/redis/statefulset.yaml" ]; then
    # Apply all Redis manifests
    kubectl apply -f "$K8S_BASE/databases/redis/" -n "$NAMESPACE"

    # Wait for StatefulSet to be ready
    log_info "Waiting for Redis StatefulSet..."
    kubectl rollout status statefulset/redis -n "$NAMESPACE" --timeout="${TIMEOUT}s"

    # Wait for pods
    log_info "Waiting for Redis pods to be ready..."
    kubectl wait --for=condition=ready pod -l app=redis -n "$NAMESPACE" --timeout="${TIMEOUT}s"

    # Verify services
    if kubectl get svc redis-master -n "$NAMESPACE" &>/dev/null; then
        log_success "Redis master service is available"
    fi

    if kubectl get svc redis-replicas -n "$NAMESPACE" &>/dev/null; then
        log_success "Redis replica service is available"
    fi

    log_success "Redis deployed successfully"
else
    log_error "Redis manifests not found at $K8S_BASE/databases/redis/"
    exit 1
fi

# Test connection
log_info "Testing Redis connection..."
sleep 5

POD=$(kubectl get pods -l app=redis,role=master -n "$NAMESPACE" -o jsonpath='{.items[0].metadata.name}')
if [ -n "$POD" ]; then
    if kubectl exec "$POD" -n "$NAMESPACE" -- redis-cli ping | grep -q PONG; then
        log_success "Redis is accepting connections"
    else
        log_error "Redis is not accepting connections"
        exit 1
    fi
fi

log_success "Redis deployment complete"
