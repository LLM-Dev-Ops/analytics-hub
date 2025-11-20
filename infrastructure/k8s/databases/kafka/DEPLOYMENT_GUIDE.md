# Kafka Deployment Guide - LLM Analytics Hub

Quick reference guide for deploying and managing the Kafka cluster.

## Prerequisites Checklist

- [ ] Kubernetes 1.28+ cluster running
- [ ] kubectl configured and connected
- [ ] StorageClass `fast-ssd` available (or update manifests)
- [ ] cert-manager installed (optional but recommended)
- [ ] Prometheus operator installed (optional for monitoring)
- [ ] Minimum 10 CPU cores and 60GB RAM available
- [ ] ~2TB SSD storage available

## Quick Deployment (5 minutes)

### Automated Deployment

```bash
cd /workspaces/llm-analytics-hub/infrastructure/k8s/databases/kafka
./deploy.sh
```

The script will guide you through:
1. Prerequisites check
2. Namespace creation
3. Secrets setup
4. TLS certificates
5. Zookeeper deployment
6. Kafka deployment
7. Topics creation
8. Monitoring setup
9. Security policies
10. Backup configuration

### Manual Deployment

If you prefer step-by-step control:

```bash
# 1. Create namespace
kubectl apply -f namespace.yaml

# 2. Create secrets (update with real passwords first!)
kubectl create secret generic kafka-secrets \
  -n kafka \
  --from-literal=admin-password='CHANGE_ME' \
  --from-literal=user-password='CHANGE_ME' \
  --from-literal=zk-kafka-password='CHANGE_ME' \
  --from-literal=ssl-keystore-password='CHANGE_ME' \
  --from-literal=ssl-key-password='CHANGE_ME' \
  --from-literal=ssl-truststore-password='CHANGE_ME'

# 3. Deploy TLS certificates (requires cert-manager)
kubectl apply -f security/tls-certificates.yaml
kubectl wait --for=condition=Ready certificate/kafka-broker-cert -n kafka --timeout=300s

# 4. Deploy Zookeeper
kubectl apply -f zookeeper/
kubectl wait --for=condition=Ready pod/zookeeper-0 -n kafka --timeout=300s
kubectl wait --for=condition=Ready pod/zookeeper-1 -n kafka --timeout=300s
kubectl wait --for=condition=Ready pod/zookeeper-2 -n kafka --timeout=300s

# 5. Deploy Kafka
kubectl apply -f kafka/
kubectl wait --for=condition=Ready pod/kafka-0 -n kafka --timeout=600s
kubectl wait --for=condition=Ready pod/kafka-1 -n kafka --timeout=600s
kubectl wait --for=condition=Ready pod/kafka-2 -n kafka --timeout=600s

# 6. Create topics
kubectl exec -n kafka kafka-0 -- bash < init-scripts/create-topics.sh

# 7. Setup ACLs
kubectl exec -n kafka kafka-0 -- bash < init-scripts/setup-acls.sh

# 8. Deploy monitoring
kubectl apply -f monitoring/

# 9. Deploy security
kubectl apply -f security/network-policy.yaml

# 10. Verify deployment
kubectl exec -n kafka kafka-0 -- bash < init-scripts/verify-cluster.sh
```

## Deployment Options

### Option A: Vanilla Kafka (Current Setup)

**Best for**: Learning, full control, customization

```bash
./deploy.sh
```

### Option B: Strimzi Operator

**Best for**: Production, declarative management, enterprise features

```bash
# Install Strimzi operator
helm repo add strimzi https://strimzi.io/charts/
helm repo update
helm install kafka-operator strimzi/strimzi-kafka-operator -n kafka -f helm-values.yaml

# Deploy Kafka cluster
kubectl apply -f - <<EOF
apiVersion: kafka.strimzi.io/v1beta2
kind: Kafka
metadata:
  name: kafka
  namespace: kafka
spec:
  kafka:
    version: 3.6.1
    replicas: 3
    # ... see helm-values.yaml for full config
EOF
```

### Option C: Confluent for Kubernetes

**Best for**: Enterprise features, Confluent Platform components

```bash
# Follow Confluent documentation
# https://docs.confluent.io/operator/current/overview.html
```

