#!/bin/bash
set -e

# Kafka Cluster Verification Script
# Validates cluster health and configuration

KAFKA_BOOTSTRAP="${KAFKA_BOOTSTRAP_SERVERS:-kafka:9092}"
CONFIG_FILE="${CONFIG_FILE:-/config/admin.properties}"

echo "========================================="
echo "Kafka Cluster Verification"
echo "========================================="
echo ""

# Color codes for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to print status
print_status() {
  if [ $1 -eq 0 ]; then
    echo -e "${GREEN}✓${NC} $2"
  else
    echo -e "${RED}✗${NC} $2"
    return 1
  fi
}

# Function to print warning
print_warning() {
  echo -e "${YELLOW}⚠${NC} $1"
}

# 1. Check Kafka broker connectivity
echo "1. Checking Kafka broker connectivity..."
if kafka-broker-api-versions.sh --bootstrap-server "$KAFKA_BOOTSTRAP" > /dev/null 2>&1; then
  print_status 0 "Kafka brokers are reachable"
else
  print_status 1 "Cannot connect to Kafka brokers"
  exit 1
fi
echo ""

# 2. Check cluster metadata
echo "2. Checking cluster metadata..."
BROKER_COUNT=$(kafka-broker-api-versions.sh --bootstrap-server "$KAFKA_BOOTSTRAP" 2>/dev/null | grep -c "^kafka" || echo "0")
print_status 0 "Found $BROKER_COUNT brokers"

if [ "$BROKER_COUNT" -lt 3 ]; then
  print_warning "Less than 3 brokers detected (recommended: 3+)"
fi
echo ""

# 3. Check controller
echo "3. Checking active controller..."
CONTROLLER_COUNT=$(kafka-metadata.sh --bootstrap-server "$KAFKA_BOOTSTRAP" --describe 2>/dev/null | grep -c "active controller" || echo "1")
if [ "$CONTROLLER_COUNT" -eq 1 ]; then
  print_status 0 "Active controller found"
else
  print_status 1 "No active controller or multiple controllers (split brain)"
fi
echo ""

# 4. Check topics
echo "4. Checking topics..."
TOPIC_COUNT=$(kafka-topics.sh --list --bootstrap-server "$KAFKA_BOOTSTRAP" 2>/dev/null | wc -l)
print_status 0 "Found $TOPIC_COUNT topics"

LLM_TOPIC_COUNT=$(kafka-topics.sh --list --bootstrap-server "$KAFKA_BOOTSTRAP" 2>/dev/null | grep -c "^llm-" || echo "0")
print_status 0 "Found $LLM_TOPIC_COUNT LLM Analytics topics"

if [ "$LLM_TOPIC_COUNT" -lt 10 ]; then
  print_warning "Expected 10+ LLM topics, found $LLM_TOPIC_COUNT"
fi
echo ""

# 5. Check under-replicated partitions
echo "5. Checking replication status..."
URP_COUNT=$(kafka-topics.sh --describe --bootstrap-server "$KAFKA_BOOTSTRAP" --under-replicated-partitions 2>/dev/null | grep -c "Topic:" || echo "0")
if [ "$URP_COUNT" -eq 0 ]; then
  print_status 0 "No under-replicated partitions"
else
  print_warning "Found $URP_COUNT under-replicated partitions"
  kafka-topics.sh --describe --bootstrap-server "$KAFKA_BOOTSTRAP" --under-replicated-partitions
fi
echo ""

# 6. Check offline partitions
echo "6. Checking offline partitions..."
OFFLINE_COUNT=$(kafka-topics.sh --describe --bootstrap-server "$KAFKA_BOOTSTRAP" --unavailable-partitions 2>/dev/null | grep -c "Topic:" || echo "0")
if [ "$OFFLINE_COUNT" -eq 0 ]; then
  print_status 0 "No offline partitions"
else
  print_status 1 "Found $OFFLINE_COUNT offline partitions (CRITICAL)"
  kafka-topics.sh --describe --bootstrap-server "$KAFKA_BOOTSTRAP" --unavailable-partitions
fi
echo ""

# 7. Check consumer groups
echo "7. Checking consumer groups..."
GROUP_COUNT=$(kafka-consumer-groups.sh --list --bootstrap-server "$KAFKA_BOOTSTRAP" 2>/dev/null | wc -l)
print_status 0 "Found $GROUP_COUNT consumer groups"
echo ""

