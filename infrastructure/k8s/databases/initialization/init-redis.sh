#!/bin/bash
set -euo pipefail

# Redis Initialization Script

NAMESPACE="${1:-llm-analytics}"

# Color output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m'

log_info() {
    echo -e "${BLUE}[Redis Init]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[Redis Init]${NC} $1"
}

log_error() {
    echo -e "${RED}[Redis Init]${NC} $1"
}

log_info "Initializing Redis..."

# Get Redis master pod
MASTER_POD=$(kubectl get pods -l app=redis,role=master -n "$NAMESPACE" -o jsonpath='{.items[0].metadata.name}')

if [ -z "$MASTER_POD" ]; then
    log_error "Redis master pod not found"
    exit 1
fi

log_info "Redis master pod: $MASTER_POD"

# Configure Redis settings
log_info "Configuring Redis memory settings..."

kubectl exec "$MASTER_POD" -n "$NAMESPACE" -- redis-cli CONFIG SET maxmemory 2gb || true
kubectl exec "$MASTER_POD" -n "$NAMESPACE" -- redis-cli CONFIG SET maxmemory-policy allkeys-lru || true
kubectl exec "$MASTER_POD" -n "$NAMESPACE" -- redis-cli CONFIG SET save "900 1 300 10 60 10000" || true

log_success "Memory settings configured"

# Test replication (if replicas exist)
REPLICA_COUNT=$(kubectl get pods -l app=redis,role=replica -n "$NAMESPACE" --no-headers 2>/dev/null | wc -l)

if [ "$REPLICA_COUNT" -gt 0 ]; then
    log_info "Testing replication with $REPLICA_COUNT replica(s)..."

    # Write test key on master
    kubectl exec "$MASTER_POD" -n "$NAMESPACE" -- redis-cli SET test_replication "success" EX 60

    # Wait for replication
    sleep 2

    # Read from replica
    REPLICA_POD=$(kubectl get pods -l app=redis,role=replica -n "$NAMESPACE" -o jsonpath='{.items[0].metadata.name}')

    if [ -n "$REPLICA_POD" ]; then
        VALUE=$(kubectl exec "$REPLICA_POD" -n "$NAMESPACE" -- redis-cli GET test_replication)

        if [ "$VALUE" = "success" ]; then
            log_success "Replication is working correctly"
        else
            log_error "Replication test failed"
        fi
    fi
else
    log_info "No replicas configured, skipping replication test"
fi

# Create initial cache structure (namespaces)
log_info "Creating cache namespaces..."

kubectl exec "$MASTER_POD" -n "$NAMESPACE" -- redis-cli SET "llm:cache:initialized" "true" EX 86400
kubectl exec "$MASTER_POD" -n "$NAMESPACE" -- redis-cli SET "llm:session:initialized" "true" EX 86400
kubectl exec "$MASTER_POD" -n "$NAMESPACE" -- redis-cli SET "llm:ratelimit:initialized" "true" EX 86400

log_success "Cache namespaces created"

# Display Redis info
log_info "Redis information:"
kubectl exec "$MASTER_POD" -n "$NAMESPACE" -- redis-cli INFO server | grep redis_version || true
kubectl exec "$MASTER_POD" -n "$NAMESPACE" -- redis-cli INFO replication | grep role || true

log_success "Redis initialization complete"
