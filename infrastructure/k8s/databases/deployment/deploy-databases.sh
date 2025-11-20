#!/bin/bash
set -euo pipefail

# Master Database Deployment Script for LLM Analytics Hub
# Deploys all databases in the correct order with health checks

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BASE_DIR="$(dirname "$SCRIPT_DIR")"
K8S_BASE="/workspaces/llm-analytics-hub/infrastructure/core/kubernetes"

# Color output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
ENVIRONMENT="${1:-dev}"
NAMESPACE="llm-analytics"
TIMEOUT=300
RETRY_DELAY=5

# Logging functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $(date '+%Y-%m-%d %H:%M:%S') - $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $(date '+%Y-%m-%d %H:%M:%S') - $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $(date '+%Y-%m-%d %H:%M:%S') - $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $(date '+%Y-%m-%d %H:%M:%S') - $1"
}

# Error handling
error_handler() {
    log_error "Deployment failed at line $1"
    log_error "Rolling back deployment..."
    "$SCRIPT_DIR/rollback.sh" "$ENVIRONMENT"
    exit 1
}

trap 'error_handler $LINENO' ERR

# Validate environment
validate_environment() {
    log_info "Validating environment: $ENVIRONMENT"

    case "$ENVIRONMENT" in
        dev|staging|prod)
            log_success "Environment valid: $ENVIRONMENT"
            ;;
        *)
            log_error "Invalid environment: $ENVIRONMENT. Must be dev, staging, or prod"
            exit 1
            ;;
    esac
}

# Pre-deployment checks
run_pre_checks() {
    log_info "Running pre-deployment checks..."

    if ! bash "$BASE_DIR/validation/pre-deploy-check.sh" "$ENVIRONMENT"; then
        log_error "Pre-deployment checks failed"
        exit 1
    fi

    log_success "Pre-deployment checks passed"
}

# Wait for resource to be ready
wait_for_ready() {
    local resource_type=$1
    local resource_name=$2
    local namespace=$3
    local timeout=$4

    log_info "Waiting for $resource_type/$resource_name to be ready..."

    local elapsed=0
    while [ $elapsed -lt "$timeout" ]; do
        if kubectl get "$resource_type" "$resource_name" -n "$namespace" &>/dev/null; then
            local status=$(kubectl get "$resource_type" "$resource_name" -n "$namespace" -o jsonpath='{.status.conditions[?(@.type=="Ready")].status}' 2>/dev/null || echo "")

            if [ "$status" = "True" ]; then
                log_success "$resource_type/$resource_name is ready"
                return 0
            fi
        fi

        sleep "$RETRY_DELAY"
        elapsed=$((elapsed + RETRY_DELAY))
        echo -n "."
    done

    echo ""
    log_error "$resource_type/$resource_name failed to become ready within ${timeout}s"
    return 1
}

# Wait for pods to be ready
wait_for_pods() {
    local label=$1
    local namespace=$2
    local expected_count=$3
    local timeout=$4

    log_info "Waiting for pods with label '$label' to be ready..."

    local elapsed=0
    while [ $elapsed -lt "$timeout" ]; do
        local ready_count=$(kubectl get pods -l "$label" -n "$namespace" -o jsonpath='{.items[?(@.status.conditions[?(@.type=="Ready")].status=="True")].metadata.name}' 2>/dev/null | wc -w)

        if [ "$ready_count" -ge "$expected_count" ]; then
            log_success "$ready_count/$expected_count pods are ready"
            return 0
        fi

        sleep "$RETRY_DELAY"
        elapsed=$((elapsed + RETRY_DELAY))
        echo -n "."
    done

    echo ""
    log_error "Only $ready_count/$expected_count pods became ready within ${timeout}s"
    return 1
}

# Deploy namespace
deploy_namespace() {
    log_info "Step 1/5: Deploying namespace..."

    if kubectl get namespace "$NAMESPACE" &>/dev/null; then
        log_warning "Namespace $NAMESPACE already exists"
    else
        kubectl create namespace "$NAMESPACE"
        kubectl label namespace "$NAMESPACE" name="$NAMESPACE" environment="$ENVIRONMENT"
        log_success "Namespace created: $NAMESPACE"
    fi
}

# Deploy storage
deploy_storage() {
    log_info "Step 2/5: Deploying storage..."

    # Deploy storage classes
    if [ -f "$K8S_BASE/storage/storage-classes.yaml" ]; then
        kubectl apply -f "$K8S_BASE/storage/storage-classes.yaml"
        log_success "Storage classes deployed"
    fi

    # Deploy PVCs
    local pvcs=("timescaledb-data" "redis-data" "kafka-data" "zookeeper-data")
    for pvc in "${pvcs[@]}"; do
        if [ -f "$K8S_BASE/storage/${pvc}-pvc.yaml" ]; then
            kubectl apply -f "$K8S_BASE/storage/${pvc}-pvc.yaml" -n "$NAMESPACE"
            log_info "PVC applied: $pvc"
        fi
    done

    sleep 5
    log_success "Storage deployed"
}

