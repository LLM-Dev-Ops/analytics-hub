#!/bin/bash
set -euo pipefail

# Comprehensive Health Check Script

NAMESPACE="${1:-llm-analytics}"

# Color output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

log_info() {
    echo -e "${BLUE}[HEALTH]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[HEALTH]${NC} $1"
}

log_error() {
    echo -e "${RED}[HEALTH]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[HEALTH]${NC} $1"
}

TOTAL_CHECKS=0
PASSED_CHECKS=0
FAILED_CHECKS=0
WARNING_CHECKS=0

# Check function wrapper
check() {
    local check_name=$1
    local check_command=$2

    ((TOTAL_CHECKS++))

    log_info "Checking: $check_name..."

    if eval "$check_command" &>/dev/null; then
        log_success "$check_name: OK"
        ((PASSED_CHECKS++))
        return 0
    else
        log_error "$check_name: FAILED"
        ((FAILED_CHECKS++))
        return 1
    fi
}

# Warning function wrapper
check_warning() {
    local check_name=$1
    local check_command=$2

    ((TOTAL_CHECKS++))

    log_info "Checking: $check_name..."

    if eval "$check_command" &>/dev/null; then
        log_success "$check_name: OK"
        ((PASSED_CHECKS++))
        return 0
    else
        log_warning "$check_name: WARNING"
        ((WARNING_CHECKS++))
        return 1
    fi
}

log_info "=========================================="
log_info "Database Health Check"
log_info "Namespace: $NAMESPACE"
log_info "=========================================="

# Namespace checks
check "Namespace exists" "kubectl get namespace $NAMESPACE"

# TimescaleDB health checks
log_info ""
log_info "--- TimescaleDB Health ---"
check "TimescaleDB pod running" "kubectl get pods -l app=timescaledb -n $NAMESPACE | grep -q Running"
check "TimescaleDB service exists" "kubectl get svc timescaledb -n $NAMESPACE"
check "TimescaleDB PVC bound" "kubectl get pvc -l app=timescaledb -n $NAMESPACE -o jsonpath='{.items[0].status.phase}' | grep -q Bound"

if kubectl get pods -l app=timescaledb -n "$NAMESPACE" &>/dev/null; then
    POD=$(kubectl get pods -l app=timescaledb -n "$NAMESPACE" -o jsonpath='{.items[0].metadata.name}')
    check "TimescaleDB accepting connections" "kubectl exec $POD -n $NAMESPACE -- psql -U postgres -c 'SELECT 1;'"
    check "Analytics database exists" "kubectl exec $POD -n $NAMESPACE -- psql -U postgres -lqt | cut -d '|' -f 1 | grep -qw analytics"
    check_warning "TimescaleDB extension installed" "kubectl exec $POD -n $NAMESPACE -- psql -U postgres -d analytics -c '\\dx' | grep -q timescaledb"
fi

# Redis health checks
log_info ""
log_info "--- Redis Health ---"
check "Redis pod running" "kubectl get pods -l app=redis -n $NAMESPACE | grep -q Running"
check "Redis master service exists" "kubectl get svc redis-master -n $NAMESPACE"
check "Redis PVC bound" "kubectl get pvc -l app=redis -n $NAMESPACE -o jsonpath='{.items[0].status.phase}' | grep -q Bound"

if kubectl get pods -l app=redis,role=master -n "$NAMESPACE" &>/dev/null; then
    POD=$(kubectl get pods -l app=redis,role=master -n "$NAMESPACE" -o jsonpath='{.items[0].metadata.name}')
    check "Redis master accepting connections" "kubectl exec $POD -n $NAMESPACE -- redis-cli ping | grep -q PONG"
    check_warning "Redis memory configured" "kubectl exec $POD -n $NAMESPACE -- redis-cli CONFIG GET maxmemory | grep -v '^maxmemory$' | grep -q ."
fi

# Check Redis replication
REPLICA_COUNT=$(kubectl get pods -l app=redis,role=replica -n "$NAMESPACE" --no-headers 2>/dev/null | wc -l)
if [ "$REPLICA_COUNT" -gt 0 ]; then
    log_info "Redis replication configured ($REPLICA_COUNT replica(s))"
    check_warning "Redis replicas running" "kubectl get pods -l app=redis,role=replica -n $NAMESPACE | grep -q Running"
