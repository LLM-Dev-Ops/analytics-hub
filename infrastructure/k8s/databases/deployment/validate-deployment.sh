#!/bin/bash
set -euo pipefail

# Deployment Validation Script

NAMESPACE="${1:-llm-analytics}"

# Color output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

log_info() {
    echo -e "${BLUE}[VALIDATE]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[VALIDATE]${NC} $1"
}

log_error() {
    echo -e "${RED}[VALIDATE]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[VALIDATE]${NC} $1"
}

ERRORS=0

# Validate namespace exists
validate_namespace() {
    log_info "Validating namespace..."
    if kubectl get namespace "$NAMESPACE" &>/dev/null; then
        log_success "Namespace exists: $NAMESPACE"
    else
        log_error "Namespace does not exist: $NAMESPACE"
        ((ERRORS++))
    fi
}

# Validate pods
validate_pods() {
    log_info "Validating pods..."

    local apps=("timescaledb" "redis" "kafka" "zookeeper")

    for app in "${apps[@]}"; do
        local pod_count=$(kubectl get pods -l "app=$app" -n "$NAMESPACE" 2>/dev/null | grep -c Running || echo 0)

        if [ "$pod_count" -gt 0 ]; then
            log_success "$app: $pod_count pod(s) running"

            # Check if all pods are ready
            local ready_count=$(kubectl get pods -l "app=$app" -n "$NAMESPACE" -o jsonpath='{.items[?(@.status.conditions[?(@.type=="Ready")].status=="True")].metadata.name}' 2>/dev/null | wc -w)

            if [ "$ready_count" -eq "$pod_count" ]; then
                log_success "$app: All pods are ready"
            else
                log_warning "$app: Only $ready_count/$pod_count pods are ready"
            fi
        else
            log_error "$app: No running pods found"
            ((ERRORS++))
        fi
    done
}

# Validate services
validate_services() {
    log_info "Validating services..."

    local services=("timescaledb" "redis-master" "redis-replicas" "kafka" "zookeeper")

    for svc in "${services[@]}"; do
        if kubectl get svc "$svc" -n "$NAMESPACE" &>/dev/null; then
            local cluster_ip=$(kubectl get svc "$svc" -n "$NAMESPACE" -o jsonpath='{.spec.clusterIP}')
            log_success "$svc service exists (ClusterIP: $cluster_ip)"
        else
            log_error "$svc service does not exist"
            ((ERRORS++))
        fi
    done
}

# Validate PVCs
validate_pvcs() {
    log_info "Validating PVCs..."

    local pvcs=$(kubectl get pvc -n "$NAMESPACE" -o jsonpath='{.items[*].metadata.name}')

    if [ -z "$pvcs" ]; then
        log_warning "No PVCs found in namespace"
    else
        for pvc in $pvcs; do
            local status=$(kubectl get pvc "$pvc" -n "$NAMESPACE" -o jsonpath='{.status.phase}')
            if [ "$status" = "Bound" ]; then
                log_success "PVC $pvc is Bound"
            else
                log_error "PVC $pvc is $status"
                ((ERRORS++))
            fi
        done
    fi
}

# Validate StatefulSets
validate_statefulsets() {
    log_info "Validating StatefulSets..."

    local apps=("timescaledb" "redis" "kafka" "zookeeper")

    for app in "${apps[@]}"; do
        if kubectl get statefulset "$app" -n "$NAMESPACE" &>/dev/null; then
            local desired=$(kubectl get statefulset "$app" -n "$NAMESPACE" -o jsonpath='{.spec.replicas}')
            local ready=$(kubectl get statefulset "$app" -n "$NAMESPACE" -o jsonpath='{.status.readyReplicas}')

            if [ "$ready" = "$desired" ]; then
                log_success "StatefulSet $app: $ready/$desired replicas ready"
            else
                log_warning "StatefulSet $app: $ready/$desired replicas ready"
            fi
        else
            log_error "StatefulSet $app does not exist"
            ((ERRORS++))
        fi
    done
}

# Validate connectivity
validate_connectivity() {
    log_info "Validating database connectivity..."

    # Test TimescaleDB
    local ts_pod=$(kubectl get pods -l app=timescaledb -n "$NAMESPACE" -o jsonpath='{.items[0].metadata.name}' 2>/dev/null)
    if [ -n "$ts_pod" ]; then
        if kubectl exec "$ts_pod" -n "$NAMESPACE" -- psql -U postgres -c "SELECT 1;" &>/dev/null; then
            log_success "TimescaleDB is accepting connections"
        else
            log_error "TimescaleDB is not accepting connections"
            ((ERRORS++))
        fi
    fi

    # Test Redis
    local redis_pod=$(kubectl get pods -l app=redis,role=master -n "$NAMESPACE" -o jsonpath='{.items[0].metadata.name}' 2>/dev/null)
    if [ -n "$redis_pod" ]; then
        if kubectl exec "$redis_pod" -n "$NAMESPACE" -- redis-cli ping | grep -q PONG; then
            log_success "Redis is accepting connections"
        else
            log_error "Redis is not accepting connections"
            ((ERRORS++))
        fi
    fi

    # Test Kafka
    local kafka_pod=$(kubectl get pods -l app=kafka -n "$NAMESPACE" -o jsonpath='{.items[0].metadata.name}' 2>/dev/null)
    if [ -n "$kafka_pod" ]; then
        if kubectl exec "$kafka_pod" -n "$NAMESPACE" -- kafka-broker-api-versions.sh --bootstrap-server localhost:9092 &>/dev/null; then
            log_success "Kafka is accepting connections"
        else
            log_error "Kafka is not accepting connections"
            ((ERRORS++))
        fi
    fi
}

# Main validation
main() {
    log_info "=========================================="
    log_info "Database Deployment Validation"
    log_info "Namespace: $NAMESPACE"
    log_info "=========================================="

    validate_namespace
    validate_pods
    validate_services
    validate_pvcs
    validate_statefulsets
    validate_connectivity

    echo ""
    if [ $ERRORS -eq 0 ]; then
        log_success "=========================================="
        log_success "All validation checks passed!"
        log_success "=========================================="
        exit 0
    else
        log_error "=========================================="
        log_error "Validation failed with $ERRORS error(s)"
        log_error "=========================================="
        exit 1
    fi
}

main "$@"
