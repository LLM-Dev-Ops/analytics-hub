#!/bin/bash
###############################################################################
# Master Deployment Script for Database Operations Infrastructure
# Purpose: Deploy all monitoring, backup, and operational tooling
###############################################################################

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
NAMESPACE="${NAMESPACE:-llm-analytics-hub}"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log() {
    echo -e "${GREEN}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $*"
}

error() {
    echo -e "${RED}[$(date +'%Y-%m-%d %H:%M:%S')] ERROR:${NC} $*" >&2
}

warn() {
    echo -e "${YELLOW}[$(date +'%Y-%m-%d %H:%M:%S')] WARNING:${NC} $*"
}

section() {
    echo -e "\n${BLUE}========================================${NC}"
    echo -e "${BLUE}$*${NC}"
    echo -e "${BLUE}========================================${NC}\n"
}

check_prerequisites() {
    section "Checking Prerequisites"

    # Check kubectl
    if ! command -v kubectl &> /dev/null; then
        error "kubectl not found. Please install kubectl."
        exit 1
    fi
    log "kubectl: $(kubectl version --client --short)"

    # Check cluster access
    if ! kubectl cluster-info &> /dev/null; then
        error "Cannot access Kubernetes cluster"
        exit 1
    fi
    log "Cluster access: OK"

    # Check namespace
    if ! kubectl get namespace "$NAMESPACE" &> /dev/null; then
        log "Creating namespace: $NAMESPACE"
        kubectl create namespace "$NAMESPACE"
    fi
    log "Namespace: $NAMESPACE"

    # Check AWS CLI
    if ! command -v aws &> /dev/null; then
        warn "AWS CLI not found. S3 backup features may not work."
    else
        log "AWS CLI: $(aws --version | cut -d' ' -f1)"
    fi
}

create_secrets() {
    section "Creating Secrets"

    # Check if secrets exist
    if kubectl get secret backup-s3-credentials -n "$NAMESPACE" &> /dev/null; then
        log "backup-s3-credentials already exists"
    else
        log "Creating backup-s3-credentials secret"
        kubectl create secret generic backup-s3-credentials \
            -n "$NAMESPACE" \
            --from-literal=access-key-id="${AWS_ACCESS_KEY_ID:-}" \
            --from-literal=secret-access-key="${AWS_SECRET_ACCESS_KEY:-}" \
            --dry-run=client -o yaml | kubectl apply -f -
    fi

    if kubectl get secret backup-encryption-key -n "$NAMESPACE" &> /dev/null; then
        log "backup-encryption-key already exists"
    else
        log "Creating backup-encryption-key secret"
        ENCRYPTION_KEY=$(openssl rand -base64 32)
        kubectl create secret generic backup-encryption-key \
            -n "$NAMESPACE" \
            --from-literal=key="$ENCRYPTION_KEY" \
            --dry-run=client -o yaml | kubectl apply -f -
    fi

    if kubectl get secret postgres-exporter-secret -n "$NAMESPACE" &> /dev/null; then
        log "postgres-exporter-secret already exists"
    else
        log "Creating postgres-exporter-secret"
        DB_PASSWORD=$(kubectl get secret analytics-hub-secrets -n "$NAMESPACE" -o jsonpath='{.data.DB_PASSWORD}' | base64 -d || echo "postgres")
        DATA_SOURCE_NAME="postgresql://postgres:${DB_PASSWORD}@timescaledb-service:5432/llm_analytics?sslmode=disable"
        kubectl create secret generic postgres-exporter-secret \
            -n "$NAMESPACE" \
            --from-literal=data-source-name="$DATA_SOURCE_NAME" \
            --dry-run=client -o yaml | kubectl apply -f -
    fi
}

deploy_monitoring() {
    section "Deploying Monitoring Infrastructure"

    # Deploy Prometheus rules
    log "Deploying Prometheus alert rules..."
    kubectl apply -f "$SCRIPT_DIR/monitoring/prometheus-rules.yaml"

    # Deploy ServiceMonitors and exporters
    log "Deploying ServiceMonitors and exporters..."
    kubectl apply -f "$SCRIPT_DIR/monitoring/servicemonitors.yaml"

    # Wait for exporters to be ready
    log "Waiting for exporters to be ready..."
    kubectl wait --for=condition=Ready pod -l app=postgres-exporter -n "$NAMESPACE" --timeout=300s || warn "Postgres exporter not ready"
    kubectl wait --for=condition=Ready pod -l app=redis-exporter -n "$NAMESPACE" --timeout=300s || warn "Redis exporter not ready"

    # Import Grafana dashboards
    log "Grafana dashboards available in: $SCRIPT_DIR/monitoring/"
    log "  - grafana-dashboard-overview.json"
    log "  - grafana-dashboard-timescaledb.json"
    log "  - grafana-dashboard-redis.json"
    log "  - grafana-dashboard-kafka.json"
    warn "Manual import required: Upload JSON files to Grafana UI"
}