# Deploy Zookeeper
deploy_zookeeper() {
    log_info "Step 3/5: Deploying Zookeeper..."

    if [ -f "$K8S_BASE/databases/zookeeper/statefulset.yaml" ]; then
        kubectl apply -f "$K8S_BASE/databases/zookeeper/" -n "$NAMESPACE"

        # Wait for Zookeeper to be ready
        wait_for_pods "app=zookeeper" "$NAMESPACE" 1 "$TIMEOUT"

        sleep 10 # Allow Zookeeper to stabilize
        log_success "Zookeeper deployed and ready"
    else
        log_warning "Zookeeper manifests not found, skipping"
    fi
}

# Deploy TimescaleDB
deploy_timescaledb() {
    log_info "Step 4/5: Deploying TimescaleDB..."

    bash "$SCRIPT_DIR/deploy-timescaledb.sh" "$ENVIRONMENT" "$NAMESPACE"
    log_success "TimescaleDB deployed"
}

# Deploy Redis
deploy_redis() {
    log_info "Step 4/5: Deploying Redis..."

    bash "$SCRIPT_DIR/deploy-redis.sh" "$ENVIRONMENT" "$NAMESPACE"
    log_success "Redis deployed"
}

# Deploy Kafka
deploy_kafka() {
    log_info "Step 5/5: Deploying Kafka..."

    bash "$SCRIPT_DIR/deploy-kafka.sh" "$ENVIRONMENT" "$NAMESPACE"
    log_success "Kafka deployed"
}

# Initialize databases
initialize_databases() {
    log_info "Initializing databases..."

    # Initialize TimescaleDB
    if [ -f "$BASE_DIR/initialization/init-timescaledb.sql" ]; then
        log_info "Initializing TimescaleDB schema..."
        sleep 10 # Wait for database to be fully ready

        local pod=$(kubectl get pods -l app=timescaledb -n "$NAMESPACE" -o jsonpath='{.items[0].metadata.name}')
        if [ -n "$pod" ]; then
            kubectl exec -i "$pod" -n "$NAMESPACE" -- psql -U postgres < "$BASE_DIR/initialization/init-timescaledb.sql"
            log_success "TimescaleDB initialized"
        fi
    fi

    # Initialize Redis
    if [ -f "$BASE_DIR/initialization/init-redis.sh" ]; then
        log_info "Initializing Redis cluster..."
        bash "$BASE_DIR/initialization/init-redis.sh" "$NAMESPACE"
        log_success "Redis initialized"
    fi

    # Initialize Kafka
    if [ -f "$BASE_DIR/initialization/init-kafka.sh" ]; then
        log_info "Initializing Kafka topics..."
        bash "$BASE_DIR/initialization/init-kafka.sh" "$NAMESPACE"
        log_success "Kafka initialized"
    fi
}

# Validate deployment
validate_deployment() {
    log_info "Validating deployment..."

    if ! bash "$BASE_DIR/validation/post-deploy-check.sh" "$ENVIRONMENT"; then
        log_error "Post-deployment validation failed"
        return 1
    fi

    log_success "Deployment validation passed"
}

# Run smoke tests
run_smoke_tests() {
    log_info "Running smoke tests..."

    if ! bash "$BASE_DIR/validation/smoke-test.sh" "$NAMESPACE"; then
        log_warning "Some smoke tests failed, but deployment continues"
        return 0
    fi

    log_success "Smoke tests passed"
}

# Main deployment flow
main() {
    log_info "=========================================="
    log_info "LLM Analytics Hub - Database Deployment"
    log_info "Environment: $ENVIRONMENT"
    log_info "Namespace: $NAMESPACE"
    log_info "=========================================="

    validate_environment
    run_pre_checks

    deploy_namespace
    deploy_storage
    deploy_zookeeper
    deploy_timescaledb
    deploy_redis
    deploy_kafka

    initialize_databases
    validate_deployment
    run_smoke_tests

    log_success "=========================================="
    log_success "Database deployment completed successfully!"
    log_success "=========================================="

    # Print connection information
    echo ""
    log_info "Connection Information:"
    echo ""
    echo "TimescaleDB:"
    echo "  Host: timescaledb.$NAMESPACE.svc.cluster.local"
    echo "  Port: 5432"
    echo "  Database: analytics"
    echo ""
    echo "Redis:"
    echo "  Host: redis-master.$NAMESPACE.svc.cluster.local"
    echo "  Port: 6379"
    echo ""
    echo "Kafka:"
    echo "  Bootstrap: kafka.$NAMESPACE.svc.cluster.local:9092"
    echo ""

    log_info "To view status: kubectl get all -n $NAMESPACE"
    log_info "To run integration tests: $BASE_DIR/validation/integration-test.sh"
}

# Run main function
main "$@"
