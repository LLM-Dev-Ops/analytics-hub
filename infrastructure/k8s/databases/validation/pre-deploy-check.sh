#!/bin/bash
set -euo pipefail

# Pre-Deployment Validation Script

ENVIRONMENT="${1:-dev}"

# Color output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

log_info() {
    echo -e "${BLUE}[PRE-CHECK]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[PRE-CHECK]${NC} $1"
}

log_error() {
    echo -e "${RED}[PRE-CHECK]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[PRE-CHECK]${NC} $1"
}

ERRORS=0

# Check Kubernetes cluster connectivity
check_cluster_connectivity() {
    log_info "Checking Kubernetes cluster connectivity..."

    if kubectl cluster-info &>/dev/null; then
        log_success "Kubernetes cluster is accessible"
    else
        log_error "Cannot connect to Kubernetes cluster"
        ((ERRORS++))
        return 1
    fi

    # Get cluster info
    local k8s_version=$(kubectl version --short 2>/dev/null | grep Server | awk '{print $3}' || echo "unknown")
    log_info "Kubernetes version: $k8s_version"
}

# Check kubectl version
check_kubectl_version() {
    log_info "Checking kubectl version..."

    if command -v kubectl &>/dev/null; then
        local version=$(kubectl version --client --short 2>/dev/null | awk '{print $3}' || echo "unknown")
        log_success "kubectl is installed (version: $version)"
    else
        log_error "kubectl is not installed"
        ((ERRORS++))
    fi
}

# Check node resources
check_node_resources() {
    log_info "Checking node resources..."

    local node_count=$(kubectl get nodes --no-headers 2>/dev/null | wc -l)

    if [ "$node_count" -eq 0 ]; then
        log_error "No nodes found in cluster"
        ((ERRORS++))
        return 1
    fi

    log_success "Found $node_count node(s)"

    # Check node status
    local ready_nodes=$(kubectl get nodes --no-headers 2>/dev/null | grep -c Ready || echo 0)
    if [ "$ready_nodes" -eq "$node_count" ]; then
        log_success "All nodes are ready"
    else
        log_warning "Only $ready_nodes/$node_count nodes are ready"
    fi

    # Check available CPU and memory
    log_info "Node resource summary:"
    kubectl top nodes 2>/dev/null || log_warning "Metrics server not available"
}

# Check storage classes
check_storage_classes() {
    log_info "Checking storage classes..."

    local sc_count=$(kubectl get storageclass --no-headers 2>/dev/null | wc -l)

    if [ "$sc_count" -eq 0 ]; then
        log_error "No storage classes found"
        ((ERRORS++))
    else
        log_success "Found $sc_count storage class(es)"

        # Check for default storage class
        if kubectl get storageclass 2>/dev/null | grep -q "(default)"; then
            log_success "Default storage class is configured"
        else
            log_warning "No default storage class configured"
        fi
    fi
}

# Check storage provisioner
check_storage_provisioner() {
    log_info "Checking storage provisioner..."

    if kubectl get csidriver &>/dev/null; then
        local csi_count=$(kubectl get csidriver --no-headers 2>/dev/null | wc -l)
        if [ "$csi_count" -gt 0 ]; then
            log_success "CSI driver(s) available: $csi_count"
        else
            log_warning "No CSI drivers found"
        fi
    else
        log_warning "CSI driver information not available"
    fi
}

# Check namespace
check_namespace() {
    log_info "Checking namespace availability..."

    local namespace="llm-analytics"

    if kubectl get namespace "$namespace" &>/dev/null; then
        log_warning "Namespace '$namespace' already exists"

        # Check if there are existing resources
        local pod_count=$(kubectl get pods -n "$namespace" --no-headers 2>/dev/null | wc -l)
        if [ "$pod_count" -gt 0 ]; then
            log_warning "Found $pod_count existing pod(s) in namespace"
        fi
    else
        log_success "Namespace '$namespace' is available for creation"
    fi
}

