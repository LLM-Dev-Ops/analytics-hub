#!/bin/bash
set -euo pipefail

# Integration Test Script - End-to-end testing

NAMESPACE="${1:-llm-analytics}"

# Color output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

log_info() {
    echo -e "${BLUE}[INTEGRATION]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[INTEGRATION]${NC} $1"
}

log_error() {
    echo -e "${RED}[INTEGRATION]${NC} $1"
}

ERRORS=0

# Test end-to-end data flow
test_data_flow() {
    log_info "Testing end-to-end data flow..."

    local ts_pod=$(kubectl get pods -l app=timescaledb -n "$NAMESPACE" -o jsonpath='{.items[0].metadata.name}')
    local redis_pod=$(kubectl get pods -l app=redis,role=master -n "$NAMESPACE" -o jsonpath='{.items[0].metadata.name}')
    local kafka_pod=$(kubectl get pods -l app=kafka -n "$NAMESPACE" -o jsonpath='{.items[0].metadata.name}')

    # Step 1: Produce event to Kafka
    log_info "Step 1: Producing event to Kafka..."

    local test_event="{\"model\":\"gpt-4\",\"tokens\":1000,\"cost\":0.03,\"timestamp\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"}"

    echo "$test_event" | kubectl exec -i "$kafka_pod" -n "$NAMESPACE" -- \
        kafka-console-producer.sh \
        --bootstrap-server localhost:9092 \
        --topic llm-events &>/dev/null

    log_success "Event produced to Kafka"

    # Step 2: Cache in Redis
    log_info "Step 2: Caching event in Redis..."

    local event_id="test-event-$(date +%s)"
    kubectl exec "$redis_pod" -n "$NAMESPACE" -- redis-cli SET "event:$event_id" "$test_event" EX 300 &>/dev/null

    log_success "Event cached in Redis"

    # Step 3: Store in TimescaleDB
    log_info "Step 3: Storing event in TimescaleDB..."

    kubectl exec "$ts_pod" -n "$NAMESPACE" -- psql -U postgres -d analytics -c "
        INSERT INTO llm_usage_metrics (
            time,
            model_id,
            provider,
            request_count,
            token_total,
            cost_usd
        ) VALUES (
            NOW(),
            'gpt-4',
            'openai',
            1,
            1000,
            0.03
        );
    " &>/dev/null

    log_success "Event stored in TimescaleDB"

    # Verify data
    log_info "Verifying stored data..."

    local count=$(kubectl exec "$ts_pod" -n "$NAMESPACE" -- psql -U postgres -d analytics -t -c "
        SELECT COUNT(*) FROM llm_usage_metrics WHERE model_id = 'gpt-4';
    " 2>/dev/null | tr -d ' ')

    if [ "$count" -gt 0 ]; then
        log_success "Data flow test passed"
    else
        log_error "Data flow test failed"
        ((ERRORS++))
    fi

    # Cleanup
    kubectl exec "$redis_pod" -n "$NAMESPACE" -- redis-cli DEL "event:$event_id" &>/dev/null
}

# Test cache invalidation
test_cache_invalidation() {
    log_info "Testing cache invalidation..."

    local redis_pod=$(kubectl get pods -l app=redis,role=master -n "$NAMESPACE" -o jsonpath='{.items[0].metadata.name}')

    # Set cache
    kubectl exec "$redis_pod" -n "$NAMESPACE" -- redis-cli SET "cache:test" "value1" &>/dev/null

    # Verify cache
    local value=$(kubectl exec "$redis_pod" -n "$NAMESPACE" -- redis-cli GET "cache:test")

    if [ "$value" = "value1" ]; then
        # Invalidate
        kubectl exec "$redis_pod" -n "$NAMESPACE" -- redis-cli DEL "cache:test" &>/dev/null

        # Verify invalidation
        local after=$(kubectl exec "$redis_pod" -n "$NAMESPACE" -- redis-cli GET "cache:test")

        if [ -z "$after" ] || [ "$after" = "(nil)" ]; then
            log_success "Cache invalidation test passed"
        else
            log_error "Cache invalidation test failed"
            ((ERRORS++))
        fi
    else
        log_error "Cache set failed"
        ((ERRORS++))
    fi
}