# 8. Check consumer lag
echo "8. Checking consumer lag..."
kafka-consumer-groups.sh --list --bootstrap-server "$KAFKA_BOOTSTRAP" 2>/dev/null | while read -r group; do
  if [ -n "$group" ]; then
    LAG=$(kafka-consumer-groups.sh --describe --bootstrap-server "$KAFKA_BOOTSTRAP" --group "$group" 2>/dev/null | awk 'NR>1 {sum+=$5} END {print sum}')
    if [ -n "$LAG" ] && [ "$LAG" -gt 10000 ]; then
      print_warning "Consumer group '$group' has lag: $LAG messages"
    fi
  fi
done
echo ""

# 9. Check broker configurations
echo "9. Checking critical broker configurations..."

# Check replication factor
RF=$(kafka-configs.sh --describe --bootstrap-server "$KAFKA_BOOTSTRAP" --entity-type brokers --entity-default 2>/dev/null | grep "default.replication.factor" | awk -F= '{print $2}' | tr -d ' ')
if [ "$RF" = "3" ]; then
  print_status 0 "Replication factor: $RF"
else
  print_warning "Replication factor: $RF (recommended: 3)"
fi

# Check min.insync.replicas
MIN_ISR=$(kafka-configs.sh --describe --bootstrap-server "$KAFKA_BOOTSTRAP" --entity-type brokers --entity-default 2>/dev/null | grep "min.insync.replicas" | awk -F= '{print $2}' | tr -d ' ')
if [ "$MIN_ISR" = "2" ]; then
  print_status 0 "Min in-sync replicas: $MIN_ISR"
else
  print_warning "Min in-sync replicas: $MIN_ISR (recommended: 2)"
fi
echo ""

# 10. Check Zookeeper connectivity
echo "10. Checking Zookeeper connectivity..."
if echo ruok | nc zookeeper 2181 | grep -q imok; then
  print_status 0 "Zookeeper is responding"
else
  print_status 1 "Zookeeper is not responding"
fi
echo ""

# 11. Test produce/consume
echo "11. Testing produce/consume functionality..."
TEST_TOPIC="test-verification-$(date +%s)"

# Create test topic
kafka-topics.sh --create \
  --bootstrap-server "$KAFKA_BOOTSTRAP" \
  --topic "$TEST_TOPIC" \
  --partitions 1 \
  --replication-factor 1 \
  --if-not-exists > /dev/null 2>&1

# Produce message
echo "test-message" | kafka-console-producer.sh \
  --bootstrap-server "$KAFKA_BOOTSTRAP" \
  --topic "$TEST_TOPIC" > /dev/null 2>&1

# Consume message
CONSUMED=$(timeout 5 kafka-console-consumer.sh \
  --bootstrap-server "$KAFKA_BOOTSTRAP" \
  --topic "$TEST_TOPIC" \
  --from-beginning \
  --max-messages 1 2>/dev/null || echo "")

if [ "$CONSUMED" = "test-message" ]; then
  print_status 0 "Produce/consume test successful"
else
  print_status 1 "Produce/consume test failed"
fi

# Cleanup test topic
kafka-topics.sh --delete \
  --bootstrap-server "$KAFKA_BOOTSTRAP" \
  --topic "$TEST_TOPIC" > /dev/null 2>&1

echo ""

# Summary
echo "========================================="
echo "Verification Summary"
echo "========================================="
echo "Brokers: $BROKER_COUNT"
echo "Topics: $TOPIC_COUNT"
echo "LLM Topics: $LLM_TOPIC_COUNT"
echo "Consumer Groups: $GROUP_COUNT"
echo "Under-Replicated Partitions: $URP_COUNT"
echo "Offline Partitions: $OFFLINE_COUNT"
echo ""

if [ "$URP_COUNT" -eq 0 ] && [ "$OFFLINE_COUNT" -eq 0 ] && [ "$BROKER_COUNT" -ge 3 ]; then
  echo -e "${GREEN}✓ Cluster is healthy${NC}"
  exit 0
else
  echo -e "${YELLOW}⚠ Cluster has issues that need attention${NC}"
  exit 1
fi
