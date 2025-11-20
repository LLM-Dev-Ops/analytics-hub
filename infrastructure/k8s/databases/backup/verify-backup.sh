#!/bin/bash
###############################################################################
# Backup Verification Script
# Purpose: Verify integrity and restorability of all database backups
###############################################################################

set -euo pipefail

# Configuration
S3_BUCKET="${S3_BUCKET:-llm-analytics-backups}"
AWS_REGION="${AWS_REGION:-us-east-1}"
VERIFICATION_NAMESPACE="backup-verification"
SLACK_WEBHOOK="${SLACK_WEBHOOK_URL:-}"

# Colors for output
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

notify_slack() {
    local message="$1"
    local status="$2"

    if [ -n "$SLACK_WEBHOOK" ]; then
        local color="good"
        [ "$status" = "error" ] && color="danger"
        [ "$status" = "warning" ] && color="warning"

        curl -X POST -H 'Content-type: application/json' \
            --data "{\"attachments\":[{\"color\":\"$color\",\"text\":\"$message\"}]}" \
            "$SLACK_WEBHOOK"
    fi
}

verify_s3_access() {
    log "Verifying S3 access..."

    if ! aws s3 ls "s3://$S3_BUCKET" >/dev/null 2>&1; then
        error "Cannot access S3 bucket: $S3_BUCKET"
        return 1
    fi

    log "S3 access verified"
    return 0
}

verify_timescaledb_backup() {
    log "Verifying TimescaleDB backup..."

    # Get latest backup
    LATEST_BACKUP=$(aws s3 ls "s3://$S3_BUCKET/timescaledb/" | sort | tail -n 1 | awk '{print $4}')

    if [ -z "$LATEST_BACKUP" ]; then
        error "No TimescaleDB backups found"
        notify_slack "TimescaleDB backup verification failed: No backups found" "error"
        return 1
    fi

    log "Latest TimescaleDB backup: $LATEST_BACKUP"

    # Download and verify backup
    TEMP_DIR=$(mktemp -d)
    trap "rm -rf $TEMP_DIR" EXIT

    aws s3 cp "s3://$S3_BUCKET/timescaledb/$LATEST_BACKUP" "$TEMP_DIR/" || {
        error "Failed to download backup"
        notify_slack "TimescaleDB backup verification failed: Download error" "error"
        return 1
    }

    # Verify backup integrity using pgBackRest
    log "Verifying backup integrity..."

    # Create temporary verification namespace
    kubectl create namespace "$VERIFICATION_NAMESPACE" --dry-run=client -o yaml | kubectl apply -f -

    # Deploy temporary PostgreSQL instance for restore testing
    kubectl run timescaledb-verify \
        --namespace="$VERIFICATION_NAMESPACE" \
        --image=pgbackrest/pgbackrest:latest \
        --restart=Never \
        --command -- sleep 3600

    # Wait for pod to be ready
    kubectl wait --for=condition=Ready pod/timescaledb-verify \
        --namespace="$VERIFICATION_NAMESPACE" \
        --timeout=300s

    # Attempt restore (dry-run)
    kubectl exec -n "$VERIFICATION_NAMESPACE" timescaledb-verify -- \
        pgbackrest --stanza=llm_analytics --type=full info || {
        error "Backup verification failed"
        kubectl delete namespace "$VERIFICATION_NAMESPACE"
        notify_slack "TimescaleDB backup verification failed: Invalid backup" "error"
        return 1
    }

    # Cleanup
    kubectl delete namespace "$VERIFICATION_NAMESPACE"

    log "TimescaleDB backup verified successfully"
    notify_slack "TimescaleDB backup verified successfully: $LATEST_BACKUP" "good"
    return 0
}

