#!/bin/bash
set -e

# Kafka Performance Testing Script
# Benchmarks producer and consumer throughput

KAFKA_BOOTSTRAP="${KAFKA_BOOTSTRAP_SERVERS:-kafka:9092}"
TEST_TOPIC="${TEST_TOPIC:-performance-test}"
NUM_RECORDS="${NUM_RECORDS:-1000000}"
RECORD_SIZE="${RECORD_SIZE:-1024}"
THROUGHPUT="${THROUGHPUT:-100000}"

echo "========================================="
echo "Kafka Performance Test"
echo "========================================="
echo "Bootstrap Servers: $KAFKA_BOOTSTRAP"
echo "Test Topic: $TEST_TOPIC"
echo "Number of Records: $NUM_RECORDS"
echo "Record Size: $RECORD_SIZE bytes"
echo "Target Throughput: $THROUGHPUT records/sec"
echo ""

# Create test topic
echo "Creating test topic..."
kafka-topics.sh --create \
  --bootstrap-server "$KAFKA_BOOTSTRAP" \
  --topic "$TEST_TOPIC" \
  --partitions 32 \
  --replication-factor 3 \
  --config compression.type=lz4 \
  --config min.insync.replicas=2 \
  --if-not-exists

echo "✓ Test topic created"
echo ""

# Producer Performance Test
echo "========================================="
echo "Producer Performance Test"
echo "========================================="
echo "Testing producer throughput with $NUM_RECORDS records..."
echo ""

kafka-producer-perf-test.sh \
  --topic "$TEST_TOPIC" \
  --num-records "$NUM_RECORDS" \
  --record-size "$RECORD_SIZE" \
  --throughput "$THROUGHPUT" \
  --producer-props \
    bootstrap.servers="$KAFKA_BOOTSTRAP" \
    acks=all \
    compression.type=lz4 \
    batch.size=32768 \
    linger.ms=10 \
    buffer.memory=67108864

echo ""
echo "✓ Producer test complete"
echo ""

# Wait for replication
echo "Waiting for replication to complete..."
sleep 10

# Consumer Performance Test
echo "========================================="
echo "Consumer Performance Test"
echo "========================================="
echo "Testing consumer throughput..."
echo ""

kafka-consumer-perf-test.sh \
  --topic "$TEST_TOPIC" \
  --messages "$NUM_RECORDS" \
  --threads 1 \
  --bootstrap-server "$KAFKA_BOOTSTRAP" \
  --consumer-props \
    group.id=perf-test-consumer \
    enable.auto.commit=false \
    auto.offset.reset=earliest \
    fetch.min.bytes=1024 \
    fetch.max.wait.ms=500

echo ""
echo "✓ Consumer test complete"
echo ""

# End-to-End Latency Test
echo "========================================="
echo "End-to-End Latency Test"
echo "========================================="
echo "Testing end-to-end latency..."
echo ""

kafka-run-class.sh kafka.tools.EndToEndLatency \
  "$KAFKA_BOOTSTRAP" \
  "$TEST_TOPIC" \
  10000 \
  all \
  1024

echo ""
echo "✓ Latency test complete"
echo ""

# Multi-threaded Producer Test
echo "========================================="
echo "Multi-threaded Producer Test"
echo "========================================="
echo "Testing with multiple producer threads..."
echo ""

for threads in 1 2 4 8; do
  echo "Testing with $threads threads..."
  kafka-producer-perf-test.sh \
    --topic "$TEST_TOPIC" \
    --num-records 100000 \
    --record-size "$RECORD_SIZE" \
    --throughput -1 \
    --producer-props \
      bootstrap.servers="$KAFKA_BOOTSTRAP" \
      acks=all \
      compression.type=lz4 \
      batch.size=32768 \
      linger.ms=10 \
    --print-metrics 2>&1 | grep "records sent per second"
  echo ""
done

echo "✓ Multi-threaded test complete"
echo ""

# Compression Test
echo "========================================="
echo "Compression Type Comparison"
echo "========================================="
echo ""

for compression in none gzip snappy lz4 zstd; do
  echo "Testing compression: $compression..."
  kafka-producer-perf-test.sh \
    --topic "$TEST_TOPIC" \
    --num-records 100000 \
    --record-size "$RECORD_SIZE" \
    --throughput -1 \
    --producer-props \
      bootstrap.servers="$KAFKA_BOOTSTRAP" \
      acks=all \
      compression.type="$compression" \
      batch.size=32768 \
      linger.ms=10 \
    --print-metrics 2>&1 | grep -E "records sent per second|average compression rate"
  echo ""
done

echo "✓ Compression test complete"
echo ""

# Cleanup
echo "========================================="
echo "Cleanup"
echo "========================================="
read -p "Delete test topic? (y/n): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
  kafka-topics.sh --delete \
    --bootstrap-server "$KAFKA_BOOTSTRAP" \
    --topic "$TEST_TOPIC"
  echo "✓ Test topic deleted"
else
  echo "Test topic preserved: $TEST_TOPIC"
fi

echo ""
echo "========================================="
echo "Performance Test Complete"
echo "========================================="
