#!/bin/bash
set -e

# TimescaleDB Deployment Script
# This script deploys the complete TimescaleDB infrastructure

NAMESPACE="timescaledb"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Functions
log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

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

    log_info "Prerequisites check passed"
}

generate_secrets() {
    log_info "Generating secrets..."

    # Check if secrets already exist
    if kubectl get secret timescaledb-credentials -n $NAMESPACE &> /dev/null; then
        log_warn "Secrets already exist. Skipping generation."
        return
    fi

    # Generate random passwords
    POSTGRES_PASSWORD=$(openssl rand -base64 32)
    REPLICATION_PASSWORD=$(openssl rand -base64 32)
    APP_PASSWORD=$(openssl rand -base64 32)
    PATRONI_PASSWORD=$(openssl rand -base64 32)
    PGBOUNCER_PASSWORD=$(openssl rand -base64 32)

    # Create namespace if it doesn't exist
    kubectl create namespace $NAMESPACE --dry-run=client -o yaml | kubectl apply -f -

    # Create credentials secret
    kubectl create secret generic timescaledb-credentials \
        --from-literal=POSTGRES_PASSWORD="$POSTGRES_PASSWORD" \
        --from-literal=REPLICATION_PASSWORD="$REPLICATION_PASSWORD" \
        --from-literal=APP_PASSWORD="$APP_PASSWORD" \
        --from-literal=PATRONI_SUPERUSER_PASSWORD="$PATRONI_PASSWORD" \
        --from-literal=PATRONI_REPLICATION_PASSWORD="$REPLICATION_PASSWORD" \
        --from-literal=PGBOUNCER_PASSWORD="$PGBOUNCER_PASSWORD" \
        -n $NAMESPACE

    log_info "Secrets created successfully"
    log_warn "IMPORTANT: Save these credentials securely!"
    echo "POSTGRES_PASSWORD: $POSTGRES_PASSWORD"
    echo "APP_PASSWORD: $APP_PASSWORD"
}

generate_tls_certificates() {
    log_info "Generating TLS certificates..."

    # Check if TLS secret already exists
    if kubectl get secret timescaledb-tls -n $NAMESPACE &> /dev/null; then
        log_warn "TLS certificates already exist. Skipping generation."
        return
    fi

    # Create temporary directory
    TMP_DIR=$(mktemp -d)
    cd $TMP_DIR

    # Generate self-signed certificate
    openssl req -x509 -newkey rsa:4096 -nodes \
        -keyout tls.key -out tls.crt -days 365 \
        -subj "/CN=timescaledb.timescaledb.svc.cluster.local" \
        2>/dev/null

    # Create TLS secret
    kubectl create secret tls timescaledb-tls \
        --cert=tls.crt --key=tls.key \
        -n $NAMESPACE

    # Cleanup
    cd - > /dev/null
    rm -rf $TMP_DIR

    log_info "TLS certificates created successfully"
}