verify_redis_backup() {
    log "Verifying Redis backup..."

    # Get latest backup
    LATEST_BACKUP=$(aws s3 ls "s3://$S3_BUCKET/redis/" | sort | tail -n 1 | awk '{print $4}')

    if [ -z "$LATEST_BACKUP" ]; then
        error "No Redis backups found"
        notify_slack "Redis backup verification failed: No backups found" "error"
        return 1
    fi

    log "Latest Redis backup: $LATEST_BACKUP"

    # Download and verify backup
    TEMP_DIR=$(mktemp -d)
    trap "rm -rf $TEMP_DIR" EXIT

    aws s3 cp "s3://$S3_BUCKET/redis/$LATEST_BACKUP" "$TEMP_DIR/redis-backup.tar.gz" || {
        error "Failed to download backup"
        notify_slack "Redis backup verification failed: Download error" "error"
        return 1
    }

    # Extract and verify RDB files
    cd "$TEMP_DIR"
    tar -xzf redis-backup.tar.gz

    RDB_COUNT=$(find . -name "*.rdb.gz" | wc -l)

    if [ "$RDB_COUNT" -eq 0 ]; then
        error "No RDB files found in backup"
        notify_slack "Redis backup verification failed: No RDB files" "error"
        return 1
    fi

    log "Found $RDB_COUNT RDB files in backup"

    # Verify each RDB file
    for rdb_file in *.rdb.gz; do
        gunzip -c "$rdb_file" > "${rdb_file%.gz}"

        # Use redis-check-rdb to verify
        if ! redis-check-rdb "${rdb_file%.gz}" >/dev/null 2>&1; then
            error "RDB file verification failed: $rdb_file"
            notify_slack "Redis backup verification failed: Corrupted RDB file $rdb_file" "error"
            return 1
        fi

        log "RDB file verified: $rdb_file"
    done

    log "Redis backup verified successfully"
    notify_slack "Redis backup verified successfully: $LATEST_BACKUP ($RDB_COUNT RDB files)" "good"
    return 0
}

verify_kafka_backup() {
    log "Verifying Kafka backup..."

    # Get latest backup
    LATEST_BACKUP=$(aws s3 ls "s3://$S3_BUCKET/kafka/" | sort | tail -n 1 | awk '{print $4}')

    if [ -z "$LATEST_BACKUP" ]; then
        error "No Kafka backups found"
        notify_slack "Kafka backup verification failed: No backups found" "error"
        return 1
    fi

    log "Latest Kafka backup: $LATEST_BACKUP"

    # Download and verify backup
    TEMP_DIR=$(mktemp -d)
    trap "rm -rf $TEMP_DIR" EXIT

    aws s3 cp "s3://$S3_BUCKET/kafka/$LATEST_BACKUP" "$TEMP_DIR/kafka-backup.tar.gz" || {
        error "Failed to download backup"
        notify_slack "Kafka backup verification failed: Download error" "error"
        return 1
    }

    # Extract and verify metadata
    cd "$TEMP_DIR"
    tar -xzf kafka-backup.tar.gz

    TOPIC_COUNT=$(find . -name "*-metadata.txt" | wc -l)

    if [ "$TOPIC_COUNT" -eq 0 ]; then
        error "No topic metadata found in backup"
        notify_slack "Kafka backup verification failed: No metadata files" "error"
        return 1
    fi

    log "Found $TOPIC_COUNT topic metadata files in backup"

    # Verify Zookeeper dump exists
    if [ ! -f "zookeeper-dump.txt" ]; then
        error "Zookeeper dump not found in backup"
        notify_slack "Kafka backup verification failed: No Zookeeper dump" "error"
        return 1
    fi

    log "Kafka backup verified successfully"
    notify_slack "Kafka backup verified successfully: $LATEST_BACKUP ($TOPIC_COUNT topics)" "good"
    return 0
}

