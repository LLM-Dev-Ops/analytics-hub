# Redis Cluster for LLM Analytics Hub

Production-ready Redis Cluster deployment with high availability, persistence, and comprehensive monitoring.

## Architecture

### Cluster Configuration
- **6-node cluster** (3 masters + 3 replicas)
- **Automatic sharding** across 3 masters
- **16,384 hash slots** distributed evenly
- **Each master** has 1 replica for high availability
- **Redis Sentinel** (3 instances) for monitoring and failover
- **Pod anti-affinity** ensures distribution across nodes and zones

### Key Features
- ✅ **High Availability**: Automatic failover with Sentinel
- ✅ **Data Persistence**: AOF + RDB snapshots
- ✅ **Performance**: 100k+ ops/sec capability
- ✅ **Monitoring**: Prometheus metrics + Grafana dashboards
- ✅ **Security**: Authentication, network policies, TLS support
- ✅ **Backups**: Automated daily backups to S3
- ✅ **Resource Optimization**: 2 CPU, 8GB RAM per node

## Quick Start

### Prerequisites

1. **Kubernetes cluster** (1.28+)
2. **kubectl** configured
3. **Storage class** named `fast-ssd` (or modify in manifests)
4. **Prometheus Operator** (for monitoring)
5. **AWS credentials** (for backups - optional)

### Installation

#### Step 1: Create Namespace and Secrets

```bash
# Create namespace
kubectl apply -f namespace.yaml

# Generate strong Redis password
REDIS_PASSWORD=$(openssl rand -base64 32)

# Create password secret
kubectl create secret generic redis-auth \
  --from-literal=password="$REDIS_PASSWORD" \
  --namespace=redis-system

# Save password securely
echo "Redis Password: $REDIS_PASSWORD" >> redis-credentials.txt
chmod 600 redis-credentials.txt

# Configure S3 backup credentials (optional)
kubectl create secret generic redis-backup-s3 \
  --from-literal=AWS_ACCESS_KEY_ID="YOUR_ACCESS_KEY" \
  --from-literal=AWS_SECRET_ACCESS_KEY="YOUR_SECRET_KEY" \
  --from-literal=AWS_DEFAULT_REGION="us-east-1" \
  --from-literal=S3_BUCKET="llm-analytics-redis-backups" \
  --from-literal=S3_PREFIX="redis-cluster/" \
  --namespace=redis-system
```

#### Step 2: Deploy Configuration

```bash
# Apply ConfigMaps
kubectl apply -f configmap.yaml

# Apply Services
kubectl apply -f services.yaml

# Apply StatefulSet
kubectl apply -f statefulset.yaml

# Apply Sentinel
kubectl apply -f sentinel-statefulset.yaml
kubectl apply -f sentinel-service.yaml

# Apply Network Policies
kubectl apply -f network-policy.yaml

# Apply Monitoring
kubectl apply -f monitoring.yaml

# Apply Backup CronJobs
kubectl apply -f backup-cronjob.yaml
```

#### Step 3: Wait for Pods to be Ready

```bash
# Watch pod status
kubectl get pods -n redis-system -w

# Wait for all pods to be Running
kubectl wait --for=condition=Ready pod -l app.kubernetes.io/name=redis \
  -n redis-system --timeout=300s
```

#### Step 4: Initialize Cluster

```bash
# Run cluster initialization script
./init-cluster.sh

# Or manually create cluster
kubectl exec -n redis-system redis-cluster-0 -- redis-cli \
  --cluster create \
  $(kubectl get pods -n redis-system -l app.kubernetes.io/name=redis -o jsonpath='{range.items[*]}{.status.podIP}:6379 {end}') \
  --cluster-replicas 1 \
  --cluster-yes \
  -a "$REDIS_PASSWORD"
```

#### Step 5: Verify Cluster

```bash
# Check cluster info
kubectl exec -n redis-system redis-cluster-0 -- redis-cli \
  -a "$REDIS_PASSWORD" cluster info

# Check cluster nodes
kubectl exec -n redis-system redis-cluster-0 -- redis-cli \
  -a "$REDIS_PASSWORD" cluster nodes

# Test cluster
kubectl exec -n redis-system redis-cluster-0 -- redis-cli \
  -a "$REDIS_PASSWORD" -c set test "Hello Redis"

kubectl exec -n redis-system redis-cluster-1 -- redis-cli \
  -a "$REDIS_PASSWORD" -c get test
```

## Alternative: Helm Installation

For a simpler deployment using Helm:

