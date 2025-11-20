#!/bin/bash
set -e

# Kafka ACL Setup Script
# Configures Access Control Lists for LLM Analytics Hub

KAFKA_BOOTSTRAP="${KAFKA_BOOTSTRAP_SERVERS:-kafka:9092}"
CONFIG_FILE="${CONFIG_FILE:-/config/admin.properties}"

echo "========================================="
echo "Kafka ACL Setup Script"
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

# Function to create ACL
create_acl() {
  local PRINCIPAL=$1
  local RESOURCE_TYPE=$2
  local RESOURCE_NAME=$3
  local OPERATION=$4
  local PERMISSION=${5:-ALLOW}

  echo "Creating ACL:"
  echo "  Principal: $PRINCIPAL"
  echo "  Resource: $RESOURCE_TYPE:$RESOURCE_NAME"
  echo "  Operation: $OPERATION"
  echo "  Permission: $PERMISSION"

  kafka-acls.sh --add \
    --bootstrap-server "$KAFKA_BOOTSTRAP" \
    --command-config "$CONFIG_FILE" \
    --allow-principal "User:$PRINCIPAL" \
    --operation "$OPERATION" \
    --${RESOURCE_TYPE,,} "$RESOURCE_NAME" \
    --force > /dev/null 2>&1

  echo "✓ ACL created"
  echo ""
}

# Create ACLs for producers
echo "Setting up ACLs for LLM Analytics Producer..."
echo ""

# Producer: Write to topics
create_acl "llm-analytics-producer" "topic" "llm-events" "WRITE"
create_acl "llm-analytics-producer" "topic" "llm-metrics" "WRITE"
create_acl "llm-analytics-producer" "topic" "llm-analytics" "WRITE"
create_acl "llm-analytics-producer" "topic" "llm-traces" "WRITE"
create_acl "llm-analytics-producer" "topic" "llm-errors" "WRITE"
create_acl "llm-analytics-producer" "topic" "llm-audit" "WRITE"
create_acl "llm-analytics-producer" "topic" "llm-alerts" "WRITE"
create_acl "llm-analytics-producer" "topic" "llm-session-events" "WRITE"
create_acl "llm-analytics-producer" "topic" "llm-user-feedback" "WRITE"
create_acl "llm-analytics-producer" "topic" "llm-cost-tracking" "WRITE"

# Producer: Describe topics
create_acl "llm-analytics-producer" "topic" "llm-*" "DESCRIBE"

# Producer: Create topics (if auto-create is enabled)
create_acl "llm-analytics-producer" "cluster" "kafka-cluster" "CREATE"

# Create ACLs for consumers
echo "Setting up ACLs for LLM Analytics Consumer..."
echo ""

# Consumer: Read from topics
create_acl "llm-analytics-consumer" "topic" "llm-events" "READ"
create_acl "llm-analytics-consumer" "topic" "llm-metrics" "READ"
create_acl "llm-analytics-consumer" "topic" "llm-analytics" "READ"
create_acl "llm-analytics-consumer" "topic" "llm-traces" "READ"
create_acl "llm-analytics-consumer" "topic" "llm-errors" "READ"
create_acl "llm-analytics-consumer" "topic" "llm-audit" "READ"
create_acl "llm-analytics-consumer" "topic" "llm-alerts" "READ"
create_acl "llm-analytics-consumer" "topic" "llm-session-events" "READ"
create_acl "llm-analytics-consumer" "topic" "llm-user-feedback" "READ"
create_acl "llm-analytics-consumer" "topic" "llm-cost-tracking" "READ"
create_acl "llm-analytics-consumer" "topic" "llm-aggregated-metrics" "READ"
create_acl "llm-analytics-consumer" "topic" "llm-model-performance" "READ"
create_acl "llm-analytics-consumer" "topic" "llm-usage-stats" "READ"

# Consumer: Describe topics
create_acl "llm-analytics-consumer" "topic" "llm-*" "DESCRIBE"

# Consumer: Consumer group operations
create_acl "llm-analytics-consumer" "group" "llm-analytics-group" "READ"
create_acl "llm-analytics-consumer" "group" "llm-analytics-group" "DESCRIBE"
create_acl "llm-analytics-consumer" "group" "llm-stream-processor" "READ"
create_acl "llm-analytics-consumer" "group" "llm-stream-processor" "DESCRIBE"

# Create ACLs for stream processors
echo "Setting up ACLs for Stream Processors..."
echo ""

# Stream processor: Read and Write
create_acl "llm-stream-processor" "topic" "llm-events" "READ"
create_acl "llm-stream-processor" "topic" "llm-metrics" "READ"
create_acl "llm-stream-processor" "topic" "llm-aggregated-metrics" "WRITE"
create_acl "llm-stream-processor" "topic" "llm-model-performance" "WRITE"
create_acl "llm-stream-processor" "topic" "llm-usage-stats" "WRITE"
create_acl "llm-stream-processor" "topic" "llm-alerts" "WRITE"
create_acl "llm-stream-processor" "topic" "llm-deadletter" "WRITE"

# Stream processor: All topic operations
create_acl "llm-stream-processor" "topic" "llm-*" "DESCRIBE"
create_acl "llm-stream-processor" "topic" "llm-*" "CREATE"

# Stream processor: Consumer group
create_acl "llm-stream-processor" "group" "llm-stream-processor" "READ"
create_acl "llm-stream-processor" "group" "llm-stream-processor" "DESCRIBE"

# Stream processor: Internal topics
create_acl "llm-stream-processor" "topic" "_*" "ALL"

# Create ACLs for monitoring
echo "Setting up ACLs for Monitoring..."
echo ""

# Monitoring: Describe and read for lag monitoring
create_acl "kafka-lag-exporter" "topic" "llm-*" "DESCRIBE"
create_acl "kafka-lag-exporter" "group" "*" "DESCRIBE"
create_acl "kafka-lag-exporter" "cluster" "kafka-cluster" "DESCRIBE"

# Create ACLs for backup/mirror maker
echo "Setting up ACLs for Backup/MirrorMaker..."
echo ""

# MirrorMaker: Read all topics
create_acl "mirror-maker" "topic" "llm-*" "READ"
create_acl "mirror-maker" "topic" "llm-*" "DESCRIBE"

# MirrorMaker: Write to backup topics
create_acl "mirror-maker" "topic" "*" "WRITE"
create_acl "mirror-maker" "topic" "*" "CREATE"

# MirrorMaker: Consumer groups
create_acl "mirror-maker" "group" "mirror-maker-*" "READ"
create_acl "mirror-maker" "group" "mirror-maker-*" "DESCRIBE"

# MirrorMaker: Cluster operations
create_acl "mirror-maker" "cluster" "kafka-cluster" "DESCRIBE"
create_acl "mirror-maker" "cluster" "kafka-cluster" "ALTER"

# Create ACLs for admin operations
echo "Setting up ACLs for Admin Operations..."
echo ""

# Admin: All operations (already has super user rights)
# This is redundant but explicit for documentation
create_acl "admin" "cluster" "kafka-cluster" "ALL"
create_acl "admin" "topic" "*" "ALL"
create_acl "admin" "group" "*" "ALL"

echo "========================================="
echo "ACL setup completed!"
echo "========================================="
echo ""

# List all ACLs
echo "Listing all ACLs:"
kafka-acls.sh --list \
  --bootstrap-server "$KAFKA_BOOTSTRAP" \
  --command-config "$CONFIG_FILE"

echo ""
echo "✓ All ACLs configured successfully!"