## Post-Deployment Verification

### 1. Check Pod Status

```bash
kubectl get pods -n kafka
```

Expected output:
```
NAME          READY   STATUS    RESTARTS   AGE
zookeeper-0   1/1     Running   0          5m
zookeeper-1   1/1     Running   0          5m
zookeeper-2   1/1     Running   0          5m
kafka-0       1/1     Running   0          3m
kafka-1       1/1     Running   0          3m
kafka-2       1/1     Running   0          3m
```

### 2. Verify Kafka Cluster

```bash
kubectl exec -n kafka kafka-0 -- kafka-broker-api-versions.sh --bootstrap-server localhost:9092
```

### 3. List Topics

```bash
kubectl exec -n kafka kafka-0 -- kafka-topics.sh --list --bootstrap-server localhost:9092
```

Expected LLM Analytics topics:
- llm-events
- llm-metrics
- llm-analytics
- llm-traces
- llm-errors
- llm-audit
- llm-aggregated-metrics
- llm-alerts
- llm-usage-stats
- llm-model-performance
- llm-cost-tracking
- llm-user-feedback
- llm-session-events
- llm-deadletter

### 4. Run Verification Script

```bash
kubectl exec -n kafka kafka-0 -- bash < init-scripts/verify-cluster.sh
```

### 5. Check Metrics

```bash
kubectl port-forward -n kafka svc/kafka-metrics 7071:7071
curl http://localhost:7071/metrics | grep kafka_server
```

## Configuration Customization

### Before Deployment

Update these files based on your requirements:

1. **Storage Configuration** (`kafka/statefulset.yaml`, `zookeeper/statefulset.yaml`)
   ```yaml
   storageClassName: fast-ssd  # Change to your storage class
   storage: 500Gi              # Adjust size
   ```

2. **Resource Limits** (`kafka/statefulset.yaml`)
   ```yaml
   resources:
     requests:
       cpu: "2"        # Adjust based on workload
       memory: 16Gi    # Adjust based on workload
   ```

3. **Replication Factor** (`kafka/configmap.yaml`)
   ```properties
   default.replication.factor=3    # Change if needed
   min.insync.replicas=2           # Change if needed
   ```

4. **Retention** (`kafka/configmap.yaml`)
   ```properties
   log.retention.hours=168         # 7 days (adjust as needed)
   log.retention.bytes=536870912000  # 500GB (adjust as needed)
   ```

5. **JVM Heap** (`kafka/statefulset.yaml`)
   ```yaml
   env:
   - name: KAFKA_HEAP_OPTS
     value: "-Xmx8G -Xms8G"  # Adjust based on available memory
   ```

### After Deployment

Update configurations dynamically:

```bash
# Update topic retention
kafka-configs.sh --alter \
  --bootstrap-server kafka:9092 \
  --entity-type topics \
  --entity-name llm-events \
  --add-config retention.ms=1209600000  # 14 days

# Update broker configuration
kubectl edit configmap kafka-config -n kafka
kubectl rollout restart statefulset kafka -n kafka
```

## Common Operations

### Scale Cluster

```bash
# Scale to 5 brokers
kubectl scale statefulset kafka -n kafka --replicas=5

# Verify
kubectl get pods -n kafka -l app=kafka
```

### Rolling Restart

```bash
kubectl rollout restart statefulset kafka -n kafka
kubectl rollout status statefulset kafka -n kafka
```

### Upgrade Kafka Version

```bash
# 1. Update image in kafka/statefulset.yaml
# image: confluentinc/cp-kafka:7.6.0

# 2. Apply changes
kubectl apply -f kafka/statefulset.yaml

# 3. Monitor rollout
kubectl rollout status statefulset kafka -n kafka
```

### Backup Now

```bash
# Trigger manual backup
kubectl create job --from=cronjob/kafka-metadata-backup kafka-backup-manual -n kafka
```

### Performance Test

```bash
kubectl exec -n kafka kafka-0 -- bash < init-scripts/performance-test.sh
```

## Troubleshooting Quick Reference

### Pods Not Starting

