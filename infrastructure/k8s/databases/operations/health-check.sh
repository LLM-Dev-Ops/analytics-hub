#!/bin/bash
###############################################################################
# Database Health Check Script
# Purpose: Comprehensive health checks for all databases
###############################################################################

set -euo pipefail

NAMESPACE="${NAMESPACE:-llm-analytics-hub}"
EXIT_CODE=0

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log() { echo -e "${GREEN}[✓]${NC} $*"; }
error() { echo -e "${RED}[✗]${NC} $*" >&2; EXIT_CODE=1; }
warn() { echo -e "${YELLOW}[!]${NC} $*"; }

check_timescaledb() {
    echo "=========================================="
    echo "TimescaleDB Health Check"
    echo "=========================================="

    # Check if pods are running
    if kubectl get pods -n "$NAMESPACE" -l app=timescaledb | grep -q Running; then
        log "TimescaleDB pods are running"
    else
        error "TimescaleDB pods are not running"
        return 1
    fi

    # Check database connectivity
    if kubectl exec -n "$NAMESPACE" timescaledb-0 -- pg_isready -U postgres >/dev/null 2>&1; then
        log "Database is accepting connections"
    else
        error "Database is not accepting connections"
        return 1
    fi

    # Check replication status
    REPLICATION_LAG=$(kubectl exec -n "$NAMESPACE" timescaledb-0 -- \
        psql -U postgres -t -c "SELECT EXTRACT(EPOCH FROM (now() - pg_last_xact_replay_timestamp()));" 2>/dev/null || echo "0")

    if (( $(echo "$REPLICATION_LAG < 10" | bc -l) )); then
        log "Replication lag: ${REPLICATION_LAG}s (healthy)"
    else
        warn "Replication lag: ${REPLICATION_LAG}s (elevated)"
    fi

    # Check connections
    ACTIVE_CONNECTIONS=$(kubectl exec -n "$NAMESPACE" timescaledb-0 -- \
        psql -U postgres -t -c "SELECT count(*) FROM pg_stat_activity WHERE state='active';" 2>/dev/null || echo "0")
    log "Active connections: $ACTIVE_CONNECTIONS"

    # Check disk usage
    DISK_USAGE=$(kubectl exec -n "$NAMESPACE" timescaledb-0 -- \
        df -h /var/lib/postgresql/data | tail -1 | awk '{print $5}' | sed 's/%//')

    if [ "$DISK_USAGE" -lt 75 ]; then
        log "Disk usage: ${DISK_USAGE}% (healthy)"
    elif [ "$DISK_USAGE" -lt 85 ]; then
        warn "Disk usage: ${DISK_USAGE}% (warning)"
    else
        error "Disk usage: ${DISK_USAGE}% (critical)"
    fi

    # Check for long-running queries
    LONG_QUERIES=$(kubectl exec -n "$NAMESPACE" timescaledb-0 -- \
        psql -U postgres -t -c "SELECT count(*) FROM pg_stat_activity WHERE state='active' AND now() - query_start > interval '5 minutes';" 2>/dev/null || echo "0")

    if [ "$LONG_QUERIES" -eq 0 ]; then
        log "No long-running queries detected"
    else
        warn "Found $LONG_QUERIES long-running queries"
    fi

    echo ""
}

check_redis() {
    echo "=========================================="
    echo "Redis Health Check"
    echo "=========================================="

    # Check if pods are running
    if kubectl get pods -n "$NAMESPACE" -l app=redis-cluster | grep -q Running; then
        log "Redis pods are running"
    else
        error "Redis pods are not running"
        return 1
    fi

    # Get Redis password
    REDIS_PASSWORD=$(kubectl get secret analytics-hub-secrets -n "$NAMESPACE" -o jsonpath='{.data.REDIS_PASSWORD}' | base64 -d)

    # Check cluster status
    CLUSTER_STATE=$(kubectl exec -n "$NAMESPACE" redis-cluster-0 -- \
        redis-cli --pass "$REDIS_PASSWORD" cluster info | grep cluster_state | cut -d: -f2 | tr -d '\r\n')

    if [ "$CLUSTER_STATE" = "ok" ]; then
        log "Cluster state: OK"
    else
        error "Cluster state: $CLUSTER_STATE"
    fi

    # Check memory usage
    MEMORY_USED=$(kubectl exec -n "$NAMESPACE" redis-cluster-0 -- \
        redis-cli --pass "$REDIS_PASSWORD" info memory | grep used_memory_human | cut -d: -f2 | tr -d '\r\n')
    log "Memory used: $MEMORY_USED"

    # Check connected clients
    CONNECTED_CLIENTS=$(kubectl exec -n "$NAMESPACE" redis-cluster-0 -- \
        redis-cli --pass "$REDIS_PASSWORD" info clients | grep connected_clients | cut -d: -f2 | tr -d '\r\n')
    log "Connected clients: $CONNECTED_CLIENTS"

    # Check keyspace
    KEYS=$(kubectl exec -n "$NAMESPACE" redis-cluster-0 -- \
        redis-cli --pass "$REDIS_PASSWORD" dbsize | tr -d '\r\n')
    log "Total keys: $KEYS"

    # Check replication
    REPL_OFFSET=$(kubectl exec -n "$NAMESPACE" redis-cluster-0 -- \
        redis-cli --pass "$REDIS_PASSWORD" info replication | grep master_repl_offset | cut -d: -f2 | tr -d '\r\n')
    log "Replication offset: $REPL_OFFSET"

    echo ""
}

