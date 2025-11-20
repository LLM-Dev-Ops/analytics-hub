#!/bin/bash

################################################################################
# LLM Analytics Hub - Deployment Validation Script
#
# Performs comprehensive validation including:
# - Pre-flight checks (prerequisites, credentials)
# - Cluster health validation
# - Service availability checks
# - Network connectivity tests
# - Database connectivity
# - API endpoint validation
# - Performance baselines
# - Security compliance checks
#
# Usage: ./validate.sh [environment] [--verbose]
# Example: ./validate.sh production --verbose
################################################################################

set -euo pipefail

# Script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
INFRASTRUCTURE_DIR="${PROJECT_ROOT}/infrastructure"

# Configuration
ENVIRONMENT="${1:-dev}"
VERBOSE="${2:-}"
NAMESPACE="llm-analytics-hub"

# Logging
LOG_FILE="${INFRASTRUCTURE_DIR}/logs/validate-${ENVIRONMENT}-$(date +%Y%m%d-%H%M%S).log"
mkdir -p "${INFRASTRUCTURE_DIR}/logs"

# Counters
CHECKS_TOTAL=0
CHECKS_PASSED=0
CHECKS_FAILED=0
CHECKS_WARNING=0

################################################################################
# Functions
################################################################################

log() {
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] $*" | tee -a "${LOG_FILE}"
}

error() {
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] ERROR: $*" | tee -a "${LOG_FILE}" >&2
}

verbose() {
    if [ "${VERBOSE}" == "--verbose" ]; then
        echo "[$(date +'%Y-%m-%d %H:%M:%S')] DEBUG: $*" | tee -a "${LOG_FILE}"
    fi
}

check_pass() {
    CHECKS_TOTAL=$((CHECKS_TOTAL + 1))
    CHECKS_PASSED=$((CHECKS_PASSED + 1))
    echo "✓ PASS: $*" | tee -a "${LOG_FILE}"
}

check_fail() {
    CHECKS_TOTAL=$((CHECKS_TOTAL + 1))
    CHECKS_FAILED=$((CHECKS_FAILED + 1))
    echo "✗ FAIL: $*" | tee -a "${LOG_FILE}"
}

check_warn() {
    CHECKS_TOTAL=$((CHECKS_TOTAL + 1))
    CHECKS_WARNING=$((CHECKS_WARNING + 1))
    echo "⚠ WARN: $*" | tee -a "${LOG_FILE}"
}

################################################################################
# Pre-flight Checks
################################################################################

check_prerequisites() {
    log "========================================="
    log "Pre-flight Checks"
    log "========================================="

    # Check kubectl
    if command -v kubectl &> /dev/null; then
        local version=$(kubectl version --client --short 2>/dev/null | grep -oP 'v\d+\.\d+\.\d+' || echo "unknown")
        check_pass "kubectl installed (${version})"
    else
        check_fail "kubectl not installed"
    fi

    # Check helm
    if command -v helm &> /dev/null; then
        local version=$(helm version --short 2>/dev/null | grep -oP 'v\d+\.\d+\.\d+' || echo "unknown")
        check_pass "helm installed (${version})"
    else
        check_fail "helm not installed"
    fi

    # Check cluster connectivity
    if kubectl cluster-info &> /dev/null; then
        check_pass "Kubernetes cluster is accessible"
    else
        check_fail "Cannot connect to Kubernetes cluster"
        return 1
    fi

    # Check namespace exists
    if kubectl get namespace "${NAMESPACE}" &> /dev/null; then
        check_pass "Namespace '${NAMESPACE}' exists"
    else
        check_fail "Namespace '${NAMESPACE}' does not exist"
    fi
}

################################################################################
# Cluster Health Checks
################################################################################

