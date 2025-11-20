#!/bin/bash
set -e

#####################################################
# Redis Cluster Deployment Script
# LLM Analytics Hub - Automated Redis Deployment
#####################################################

NAMESPACE="redis-system"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Function to check prerequisites
check_prerequisites() {
    log_info "Checking prerequisites..."

    # Check kubectl
    if ! command -v kubectl &> /dev/null; then
        log_error "kubectl not found. Please install kubectl."
        exit 1
    fi

    # Check cluster connection
    if ! kubectl cluster-info &> /dev/null; then
        log_error "Cannot connect to Kubernetes cluster. Please configure kubectl."
        exit 1
    fi

    # Check for storage class
    if ! kubectl get storageclass fast-ssd &> /dev/null; then
        log_warning "StorageClass 'fast-ssd' not found. You may need to create it or modify the manifests."
        read -p "Continue anyway? (y/n) " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            exit 1
        fi
    fi

    log_success "Prerequisites check passed"
}

# Function to generate Redis password
generate_password() {
    log_info "Generating Redis password..."

    if command -v openssl &> /dev/null; then
        REDIS_PASSWORD=$(openssl rand -base64 32)
    else
        # Fallback if openssl not available
        REDIS_PASSWORD=$(cat /dev/urandom | tr -dc 'a-zA-Z0-9' | fold -w 32 | head -n 1)
    fi

    log_success "Redis password generated"
}

# Function to create namespace
create_namespace() {
    log_info "Creating namespace..."

    if kubectl get namespace $NAMESPACE &> /dev/null; then
        log_warning "Namespace $NAMESPACE already exists"
    else
        kubectl apply -f "$SCRIPT_DIR/namespace.yaml"
        log_success "Namespace created"
    fi
}

# Function to create secrets
create_secrets() {
    log_info "Creating secrets..."

    # Check if password already exists
    if kubectl get secret redis-auth -n $NAMESPACE &> /dev/null; then
        log_warning "Secret redis-auth already exists. Skipping..."
        REDIS_PASSWORD=$(kubectl get secret redis-auth -n $NAMESPACE -o jsonpath='{.data.password}' | base64 -d)
    else
        kubectl create secret generic redis-auth \
            --from-literal=password="$REDIS_PASSWORD" \
            --namespace=$NAMESPACE

        # Save password to file
        echo "$REDIS_PASSWORD" > "$SCRIPT_DIR/.redis-password"
        chmod 600 "$SCRIPT_DIR/.redis-password"

        log_success "Secret redis-auth created"
        log_info "Password saved to $SCRIPT_DIR/.redis-password"
    fi

    # Create S3 backup secret (with placeholders)
    if ! kubectl get secret redis-backup-s3 -n $NAMESPACE &> /dev/null; then
        kubectl create secret generic redis-backup-s3 \
            --from-literal=AWS_ACCESS_KEY_ID="CHANGE_ME" \
            --from-literal=AWS_SECRET_ACCESS_KEY="CHANGE_ME" \
            --from-literal=AWS_DEFAULT_REGION="us-east-1" \
            --from-literal=S3_BUCKET="llm-analytics-redis-backups" \
            --from-literal=S3_PREFIX="redis-cluster/" \
            --namespace=$NAMESPACE

        log_warning "S3 backup secret created with placeholder values. Update before enabling backups!"
    fi
}

# Function to deploy configuration
deploy_config() {
    log_info "Deploying ConfigMaps..."
    kubectl apply -f "$SCRIPT_DIR/configmap.yaml"
    log_success "ConfigMaps deployed"
}

# Function to deploy services
deploy_services() {
    log_info "Deploying Services..."
    kubectl apply -f "$SCRIPT_DIR/services.yaml"
    kubectl apply -f "$SCRIPT_DIR/sentinel-service.yaml"
    log_success "Services deployed"
}