fi

# Kafka health checks
log_info ""
log_info "--- Kafka Health ---"
check "Kafka pod running" "kubectl get pods -l app=kafka -n $NAMESPACE | grep -q Running"
check "Kafka service exists" "kubectl get svc kafka -n $NAMESPACE"
check "Kafka PVC bound" "kubectl get pvc -l app=kafka -n $NAMESPACE -o jsonpath='{.items[0].status.phase}' | grep -q Bound"

if kubectl get pods -l app=kafka -n "$NAMESPACE" &>/dev/null; then
    POD=$(kubectl get pods -l app=kafka -n "$NAMESPACE" -o jsonpath='{.items[0].metadata.name}')
    check "Kafka broker responding" "kubectl exec $POD -n $NAMESPACE -- kafka-broker-api-versions.sh --bootstrap-server localhost:9092"
    check_warning "Kafka topics exist" "kubectl exec $POD -n $NAMESPACE -- kafka-topics.sh --bootstrap-server localhost:9092 --list | grep -q llm-events"
fi

# Zookeeper health checks
log_info ""
log_info "--- Zookeeper Health ---"
check "Zookeeper pod running" "kubectl get pods -l app=zookeeper -n $NAMESPACE | grep -q Running"
check "Zookeeper service exists" "kubectl get svc zookeeper -n $NAMESPACE"

# Resource checks
log_info ""
log_info "--- Resource Health ---"

# Check CPU and memory usage
if command -v kubectl &>/dev/null && kubectl top nodes &>/dev/null; then
    log_info "Node resource usage:"
    kubectl top nodes
else
    log_warning "Metrics server not available, skipping resource checks"
fi

# Check pod resource usage
if kubectl top pods -n "$NAMESPACE" &>/dev/null; then
    log_info ""
    log_info "Pod resource usage:"
    kubectl top pods -n "$NAMESPACE"
else
    log_warning "Pod metrics not available"
fi

# Network checks
log_info ""
log_info "--- Network Health ---"

check "DNS resolution working" "kubectl run -it --rm dns-test --image=busybox --restart=Never -n $NAMESPACE -- nslookup kubernetes.default"

# Storage checks
log_info ""
log_info "--- Storage Health ---"

TOTAL_PVCS=$(kubectl get pvc -n "$NAMESPACE" --no-headers 2>/dev/null | wc -l)
BOUND_PVCS=$(kubectl get pvc -n "$NAMESPACE" -o jsonpath='{.items[?(@.status.phase=="Bound")].metadata.name}' 2>/dev/null | wc -w)

log_info "PVCs: $BOUND_PVCS/$TOTAL_PVCS bound"

if [ "$BOUND_PVCS" -eq "$TOTAL_PVCS" ]; then
    log_success "All PVCs are bound"
    ((PASSED_CHECKS++))
else
    log_warning "Some PVCs are not bound"
    ((WARNING_CHECKS++))
fi
((TOTAL_CHECKS++))

# Security checks
log_info ""
log_info "--- Security Health ---"

check_warning "Secrets exist" "kubectl get secrets -n $NAMESPACE | grep -q ."
check_warning "Network policies configured" "kubectl get networkpolicy -n $NAMESPACE"

# Summary
log_info ""
log_info "=========================================="
log_info "Health Check Summary"
log_info "=========================================="
log_info "Total Checks:    $TOTAL_CHECKS"
log_success "Passed:          $PASSED_CHECKS"
log_warning "Warnings:        $WARNING_CHECKS"
log_error "Failed:          $FAILED_CHECKS"

HEALTH_SCORE=$((PASSED_CHECKS * 100 / TOTAL_CHECKS))
log_info "Health Score:    $HEALTH_SCORE%"

echo ""

if [ "$FAILED_CHECKS" -eq 0 ]; then
    log_success "=========================================="
    log_success "Overall Status: HEALTHY"
    if [ "$WARNING_CHECKS" -gt 0 ]; then
        log_warning "Some warnings detected, review above"
    fi
    log_success "=========================================="
    exit 0
else
    log_error "=========================================="
    log_error "Overall Status: UNHEALTHY"
    log_error "Please review failed checks above"
    log_error "=========================================="
    exit 1
fi