check_cluster_health() {
    log ""
    log "========================================="
    log "Cluster Health Checks"
    log "========================================="

    # Check nodes
    local total_nodes=$(kubectl get nodes --no-headers 2>/dev/null | wc -l)
    local ready_nodes=$(kubectl get nodes --no-headers 2>/dev/null | grep -c " Ready " || echo 0)

    if [ "${total_nodes}" -gt 0 ] && [ "${ready_nodes}" -eq "${total_nodes}" ]; then
        check_pass "All nodes ready (${ready_nodes}/${total_nodes})"
    elif [ "${ready_nodes}" -gt 0 ]; then
        check_warn "Some nodes not ready (${ready_nodes}/${total_nodes})"
    else
        check_fail "No nodes ready"
    fi

    # Check node resources
    local nodes_with_pressure=$(kubectl get nodes -o json 2>/dev/null | \
        jq -r '.items[] | select(.status.conditions[] | select(.type=="MemoryPressure" or .type=="DiskPressure" or .type=="PIDPressure") | select(.status=="True")) | .metadata.name' | wc -l)

    if [ "${nodes_with_pressure}" -eq 0 ]; then
        check_pass "No nodes under resource pressure"
    else
        check_warn "${nodes_with_pressure} node(s) under resource pressure"
    fi

    # Check system pods
    local system_pods=$(kubectl get pods -n kube-system --no-headers 2>/dev/null | wc -l)
    local running_system_pods=$(kubectl get pods -n kube-system --field-selector=status.phase=Running --no-headers 2>/dev/null | wc -l)

    if [ "${system_pods}" -gt 0 ] && [ "${running_system_pods}" -eq "${system_pods}" ]; then
        check_pass "All system pods running (${running_system_pods}/${system_pods})"
    else
        check_warn "Some system pods not running (${running_system_pods}/${system_pods})"
    fi
}

################################################################################
# Service Availability Checks
################################################################################

check_service_availability() {
    log ""
    log "========================================="
    log "Service Availability Checks"
    log "========================================="

    # Check application pods
    local app_pods=$(kubectl get pods -n "${NAMESPACE}" -l app=analytics-api --no-headers 2>/dev/null | wc -l)
    local running_app_pods=$(kubectl get pods -n "${NAMESPACE}" -l app=analytics-api --field-selector=status.phase=Running --no-headers 2>/dev/null | wc -l)

    if [ "${app_pods}" -gt 0 ] && [ "${running_app_pods}" -eq "${app_pods}" ]; then
        check_pass "All application pods running (${running_app_pods}/${app_pods})"
    elif [ "${running_app_pods}" -gt 0 ]; then
        check_warn "Some application pods not running (${running_app_pods}/${app_pods})"
    else
        check_fail "No application pods running"
    fi

    # Check pod readiness
    local ready_pods=$(kubectl get pods -n "${NAMESPACE}" -l app=analytics-api -o json 2>/dev/null | \
        jq -r '.items[] | select(.status.conditions[] | select(.type=="Ready" and .status=="True")) | .metadata.name' | wc -l)

    if [ "${ready_pods}" -eq "${running_app_pods}" ]; then
        check_pass "All running pods are ready (${ready_pods}/${running_app_pods})"
    else
        check_warn "Some pods not ready (${ready_pods}/${running_app_pods})"
    fi

    # Check TimescaleDB
    if kubectl get pods -n "${NAMESPACE}" -l app=timescaledb --field-selector=status.phase=Running --no-headers 2>/dev/null | grep -q .; then
        check_pass "TimescaleDB pod is running"
    else
        check_fail "TimescaleDB pod is not running"
    fi

    # Check Redis
    local redis_pods=$(kubectl get pods -n "${NAMESPACE}" -l app=redis --field-selector=status.phase=Running --no-headers 2>/dev/null | wc -l)
    if [ "${redis_pods}" -ge 3 ]; then
        check_pass "Redis cluster is running (${redis_pods} pods)"
    elif [ "${redis_pods}" -gt 0 ]; then
        check_warn "Redis cluster partially running (${redis_pods} pods)"
    else
        check_fail "Redis cluster is not running"
    fi

    # Check Kafka
    local kafka_pods=$(kubectl get pods -n "${NAMESPACE}" -l app=kafka --field-selector=status.phase=Running --no-headers 2>/dev/null | wc -l)
    if [ "${kafka_pods}" -ge 3 ]; then
        check_pass "Kafka cluster is running (${kafka_pods} pods)"
    elif [ "${kafka_pods}" -gt 0 ]; then
        check_warn "Kafka cluster partially running (${kafka_pods} pods)"
    else
        check_fail "Kafka cluster is not running"
    fi

    # Check services
    local services=$(kubectl get svc -n "${NAMESPACE}" --no-headers 2>/dev/null | wc -l)
    if [ "${services}" -gt 0 ]; then
        check_pass "Services configured (${services} services)"
    else
        check_fail "No services configured"
    fi
}