# Function to deploy StatefulSets
deploy_statefulsets() {
    log_info "Deploying Redis StatefulSet..."
    kubectl apply -f "$SCRIPT_DIR/statefulset.yaml"

    log_info "Waiting for Redis pods to be ready (this may take a few minutes)..."
    kubectl wait --for=condition=Ready pod -l app.kubernetes.io/name=redis,app.kubernetes.io/component=cluster \
        -n $NAMESPACE --timeout=600s || {
        log_error "Timeout waiting for Redis pods"
        log_info "Check pod status with: kubectl get pods -n $NAMESPACE"
        exit 1
    }

    log_success "Redis pods are ready"

    log_info "Deploying Sentinel StatefulSet..."
    kubectl apply -f "$SCRIPT_DIR/sentinel-statefulset.yaml"

    log_info "Waiting for Sentinel pods to be ready..."
    kubectl wait --for=condition=Ready pod -l app.kubernetes.io/name=redis-sentinel \
        -n $NAMESPACE --timeout=300s || {
        log_warning "Timeout waiting for Sentinel pods (this is normal on first deployment)"
    }

    log_success "StatefulSets deployed"
}

# Function to deploy network policies
deploy_network_policies() {
    log_info "Deploying Network Policies..."
    kubectl apply -f "$SCRIPT_DIR/network-policy.yaml"
    log_success "Network Policies deployed"
}

# Function to deploy monitoring
deploy_monitoring() {
    log_info "Deploying monitoring resources..."

    # Check if Prometheus CRDs exist
    if kubectl get crd servicemonitors.monitoring.coreos.com &> /dev/null; then
        kubectl apply -f "$SCRIPT_DIR/monitoring.yaml"
        log_success "Monitoring resources deployed"
    else
        log_warning "Prometheus Operator CRDs not found. Skipping monitoring deployment."
        log_info "Install Prometheus Operator first, then run: kubectl apply -f monitoring.yaml"
    fi
}

# Function to deploy backup jobs
deploy_backups() {
    log_info "Deploying backup CronJobs..."
    kubectl apply -f "$SCRIPT_DIR/backup-cronjob.yaml"
    log_success "Backup CronJobs deployed"
    log_warning "Remember to configure S3 credentials in redis-backup-s3 secret!"
}

# Function to initialize cluster
initialize_cluster() {
    log_info "Initializing Redis cluster..."

    # Check if cluster is already initialized
    if kubectl exec -n $NAMESPACE redis-cluster-0 -- redis-cli -a "$REDIS_PASSWORD" cluster info 2>/dev/null | grep -q "cluster_state:ok"; then
        log_warning "Cluster is already initialized"
        return 0
    fi

    # Run initialization script
    if [ -f "$SCRIPT_DIR/init-cluster.sh" ]; then
        NAMESPACE=$NAMESPACE "$SCRIPT_DIR/init-cluster.sh"
    else
        log_error "init-cluster.sh not found"
        return 1
    fi

    log_success "Cluster initialized"
}

# Function to verify deployment
verify_deployment() {
    log_info "Verifying deployment..."

    # Check pods
    log_info "Checking pods..."
    kubectl get pods -n $NAMESPACE

    # Check services
    log_info "Checking services..."
    kubectl get svc -n $NAMESPACE

    # Check PVCs
    log_info "Checking PersistentVolumeClaims..."
    kubectl get pvc -n $NAMESPACE

    # Test Redis connection
    log_info "Testing Redis connection..."
    if kubectl exec -n $NAMESPACE redis-cluster-0 -- redis-cli -a "$REDIS_PASSWORD" ping 2>/dev/null | grep -q "PONG"; then
        log_success "Redis is responding"
    else
        log_error "Redis is not responding"
        return 1
    fi

    # Check cluster state
    log_info "Checking cluster state..."
    kubectl exec -n $NAMESPACE redis-cluster-0 -- redis-cli -a "$REDIS_PASSWORD" cluster info 2>/dev/null

    log_success "Deployment verification complete"
}

