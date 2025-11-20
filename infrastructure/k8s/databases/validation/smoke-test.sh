#!/bin/bash
set -euo pipefail

# Smoke Test Script - Quick validation of basic functionality

NAMESPACE="${1:-llm-analytics}"

# Color output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

log_info() {
    echo -e "${BLUE}[SMOKE-TEST]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SMOKE-TEST]${NC} $1"
}

log_error() {
    echo -e "${RED}[SMOKE-TEST]${NC} $1"
}

ERRORS=0

# Test TimescaleDB connectivity
test_timescaledb_connectivity() {
    log_info "Testing TimescaleDB connectivity..."

    local pod=$(kubectl get pods -l app=timescaledb -n "$NAMESPACE" -o jsonpath='{.items[0].metadata.name}' 2>/dev/null)

    if [ -z "$pod" ]; then
        log_error "TimescaleDB pod not found"
        ((ERRORS++))
        return 1
    fi

    if kubectl exec "$pod" -n "$NAMESPACE" -- psql -U postgres -c "SELECT 1;" &>/dev/null; then
        log_success "TimescaleDB connectivity OK"
    else
        log_error "TimescaleDB connectivity failed"
        ((ERRORS++))
        return 1
    fi
}

# Test TimescaleDB CRUD operations
test_timescaledb_crud() {
    log_info "Testing TimescaleDB CRUD operations..."

    local pod=$(kubectl get pods -l app=timescaledb -n "$NAMESPACE" -o jsonpath='{.items[0].metadata.name}' 2>/dev/null)

    if [ -z "$pod" ]; then
        return 1
    fi

    # Create test table
    kubectl exec "$pod" -n "$NAMESPACE" -- psql -U postgres -d analytics -c "
        CREATE TABLE IF NOT EXISTS smoke_test (
            id SERIAL PRIMARY KEY,
            data TEXT,
            created_at TIMESTAMP DEFAULT NOW()
        );
    " &>/dev/null

    # Insert
    kubectl exec "$pod" -n "$NAMESPACE" -- psql -U postgres -d analytics -c "
        INSERT INTO smoke_test (data) VALUES ('test');
    " &>/dev/null

    # Select
    local result=$(kubectl exec "$pod" -n "$NAMESPACE" -- psql -U postgres -d analytics -t -c "
        SELECT COUNT(*) FROM smoke_test;
    " 2>/dev/null | tr -d ' ')

    if [ "$result" -gt 0 ]; then
        log_success "TimescaleDB CRUD operations OK"
    else
        log_error "TimescaleDB CRUD operations failed"
        ((ERRORS++))
    fi

    # Cleanup
    kubectl exec "$pod" -n "$NAMESPACE" -- psql -U postgres -d analytics -c "
        DROP TABLE IF EXISTS smoke_test;
    " &>/dev/null
}

# Test Redis connectivity
test_redis_connectivity() {
    log_info "Testing Redis connectivity..."

    local pod=$(kubectl get pods -l app=redis,role=master -n "$NAMESPACE" -o jsonpath='{.items[0].metadata.name}' 2>/dev/null)

    if [ -z "$pod" ]; then
        log_error "Redis pod not found"
        ((ERRORS++))
        return 1
    fi

    if kubectl exec "$pod" -n "$NAMESPACE" -- redis-cli ping | grep -q PONG; then
        log_success "Redis connectivity OK"
    else
        log_error "Redis connectivity failed"
        ((ERRORS++))
        return 1
    fi
}

# Test Redis operations
test_redis_operations() {
    log_info "Testing Redis operations..."

    local pod=$(kubectl get pods -l app=redis,role=master -n "$NAMESPACE" -o jsonpath='{.items[0].metadata.name}' 2>/dev/null)

    if [ -z "$pod" ]; then
        return 1
    fi

    # Set
    kubectl exec "$pod" -n "$NAMESPACE" -- redis-cli SET smoke_test "success" EX 60 &>/dev/null

    # Get
    local result=$(kubectl exec "$pod" -n "$NAMESPACE" -- redis-cli GET smoke_test 2>/dev/null)

    if [ "$result" = "success" ]; then
        log_success "Redis operations OK"
    else
        log_error "Redis operations failed"
        ((ERRORS++))
    fi

    # Delete
    kubectl exec "$pod" -n "$NAMESPACE" -- redis-cli DEL smoke_test &>/dev/null
}

# Test Kafka connectivity
test_kafka_connectivity() {
    log_info "Testing Kafka connectivity..."

    local pod=$(kubectl get pods -l app=kafka -n "$NAMESPACE" -o jsonpath='{.items[0].metadata.name}' 2>/dev/null)

    if [ -z "$pod" ]; then
        log_error "Kafka pod not found"
        ((ERRORS++))
        return 1
    fi

    if kubectl exec "$pod" -n "$NAMESPACE" -- kafka-broker-api-versions.sh --bootstrap-server localhost:9092 &>/dev/null; then
        log_success "Kafka connectivity OK"
    else
        log_error "Kafka connectivity failed"
        ((ERRORS++))
        return 1
    fi
}

# Test Kafka producer/consumer
test_kafka_operations() {
    log_info "Testing Kafka operations..."

    local pod=$(kubectl get pods -l app=kafka -n "$NAMESPACE" -o jsonpath='{.items[0].metadata.name}' 2>/dev/null)

    if [ -z "$pod" ]; then
        return 1
    fi

    local test_topic="smoke-test"
    local test_message="smoke-test-$(date +%s)"

    # Create test topic
    kubectl exec "$pod" -n "$NAMESPACE" -- kafka-topics.sh \
        --bootstrap-server localhost:9092 \
        --create \
        --topic "$test_topic" \
        --partitions 1 \
        --replication-factor 1 \
        --if-not-exists &>/dev/null

    sleep 2

    # Produce message
    echo "$test_message" | kubectl exec -i "$pod" -n "$NAMESPACE" -- \
        kafka-console-producer.sh \
        --bootstrap-server localhost:9092 \
        --topic "$test_topic" &>/dev/null

    sleep 2

    # Consume message
    local consumed=$(kubectl exec "$pod" -n "$NAMESPACE" -- \
        kafka-console-consumer.sh \
        --bootstrap-server localhost:9092 \
        --topic "$test_topic" \
        --from-beginning \
        --max-messages 1 \
        --timeout-ms 5000 2>/dev/null || echo "")

    if echo "$consumed" | grep -q "$test_message"; then
        log_success "Kafka operations OK"
    else
        log_error "Kafka operations failed"
        ((ERRORS++))
    fi

    # Delete test topic
    kubectl exec "$pod" -n "$NAMESPACE" -- kafka-topics.sh \
        --bootstrap-server localhost:9092 \
        --delete \
        --topic "$test_topic" &>/dev/null || true
}

# Test replication
test_replication() {
    log_info "Testing replication..."

    # Test Redis replication
    local replica_count=$(kubectl get pods -l app=redis,role=replica -n "$NAMESPACE" --no-headers 2>/dev/null | wc -l)

    if [ "$replica_count" -gt 0 ]; then
        log_info "Testing Redis replication..."

        local master_pod=$(kubectl get pods -l app=redis,role=master -n "$NAMESPACE" -o jsonpath='{.items[0].metadata.name}')
        local replica_pod=$(kubectl get pods -l app=redis,role=replica -n "$NAMESPACE" -o jsonpath='{.items[0].metadata.name}')

        # Write to master
        kubectl exec "$master_pod" -n "$NAMESPACE" -- redis-cli SET repl_test "success" EX 60 &>/dev/null

        sleep 2

        # Read from replica
        local value=$(kubectl exec "$replica_pod" -n "$NAMESPACE" -- redis-cli GET repl_test 2>/dev/null)

        if [ "$value" = "success" ]; then
            log_success "Redis replication OK"
        else
            log_error "Redis replication failed"
            ((ERRORS++))
        fi

        # Cleanup
        kubectl exec "$master_pod" -n "$NAMESPACE" -- redis-cli DEL repl_test &>/dev/null
    else
        log_info "No Redis replicas configured, skipping replication test"
    fi
}

# Test persistence
test_persistence() {
    log_info "Testing persistence..."

    # Check PVCs are bound
    local pvc_count=$(kubectl get pvc -n "$NAMESPACE" -o jsonpath='{.items[?(@.status.phase=="Bound")].metadata.name}' 2>/dev/null | wc -w)

    if [ "$pvc_count" -gt 0 ]; then
        log_success "Persistence configured: $pvc_count PVC(s) bound"
    else
        log_error "No PVCs bound"
        ((ERRORS++))
    fi
}

# Main smoke test
main() {
    log_info "=========================================="
    log_info "Running Smoke Tests"
    log_info "Namespace: $NAMESPACE"
    log_info "=========================================="

    test_timescaledb_connectivity
    test_timescaledb_crud
    test_redis_connectivity
    test_redis_operations
    test_kafka_connectivity
    test_kafka_operations
    test_replication
    test_persistence

    echo ""
    if [ $ERRORS -eq 0 ]; then
        log_success "=========================================="
        log_success "All smoke tests passed!"
        log_success "=========================================="
        exit 0
    else
        log_error "=========================================="
        log_error "Smoke tests failed with $ERRORS error(s)"
        log_error "=========================================="
        exit 1
    fi
}

main "$@"