# Check resource quotas
check_resource_quotas() {
    log_info "Checking resource quotas..."

    local namespace="llm-analytics"

    if kubectl get namespace "$namespace" &>/dev/null; then
        local quota_count=$(kubectl get resourcequota -n "$namespace" --no-headers 2>/dev/null | wc -l)

        if [ "$quota_count" -gt 0 ]; then
            log_info "Found $quota_count resource quota(s)"
            kubectl get resourcequota -n "$namespace" 2>/dev/null || true
        else
            log_info "No resource quotas configured"
        fi
    fi
}

# Check network policies
check_network_policies() {
    log_info "Checking network policy support..."

    # Check if network policies are supported
    if kubectl get networkpolicy --all-namespaces &>/dev/null; then
        log_success "Network policies are supported"
    else
        log_warning "Network policies may not be supported"
    fi
}

# Check DNS
check_dns() {
    log_info "Checking DNS..."

    if kubectl get svc kube-dns -n kube-system &>/dev/null || \
       kubectl get svc coredns -n kube-system &>/dev/null; then
        log_success "DNS service is running"
    else
        log_error "DNS service not found"
        ((ERRORS++))
    fi
}

# Check required tools
check_required_tools() {
    log_info "Checking required tools..."

    local tools=("kubectl" "bash" "awk" "grep")

    for tool in "${tools[@]}"; do
        if command -v "$tool" &>/dev/null; then
            log_success "$tool is installed"
        else
            log_error "$tool is not installed"
            ((ERRORS++))
        fi
    done
}

# Check docker/container runtime
check_container_runtime() {
    log_info "Checking container runtime..."

    local runtime=$(kubectl get nodes -o jsonpath='{.items[0].status.nodeInfo.containerRuntimeVersion}' 2>/dev/null || echo "unknown")

    if [ "$runtime" != "unknown" ]; then
        log_success "Container runtime: $runtime"
    else
        log_warning "Container runtime information not available"
    fi
}

# Check RBAC
check_rbac() {
    log_info "Checking RBAC permissions..."

    # Test if we can create namespace
    if kubectl auth can-i create namespace &>/dev/null; then
        log_success "Has permission to create namespaces"
    else
        log_error "Missing permission to create namespaces"
        ((ERRORS++))
    fi

    # Test if we can create pods
    if kubectl auth can-i create pods --all-namespaces &>/dev/null; then
        log_success "Has permission to create pods"
    else
        log_error "Missing permission to create pods"
        ((ERRORS++))
    fi

    # Test if we can create services
    if kubectl auth can-i create services --all-namespaces &>/dev/null; then
        log_success "Has permission to create services"
    else
        log_error "Missing permission to create services"
        ((ERRORS++))
    fi
}

# Check available disk space
check_disk_space() {
    log_info "Checking available disk space on nodes..."

    kubectl get nodes -o json 2>/dev/null | grep -o '"ephemeral-storage.*' || log_warning "Disk space information not available"
}

# Main validation
main() {
    log_info "=========================================="
    log_info "Pre-Deployment Validation"
    log_info "Environment: $ENVIRONMENT"
    log_info "=========================================="

    check_required_tools
    check_kubectl_version
    check_cluster_connectivity
    check_node_resources
    check_storage_classes
    check_storage_provisioner
    check_namespace
    check_resource_quotas
    check_network_policies
    check_dns
    check_container_runtime
    check_rbac
    check_disk_space

    echo ""
    if [ $ERRORS -eq 0 ]; then
        log_success "=========================================="
        log_success "All pre-deployment checks passed!"
        log_success "Ready to deploy databases"
        log_success "=========================================="
        exit 0
    else
        log_error "=========================================="
        log_error "Pre-deployment validation failed with $ERRORS error(s)"
        log_error "Please fix the issues before deploying"
        log_error "=========================================="
        exit 1
    fi
}

main "$@"