```bash
# Check events
kubectl describe pod kafka-0 -n kafka

# Check logs
kubectl logs kafka-0 -n kafka --tail=100

# Common issues:
# - Storage not available: Check PVC status
# - Zookeeper not ready: Wait for Zookeeper
# - Resource limits: Check node capacity
```

### Under-Replicated Partitions

```bash
# Check status
kubectl exec -n kafka kafka-0 -- kafka-topics.sh \
  --bootstrap-server localhost:9092 \
  --describe \
  --under-replicated-partitions

# Trigger rebalance
kubectl exec -n kafka kafka-0 -- kafka-leader-election.sh \
  --bootstrap-server localhost:9092 \
  --election-type preferred \
  --all-topic-partitions
```

### High Consumer Lag

```bash
# Check lag
kubectl exec -n kafka kafka-0 -- kafka-consumer-groups.sh \
  --bootstrap-server localhost:9092 \
  --describe \
  --group llm-analytics-group

# Solutions:
# 1. Scale consumers
# 2. Increase partitions
# 3. Optimize consumer code
```

### Connection Issues

```bash
# Test from inside cluster
kubectl run -it --rm kafka-test --image=confluentinc/cp-kafka:7.5.3 --restart=Never -- bash
kafka-console-producer.sh --bootstrap-server kafka:9092 --topic test

# Test from outside (if LoadBalancer enabled)
kubectl get svc kafka-external -n kafka
```

## Security Checklist

- [ ] Change all default passwords in secrets
- [ ] Generate proper TLS certificates (not self-signed for production)
- [ ] Enable SASL/SCRAM authentication
- [ ] Configure ACLs for all users
- [ ] Apply network policies
- [ ] Enable audit logging
- [ ] Restrict external access
- [ ] Use non-root containers
- [ ] Enable pod security policies

## Monitoring Checklist

- [ ] Prometheus scraping Kafka metrics
- [ ] Grafana dashboards imported
- [ ] AlertManager rules configured
- [ ] Consumer lag monitoring active
- [ ] JMX metrics exposed
- [ ] Log aggregation configured
- [ ] Dashboards accessible

## Backup Checklist

- [ ] Automated metadata backups enabled (CronJob)
- [ ] MirrorMaker configured for replication
- [ ] S3 backup configured (if applicable)
- [ ] Backup verification scheduled
- [ ] Disaster recovery procedure documented
- [ ] Restoration tested

## Production Readiness Checklist

- [ ] 3+ broker deployment
- [ ] Replication factor 3
- [ ] min.insync.replicas = 2
- [ ] Pod anti-affinity configured
- [ ] Resource limits set
- [ ] Persistent storage configured
- [ ] TLS encryption enabled
- [ ] Authentication enabled
- [ ] ACLs configured
- [ ] Network policies applied
- [ ] Monitoring deployed
- [ ] Alerting configured
- [ ] Backup automated
- [ ] Disaster recovery tested
- [ ] Documentation complete
- [ ] Runbook created

## Getting Help

1. **Check README.md** for detailed documentation
2. **Review logs**: `kubectl logs -n kafka <pod-name>`
3. **Run verification**: `kubectl exec -n kafka kafka-0 -- bash < init-scripts/verify-cluster.sh`
4. **Check metrics**: `kubectl port-forward -n kafka svc/kafka-metrics 7071:7071`
5. **Kafka documentation**: https://kafka.apache.org/documentation/
6. **Strimzi documentation**: https://strimzi.io/docs/

## Next Steps

After successful deployment:

1. **Integrate with Applications**
   - Update application configs with Kafka bootstrap servers
   - Configure producers and consumers
   - Test end-to-end flow

2. **Setup Monitoring**
   - Access Grafana dashboards
   - Configure alerts
   - Test alert notifications

3. **Performance Testing**
   - Run performance tests
   - Tune based on results
   - Validate throughput requirements

4. **Disaster Recovery**
   - Test backup and restore
   - Document procedures
   - Train team on DR

5. **Optimize**
   - Monitor performance metrics
   - Tune JVM settings
   - Adjust retention policies
   - Scale as needed

---

**Deployment Version**: 1.0.0
**Last Updated**: 2024-01-20
**Kafka Version**: 3.6.1
**Author**: LLM Analytics Platform Team
