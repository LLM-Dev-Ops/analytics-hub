#!/bin/bash
set -euo pipefail

# Kafka Initialization Script

NAMESPACE="${1:-llm-analytics}"

# Color output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m'

log_info() {
    echo -e "${BLUE}[Kafka Init]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[Kafka Init]${NC} $1"
}

log_error() {
    echo -e "${RED}[Kafka Init]${NC} $1"
}

log_info "Initializing Kafka..."

# Get Kafka pod
KAFKA_POD=$(kubectl get pods -l app=kafka -n "$NAMESPACE" -o jsonpath='{.items[0].metadata.name}')

if [ -z "$KAFKA_POD" ]; then
    log_error "Kafka pod not found"
    exit 1
fi

log_info "Kafka pod: $KAFKA_POD"

BOOTSTRAP_SERVER="localhost:9092"

# Topic configurations
declare -A TOPICS=(
    ["llm-events"]="partitions=6,replication=1,retention.ms=604800000"
    ["llm-metrics"]="partitions=3,replication=1,retention.ms=604800000"
    ["llm-alerts"]="partitions=3,replication=1,retention.ms=2592000000"
    ["llm-logs"]="partitions=6,replication=1,retention.ms=259200000"
    ["llm-analytics"]="partitions=3,replication=1,retention.ms=2592000000"
)

# Create topics
log_info "Creating Kafka topics..."

for topic in "${!TOPICS[@]}"; do
    config=${TOPICS[$topic]}

    # Parse config
    IFS=',' read -ra PARAMS <<< "$config"
    partitions=""
    replication=""
    retention=""

    for param in "${PARAMS[@]}"; do
        if [[ $param == partitions=* ]]; then
            partitions="${param#*=}"
        elif [[ $param == replication=* ]]; then
            replication="${param#*=}"
        elif [[ $param == retention.ms=* ]]; then
            retention="${param#*=}"
        fi
    done

    # Check if topic exists
    if kubectl exec "$KAFKA_POD" -n "$NAMESPACE" -- kafka-topics.sh \
        --bootstrap-server "$BOOTSTRAP_SERVER" \
        --list 2>/dev/null | grep -q "^${topic}$"; then

        log_info "Topic '$topic' already exists"
    else
        log_info "Creating topic '$topic' (partitions=$partitions, replication=$replication)..."

        kubectl exec "$KAFKA_POD" -n "$NAMESPACE" -- kafka-topics.sh \
            --bootstrap-server "$BOOTSTRAP_SERVER" \
            --create \
            --topic "$topic" \
            --partitions "$partitions" \
            --replication-factor "$replication" \
            --config "retention.ms=$retention" \
            --if-not-exists

        log_success "Topic '$topic' created"
    fi
done

# List all topics
log_info "Current Kafka topics:"
kubectl exec "$KAFKA_POD" -n "$NAMESPACE" -- kafka-topics.sh \
    --bootstrap-server "$BOOTSTRAP_SERVER" \
    --list

# Describe topics
log_info "Topic details:"
for topic in "${!TOPICS[@]}"; do
    echo ""
    log_info "Topic: $topic"
    kubectl exec "$KAFKA_POD" -n "$NAMESPACE" -- kafka-topics.sh \
        --bootstrap-server "$BOOTSTRAP_SERVER" \
        --describe \
        --topic "$topic" 2>/dev/null || true
done

# Test producer and consumer
log_info "Testing producer/consumer..."

TEST_TOPIC="llm-events"
TEST_MESSAGE="test-message-$(date +%s)"

# Produce test message
echo "$TEST_MESSAGE" | kubectl exec -i "$KAFKA_POD" -n "$NAMESPACE" -- \
    kafka-console-producer.sh \
    --bootstrap-server "$BOOTSTRAP_SERVER" \
    --topic "$TEST_TOPIC" 2>/dev/null

sleep 2

# Consume test message
CONSUMED=$(kubectl exec "$KAFKA_POD" -n "$NAMESPACE" -- \
    kafka-console-consumer.sh \
    --bootstrap-server "$BOOTSTRAP_SERVER" \
    --topic "$TEST_TOPIC" \
    --from-beginning \
    --max-messages 1 \
    --timeout-ms 5000 2>/dev/null || echo "")

if echo "$CONSUMED" | grep -q "$TEST_MESSAGE"; then
    log_success "Producer/consumer test passed"
else
    log_error "Producer/consumer test failed"
fi

# Display cluster information
log_info "Kafka cluster information:"
kubectl exec "$KAFKA_POD" -n "$NAMESPACE" -- kafka-broker-api-versions.sh \
    --bootstrap-server "$BOOTSTRAP_SERVER" 2>/dev/null | head -5 || true

log_success "Kafka initialization complete"
