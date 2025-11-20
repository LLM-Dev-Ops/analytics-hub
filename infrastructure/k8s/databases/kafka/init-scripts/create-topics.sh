#!/bin/bash
set -e

# Kafka Topic Creation Script
# Creates all topics required for LLM Analytics Hub

KAFKA_BOOTSTRAP="${KAFKA_BOOTSTRAP_SERVERS:-kafka:9092}"
CONFIG_FILE="${CONFIG_FILE:-/config/admin.properties}"

echo "========================================="
echo "Kafka Topic Creation Script"
echo "========================================="
echo "Bootstrap Servers: $KAFKA_BOOTSTRAP"
echo ""

# Wait for Kafka to be ready
echo "Waiting for Kafka cluster to be ready..."
while ! kafka-broker-api-versions.sh --bootstrap-server "$KAFKA_BOOTSTRAP" > /dev/null 2>&1; do
  echo "  Kafka not ready yet, waiting..."
  sleep 5
done
echo "✓ Kafka cluster is ready"
echo ""

# Function to create topic
create_topic() {
  local TOPIC_NAME=$1
  local PARTITIONS=$2
  local REPLICATION=$3
  local CONFIGS=$4

  echo "Creating topic: $TOPIC_NAME"
  echo "  Partitions: $PARTITIONS"
  echo "  Replication Factor: $REPLICATION"

  # Create topic
  kafka-topics.sh --create \
    --bootstrap-server "$KAFKA_BOOTSTRAP" \
    --topic "$TOPIC_NAME" \
    --partitions "$PARTITIONS" \
    --replication-factor "$REPLICATION" \
    --if-not-exists \
    --command-config "$CONFIG_FILE" 2>&1 | grep -v "already exists" || true

  # Apply configurations
  if [ -n "$CONFIGS" ]; then
    echo "  Applying configurations..."
    IFS=',' read -ra CONFIG_ARRAY <<< "$CONFIGS"
    for config in "${CONFIG_ARRAY[@]}"; do
      kafka-configs.sh --alter \
        --bootstrap-server "$KAFKA_BOOTSTRAP" \
        --entity-type topics \
        --entity-name "$TOPIC_NAME" \
        --add-config "$config" \
        --command-config "$CONFIG_FILE" > /dev/null 2>&1
    done
  fi

  echo "✓ Topic $TOPIC_NAME created successfully"
  echo ""
}

# Create LLM Analytics topics
echo "Creating LLM Analytics topics..."
echo ""

# 1. LLM Events - Main event stream
create_topic "llm-events" 32 3 \
  "cleanup.policy=delete,retention.ms=604800000,retention.bytes=536870912000,segment.ms=86400000,segment.bytes=1073741824,compression.type=lz4,min.insync.replicas=2,max.message.bytes=10485760"

# 2. LLM Metrics - Performance metrics
create_topic "llm-metrics" 32 3 \
  "cleanup.policy=delete,retention.ms=2592000000,retention.bytes=1073741824000,segment.ms=86400000,segment.bytes=1073741824,compression.type=lz4,min.insync.replicas=2"

# 3. LLM Analytics - Processed analytics
create_topic "llm-analytics" 16 3 \
  "cleanup.policy=delete,retention.ms=604800000,compression.type=lz4,min.insync.replicas=2"

# 4. LLM Traces - Distributed tracing
create_topic "llm-traces" 32 3 \
  "cleanup.policy=delete,retention.ms=604800000,compression.type=lz4,min.insync.replicas=2"

# 5. LLM Errors - Error events
create_topic "llm-errors" 16 3 \
  "cleanup.policy=delete,retention.ms=2592000000,compression.type=lz4,min.insync.replicas=2"

# 6. LLM Audit - Audit logs (compacted)
create_topic "llm-audit" 8 3 \
  "cleanup.policy=compact,delete,retention.ms=7776000000,compression.type=lz4,min.insync.replicas=2,min.compaction.lag.ms=86400000"

# 7. LLM Aggregated Metrics - Pre-aggregated metrics
create_topic "llm-aggregated-metrics" 16 3 \
  "cleanup.policy=delete,retention.ms=2592000000,compression.type=lz4,min.insync.replicas=2"

# 8. LLM Alerts - Alert notifications
create_topic "llm-alerts" 8 3 \
  "cleanup.policy=delete,retention.ms=604800000,compression.type=lz4,min.insync.replicas=2"

# 9. LLM Usage Stats - Usage statistics (compacted)
create_topic "llm-usage-stats" 16 3 \
  "cleanup.policy=compact,delete,retention.ms=2592000000,compression.type=lz4,min.insync.replicas=2"

# 10. LLM Model Performance - Model performance metrics
create_topic "llm-model-performance" 16 3 \
  "cleanup.policy=delete,retention.ms=2592000000,compression.type=lz4,min.insync.replicas=2"

# 11. LLM Cost Tracking - Cost analysis
create_topic "llm-cost-tracking" 8 3 \
  "cleanup.policy=delete,retention.ms=7776000000,compression.type=lz4,min.insync.replicas=2"

# 12. LLM User Feedback - User feedback events
create_topic "llm-user-feedback" 8 3 \
  "cleanup.policy=delete,retention.ms=7776000000,compression.type=lz4,min.insync.replicas=2"

# 13. LLM Session Events - Session tracking
create_topic "llm-session-events" 16 3 \
  "cleanup.policy=delete,retention.ms=2592000000,compression.type=lz4,min.insync.replicas=2"

# 14. LLM Deadletter - Failed messages
create_topic "llm-deadletter" 8 3 \
  "cleanup.policy=delete,retention.ms=7776000000,compression.type=lz4,min.insync.replicas=2"

echo "========================================="
echo "Topic creation completed!"
echo "========================================="
echo ""

# List all created topics
echo "Listing all LLM Analytics topics:"
kafka-topics.sh --list \
  --bootstrap-server "$KAFKA_BOOTSTRAP" \
  --command-config "$CONFIG_FILE" | grep "^llm-"

echo ""
echo "Topic descriptions:"
kafka-topics.sh --describe \
  --bootstrap-server "$KAFKA_BOOTSTRAP" \
  --command-config "$CONFIG_FILE" \
  --topic "llm-*"

echo ""
echo "✓ All topics created successfully!"