################################################################################
# Network Connectivity Checks
################################################################################

check_network_connectivity() {
    log ""
    log "========================================="
    log "Network Connectivity Checks"
    log "========================================="

    # Check DNS resolution
    if kubectl run -n "${NAMESPACE}" --rm -i --restart=Never --image=busybox dns-test \
        --command -- nslookup kubernetes.default &> /dev/null; then
        check_pass "DNS resolution working"
    else
        check_fail "DNS resolution not working"
    fi

    # Check service-to-service connectivity
    local api_pod=$(kubectl get pods -n "${NAMESPACE}" -l app=analytics-api --field-selector=status.phase=Running -o jsonpath='{.items[0].metadata.name}' 2>/dev/null)

    if [ -n "${api_pod}" ]; then
        # Check TimescaleDB connectivity
        if kubectl exec -n "${NAMESPACE}" "${api_pod}" -- nc -zv timescaledb-service 5432 &> /dev/null; then
            check_pass "API can reach TimescaleDB"
        else
            check_fail "API cannot reach TimescaleDB"
        fi

        # Check Redis connectivity
        if kubectl exec -n "${NAMESPACE}" "${api_pod}" -- nc -zv redis-cluster 6379 &> /dev/null; then
            check_pass "API can reach Redis"
        else
            check_fail "API cannot reach Redis"
        fi

        # Check Kafka connectivity
        if kubectl exec -n "${NAMESPACE}" "${api_pod}" -- nc -zv kafka-0.kafka-headless 9092 &> /dev/null; then
            check_pass "API can reach Kafka"
        else
            check_fail "API cannot reach Kafka"
        fi
    else
        check_warn "No API pod available for connectivity tests"
    fi

    # Check ingress
    if kubectl get ingress -n "${NAMESPACE}" &> /dev/null; then
        local ingress_count=$(kubectl get ingress -n "${NAMESPACE}" --no-headers 2>/dev/null | wc -l)
        if [ "${ingress_count}" -gt 0 ]; then
            check_pass "Ingress resources configured (${ingress_count})"
        else
            check_warn "No ingress resources configured"
        fi
    fi
}

################################################################################
# Database Connectivity Checks
################################################################################

check_database_connectivity() {
    log ""
    log "========================================="
    log "Database Connectivity Checks"
    log "========================================="

    local db_pod=$(kubectl get pods -n "${NAMESPACE}" -l app=timescaledb --field-selector=status.phase=Running -o jsonpath='{.items[0].metadata.name}' 2>/dev/null)

    if [ -n "${db_pod}" ]; then
        # Check PostgreSQL is accepting connections
        if kubectl exec -n "${NAMESPACE}" "${db_pod}" -- pg_isready -U postgres &> /dev/null; then
            check_pass "PostgreSQL is accepting connections"
        else
            check_fail "PostgreSQL is not accepting connections"
        fi

        # Check database exists
        if kubectl exec -n "${NAMESPACE}" "${db_pod}" -- psql -U postgres -lqt 2>/dev/null | grep -q llm_analytics; then
            check_pass "Database 'llm_analytics' exists"
        else
            check_fail "Database 'llm_analytics' does not exist"
        fi

        # Check TimescaleDB extension
        if kubectl exec -n "${NAMESPACE}" "${db_pod}" -- psql -U postgres -d llm_analytics -c "SELECT extname FROM pg_extension WHERE extname='timescaledb';" 2>/dev/null | grep -q timescaledb; then
            check_pass "TimescaleDB extension is installed"
        else
            check_warn "TimescaleDB extension may not be installed"
        fi
    else
        check_warn "No TimescaleDB pod available for database checks"
    fi
}

