#!/bin/bash
set -euo pipefail

# Kafka Load Testing Script

NAMESPACE="${1:-llm-analytics}"

# Color output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

log_info() {
    echo -e "${BLUE}[KAFKA-LOAD]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[KAFKA-LOAD]${NC} $1"
}

log_error() {
    echo -e "${RED}[KAFKA-LOAD]${NC} $1"
}

# Configuration
KAFKA_POD=$(kubectl get pods -l app=kafka -n "$NAMESPACE" -o jsonpath='{.items[0].metadata.name}')
BOOTSTRAP_SERVER="localhost:9092"
TEST_TOPIC="load-test-topic"
NUM_RECORDS=100000
RECORD_SIZE=1024
THROUGHPUT=-1  # Unlimited
NUM_PARTITIONS=6
REPLICATION_FACTOR=1

log_info "=========================================="
log_info "Kafka Load Test"
log_info "=========================================="
log_info "Kafka Pod: $KAFKA_POD"
log_info "Test Topic: $TEST_TOPIC"
log_info "Records: $NUM_RECORDS"
log_info "Record Size: $RECORD_SIZE bytes"
log_info "=========================================="

# Create test topic
log_info "Creating test topic..."

kubectl exec "$KAFKA_POD" -n "$NAMESPACE" -- kafka-topics.sh \
    --bootstrap-server "$BOOTSTRAP_SERVER" \
    --create \
    --topic "$TEST_TOPIC" \
    --partitions "$NUM_PARTITIONS" \
    --replication-factor "$REPLICATION_FACTOR" \
    --if-not-exists &>/dev/null

log_success "Test topic created"

# Producer performance test
log_info "Running producer performance test..."

PRODUCER_OUTPUT=$(kubectl exec "$KAFKA_POD" -n "$NAMESPACE" -- \
    kafka-producer-perf-test.sh \
    --topic "$TEST_TOPIC" \
    --num-records "$NUM_RECORDS" \
    --record-size "$RECORD_SIZE" \
    --throughput "$THROUGHPUT" \
    --producer-props bootstrap.servers="$BOOTSTRAP_SERVER" 2>&1 | tail -1)

log_success "Producer Performance Test Results:"
echo "$PRODUCER_OUTPUT"
echo ""

# Extract metrics
PRODUCER_RECORDS=$(echo "$PRODUCER_OUTPUT" | awk '{print $1}')
PRODUCER_THROUGHPUT=$(echo "$PRODUCER_OUTPUT" | awk '{print $4}')
PRODUCER_AVG_LATENCY=$(echo "$PRODUCER_OUTPUT" | awk '{print $8}')
PRODUCER_MAX_LATENCY=$(echo "$PRODUCER_OUTPUT" | awk '{print $10}')

echo "  Records Sent:       $PRODUCER_RECORDS"
echo "  Throughput:         $PRODUCER_THROUGHPUT records/sec"
echo "  Avg Latency:        $PRODUCER_AVG_LATENCY ms"
echo "  Max Latency:        $PRODUCER_MAX_LATENCY ms"
echo ""

# Wait for messages to be available
log_info "Waiting for messages to be available..."
sleep 5

# Consumer performance test
log_info "Running consumer performance test..."

CONSUMER_OUTPUT=$(kubectl exec "$KAFKA_POD" -n "$NAMESPACE" -- \
    kafka-consumer-perf-test.sh \
    --bootstrap-server "$BOOTSTRAP_SERVER" \
    --topic "$TEST_TOPIC" \
    --messages "$NUM_RECORDS" \
    --timeout 60000 2>&1 | grep -v WARN | tail -1)

log_success "Consumer Performance Test Results:"
echo "$CONSUMER_OUTPUT"
echo ""

# Extract consumer metrics
CONSUMER_RECORDS=$(echo "$CONSUMER_OUTPUT" | awk '{print $4}')
CONSUMER_THROUGHPUT=$(echo "$CONSUMER_OUTPUT" | awk '{print $6}')

echo "  Records Consumed:   $CONSUMER_RECORDS"
echo "  Throughput:         $CONSUMER_THROUGHPUT records/sec"
echo ""

# End-to-end latency test
log_info "Running end-to-end latency test..."

E2E_OUTPUT=$(kubectl exec "$KAFKA_POD" -n "$NAMESPACE" -- \
    kafka-run-class.sh kafka.tools.EndToEndLatency \
    "$BOOTSTRAP_SERVER" \
    "$TEST_TOPIC" \
    10000 \
    1 \
    1024 2>&1 | tail -1)

log_success "End-to-End Latency Test Results:"
echo "$E2E_OUTPUT"
echo ""

# Topic details
log_info "Topic Details:"
kubectl exec "$KAFKA_POD" -n "$NAMESPACE" -- kafka-topics.sh \
    --bootstrap-server "$BOOTSTRAP_SERVER" \
    --describe \
    --topic "$TEST_TOPIC"

echo ""

# Consumer lag check
log_info "Consumer Lag:"
kubectl exec "$KAFKA_POD" -n "$NAMESPACE" -- kafka-consumer-groups.sh \
    --bootstrap-server "$BOOTSTRAP_SERVER" \
    --all-groups \
    --describe 2>/dev/null || log_info "No consumer groups active"

echo ""

# Performance assessment
log_info "Performance Assessment:"

# Check producer throughput
if [ -n "$PRODUCER_THROUGHPUT" ]; then
    THROUGHPUT_NUM=$(echo "$PRODUCER_THROUGHPUT" | awk '{print int($1)}')

    if [ "$THROUGHPUT_NUM" -ge 100000 ]; then
        log_success "  Producer Throughput:  EXCELLENT (>=100k msgs/sec)"
    elif [ "$THROUGHPUT_NUM" -ge 50000 ]; then
        log_success "  Producer Throughput:  GOOD (>=50k msgs/sec)"
    else
        log_error "  Producer Throughput:  NEEDS IMPROVEMENT (<50k msgs/sec)"
    fi
fi

# Check latency
if [ -n "$PRODUCER_AVG_LATENCY" ]; then
    LATENCY_NUM=$(echo "$PRODUCER_AVG_LATENCY" | awk '{print int($1)}')

    if [ "$LATENCY_NUM" -le 50 ]; then
        log_success "  Producer Latency:     EXCELLENT (<=50ms)"
    elif [ "$LATENCY_NUM" -le 100 ]; then
        log_success "  Producer Latency:     GOOD (<=100ms)"
    else
        log_error "  Producer Latency:     NEEDS IMPROVEMENT (>100ms)"
    fi
fi

# Cleanup
log_info "Cleaning up test topic..."

kubectl exec "$KAFKA_POD" -n "$NAMESPACE" -- kafka-topics.sh \
    --bootstrap-server "$BOOTSTRAP_SERVER" \
    --delete \
    --topic "$TEST_TOPIC" &>/dev/null || true

log_success "Cleanup complete"

log_success "=========================================="
log_success "Load test completed"
log_success "=========================================="
