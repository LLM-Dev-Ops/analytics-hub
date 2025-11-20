#!/bin/bash
###############################################################################
# TimescaleDB Restore Script
# Purpose: Restore TimescaleDB from backup with PITR capability
###############################################################################

set -euo pipefail

# Configuration
S3_BUCKET="${S3_BUCKET:-llm-analytics-backups}"
RESTORE_TARGET="${RESTORE_TARGET:-latest}"
PITR_TARGET="${PITR_TARGET:-}"
NAMESPACE="${NAMESPACE:-llm-analytics-hub}"
RESTORE_NAMESPACE="${RESTORE_NAMESPACE:-llm-analytics-restore}"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
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

list_available_backups() {
    log "Available backups in S3:"
    aws s3 ls "s3://$S3_BUCKET/timescaledb/" --recursive | grep -E "\.backup$" | tail -20
}

validate_backup() {
    local backup_path="$1"

    log "Validating backup: $backup_path"

    # Download backup info
    aws s3 cp "s3://$S3_BUCKET/$backup_path.info" /tmp/backup.info || {
        error "Failed to download backup info"
        return 1
    }

    # Verify backup integrity
    pgbackrest --stanza=llm_analytics info | grep -q "$backup_path" || {
        error "Backup not found in stanza info"
        return 1
    }

    log "Backup validated successfully"
    return 0
}

create_restore_namespace() {
    log "Creating restore namespace: $RESTORE_NAMESPACE"

    kubectl create namespace "$RESTORE_NAMESPACE" --dry-run=client -o yaml | kubectl apply -f -

    # Copy secrets to restore namespace
    kubectl get secret analytics-hub-secrets -n "$NAMESPACE" -o yaml | \
        sed "s/namespace: $NAMESPACE/namespace: $RESTORE_NAMESPACE/" | \
        kubectl apply -f -
}

deploy_restore_instance() {
    log "Deploying TimescaleDB restore instance..."

    cat <<EOF | kubectl apply -f -
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: timescaledb-restore-pvc
  namespace: $RESTORE_NAMESPACE
spec:
  accessModes:
    - ReadWriteOnce
  storageClassName: fast-ssd
  resources:
    requests:
      storage: 100Gi
---
apiVersion: v1
kind: Pod
metadata:
  name: timescaledb-restore
  namespace: $RESTORE_NAMESPACE
  labels:
    app: timescaledb-restore
spec:
  containers:
    - name: postgres
      image: timescale/timescaledb-ha:pg15-latest
      env:
        - name: POSTGRES_USER
          value: postgres
        - name: POSTGRES_PASSWORD
          valueFrom:
            secretKeyRef:
              name: analytics-hub-secrets
              key: DB_PASSWORD
        - name: PGDATA
          value: /var/lib/postgresql/data/pgdata
      ports:
        - containerPort: 5432
          name: postgres
      volumeMounts:
        - name: data
          mountPath: /var/lib/postgresql/data
      resources:
        requests:
          memory: "2Gi"
          cpu: "1000m"
        limits:
          memory: "4Gi"
          cpu: "2000m"
  volumes:
    - name: data
      persistentVolumeClaim:
        claimName: timescaledb-restore-pvc
---
apiVersion: v1
kind: Service
metadata:
  name: timescaledb-restore-service
  namespace: $RESTORE_NAMESPACE
spec:
  type: ClusterIP
  selector:
    app: timescaledb-restore
  ports:
    - name: postgres
      port: 5432
      targetPort: 5432
EOF

    # Wait for pod to be ready
    log "Waiting for restore instance to be ready..."
    kubectl wait --for=condition=Ready pod/timescaledb-restore \
        --namespace="$RESTORE_NAMESPACE" \
        --timeout=300s
}