create_s3_secret() {
    log_info "Creating S3 backup credentials..."

    # Check if S3 secret already exists
    if kubectl get secret timescaledb-backup-s3 -n $NAMESPACE &> /dev/null; then
        log_warn "S3 credentials already exist. Skipping."
        return
    fi

    # Prompt for S3 credentials
    read -p "Enter AWS Access Key ID (or press Enter to skip S3 backup): " AWS_ACCESS_KEY_ID

    if [ -z "$AWS_ACCESS_KEY_ID" ]; then
        log_warn "Skipping S3 backup configuration"
        return
    fi

    read -sp "Enter AWS Secret Access Key: " AWS_SECRET_ACCESS_KEY
    echo
    read -p "Enter S3 Bucket Name: " S3_BUCKET
    read -p "Enter S3 Region (default: us-east-1): " S3_REGION
    S3_REGION=${S3_REGION:-us-east-1}
    read -p "Enter S3 Endpoint (default: https://s3.amazonaws.com): " S3_ENDPOINT
    S3_ENDPOINT=${S3_ENDPOINT:-https://s3.amazonaws.com}

    # Create S3 secret
    kubectl create secret generic timescaledb-backup-s3 \
        --from-literal=AWS_ACCESS_KEY_ID="$AWS_ACCESS_KEY_ID" \
        --from-literal=AWS_SECRET_ACCESS_KEY="$AWS_SECRET_ACCESS_KEY" \
        --from-literal=S3_BUCKET="$S3_BUCKET" \
        --from-literal=S3_REGION="$S3_REGION" \
        --from-literal=S3_ENDPOINT="$S3_ENDPOINT" \
        -n $NAMESPACE

    log_info "S3 credentials created successfully"
}

deploy_manifests() {
    log_info "Deploying TimescaleDB manifests..."

    cd $SCRIPT_DIR

    # Deploy in order
    local manifests=(
        "namespace.yaml"
        "storageclass.yaml"
        "configmap.yaml"
        "init-scripts-configmap.yaml"
        "patroni-config.yaml"
        "statefulset.yaml"
        "services.yaml"
        "pgbouncer.yaml"
        "network-policy.yaml"
        "monitoring.yaml"
        "backup-cronjob.yaml"
    )

    for manifest in "${manifests[@]}"; do
        if [ -f "$manifest" ]; then
            log_info "Applying $manifest..."
            kubectl apply -f "$manifest"
            sleep 2
        else
            log_warn "Manifest $manifest not found, skipping..."
        fi
    done

    log_info "All manifests deployed successfully"
}

wait_for_cluster() {
    log_info "Waiting for TimescaleDB cluster to be ready..."

    # Wait for StatefulSet to be ready
    kubectl wait --for=condition=ready pod/timescaledb-0 -n $NAMESPACE --timeout=600s || true
    kubectl wait --for=condition=ready pod/timescaledb-1 -n $NAMESPACE --timeout=600s || true
    kubectl wait --for=condition=ready pod/timescaledb-2 -n $NAMESPACE --timeout=600s || true

    log_info "Cluster is ready!"
}

verify_deployment() {
    log_info "Verifying deployment..."

    echo ""
    echo "=== Pods ==="
    kubectl get pods -n $NAMESPACE

    echo ""
    echo "=== Services ==="
    kubectl get svc -n $NAMESPACE

    echo ""
    echo "=== PVCs ==="
    kubectl get pvc -n $NAMESPACE

    echo ""
    log_info "Checking Patroni cluster status..."
    kubectl exec -it timescaledb-0 -n $NAMESPACE -- patronictl list || true

    echo ""
    log_info "Testing database connection..."
    kubectl exec -it timescaledb-0 -n $NAMESPACE -- \
        psql -U postgres -c "SELECT version();" || true
}

print_connection_info() {
    log_info "Connection Information:"
    echo ""
    echo "Primary (Read-Write):"
    echo "  postgresql://llm_app:APP_PASSWORD@timescaledb-rw.timescaledb.svc.cluster.local:5432/llm_analytics?sslmode=require"
    echo ""
    echo "Replica (Read-Only):"
    echo "  postgresql://llm_app:APP_PASSWORD@timescaledb-ro.timescaledb.svc.cluster.local:5432/llm_analytics?sslmode=require"
    echo ""
    echo "PgBouncer (Recommended):"
    echo "  postgresql://llm_app:APP_PASSWORD@pgbouncer.timescaledb.svc.cluster.local:6432/llm_analytics"
    echo ""
    echo "Get APP_PASSWORD with:"
    echo "  kubectl get secret timescaledb-credentials -n timescaledb -o jsonpath='{.data.APP_PASSWORD}' | base64 -d"
}

# Main execution
main() {
    echo "================================================"
    echo "  TimescaleDB Deployment for LLM Analytics Hub"
    echo "================================================"
    echo ""

    check_prerequisites
    generate_secrets
    generate_tls_certificates
    create_s3_secret
    deploy_manifests
    wait_for_cluster
    verify_deployment

    echo ""
    echo "================================================"
    log_info "Deployment completed successfully!"
    echo "================================================"
    echo ""

    print_connection_info
}

# Run main function
main