# Function to print connection info
print_connection_info() {
    echo ""
    echo "========================================="
    echo "Redis Cluster Deployment Complete!"
    echo "========================================="
    echo ""
    echo "Namespace: $NAMESPACE"
    echo ""
    echo "Connection Information:"
    echo "  Host: redis.$NAMESPACE.svc.cluster.local"
    echo "  Port: 6379"
    echo "  Password: (saved in $SCRIPT_DIR/.redis-password)"
    echo ""
    echo "Connection String:"
    echo "  redis://:PASSWORD@redis.$NAMESPACE.svc.cluster.local:6379"
    echo ""
    echo "Useful Commands:"
    echo "  # Get pods"
    echo "  kubectl get pods -n $NAMESPACE"
    echo ""
    echo "  # Check cluster info"
    echo "  kubectl exec -n $NAMESPACE redis-cluster-0 -- redis-cli -a \$PASSWORD cluster info"
    echo ""
    echo "  # Check cluster nodes"
    echo "  kubectl exec -n $NAMESPACE redis-cluster-0 -- redis-cli -a \$PASSWORD cluster nodes"
    echo ""
    echo "  # Monitor logs"
    echo "  kubectl logs -n $NAMESPACE -l app.kubernetes.io/name=redis -f"
    echo ""
    echo "  # Access Redis CLI"
    echo "  kubectl exec -n $NAMESPACE redis-cluster-0 -it -- redis-cli -a \$PASSWORD -c"
    echo ""
    echo "Next Steps:"
    echo "  1. Configure S3 backup credentials (if using backups)"
    echo "  2. Update application configuration with connection string"
    echo "  3. Configure monitoring dashboards"
    echo "  4. Set up alerts"
    echo ""
    echo "========================================="
}

# Function to cleanup (for rollback)
cleanup() {
    log_warning "Cleaning up Redis deployment..."

    kubectl delete -f "$SCRIPT_DIR/backup-cronjob.yaml" --ignore-not-found=true
    kubectl delete -f "$SCRIPT_DIR/monitoring.yaml" --ignore-not-found=true
    kubectl delete -f "$SCRIPT_DIR/network-policy.yaml" --ignore-not-found=true
    kubectl delete -f "$SCRIPT_DIR/sentinel-statefulset.yaml" --ignore-not-found=true
    kubectl delete -f "$SCRIPT_DIR/sentinel-service.yaml" --ignore-not-found=true
    kubectl delete -f "$SCRIPT_DIR/statefulset.yaml" --ignore-not-found=true
    kubectl delete -f "$SCRIPT_DIR/services.yaml" --ignore-not-found=true
    kubectl delete -f "$SCRIPT_DIR/configmap.yaml" --ignore-not-found=true

    log_info "Waiting for pods to terminate..."
    kubectl wait --for=delete pod -l app.kubernetes.io/name=redis -n $NAMESPACE --timeout=120s || true

    log_warning "Note: Secrets and PVCs are preserved. Delete manually if needed."
    log_success "Cleanup complete"
}

# Main deployment flow
main() {
    echo ""
    echo "========================================="
    echo "Redis Cluster Deployment"
    echo "LLM Analytics Hub"
    echo "========================================="
    echo ""

    # Parse command line arguments
    case "${1:-deploy}" in
        deploy)
            check_prerequisites
            generate_password
            create_namespace
            create_secrets
            deploy_config
            deploy_services
            deploy_statefulsets
            deploy_network_policies
            deploy_monitoring
            deploy_backups
            sleep 5
            initialize_cluster
            verify_deployment
            print_connection_info
            ;;
        cleanup)
            cleanup
            ;;
        verify)
            verify_deployment
            ;;
        init-cluster)
            initialize_cluster
            ;;
        *)
            log_error "Unknown command: $1"
            echo "Usage: $0 {deploy|cleanup|verify|init-cluster}"
            exit 1
            ;;
    esac
}

# Run main function
main "$@"
