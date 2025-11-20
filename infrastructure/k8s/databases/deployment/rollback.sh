#!/bin/bash
set -euo pipefail

# Rollback Script for Database Deployment

ENVIRONMENT="${1:-dev}"
NAMESPACE="llm-analytics"

# Color output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log_info() {
    echo -e "${YELLOW}[ROLLBACK]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[ROLLBACK]${NC} $1"
}

log_error() {
    echo -e "${RED}[ROLLBACK]${NC} $1"
}

# Confirmation prompt
confirm_rollback() {
    echo ""
    log_error "=========================================="
    log_error "WARNING: This will delete all databases!"
    log_error "Environment: $ENVIRONMENT"
    log_error "Namespace: $NAMESPACE"
    log_error "=========================================="
    echo ""

    read -p "Are you sure you want to rollback? (yes/no): " confirmation

    if [ "$confirmation" != "yes" ]; then
        log_info "Rollback cancelled"
        exit 0
    fi
}

# Delete databases
rollback_databases() {
    log_info "Rolling back database deployments..."

    # Delete in reverse order
    local components=("kafka" "redis" "timescaledb" "zookeeper")

    for component in "${components[@]}"; do
        log_info "Deleting $component..."

        # Delete StatefulSet
        kubectl delete statefulset "$component" -n "$NAMESPACE" --ignore-not-found=true

        # Delete Services
        kubectl delete svc -l "app=$component" -n "$NAMESPACE" --ignore-not-found=true

        # Delete ConfigMaps
        kubectl delete configmap -l "app=$component" -n "$NAMESPACE" --ignore-not-found=true

        # Delete Secrets
        kubectl delete secret -l "app=$component" -n "$NAMESPACE" --ignore-not-found=true

        log_success "$component deleted"
    done
}

# Delete PVCs (optional - preserves data)
delete_pvcs() {
    log_info "Do you want to delete PVCs (this will delete all data)?"
    read -p "Delete PVCs? (yes/no): " delete_pvc

    if [ "$delete_pvc" = "yes" ]; then
        log_info "Deleting PVCs..."
        kubectl delete pvc --all -n "$NAMESPACE"
        log_success "PVCs deleted"
    else
        log_info "PVCs preserved"
    fi
}

# Main rollback
main() {
    log_info "Database Rollback - Environment: $ENVIRONMENT"

    confirm_rollback
    rollback_databases
    delete_pvcs

    log_success "=========================================="
    log_success "Rollback completed"
    log_success "=========================================="
}

main "$@"