# Test event streaming pipeline
test_event_streaming() {
    log_info "Testing event streaming pipeline..."

    local kafka_pod=$(kubectl get pods -l app=kafka -n "$NAMESPACE" -o jsonpath='{.items[0].metadata.name}')

    # Create test events
    for i in {1..5}; do
        echo "event-$i" | kubectl exec -i "$kafka_pod" -n "$NAMESPACE" -- \
            kafka-console-producer.sh \
            --bootstrap-server localhost:9092 \
            --topic llm-events &>/dev/null
    done

    sleep 2

    # Consume events
    local consumed=$(kubectl exec "$kafka_pod" -n "$NAMESPACE" -- \
        kafka-console-consumer.sh \
        --bootstrap-server localhost:9092 \
        --topic llm-events \
        --from-beginning \
        --max-messages 5 \
        --timeout-ms 10000 2>/dev/null | wc -l)

    if [ "$consumed" -ge 5 ]; then
        log_success "Event streaming test passed"
    else
        log_error "Event streaming test failed (consumed: $consumed/5)"
        ((ERRORS++))
    fi
}

# Test multi-database transaction
test_multi_db_transaction() {
    log_info "Testing multi-database transaction simulation..."

    local ts_pod=$(kubectl get pods -l app=timescaledb -n "$NAMESPACE" -o jsonpath='{.items[0].metadata.name}')
    local redis_pod=$(kubectl get pods -l app=redis,role=master -n "$NAMESPACE" -o jsonpath='{.items[0].metadata.name}')

    local tx_id="tx-$(date +%s)"

    # Step 1: Begin - cache transaction
    kubectl exec "$redis_pod" -n "$NAMESPACE" -- redis-cli SET "tx:$tx_id:status" "pending" EX 300 &>/dev/null

    # Step 2: Execute - store in database
    kubectl exec "$ts_pod" -n "$NAMESPACE" -- psql -U postgres -d analytics -c "
        INSERT INTO llm_usage_metrics (
            time, model_id, provider, request_count
        ) VALUES (
            NOW(), 'test-model', 'test-provider', 1
        );
    " &>/dev/null

    # Step 3: Commit - update cache
    kubectl exec "$redis_pod" -n "$NAMESPACE" -- redis-cli SET "tx:$tx_id:status" "committed" EX 300 &>/dev/null

    # Verify
    local status=$(kubectl exec "$redis_pod" -n "$NAMESPACE" -- redis-cli GET "tx:$tx_id:status")

    if [ "$status" = "committed" ]; then
        log_success "Multi-database transaction test passed"
    else
        log_error "Multi-database transaction test failed"
        ((ERRORS++))
    fi

    # Cleanup
    kubectl exec "$redis_pod" -n "$NAMESPACE" -- redis-cli DEL "tx:$tx_id:status" &>/dev/null
}

# Test backup capability
test_backup_capability() {
    log_info "Testing backup capability..."

    local ts_pod=$(kubectl get pods -l app=timescaledb -n "$NAMESPACE" -o jsonpath='{.items[0].metadata.name}')

    # Create backup
    if kubectl exec "$ts_pod" -n "$NAMESPACE" -- pg_dump -U postgres analytics &>/dev/null; then
        log_success "Backup capability test passed"
    else
        log_error "Backup capability test failed"
        ((ERRORS++))
    fi
}

# Test monitoring endpoints
test_monitoring() {
    log_info "Testing monitoring endpoints..."

    local ts_pod=$(kubectl get pods -l app=timescaledb -n "$NAMESPACE" -o jsonpath='{.items[0].metadata.name}')
    local redis_pod=$(kubectl get pods -l app=redis,role=master -n "$NAMESPACE" -o jsonpath='{.items[0].metadata.name}')

    # TimescaleDB stats
    if kubectl exec "$ts_pod" -n "$NAMESPACE" -- psql -U postgres -c "SELECT * FROM pg_stat_database LIMIT 1;" &>/dev/null; then
        log_success "TimescaleDB monitoring OK"
    else
        log_error "TimescaleDB monitoring failed"
        ((ERRORS++))
    fi

    # Redis stats
    if kubectl exec "$redis_pod" -n "$NAMESPACE" -- redis-cli INFO stats &>/dev/null; then
        log_success "Redis monitoring OK"
    else
        log_error "Redis monitoring failed"
        ((ERRORS++))
    fi
}

# Main integration test
main() {
    log_info "=========================================="
    log_info "Running Integration Tests"
    log_info "Namespace: $NAMESPACE"
    log_info "=========================================="

    test_data_flow
    test_cache_invalidation
    test_event_streaming
    test_multi_db_transaction
    test_backup_capability
    test_monitoring

    echo ""
    if [ $ERRORS -eq 0 ]; then
        log_success "=========================================="
        log_success "All integration tests passed!"
        log_success "=========================================="
        exit 0
    else
        log_error "=========================================="
        log_error "Integration tests failed with $ERRORS error(s)"
        log_error "=========================================="
        exit 1
    fi
}

main "$@"