```bash
# Add Bitnami repository
helm repo add bitnami https://charts.bitnami.com/bitnami
helm repo update

# Install Redis Cluster
helm install redis bitnami/redis-cluster \
  -f helm-values.yaml \
  --namespace redis-system \
  --create-namespace

# Wait for deployment
kubectl wait --for=condition=Ready pod -l app.kubernetes.io/name=redis-cluster \
  -n redis-system --timeout=600s
```

## Configuration

### Resource Allocation

Per Redis pod:
- **CPU Request**: 2 cores
- **CPU Limit**: 4 cores
- **Memory Request**: 8 GB
- **Memory Limit**: 16 GB
- **Storage**: 100 GB SSD

Total cluster resources:
- **Total CPU**: 12 cores (requests), 24 cores (limits)
- **Total Memory**: 48 GB (requests), 96 GB (limits)
- **Total Storage**: 600 GB

### Performance Tuning

The cluster is configured for high performance:

- **Memory Policy**: `allkeys-lru` (evict least recently used)
- **Max Memory**: 6 GB per node
- **IO Threads**: 4 threads per node
- **AOF**: `appendfsync everysec` (1 second sync)
- **RDB**: Save on 900s/1 change, 300s/10 changes, 60s/10000 changes
- **Lazy Freeing**: Enabled for better performance
- **TCP Backlog**: 65535

### Security

#### Authentication
- Redis AUTH password required for all connections
- Stored in Kubernetes Secret: `redis-auth`

#### TLS/SSL (Optional)
To enable TLS encryption:

1. Generate certificates or use cert-manager
2. Update the `redis-tls` secret with your certificates
3. Uncomment TLS configuration in `configmap.yaml`
4. Restart the Redis pods

#### Network Policies
- Only allows connections from authorized namespaces
- Blocks all other traffic by default
- Allows cluster communication between nodes

### Persistence

#### AOF (Append-Only File)
- **Mode**: `appendfsync everysec`
- **Auto Rewrite**: When AOF grows 100% and minimum 64MB
- **Location**: `/data/appendonlydir/`

#### RDB (Snapshots)
- **Schedule**:
  - Every 15 minutes if 1+ keys changed
  - Every 5 minutes if 10+ keys changed
  - Every 60 seconds if 10,000+ keys changed
- **Location**: `/data/dump.rdb`
- **Compression**: Enabled

### Backups

#### Automated Backups
- **Hourly**: RDB snapshots (keeps last 3)
- **Daily**: Full backup at 2 AM (keeps last 7 days)
- **Storage**: Local + S3 (if configured)

#### Manual Backup

```bash
# Trigger manual backup
kubectl create job --from=cronjob/redis-backup-daily redis-backup-manual \
  -n redis-system

# Check backup status
kubectl get jobs -n redis-system

# View backup logs
kubectl logs -n redis-system job/redis-backup-manual
```

#### Restore from Backup

```bash
# Download backup from S3
aws s3 cp s3://llm-analytics-redis-backups/redis-cluster/redis-backup-TIMESTAMP.rdb ./

# Scale down StatefulSet
kubectl scale statefulset redis-cluster -n redis-system --replicas=0

# Copy backup to PVC
kubectl run -n redis-system restore-helper --image=redis:7.2-alpine --rm -it -- sh
# (inside pod) copy dump.rdb to /data/

# Scale up StatefulSet
kubectl scale statefulset redis-cluster -n redis-system --replicas=6

# Reinitialize cluster
./init-cluster.sh
```

## Monitoring

### Prometheus Metrics

The deployment includes Redis exporters that expose metrics on port 9121:

- Cluster health and state
- Memory usage and fragmentation
- Connection counts
- Command statistics
- Replication lag
- Key eviction rates
- Hit/miss rates

### Grafana Dashboard

Import the provided dashboard from `monitoring.yaml`:

```bash
kubectl apply -f monitoring.yaml
```

Dashboard shows:
- Cluster health status
- Memory usage per node
- Commands per second
- Cache hit rate
- Network I/O
- Replication lag

### Alerts

Pre-configured Prometheus alerts:
- **Critical**: Cluster down, state not OK, no replicas
- **Warning**: High memory usage, key eviction, replication lag
- **Info**: Slow queries, connection issues

View alerts:
```bash
kubectl get prometheusrules -n redis-system
```

## Operations

### Scaling

#### Horizontal Scaling (Add Nodes)