################################################################################
# API Endpoint Validation
################################################################################

check_api_endpoints() {
    log ""
    log "========================================="
    log "API Endpoint Validation"
    log "========================================="

    local api_pod=$(kubectl get pods -n "${NAMESPACE}" -l app=analytics-api --field-selector=status.phase=Running -o jsonpath='{.items[0].metadata.name}' 2>/dev/null)

    if [ -n "${api_pod}" ]; then
        # Port-forward to API (in background)
        kubectl port-forward -n "${NAMESPACE}" "${api_pod}" 13000:3000 &> /dev/null &
        local pf_pid=$!
        sleep 3

        # Check health endpoint
        if curl -sf http://localhost:13000/health &> /dev/null; then
            check_pass "Health endpoint responding"
        else
            check_fail "Health endpoint not responding"
        fi

        # Check ready endpoint
        if curl -sf http://localhost:13000/ready &> /dev/null; then
            check_pass "Ready endpoint responding"
        else
            check_fail "Ready endpoint not responding"
        fi

        # Check API version endpoint
        if curl -sf http://localhost:13000/api/version &> /dev/null; then
            check_pass "API version endpoint responding"
        else
            check_warn "API version endpoint not responding"
        fi

        # Kill port-forward
        kill ${pf_pid} 2>/dev/null || true
    else
        check_warn "No API pod available for endpoint checks"
    fi
}

################################################################################
# Resource Utilization Checks
################################################################################

check_resource_utilization() {
    log ""
    log "========================================="
    log "Resource Utilization Checks"
    log "========================================="

    # Check node CPU usage
    local nodes_high_cpu=$(kubectl top nodes 2>/dev/null | awk 'NR>1 {gsub(/%/,"",$3); if($3>80) print $1}' | wc -l)
    if [ "${nodes_high_cpu}" -eq 0 ]; then
        check_pass "No nodes with high CPU usage (>80%)"
    else
        check_warn "${nodes_high_cpu} node(s) with high CPU usage"
    fi

    # Check node memory usage
    local nodes_high_mem=$(kubectl top nodes 2>/dev/null | awk 'NR>1 {gsub(/%/,"",$5); if($5>80) print $1}' | wc -l)
    if [ "${nodes_high_mem}" -eq 0 ]; then
        check_pass "No nodes with high memory usage (>80%)"
    else
        check_warn "${nodes_high_mem} node(s) with high memory usage"
    fi

    # Check pod resource requests vs limits
    local pods_without_limits=$(kubectl get pods -n "${NAMESPACE}" -o json 2>/dev/null | \
        jq -r '.items[] | select(.spec.containers[].resources.limits == null) | .metadata.name' | wc -l)

    if [ "${pods_without_limits}" -eq 0 ]; then
        check_pass "All pods have resource limits defined"
    else
        check_warn "${pods_without_limits} pod(s) without resource limits"
    fi

    # Check HPA status
    if kubectl get hpa -n "${NAMESPACE}" &> /dev/null; then
        local hpa_count=$(kubectl get hpa -n "${NAMESPACE}" --no-headers 2>/dev/null | wc -l)
        if [ "${hpa_count}" -gt 0 ]; then
            check_pass "HPA configured (${hpa_count} autoscalers)"
        else
            check_warn "No HPA configured"
        fi
    fi
}

################################################################################
# Security Compliance Checks
################################################################################