check_kafka() {
    echo "=========================================="
    echo "Kafka Health Check"
    echo "=========================================="

    # Check if pods are running
    if kubectl get pods -n "$NAMESPACE" -l app=kafka | grep -q Running; then
        log "Kafka pods are running"
    else
        error "Kafka pods are not running"
        return 1
    fi

    # Check Zookeeper
    if kubectl exec -n "$NAMESPACE" zookeeper-0 -- \
        zkServer.sh status >/dev/null 2>&1; then
        log "Zookeeper is healthy"
    else
        error "Zookeeper is not healthy"
    fi

    # Check broker connectivity
    if kubectl exec -n "$NAMESPACE" kafka-0 -- \
        kafka-broker-api-versions --bootstrap-server localhost:9092 >/dev/null 2>&1; then
        log "Kafka broker is responding"
    else
        error "Kafka broker is not responding"
    fi

    # Check topic count
    TOPIC_COUNT=$(kubectl exec -n "$NAMESPACE" kafka-0 -- \
        kafka-topics --bootstrap-server localhost:9092 --list 2>/dev/null | wc -l)
    log "Total topics: $TOPIC_COUNT"

    # Check under-replicated partitions
    UNDER_REPLICATED=$(kubectl exec -n "$NAMESPACE" kafka-0 -- \
        kafka-topics --bootstrap-server localhost:9092 --describe --under-replicated-partitions 2>/dev/null | wc -l)

    if [ "$UNDER_REPLICATED" -eq 0 ]; then
        log "No under-replicated partitions"
    else
        error "Found $UNDER_REPLICATED under-replicated partitions"
    fi

    # Check consumer groups
    CONSUMER_GROUPS=$(kubectl exec -n "$NAMESPACE" kafka-0 -- \
        kafka-consumer-groups --bootstrap-server localhost:9092 --list 2>/dev/null | wc -l)
    log "Active consumer groups: $CONSUMER_GROUPS"

    echo ""
}

check_backups() {
    echo "=========================================="
    echo "Backup Health Check"
    echo "=========================================="

    # Check if S3 bucket is accessible
    if aws s3 ls "s3://${S3_BUCKET:-llm-analytics-backups}" >/dev/null 2>&1; then
        log "S3 backup bucket is accessible"
    else
        error "Cannot access S3 backup bucket"
    fi

    # Check latest TimescaleDB backup
    LATEST_TS_BACKUP=$(aws s3 ls "s3://${S3_BUCKET:-llm-analytics-backups}/timescaledb/" | tail -1 | awk '{print $1, $2}')
    if [ -n "$LATEST_TS_BACKUP" ]; then
        BACKUP_AGE=$(( ($(date +%s) - $(date -d "$LATEST_TS_BACKUP" +%s)) / 3600 ))
        if [ "$BACKUP_AGE" -lt 48 ]; then
            log "TimescaleDB backup age: ${BACKUP_AGE}h (healthy)"
        else
            warn "TimescaleDB backup age: ${BACKUP_AGE}h (old)"
        fi
    else
        error "No TimescaleDB backups found"
    fi

    # Check latest Redis backup
    LATEST_REDIS_BACKUP=$(aws s3 ls "s3://${S3_BUCKET:-llm-analytics-backups}/redis/" | tail -1 | awk '{print $1, $2}')
    if [ -n "$LATEST_REDIS_BACKUP" ]; then
        BACKUP_AGE=$(( ($(date +%s) - $(date -d "$LATEST_REDIS_BACKUP" +%s)) / 3600 ))
        if [ "$BACKUP_AGE" -lt 2 ]; then
            log "Redis backup age: ${BACKUP_AGE}h (healthy)"
        else
            warn "Redis backup age: ${BACKUP_AGE}h (old)"
        fi
    else
        error "No Redis backups found"
    fi

    echo ""
}

check_monitoring() {
    echo "=========================================="
    echo "Monitoring Health Check"
    echo "=========================================="

    # Check Prometheus
    if kubectl get pods -n "$NAMESPACE" -l app=prometheus | grep -q Running; then
        log "Prometheus is running"
    else
        warn "Prometheus is not running"
    fi

    # Check Grafana
    if kubectl get pods -n "$NAMESPACE" -l app=grafana | grep -q Running; then
        log "Grafana is running"
    else
        warn "Grafana is not running"
    fi

    # Check exporters
    if kubectl get pods -n "$NAMESPACE" -l app=postgres-exporter | grep -q Running; then
        log "Postgres exporter is running"
    else
        warn "Postgres exporter is not running"
    fi

    if kubectl get pods -n "$NAMESPACE" -l app=redis-exporter | grep -q Running; then
        log "Redis exporter is running"
    else
        warn "Redis exporter is not running"
    fi

    echo ""
}

generate_report() {
    REPORT_FILE="/tmp/health-check-report-$(date +%Y%m%d_%H%M%S).txt"

    {
        echo "Database Health Check Report"
        echo "Generated: $(date)"
        echo "Namespace: $NAMESPACE"
        echo ""
        echo "Overall Status: $([ $EXIT_CODE -eq 0 ] && echo "HEALTHY" || echo "ISSUES DETECTED")"
        echo ""
        echo "For detailed logs, see above output"
    } > "$REPORT_FILE"

    cat "$REPORT_FILE"
    echo ""
    echo "Report saved to: $REPORT_FILE"
}

main() {
    echo "=========================================="
    echo "LLM Analytics Hub - Database Health Check"
    echo "=========================================="
    echo ""

    check_timescaledb
    check_redis
    check_kafka
    check_backups
    check_monitoring

    generate_report

    exit $EXIT_CODE
}

main "$@"