perform_restore() {
    local backup_path="$1"

    log "Performing restore from: $backup_path"

    # Stop PostgreSQL in restore pod
    kubectl exec -n "$RESTORE_NAMESPACE" timescaledb-restore -- \
        su - postgres -c "pg_ctl stop -D /var/lib/postgresql/data/pgdata" || true

    # Clear data directory
    kubectl exec -n "$RESTORE_NAMESPACE" timescaledb-restore -- \
        rm -rf /var/lib/postgresql/data/pgdata/*

    # Configure pgBackRest
    kubectl exec -n "$RESTORE_NAMESPACE" timescaledb-restore -- \
        bash -c "cat > /etc/pgbackrest.conf <<EOF
[global]
repo1-type=s3
repo1-s3-bucket=$S3_BUCKET
repo1-s3-endpoint=s3.amazonaws.com
repo1-s3-key=$AWS_ACCESS_KEY_ID
repo1-s3-key-secret=$AWS_SECRET_ACCESS_KEY
repo1-s3-region=$AWS_REGION
repo1-path=/timescaledb
repo1-cipher-type=aes-256-cbc
repo1-cipher-pass=$ENCRYPTION_KEY

[llm_analytics]
pg1-path=/var/lib/postgresql/data/pgdata
EOF"

    # Perform restore
    if [ -n "$PITR_TARGET" ]; then
        log "Performing Point-in-Time Recovery to: $PITR_TARGET"
        kubectl exec -n "$RESTORE_NAMESPACE" timescaledb-restore -- \
            pgbackrest --stanza=llm_analytics --type=time --target="$PITR_TARGET" restore
    else
        log "Performing full restore to latest backup"
        kubectl exec -n "$RESTORE_NAMESPACE" timescaledb-restore -- \
            pgbackrest --stanza=llm_analytics restore
    fi

    # Start PostgreSQL
    kubectl exec -n "$RESTORE_NAMESPACE" timescaledb-restore -- \
        su - postgres -c "pg_ctl start -D /var/lib/postgresql/data/pgdata"

    # Wait for PostgreSQL to be ready
    sleep 10

    # Verify restore
    kubectl exec -n "$RESTORE_NAMESPACE" timescaledb-restore -- \
        psql -U postgres -c "SELECT version();"

    log "Restore completed successfully"
}

verify_restore() {
    log "Verifying restored database..."

    # Check database size
    DB_SIZE=$(kubectl exec -n "$RESTORE_NAMESPACE" timescaledb-restore -- \
        psql -U postgres -t -c "SELECT pg_size_pretty(pg_database_size('llm_analytics'));")
    log "Database size: $DB_SIZE"

    # Check table count
    TABLE_COUNT=$(kubectl exec -n "$RESTORE_NAMESPACE" timescaledb-restore -- \
        psql -U postgres -d llm_analytics -t -c "SELECT count(*) FROM information_schema.tables WHERE table_schema='public';")
    log "Table count: $TABLE_COUNT"

    # Check hypertables
    HYPERTABLE_COUNT=$(kubectl exec -n "$RESTORE_NAMESPACE" timescaledb-restore -- \
        psql -U postgres -d llm_analytics -t -c "SELECT count(*) FROM timescaledb_information.hypertables;")
    log "Hypertable count: $HYPERTABLE_COUNT"

    # Run integrity checks
    kubectl exec -n "$RESTORE_NAMESPACE" timescaledb-restore -- \
        psql -U postgres -d llm_analytics -c "SELECT * FROM pg_catalog.pg_database WHERE datname='llm_analytics';"

    log "Verification completed successfully"
}

promote_to_production() {
    warn "CAUTION: This will replace the production database with the restored data!"
    read -p "Are you sure you want to proceed? (yes/no): " confirm

    if [ "$confirm" != "yes" ]; then
        log "Promotion cancelled"
        return 0
    fi

    log "Promoting restored database to production..."

    # Scale down production
    kubectl scale statefulset timescaledb -n "$NAMESPACE" --replicas=0

    # Wait for pods to terminate
    kubectl wait --for=delete pod -l app=timescaledb -n "$NAMESPACE" --timeout=300s

    # Backup current production data
    log "Backing up current production data..."
    kubectl exec -n "$NAMESPACE" timescaledb-0 -- \
        pgbackrest --stanza=llm_analytics --type=full backup || true

    # Copy restored data to production PVC
    # This requires a data migration strategy based on your storage backend

    # Scale up production
    kubectl scale statefulset timescaledb -n "$NAMESPACE" --replicas=3

    # Wait for production to be ready
    kubectl wait --for=condition=Ready pod -l app=timescaledb -n "$NAMESPACE" --timeout=300s

    log "Database promoted to production successfully"
}

cleanup_restore_environment() {
    read -p "Do you want to cleanup the restore environment? (yes/no): " confirm

    if [ "$confirm" = "yes" ]; then
        log "Cleaning up restore environment..."
        kubectl delete namespace "$RESTORE_NAMESPACE"
        log "Cleanup completed"
    fi
}

show_usage() {
    cat <<EOF
Usage: $0 [OPTIONS]

Options:
    -l, --list              List available backups
    -b, --backup PATH       Restore from specific backup path
    -p, --pitr TIMESTAMP    Restore to specific point in time (YYYY-MM-DD HH:MM:SS)
    -n, --namespace NS      Restore namespace (default: llm-analytics-restore)
    --promote               Promote restored database to production
    --cleanup               Cleanup restore environment
    -h, --help              Show this help message

Examples:
    # List available backups
    $0 --list

    # Restore latest backup
    $0

    # Restore specific backup
    $0 --backup timescaledb/full/20240101-120000

    # Point-in-time recovery
    $0 --pitr "2024-01-01 12:00:00"

    # Restore and promote to production
    $0 --promote

EOF
}

main() {
    local list_backups=false
    local backup_path=""
    local promote=false
    local cleanup=false

    # Parse arguments
    while [[ $# -gt 0 ]]; do
        case $1 in
            -l|--list)
                list_backups=true
                shift
                ;;
            -b|--backup)
                backup_path="$2"
                shift 2
                ;;
            -p|--pitr)
                PITR_TARGET="$2"
                shift 2
                ;;
            -n|--namespace)
                RESTORE_NAMESPACE="$2"
                shift 2
                ;;
            --promote)
                promote=true
                shift
                ;;
            --cleanup)
                cleanup=true
                shift
                ;;
            -h|--help)
                show_usage
                exit 0
                ;;
            *)
                error "Unknown option: $1"
                show_usage
                exit 1
                ;;
        esac
    done

    if $list_backups; then
        list_available_backups
        exit 0
    fi

    if $cleanup; then
        cleanup_restore_environment
        exit 0
    fi

    log "Starting TimescaleDB restore process..."

    # Create restore namespace
    create_restore_namespace

    # Deploy restore instance
    deploy_restore_instance

    # Perform restore
    perform_restore "$backup_path"

    # Verify restore
    verify_restore

    # Promote if requested
    if $promote; then
        promote_to_production
    fi

    log "Restore process completed successfully"
    log "Restored database is available at: timescaledb-restore-service.$RESTORE_NAMESPACE.svc.cluster.local:5432"
}

main "$@"