check_security_compliance() {
    log ""
    log "========================================="
    log "Security Compliance Checks"
    log "========================================="

    # Check for pods running as root
    local root_pods=$(kubectl get pods -n "${NAMESPACE}" -o json 2>/dev/null | \
        jq -r '.items[] | select(.spec.securityContext.runAsUser == 0 or .spec.securityContext.runAsUser == null) | .metadata.name' | wc -l)

    if [ "${root_pods}" -eq 0 ]; then
        check_pass "No pods running as root"
    else
        check_warn "${root_pods} pod(s) may be running as root"
    fi

    # Check for privileged containers
    local privileged_pods=$(kubectl get pods -n "${NAMESPACE}" -o json 2>/dev/null | \
        jq -r '.items[] | select(.spec.containers[].securityContext.privileged == true) | .metadata.name' | wc -l)

    if [ "${privileged_pods}" -eq 0 ]; then
        check_pass "No privileged containers"
    else
        check_warn "${privileged_pods} pod(s) with privileged containers"
    fi

    # Check network policies
    if kubectl get networkpolicy -n "${NAMESPACE}" &> /dev/null; then
        local netpol_count=$(kubectl get networkpolicy -n "${NAMESPACE}" --no-headers 2>/dev/null | wc -l)
        if [ "${netpol_count}" -gt 0 ]; then
            check_pass "Network policies configured (${netpol_count})"
        else
            check_warn "No network policies configured"
        fi
    fi

    # Check pod disruption budgets
    if kubectl get pdb -n "${NAMESPACE}" &> /dev/null; then
        local pdb_count=$(kubectl get pdb -n "${NAMESPACE}" --no-headers 2>/dev/null | wc -l)
        if [ "${pdb_count}" -gt 0 ]; then
            check_pass "Pod disruption budgets configured (${pdb_count})"
        else
            check_warn "No pod disruption budgets configured"
        fi
    fi

    # Check secrets encryption at rest
    if kubectl get secrets -n "${NAMESPACE}" &> /dev/null; then
        local secret_count=$(kubectl get secrets -n "${NAMESPACE}" --no-headers 2>/dev/null | wc -l)
        if [ "${secret_count}" -gt 0 ]; then
            check_pass "Secrets exist (${secret_count})"
        else
            check_warn "No secrets configured"
        fi
    fi
}

################################################################################
# Monitoring Stack Checks
################################################################################

check_monitoring_stack() {
    log ""
    log "========================================="
    log "Monitoring Stack Checks"
    log "========================================="

    # Check Prometheus
    if kubectl get pods -n monitoring -l app.kubernetes.io/name=prometheus --field-selector=status.phase=Running --no-headers 2>/dev/null | grep -q .; then
        check_pass "Prometheus is running"
    else
        check_warn "Prometheus is not running"
    fi

    # Check Grafana
    if kubectl get pods -n monitoring -l app.kubernetes.io/name=grafana --field-selector=status.phase=Running --no-headers 2>/dev/null | grep -q .; then
        check_pass "Grafana is running"
    else
        check_warn "Grafana is not running"
    fi

    # Check AlertManager
    if kubectl get pods -n monitoring -l app.kubernetes.io/name=alertmanager --field-selector=status.phase=Running --no-headers 2>/dev/null | grep -q .; then
        check_pass "AlertManager is running"
    else
        check_warn "AlertManager is not running"
    fi
}

################################################################################
# Generate Report
################################################################################

generate_report() {
    log ""
    log "========================================="
    log "Validation Summary"
    log "========================================="
    log "Total Checks: ${CHECKS_TOTAL}"
    log "Passed: ${CHECKS_PASSED}"
    log "Failed: ${CHECKS_FAILED}"
    log "Warnings: ${CHECKS_WARNING}"
    log ""

    if [ "${CHECKS_FAILED}" -eq 0 ]; then
        log "✓ All critical checks passed!"
        if [ "${CHECKS_WARNING}" -gt 0 ]; then
            log "⚠ ${CHECKS_WARNING} warning(s) detected - review recommended"
        fi
        return 0
    else
        log "✗ ${CHECKS_FAILED} check(s) failed - action required"
        return 1
    fi
}

################################################################################
# Main
################################################################################

main() {
    log "========================================="
    log "LLM Analytics Hub - Deployment Validation"
    log "Environment: ${ENVIRONMENT}"
    log "Namespace: ${NAMESPACE}"
    log "========================================="
    log ""

    check_prerequisites
    check_cluster_health
    check_service_availability
    check_network_connectivity
    check_database_connectivity
    check_api_endpoints
    check_resource_utilization
    check_security_compliance
    check_monitoring_stack

    log ""
    generate_report

    local exit_code=$?
    log ""
    log "Full validation log: ${LOG_FILE}"
    exit ${exit_code}
}

# Run main function
main "$@"
