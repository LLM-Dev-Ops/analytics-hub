#!/bin/bash
set -euo pipefail

# Post-Deployment Validation Script

ENVIRONMENT="${1:-dev}"
NAMESPACE="llm-analytics"

# Color output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

log_info() {
    echo -e "${BLUE}[POST-CHECK]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[POST-CHECK]${NC} $1"
}

log_error() {
    echo -e "${RED}[POST-CHECK]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[POST-CHECK]${NC} $1"
}

ERRORS=0

# Validate all databases
validate_all() {
    log_info "=========================================="
    log_info "Post-Deployment Validation"
    log_info "Environment: $ENVIRONMENT"
    log_info "Namespace: $NAMESPACE"
    log_info "=========================================="

    # Run comprehensive validation
    bash "$(dirname "$0")/../deployment/validate-deployment.sh" "$NAMESPACE"

    if [ $? -eq 0 ]; then
        log_success "All deployments validated successfully"
    else
        log_error "Deployment validation failed"
        exit 1
    fi
}

main() {
    validate_all
}

main "$@"
