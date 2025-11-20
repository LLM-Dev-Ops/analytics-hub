# Kafka Cluster Deployment for LLM Analytics Hub

Production-ready Apache Kafka cluster with Zookeeper for high-throughput event streaming and analytics.

## Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [Prerequisites](#prerequisites)
- [Quick Start](#quick-start)
- [Deployment Options](#deployment-options)
- [Configuration](#configuration)
- [Security](#security)
- [Monitoring](#monitoring)
- [Backup & Disaster Recovery](#backup--disaster-recovery)
- [Operations](#operations)
- [Troubleshooting](#troubleshooting)
- [Performance Tuning](#performance-tuning)

## Overview

This deployment provides a production-grade Kafka cluster with:

- **High Availability**: 3-broker cluster with replication factor 3
- **Performance**: 100k+ messages/sec throughput
- **Security**: TLS encryption + SASL/SCRAM authentication
- **Monitoring**: Prometheus metrics + Grafana dashboards
- **Disaster Recovery**: MirrorMaker 2.0 + automated backups
- **Scalability**: Horizontal scaling to 5+ brokers

### Key Features

- ✅ Kafka 3.6+ with Zookeeper 3.8+
- ✅ StatefulSet deployment with persistent storage
- ✅ Pod anti-affinity for zone distribution
- ✅ Network policies for security isolation
- ✅ JMX metrics with Prometheus exporters
- ✅ Consumer lag monitoring
- ✅ Automated topic management
- ✅ ACL-based authorization
- ✅ Zero-downtime upgrades

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Kafka Cluster (kafka namespace)           │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐         │
│  │ Zookeeper-0 │  │ Zookeeper-1 │  │ Zookeeper-2 │         │
│  │   (Leader)  │  │  (Follower) │  │  (Follower) │         │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘         │
│         │                │                 │                 │
│         └────────────────┴─────────────────┘                 │
│                          │                                   │
│  ┌───────────────────────┴────────────────────────┐         │
│  │                                                  │         │
│  │  ┌─────────┐    ┌─────────┐    ┌─────────┐    │         │
│  │  │ Kafka-0 │    │ Kafka-1 │    │ Kafka-2 │    │         │
│  │  │ Broker  │◄───┤ Broker  │◄───┤ Broker  │    │         │
│  │  │ (500GB) │    │ (500GB) │    │ (500GB) │    │         │
│  │  └────┬────┘    └────┬────┘    └────┬────┘    │         │
│  │       │              │              │           │         │
│  └───────┼──────────────┼──────────────┼───────────┘         │
│          │              │              │                     │
│  ┌───────┴──────────────┴──────────────┴─────────┐         │
│  │         Topics (llm-events, llm-metrics, ...)  │         │
│  │         Partitions: 8-32 per topic             │         │
│  │         Replication Factor: 3                  │         │
│  └─────────────────────────────────────────────────┘         │
│                                                               │
│  ┌──────────────┐  ┌─────────────┐  ┌──────────────┐       │
│  │ Lag Exporter │  │ MirrorMaker │  │ Topic Operator│       │
│  │  (Metrics)   │  │  (Backup)   │  │   (Strimzi)  │       │
│  └──────────────┘  └─────────────┘  └──────────────┘       │
└─────────────────────────────────────────────────────────────┘
```

### Components

1. **Zookeeper Ensemble** (3 nodes)
   - Cluster coordination
   - Leader election
   - Configuration management
   - 100GB persistent storage per node

2. **Kafka Brokers** (3-5 nodes)
   - Message brokers
   - 500GB data + 100GB logs per broker
   - JVM heap: 8GB
   - JBOD storage configuration

3. **Topic Operator** (Strimzi)
   - Declarative topic management
   - Automatic topic creation/update
   - Configuration synchronization

4. **Lag Exporter**
   - Consumer group monitoring
   - Lag metrics for Prometheus
   - Real-time offset tracking

5. **MirrorMaker 2.0**
   - Cross-cluster replication
   - Disaster recovery
   - Geo-replication

## Prerequisites

### Required Tools

- Kubernetes 1.28+
- kubectl 1.28+
- Helm 3.10+ (optional, for Strimzi)
- cert-manager 1.13+ (for TLS)

### Storage Requirements

- **StorageClass**: `fast-ssd` (SSD-backed storage)
- **Total Storage**: ~2TB for 3-broker cluster
  - Zookeeper: 450GB (3 × 150GB)
  - Kafka: 1800GB (3 × 600GB)

### Resource Requirements

**Per Broker:**
- CPU: 2-4 cores
- Memory: 16GB RAM
- Storage: 600GB SSD

**Per Zookeeper Node:**
- CPU: 500m-1 core
- Memory: 4GB RAM
- Storage: 150GB SSD

**Total Cluster:**
- CPU: ~10 cores
- Memory: ~60GB RAM
- Storage: ~2TB SSD

### Network Requirements

- Internal communication: 9092 (SASL_SSL)
- External access: 9094 (LoadBalancer)
- JMX metrics: 9999
- Prometheus metrics: 7071
- Zookeeper: 2181, 2888, 3888

## Quick Start

### 1. Create Namespace and Secrets

```bash
# Create namespace
kubectl apply -f namespace.yaml

# Generate TLS certificates (requires cert-manager)
kubectl apply -f security/tls-certificates.yaml

# Wait for certificates
kubectl wait --for=condition=Ready certificate/kafka-broker-cert -n kafka --timeout=300s

# Update secrets with actual passwords
kubectl create secret generic kafka-secrets \
  -n kafka \
  --from-literal=admin-password='YOUR_ADMIN_PASSWORD' \
  --from-literal=user-password='YOUR_USER_PASSWORD' \
  --from-literal=zk-kafka-password='YOUR_ZK_PASSWORD' \
  --from-literal=ssl-keystore-password='YOUR_KEYSTORE_PASSWORD' \
  --from-literal=ssl-key-password='YOUR_KEY_PASSWORD' \
  --from-literal=ssl-truststore-password='YOUR_TRUSTSTORE_PASSWORD' \
  --dry-run=client -o yaml | kubectl apply -f -
```

### 2. Deploy Zookeeper

```bash
# Deploy Zookeeper ensemble
kubectl apply -f zookeeper/configmap.yaml
kubectl apply -f zookeeper/service.yaml
kubectl apply -f zookeeper/statefulset.yaml

# Wait for Zookeeper to be ready
kubectl wait --for=condition=Ready pod/zookeeper-0 -n kafka --timeout=300s
kubectl wait --for=condition=Ready pod/zookeeper-1 -n kafka --timeout=300s
kubectl wait --for=condition=Ready pod/zookeeper-2 -n kafka --timeout=300s

# Verify Zookeeper cluster
kubectl exec -n kafka zookeeper-0 -- zkServer.sh status
```

### 3. Deploy Kafka

```bash
# Deploy Kafka brokers
kubectl apply -f kafka/configmap.yaml
kubectl apply -f kafka/secrets.yaml
kubectl apply -f kafka/services.yaml
kubectl apply -f kafka/statefulset.yaml

# Wait for Kafka to be ready
kubectl wait --for=condition=Ready pod/kafka-0 -n kafka --timeout=600s
kubectl wait --for=condition=Ready pod/kafka-1 -n kafka --timeout=600s
kubectl wait --for=condition=Ready pod/kafka-2 -n kafka --timeout=600s

# Verify Kafka cluster
kubectl exec -n kafka kafka-0 -- kafka-broker-api-versions.sh --bootstrap-server localhost:9092
```

### 4. Create Topics

```bash
# Apply topic operator (Strimzi)
kubectl apply -f topics/topic-operator.yaml

# Or use init script
kubectl exec -n kafka kafka-0 -- bash /scripts/create-topics.sh

# Verify topics
kubectl exec -n kafka kafka-0 -- kafka-topics.sh --list --bootstrap-server localhost:9092
```

### 5. Setup Security

```bash
# Apply network policies
kubectl apply -f security/network-policy.yaml

# Create users and ACLs
kubectl exec -n kafka kafka-0 -- bash /scripts/setup-acls.sh

# Verify ACLs
kubectl exec -n kafka kafka-0 -- kafka-acls.sh --list --bootstrap-server localhost:9092
```

### 6. Deploy Monitoring

```bash
# Deploy JMX exporters and lag monitoring
kubectl apply -f monitoring/jmx-exporter.yaml
kubectl apply -f monitoring/servicemonitor.yaml

# Deploy alerting rules
kubectl apply -f monitoring/alerts.yaml

# Verify metrics
kubectl port-forward -n kafka svc/kafka-metrics 7071:7071
curl http://localhost:7071/metrics
```

## Deployment Options

### Option 1: Manual Deployment (Recommended for learning)

Deploy components individually as shown in Quick Start.

**Pros:**
- Full control over each component
- Easy to understand and customize
- Step-by-step troubleshooting

**Cons:**
- More manual steps
- Requires understanding of all components

### Option 2: Strimzi Operator (Recommended for production)

Use Strimzi Kafka operator for declarative management.

```bash
# Install Strimzi operator
helm repo add strimzi https://strimzi.io/charts/
helm repo update

# Install using custom values
helm install kafka-operator strimzi/strimzi-kafka-operator \
  -n kafka \
  -f helm-values.yaml

# Verify installation
kubectl get pods -n kafka -l name=strimzi-cluster-operator
```

**Pros:**
- Declarative configuration
- Automated upgrades
- Rolling updates
- Advanced features (Cruise Control, User/Topic operators)

**Cons:**
- Additional operator complexity
- Learning curve for Strimzi CRDs

### Option 3: Confluent for Kubernetes

Use Confluent operator for enterprise features.

```bash
# Install Confluent for Kubernetes
# See: https://docs.confluent.io/operator/current/overview.html
```

## Configuration

### Kafka Broker Configuration

Key configurations in `kafka/configmap.yaml`:

```properties
# Replication
default.replication.factor=3
min.insync.replicas=2

# Performance
num.network.threads=8
num.io.threads=16
compression.type=lz4

# Retention
log.retention.hours=168  # 7 days
log.retention.bytes=536870912000  # 500GB

# Message size
message.max.bytes=10485760  # 10MB

# High availability
unclean.leader.election.enable=false
auto.leader.rebalance.enable=true
```

### Topic Configuration

Default topic settings:

```yaml
partitions: 16-32
replicationFactor: 3
config:
  cleanup.policy: delete
  retention.ms: 604800000  # 7 days
  compression.type: lz4
  min.insync.replicas: 2
```

### JVM Configuration

Kafka JVM settings:

```bash
KAFKA_HEAP_OPTS="-Xmx8G -Xms8G"
KAFKA_JVM_PERFORMANCE_OPTS="-XX:+UseG1GC -XX:MaxGCPauseMillis=20 ..."
```

Zookeeper JVM settings:

```bash
JVMFLAGS="-Xmx3G -Xms3G -XX:+UseG1GC ..."
```

## Security

### TLS/SSL Encryption

All communication is encrypted using TLS:

```yaml
listeners:
  INTERNAL: SASL_SSL
  EXTERNAL: SASL_SSL
```

Generate certificates:

```bash
# Using cert-manager (recommended)
kubectl apply -f security/tls-certificates.yaml

# Or manually with openssl
openssl req -x509 -newkey rsa:4096 \
  -keyout tls.key \
  -out tls.crt \
  -days 365 \
  -nodes \
  -subj "/CN=kafka.kafka.svc.cluster.local"
```

### SASL/SCRAM Authentication

Create users:

```bash
# Admin user
kafka-configs.sh --zookeeper zookeeper:2181 \
  --alter \
  --add-config 'SCRAM-SHA-512=[password=ADMIN_PASSWORD]' \
  --entity-type users \
  --entity-name admin

# Application user
kafka-configs.sh --zookeeper zookeeper:2181 \
  --alter \
  --add-config 'SCRAM-SHA-512=[password=USER_PASSWORD]' \
  --entity-type users \
  --entity-name llm-analytics-producer
```

### Access Control Lists (ACLs)

Configure ACLs:

```bash
# Producer ACL
kafka-acls.sh --add \
  --bootstrap-server kafka:9092 \
  --allow-principal User:llm-analytics-producer \
  --operation WRITE \
  --topic llm-events

# Consumer ACL
kafka-acls.sh --add \
  --bootstrap-server kafka:9092 \
  --allow-principal User:llm-analytics-consumer \
  --operation READ \
  --topic llm-events \
  --group llm-analytics-group
```

### Network Policies

Restrict network access:

```bash
kubectl apply -f security/network-policy.yaml
```

## Monitoring

### Prometheus Metrics

Kafka exposes metrics via JMX exporter on port 7071:

```bash
# Port forward to access metrics
kubectl port-forward -n kafka svc/kafka-metrics 7071:7071
curl http://localhost:7071/metrics
```

### Key Metrics

**Broker Metrics:**
- `kafka_server_brokertopicmetrics_messagesinpersec`
- `kafka_server_brokertopicmetrics_bytesinpersec`
- `kafka_server_replicamanager_underreplicatedpartitions`
- `kafka_controller_kafkacontroller_activecontrollercount`

**Consumer Lag:**
- `kafka_consumergroup_group_max_lag`
- `kafka_consumergroup_group_sum_lag`

**JVM Metrics:**
- `java_lang_memory_heapmemoryusage_used`
- `java_lang_garbagecollector_collectiontime`

### Grafana Dashboards

Import dashboards from `monitoring/servicemonitor.yaml`:

1. Kafka Cluster Overview
2. Kafka Topics
3. Consumer Lag Monitoring
4. Zookeeper Cluster

### Alerting

AlertManager rules in `monitoring/alerts.yaml`:

- `KafkaNoActiveController`
- `KafkaBrokerDown`
- `KafkaOfflinePartitions`
- `KafkaUnderReplicatedPartitions`
- `KafkaConsumerLagHigh`
- `ZookeeperNoQuorum`

## Backup & Disaster Recovery

### Metadata Backup

Automated daily backup of topic configurations and ACLs:

```bash
# Apply backup CronJob
kubectl apply -f backup/backup-cronjob.yaml

# Manual backup
kubectl exec -n kafka kafka-0 -- bash /scripts/backup-metadata.sh

# List backups
kubectl exec -n kafka kafka-0 -- bash /scripts/list-backups.sh
```

### Topic Data Backup

#### Option 1: MirrorMaker 2.0

Replicate to backup cluster:

```bash
# Deploy MirrorMaker
kubectl apply -f backup/mirror-maker.yaml

# Verify replication
kubectl logs -n kafka -l app=mirror-maker
```

#### Option 2: S3 Sink Connector

Use Kafka Connect with S3 sink:

```bash
# Configure S3 backup
kubectl exec -n kafka kafka-0 -- bash /scripts/backup-topics-to-s3.sh
```

### Disaster Recovery Procedures

#### Scenario 1: Single Broker Failure

```bash
# Kafka automatically recovers (replication factor 3)
# Monitor under-replicated partitions
kubectl exec -n kafka kafka-0 -- kafka-topics.sh \
  --bootstrap-server localhost:9092 \
  --describe \
  --under-replicated-partitions
```

#### Scenario 2: Complete Cluster Loss

```bash
# 1. Restore Zookeeper from backup
# 2. Deploy new Kafka cluster
kubectl apply -f zookeeper/
kubectl apply -f kafka/

# 3. Restore metadata
BACKUP_FILE="kafka-metadata-20240101-120000.tar.gz"
kubectl exec -n kafka kafka-0 -- bash /scripts/restore-metadata.sh "$BACKUP_FILE"

# 4. Restore data from MirrorMaker or S3
# Use backup cluster or S3 sink data
```

## Operations

### Scaling Kafka Cluster

Scale from 3 to 5 brokers:

```bash
# Update replica count
kubectl patch statefulset kafka -n kafka -p '{"spec":{"replicas":5}}'

# Wait for new brokers
kubectl wait --for=condition=Ready pod/kafka-3 -n kafka --timeout=600s
kubectl wait --for=condition=Ready pod/kafka-4 -n kafka --timeout=600s

# Rebalance partitions (using Cruise Control or manual)
# This redistributes partitions across all brokers
```

### Rolling Upgrades

Zero-downtime Kafka upgrade:

```bash
# 1. Update image version in statefulset.yaml
# image: confluentinc/cp-kafka:7.6.0

# 2. Apply changes (rolling update)
kubectl apply -f kafka/statefulset.yaml

# 3. Monitor rollout
kubectl rollout status statefulset/kafka -n kafka

# 4. Verify each broker
for i in {0..2}; do
  kubectl exec -n kafka kafka-$i -- kafka-broker-api-versions.sh --bootstrap-server localhost:9092
done
```

### Performance Tuning

#### OS-Level Tuning

```bash
# Increase file descriptors
ulimit -n 100000

# Disable swap
swapoff -a

# Network buffer sizes
sysctl -w net.core.rmem_max=134217728
sysctl -w net.core.wmem_max=134217728
```

#### Kafka Producer Optimization

```properties
# Batching
batch.size=32768
linger.ms=10

# Compression
compression.type=lz4

# Acknowledgments
acks=all

# Retries
retries=2147483647
```

#### Kafka Consumer Optimization

```properties
# Fetch size
fetch.min.bytes=1024
fetch.max.wait.ms=500

# Max poll
max.poll.records=500
max.poll.interval.ms=300000

# Auto commit
enable.auto.commit=false
```

### Topic Management

#### Create Topic

```bash
kafka-topics.sh --create \
  --bootstrap-server kafka:9092 \
  --topic new-topic \
  --partitions 16 \
  --replication-factor 3 \
  --config retention.ms=604800000 \
  --config compression.type=lz4
```

#### Increase Partitions

```bash
kafka-topics.sh --alter \
  --bootstrap-server kafka:9092 \
  --topic llm-events \
  --partitions 64
```

#### Change Retention

```bash
kafka-configs.sh --alter \
  --bootstrap-server kafka:9092 \
  --entity-type topics \
  --entity-name llm-events \
  --add-config retention.ms=1209600000  # 14 days
```

### Consumer Group Management

#### List Consumer Groups

```bash
kafka-consumer-groups.sh \
  --bootstrap-server kafka:9092 \
  --list
```

#### Describe Group

```bash
kafka-consumer-groups.sh \
  --bootstrap-server kafka:9092 \
  --group llm-analytics-group \
  --describe
```

#### Reset Offsets

```bash
# To earliest
kafka-consumer-groups.sh \
  --bootstrap-server kafka:9092 \
  --group llm-analytics-group \
  --topic llm-events \
  --reset-offsets \
  --to-earliest \
  --execute

# To specific timestamp
kafka-consumer-groups.sh \
  --bootstrap-server kafka:9092 \
  --group llm-analytics-group \
  --topic llm-events \
  --reset-offsets \
  --to-datetime 2024-01-01T00:00:00.000 \
  --execute
```

## Troubleshooting

### Common Issues

#### 1. Broker Not Starting

```bash
# Check logs
kubectl logs -n kafka kafka-0

# Common causes:
# - Zookeeper not ready
# - Storage permission issues
# - Port conflicts
# - Invalid configuration
```

#### 2. Under-Replicated Partitions

```bash
# Identify under-replicated partitions
kafka-topics.sh --bootstrap-server kafka:9092 \
  --describe \
  --under-replicated-partitions

# Check broker status
kafka-broker-api-versions.sh --bootstrap-server kafka:9092

# Trigger rebalance
kafka-leader-election.sh --bootstrap-server kafka:9092 \
  --election-type preferred \
  --all-topic-partitions
```

#### 3. Consumer Lag

```bash
# Check consumer group lag
kafka-consumer-groups.sh \
  --bootstrap-server kafka:9092 \
  --group llm-analytics-group \
  --describe

# Solutions:
# - Scale consumer group
# - Increase consumer throughput
# - Optimize consumer logic
# - Increase partitions
```

#### 4. High Memory Usage

```bash
# Check JVM heap usage
kubectl exec -n kafka kafka-0 -- jstat -gc 1

# Adjust heap size in statefulset.yaml
KAFKA_HEAP_OPTS="-Xmx8G -Xms8G"

# Force GC
kubectl exec -n kafka kafka-0 -- jcmd 1 GC.run
```

#### 5. Network Issues

```bash
# Test connectivity
kubectl exec -n kafka kafka-0 -- nc -zv kafka-1.kafka-headless.kafka.svc.cluster.local 9092

# Check network policies
kubectl get networkpolicy -n kafka

# Verify DNS
kubectl exec -n kafka kafka-0 -- nslookup kafka-headless.kafka.svc.cluster.local
```

### Debug Commands

```bash
# Get cluster metadata
kubectl exec -n kafka kafka-0 -- kafka-metadata.sh \
  --bootstrap-server localhost:9092 \
  --describe

# Check broker logs
kubectl logs -n kafka kafka-0 --tail=100 -f

# Describe topic
kubectl exec -n kafka kafka-0 -- kafka-topics.sh \
  --bootstrap-server localhost:9092 \
  --describe \
  --topic llm-events

# Test produce/consume
kubectl exec -n kafka kafka-0 -- kafka-console-producer.sh \
  --bootstrap-server localhost:9092 \
  --topic test

kubectl exec -n kafka kafka-0 -- kafka-console-consumer.sh \
  --bootstrap-server localhost:9092 \
  --topic test \
  --from-beginning
```

## Performance Tuning

### Expected Performance

- **Throughput**: 100,000+ messages/sec
- **Latency**: <50ms p99
- **Availability**: 99.9%+
- **Storage**: 500GB per broker

### Optimization Checklist

- [ ] Enable compression (lz4)
- [ ] Tune batch size (32KB)
- [ ] Optimize linger.ms (10ms)
- [ ] Use JBOD storage
- [ ] Enable rack awareness
- [ ] Configure proper replication factor
- [ ] Set min.insync.replicas=2
- [ ] Tune JVM heap (8GB)
- [ ] Use G1GC collector
- [ ] Increase file descriptors
- [ ] Optimize network buffers
- [ ] Use SSD storage
- [ ] Monitor consumer lag
- [ ] Regular partition rebalancing

## Support

For issues and questions:

- **Documentation**: This README
- **Logs**: `kubectl logs -n kafka <pod-name>`
- **Metrics**: Prometheus/Grafana dashboards
- **Kafka Docs**: https://kafka.apache.org/documentation/
- **Strimzi Docs**: https://strimzi.io/docs/

## License

See project LICENSE file.

---

**Last Updated**: 2024-01-20
**Kafka Version**: 3.6.1
**Zookeeper Version**: 3.8.3
**Kubernetes**: 1.28+