```bash
# Scale StatefulSet
kubectl scale statefulset redis-cluster -n redis-system --replicas=9

# Wait for new pods
kubectl wait --for=condition=Ready pod redis-cluster-6 redis-cluster-7 redis-cluster-8 \
  -n redis-system --timeout=300s

# Add nodes to cluster
kubectl exec -n redis-system redis-cluster-0 -- redis-cli \
  --cluster add-node NEW_NODE_IP:6379 EXISTING_NODE_IP:6379 \
  -a "$REDIS_PASSWORD"

# Rebalance cluster
kubectl exec -n redis-system redis-cluster-0 -- redis-cli \
  --cluster rebalance CLUSTER_IP:6379 \
  -a "$REDIS_PASSWORD"
```

#### Vertical Scaling (Increase Resources)

```bash
# Edit StatefulSet
kubectl edit statefulset redis-cluster -n redis-system

# Update resources section:
# resources:
#   requests:
#     cpu: "4"
#     memory: 16Gi
#   limits:
#     cpu: "8"
#     memory: 32Gi

# Rolling restart will occur automatically
```

### Failover Testing

```bash
# Simulate node failure
kubectl delete pod redis-cluster-0 -n redis-system

# Watch Sentinel detect failure and promote replica
kubectl logs -n redis-system -l app.kubernetes.io/name=redis-sentinel -f

# Verify cluster recovered
kubectl exec -n redis-system redis-cluster-1 -- redis-cli \
  -a "$REDIS_PASSWORD" cluster info
```

### Maintenance

#### Upgrade Redis Version

```bash
# Edit StatefulSet
kubectl edit statefulset redis-cluster -n redis-system

# Update image version
# image: redis:7.4-alpine

# Rolling update will occur
kubectl rollout status statefulset redis-cluster -n redis-system
```

#### Flush All Data (Dangerous!)

```bash
# Flush all databases in cluster
kubectl exec -n redis-system redis-cluster-0 -- redis-cli \
  -a "$REDIS_PASSWORD" --cluster call \
  $(kubectl get pods -n redis-system -l app.kubernetes.io/name=redis -o jsonpath='{range.items[*]}{.status.podIP}:6379 {end}') \
  FLUSHALL
```

## Troubleshooting

### Check Cluster Health

```bash
# Overall cluster status
kubectl get all -n redis-system

# Pod status
kubectl get pods -n redis-system -o wide

# Cluster info from each node
for i in {0..5}; do
  echo "=== redis-cluster-$i ==="
  kubectl exec -n redis-system redis-cluster-$i -- redis-cli \
    -a "$REDIS_PASSWORD" cluster info
done
```

### Common Issues

#### Pods Not Starting

```bash
# Check events
kubectl get events -n redis-system --sort-by='.lastTimestamp'

# Check pod logs
kubectl logs -n redis-system redis-cluster-0

# Check init container logs
kubectl logs -n redis-system redis-cluster-0 -c system-init
kubectl logs -n redis-system redis-cluster-0 -c config-init
```

#### Cluster Creation Failed

```bash
# Check if nodes can communicate
kubectl exec -n redis-system redis-cluster-0 -- redis-cli \
  -a "$REDIS_PASSWORD" ping

# Check cluster bus port (16379)
kubectl exec -n redis-system redis-cluster-0 -- nc -zv redis-cluster-1.redis-cluster 16379

# Manually reset and recreate
kubectl exec -n redis-system redis-cluster-0 -- redis-cli \
  -a "$REDIS_PASSWORD" CLUSTER RESET HARD
```

#### High Memory Usage

```bash
# Check memory stats
kubectl exec -n redis-system redis-cluster-0 -- redis-cli \
  -a "$REDIS_PASSWORD" INFO memory

# Check key count
kubectl exec -n redis-system redis-cluster-0 -- redis-cli \
  -a "$REDIS_PASSWORD" --cluster call \
  $(kubectl get pods -n redis-system -l app.kubernetes.io/name=redis -o jsonpath='{range.items[*]}{.status.podIP}:6379 {end}') \
  DBSIZE

# Check largest keys
kubectl exec -n redis-system redis-cluster-0 -- redis-cli \
  -a "$REDIS_PASSWORD" --bigkeys
```

#### Replication Lag

```bash
# Check replication info
kubectl exec -n redis-system redis-cluster-0 -- redis-cli \
  -a "$REDIS_PASSWORD" INFO replication

# Check master-replica offset difference
kubectl exec -n redis-system redis-cluster-0 -- redis-cli \
  -a "$REDIS_PASSWORD" INFO replication | grep offset
```

### Performance Issues