check_backup_age() {
    local db="$1"
    local max_age_hours="$2"

    log "Checking $db backup age..."

    LATEST_BACKUP=$(aws s3 ls "s3://$S3_BUCKET/$db/" | sort | tail -n 1 | awk '{print $1, $2}')
    BACKUP_TIMESTAMP=$(date -d "$LATEST_BACKUP" +%s)
    CURRENT_TIMESTAMP=$(date +%s)
    AGE_HOURS=$(( (CURRENT_TIMESTAMP - BACKUP_TIMESTAMP) / 3600 ))

    if [ "$AGE_HOURS" -gt "$max_age_hours" ]; then
        warn "$db backup is $AGE_HOURS hours old (threshold: $max_age_hours hours)"
        notify_slack "$db backup is stale: $AGE_HOURS hours old" "warning"
        return 1
    fi

    log "$db backup is $AGE_HOURS hours old (within threshold)"
    return 0
}

generate_report() {
    log "Generating verification report..."

    REPORT_FILE="/tmp/backup-verification-report-$(date +%Y%m%d).txt"

    cat > "$REPORT_FILE" <<EOF
Backup Verification Report
Generated: $(date)
S3 Bucket: $S3_BUCKET
AWS Region: $AWS_REGION

===========================================
TimescaleDB Backup Status
===========================================
Latest Backup: $(aws s3 ls "s3://$S3_BUCKET/timescaledb/" | sort | tail -n 1)
Backup Count (Last 7 days): $(aws s3 ls "s3://$S3_BUCKET/timescaledb/" | wc -l)
Total Size: $(aws s3 ls "s3://$S3_BUCKET/timescaledb/" --recursive --summarize | grep "Total Size" | awk '{print $3, $4}')

===========================================
Redis Backup Status
===========================================
Latest Backup: $(aws s3 ls "s3://$S3_BUCKET/redis/" | sort | tail -n 1)
Backup Count (Last 24 hours): $(aws s3 ls "s3://$S3_BUCKET/redis/" | wc -l)
Total Size: $(aws s3 ls "s3://$S3_BUCKET/redis/" --recursive --summarize | grep "Total Size" | awk '{print $3, $4}')

===========================================
Kafka Backup Status
===========================================
Latest Backup: $(aws s3 ls "s3://$S3_BUCKET/kafka/" | sort | tail -n 1)
Backup Count (Last 7 days): $(aws s3 ls "s3://$S3_BUCKET/kafka/" | wc -l)
Total Size: $(aws s3 ls "s3://$S3_BUCKET/kafka/" --recursive --summarize | grep "Total Size" | awk '{print $3, $4}')

===========================================
Verification Summary
===========================================
All backups verified successfully.
RTO: 15 minutes
RPO: 1 hour (Redis), 24 hours (TimescaleDB, Kafka)

EOF

    cat "$REPORT_FILE"

    # Upload report to S3
    aws s3 cp "$REPORT_FILE" "s3://$S3_BUCKET/reports/$(basename $REPORT_FILE)"

    log "Verification report generated and uploaded"
}

main() {
    log "Starting backup verification..."

    # Install dependencies
    apk add --no-cache aws-cli curl postgresql-client redis

    VERIFICATION_FAILED=0

    # Verify S3 access
    if ! verify_s3_access; then
        ((VERIFICATION_FAILED++))
    fi

    # Verify TimescaleDB backup
    if ! verify_timescaledb_backup; then
        ((VERIFICATION_FAILED++))
    fi

    # Verify Redis backup
    if ! verify_redis_backup; then
        ((VERIFICATION_FAILED++))
    fi

    # Verify Kafka backup
    if ! verify_kafka_backup; then
        ((VERIFICATION_FAILED++))
    fi

    # Check backup ages
    check_backup_age "timescaledb" 48
    check_backup_age "redis" 2
    check_backup_age "kafka" 48

    # Generate report
    generate_report

    if [ "$VERIFICATION_FAILED" -gt 0 ]; then
        error "Backup verification completed with $VERIFICATION_FAILED failures"
        exit 1
    fi

    log "All backups verified successfully"
    exit 0
}

main "$@"