deploy_backup_system() {
    section "Deploying Backup System"

    # Deploy S3 configuration
    log "Deploying S3 configuration..."
    kubectl apply -f "$SCRIPT_DIR/backup/s3-config.yaml"

    # Deploy retention policy
    log "Deploying retention policy..."
    kubectl apply -f "$SCRIPT_DIR/backup/retention-policy.yaml"

    # Create backup scripts ConfigMap
    log "Creating backup scripts ConfigMap..."
    kubectl create configmap backup-scripts \
        -n "$NAMESPACE" \
        --from-file="$SCRIPT_DIR/backup/verify-backup.sh" \
        --dry-run=client -o yaml | kubectl apply -f -

    # Deploy backup orchestrator
    log "Deploying backup orchestrator..."
    kubectl apply -f "$SCRIPT_DIR/backup/backup-orchestrator.yaml"

    log "Backup system deployed successfully"
    log "Backup schedules:"
    log "  - TimescaleDB: Daily at 2:00 AM"
    log "  - Redis: Hourly"
    log "  - Kafka: Daily at 3:00 AM"
    log "  - Verification: Monthly on 1st at 4:00 AM"
    log "  - Retention enforcement: Daily at 6:00 AM"
}

setup_operational_tools() {
    section "Setting Up Operational Tools"

    # Make scripts executable
    log "Setting up operational scripts..."
    chmod +x "$SCRIPT_DIR/operations/"*.sh
    chmod +x "$SCRIPT_DIR/utils/"*.sh
    chmod +x "$SCRIPT_DIR/backup/backup-restore-scripts/"*.sh

    # Create ConfigMaps for scripts
    log "Creating operational scripts ConfigMaps..."
    kubectl create configmap database-ops-scripts \
        -n "$NAMESPACE" \
        --from-file="$SCRIPT_DIR/operations/" \
        --dry-run=client -o yaml | kubectl apply -f -

    kubectl create configmap database-utils-scripts \
        -n "$NAMESPACE" \
        --from-file="$SCRIPT_DIR/utils/" \
        --dry-run=client -o yaml | kubectl apply -f -

    log "Operational tools available:"
    log "  - Health check: ./operations/health-check.sh"
    log "  - Connect to TimescaleDB: ./utils/connect-timescaledb.sh"
    log "  - Connect to Redis: ./utils/connect-redis.sh"
    log "  - Connect to Kafka: ./utils/connect-kafka.sh"
}

verify_deployment() {
    section "Verifying Deployment"

    # Check CronJobs
    log "Checking CronJobs..."
    kubectl get cronjobs -n "$NAMESPACE" | grep -E "backup|retention|verification" || warn "No backup CronJobs found"

    # Check ServiceMonitors
    log "Checking ServiceMonitors..."
    kubectl get servicemonitors -n "$NAMESPACE" || warn "No ServiceMonitors found"

    # Check exporters
    log "Checking exporters..."
    kubectl get pods -n "$NAMESPACE" | grep -E "exporter" || warn "No exporters found"

    # Check ConfigMaps
    log "Checking ConfigMaps..."
    kubectl get configmaps -n "$NAMESPACE" | grep -E "backup|prometheus|retention" || warn "Some ConfigMaps missing"

    log "Verification complete"
}

print_summary() {
    section "Deployment Summary"

    cat <<EOF
${GREEN}Database Operations Infrastructure Deployed Successfully!${NC}

${BLUE}Monitoring:${NC}
  - Prometheus alert rules: 50+ alerts configured
  - ServiceMonitors: TimescaleDB, Redis, Kafka, Zookeeper
  - Exporters: Postgres, Redis, JMX, Node
  - Grafana dashboards: 4 dashboards (manual import required)

${BLUE}Backup System:${NC}
  - TimescaleDB: pgBackRest with daily full + continuous WAL
  - Redis: Hourly RDB snapshots + continuous AOF
  - Kafka: Daily metadata backups
  - S3 storage with encryption and lifecycle policies
  - Automated verification: Monthly
  - Retention enforcement: Daily

${BLUE}Operational Tools:${NC}
  - Health check script: ./operations/health-check.sh
  - Database connection scripts: ./utils/connect-*.sh
  - Backup restore scripts: ./backup/backup-restore-scripts/
  - Documentation: ./docs/

${BLUE}Next Steps:${NC}
  1. Import Grafana dashboards from ./monitoring/*.json
  2. Configure AWS credentials for backups (if not done)
  3. Run health check: ./operations/health-check.sh
  4. Review operations guide: ./docs/OPERATIONS_GUIDE.md
  5. Test backup/restore: ./backup/verify-backup.sh

${BLUE}Monitoring URLs:${NC}
  - Grafana: http://grafana.${NAMESPACE}.svc.cluster.local
  - Prometheus: http://prometheus.${NAMESPACE}.svc.cluster.local

${BLUE}Documentation:${NC}
  - Operations Guide: ./docs/OPERATIONS_GUIDE.md
  - Backup & Recovery: ./docs/BACKUP_RECOVERY.md
  - Troubleshooting: ./docs/TROUBLESHOOTING.md
  - Performance Tuning: ./docs/PERFORMANCE_TUNING.md

${GREEN}For help, run: make help${NC}
EOF
}

main() {
    log "Starting database operations infrastructure deployment..."

    check_prerequisites
    create_secrets
    deploy_monitoring
    deploy_backup_system
    setup_operational_tools
    verify_deployment
    print_summary

    log "Deployment completed successfully!"
}

main "$@"