```bash
# Check slow log
kubectl exec -n redis-system redis-cluster-0 -- redis-cli \
  -a "$REDIS_PASSWORD" SLOWLOG GET 10

# Monitor commands in real-time
kubectl exec -n redis-system redis-cluster-0 -- redis-cli \
  -a "$REDIS_PASSWORD" MONITOR

# Check latency
kubectl exec -n redis-system redis-cluster-0 -- redis-cli \
  -a "$REDIS_PASSWORD" --latency

# Check command statistics
kubectl exec -n redis-system redis-cluster-0 -- redis-cli \
  -a "$REDIS_PASSWORD" INFO commandstats
```

## Connection Information

### From Applications

#### Connection String
```
redis://:PASSWORD@redis.redis-system.svc.cluster.local:6379
```

#### Environment Variables
```bash
REDIS_HOST=redis.redis-system.svc.cluster.local
REDIS_PORT=6379
REDIS_PASSWORD=<from secret>
REDIS_CLUSTER_MODE=true
```

#### Example: Python (redis-py-cluster)

```python
from rediscluster import RedisCluster

startup_nodes = [
    {"host": "redis-cluster-0.redis-cluster.redis-system.svc.cluster.local", "port": 6379},
    {"host": "redis-cluster-1.redis-cluster.redis-system.svc.cluster.local", "port": 6379},
    {"host": "redis-cluster-2.redis-cluster.redis-system.svc.cluster.local", "port": 6379},
]

rc = RedisCluster(
    startup_nodes=startup_nodes,
    password="YOUR_PASSWORD",
    decode_responses=True,
    skip_full_coverage_check=True
)

# Use cluster
rc.set("key", "value")
value = rc.get("key")
```

#### Example: Node.js (ioredis)

```javascript
const Redis = require('ioredis');

const cluster = new Redis.Cluster([
  {
    host: 'redis-cluster-0.redis-cluster.redis-system.svc.cluster.local',
    port: 6379
  },
  {
    host: 'redis-cluster-1.redis-cluster.redis-system.svc.cluster.local',
    port: 6379
  },
  {
    host: 'redis-cluster-2.redis-cluster.redis-system.svc.cluster.local',
    port: 6379
  }
], {
  redisOptions: {
    password: 'YOUR_PASSWORD'
  }
});

// Use cluster
await cluster.set('key', 'value');
const value = await cluster.get('key');
```

## Best Practices

### Performance
1. Use pipelining for bulk operations
2. Avoid KEYS command in production (use SCAN)
3. Set appropriate TTLs to prevent memory bloat
4. Use connection pooling in applications
5. Monitor hit/miss ratios and adjust caching strategy

### Security
1. Always use strong passwords
2. Enable TLS for production
3. Regularly rotate credentials
4. Limit network access with NetworkPolicies
5. Run as non-root user

### Reliability
1. Monitor backup jobs regularly
2. Test restore procedures periodically
3. Set up alerts for critical metrics
4. Perform regular failover tests
5. Keep Redis version up to date

### Operations
1. Document any manual changes
2. Use GitOps for configuration management
3. Maintain runbooks for common issues
4. Regular capacity planning
5. Performance baseline testing

## Disaster Recovery

### Recovery Scenarios

#### Complete Cluster Loss

1. Restore from S3 backup
2. Create new PVCs if needed
3. Deploy Redis cluster
4. Initialize cluster with restored data

#### Data Corruption

1. Identify affected nodes
2. Stop writes to cluster
3. Restore from last known good backup
4. Verify data integrity
5. Resume operations

#### Split Brain

1. Identify partition
2. Check Sentinel logs
3. Manually promote correct master if needed
4. Reset affected replicas
5. Rejoin to cluster

## Support and Resources

### Documentation
- [Redis Cluster Specification](https://redis.io/topics/cluster-spec)
- [Redis Best Practices](https://redis.io/topics/best-practices)
- [Kubernetes StatefulSets](https://kubernetes.io/docs/concepts/workloads/controllers/statefulset/)

### Monitoring
- Grafana dashboards: `/monitoring/grafana`
- Prometheus metrics: `http://redis.redis-system:9121/metrics`
- Sentinel metrics: `http://redis-sentinel-announce.redis-system:9355/metrics`

### Logs
```bash
# Redis logs
kubectl logs -n redis-system -l app.kubernetes.io/name=redis -f

# Sentinel logs
kubectl logs -n redis-system -l app.kubernetes.io/name=redis-sentinel -f

# Backup logs
kubectl logs -n redis-system -l app.kubernetes.io/component=backup
```

## License

This configuration is part of the LLM Analytics Hub project.

## Changelog

### Version 1.0.0
- Initial Redis Cluster deployment
- 6-node cluster with automatic sharding
- Redis Sentinel for HA
- Prometheus monitoring
- Automated backups
- Network policies
- Production-ready configuration
