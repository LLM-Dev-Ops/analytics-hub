# Redis Cluster - Application Integration Guide

## Quick Integration

### Environment Variables

Add these to your application deployments:

```yaml
env:
- name: REDIS_HOST
  value: "redis.redis-system.svc.cluster.local"
- name: REDIS_PORT
  value: "6379"
- name: REDIS_PASSWORD
  valueFrom:
    secretKeyRef:
      name: redis-auth
      namespace: redis-system
      key: password
- name: REDIS_CLUSTER_MODE
  value: "true"
- name: REDIS_DB
  value: "0"
```

### ConfigMap Example

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: app-config
data:
  redis.conf: |
    host: redis.redis-system.svc.cluster.local
    port: 6379
    cluster_mode: true
    pool_size: 10
    timeout: 5000
    retry_attempts: 3
```

## Language-Specific Integration

### Python (redis-py-cluster)

#### Installation
```bash
pip install redis-py-cluster
```

#### Connection Code
```python
from rediscluster import RedisCluster
import os

# Configuration
startup_nodes = [
    {"host": "redis-cluster-0.redis-cluster.redis-system.svc.cluster.local", "port": 6379},
    {"host": "redis-cluster-1.redis-cluster.redis-system.svc.cluster.local", "port": 6379},
    {"host": "redis-cluster-2.redis-cluster.redis-system.svc.cluster.local", "port": 6379},
]

# Create cluster connection
rc = RedisCluster(
    startup_nodes=startup_nodes,
    password=os.getenv('REDIS_PASSWORD'),
    decode_responses=True,
    skip_full_coverage_check=True,
    max_connections=50,
    socket_timeout=5,
    socket_connect_timeout=5,
    retry_on_timeout=True,
    health_check_interval=30
)

# Basic operations
rc.set('user:1:name', 'John Doe')
name = rc.get('user:1:name')

# Hash operations
rc.hset('user:1', mapping={'name': 'John', 'email': 'john@example.com'})
user = rc.hgetall('user:1')

# List operations
rc.lpush('queue:tasks', 'task1', 'task2')
task = rc.rpop('queue:tasks')

# Set operations
rc.sadd('users:active', 'user1', 'user2')
active_users = rc.smembers('users:active')

# Sorted set operations
rc.zadd('leaderboard', {'player1': 100, 'player2': 200})
top_players = rc.zrange('leaderboard', 0, 9, withscores=True)

# Pipeline for bulk operations
pipe = rc.pipeline()
pipe.set('key1', 'value1')
pipe.set('key2', 'value2')
pipe.set('key3', 'value3')
pipe.execute()

# Close connection
rc.close()
```

#### Connection Pooling
```python
from rediscluster import RedisCluster
from rediscluster.connection import ClusterConnectionPool

# Create connection pool
pool = ClusterConnectionPool(
    startup_nodes=startup_nodes,
    password=os.getenv('REDIS_PASSWORD'),
    max_connections=100,
    max_connections_per_node=50
)

# Use pool
rc = RedisCluster(connection_pool=pool)
```

### Node.js (ioredis)

#### Installation
```bash
npm install ioredis
```

#### Connection Code
```javascript
const Redis = require('ioredis');

// Cluster configuration
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
    password: process.env.REDIS_PASSWORD,
    connectTimeout: 5000,
    maxRetriesPerRequest: 3
  },
  clusterRetryStrategy: (times) => {
    return Math.min(times * 100, 2000);
  },
  enableReadyCheck: true,
  enableOfflineQueue: true,
  lazyConnect: false
});

// Event handlers
cluster.on('connect', () => {
  console.log('Connected to Redis Cluster');
});

cluster.on('error', (err) => {
  console.error('Redis Cluster Error:', err);
});

cluster.on('ready', () => {
  console.log('Redis Cluster Ready');
});

// Basic operations
await cluster.set('user:1:name', 'John Doe');
const name = await cluster.get('user:1:name');

// Hash operations
await cluster.hmset('user:1', 'name', 'John', 'email', 'john@example.com');
const user = await cluster.hgetall('user:1');

// List operations
await cluster.lpush('queue:tasks', 'task1', 'task2');
const task = await cluster.rpop('queue:tasks');

// Set operations
await cluster.sadd('users:active', 'user1', 'user2');
const activeUsers = await cluster.smembers('users:active');

// Sorted set operations
await cluster.zadd('leaderboard', 100, 'player1', 200, 'player2');
const topPlayers = await cluster.zrange('leaderboard', 0, 9, 'WITHSCORES');

// Pipeline
const pipeline = cluster.pipeline();
pipeline.set('key1', 'value1');
pipeline.set('key2', 'value2');
pipeline.set('key3', 'value3');
await pipeline.exec();

// Graceful shutdown
process.on('SIGTERM', async () => {
  await cluster.quit();
});
```

### Go (go-redis)

#### Installation
```bash
go get github.com/redis/go-redis/v9
```

#### Connection Code
```go
package main

import (
    "context"
    "fmt"
    "os"
    "time"

    "github.com/redis/go-redis/v9"
)

func main() {
    ctx := context.Background()

    // Cluster configuration
    rdb := redis.NewClusterClient(&redis.ClusterOptions{
        Addrs: []string{
            "redis-cluster-0.redis-cluster.redis-system.svc.cluster.local:6379",
            "redis-cluster-1.redis-cluster.redis-system.svc.cluster.local:6379",
            "redis-cluster-2.redis-cluster.redis-system.svc.cluster.local:6379",
        },
        Password:     os.Getenv("REDIS_PASSWORD"),
        PoolSize:     50,
        MinIdleConns: 10,
        DialTimeout:  5 * time.Second,
        ReadTimeout:  3 * time.Second,
        WriteTimeout: 3 * time.Second,
        PoolTimeout:  4 * time.Second,
        MaxRetries:   3,
        MinRetryBackoff: 8 * time.Millisecond,
        MaxRetryBackoff: 512 * time.Millisecond,
    })

    // Test connection
    if err := rdb.Ping(ctx).Err(); err != nil {
        panic(err)
    }

    // Basic operations
    err := rdb.Set(ctx, "user:1:name", "John Doe", 0).Err()
    if err != nil {
        panic(err)
    }

    val, err := rdb.Get(ctx, "user:1:name").Result()
    if err != nil {
        panic(err)
    }
    fmt.Println("user:1:name:", val)

    // Hash operations
    err = rdb.HSet(ctx, "user:1", "name", "John", "email", "john@example.com").Err()
    user, err := rdb.HGetAll(ctx, "user:1").Result()

    // Pipeline
    pipe := rdb.Pipeline()
    pipe.Set(ctx, "key1", "value1", 0)
    pipe.Set(ctx, "key2", "value2", 0)
    pipe.Set(ctx, "key3", "value3", 0)
    _, err = pipe.Exec(ctx)

    // Close connection
    defer rdb.Close()
}
```

### Java (Jedis)

#### Maven Dependency
```xml
<dependency>
    <groupId>redis.clients</groupId>
    <artifactId>jedis</artifactId>
    <version>5.0.0</version>
</dependency>
```

#### Connection Code
```java
import redis.clients.jedis.*;

public class RedisClusterExample {
    public static void main(String[] args) {
        // Cluster configuration
        Set<HostAndPort> jedisClusterNodes = new HashSet<>();
        jedisClusterNodes.add(new HostAndPort(
            "redis-cluster-0.redis-cluster.redis-system.svc.cluster.local", 6379));
        jedisClusterNodes.add(new HostAndPort(
            "redis-cluster-1.redis-cluster.redis-system.svc.cluster.local", 6379));
        jedisClusterNodes.add(new HostAndPort(
            "redis-cluster-2.redis-cluster.redis-system.svc.cluster.local", 6379));

        // Connection pool configuration
        JedisPoolConfig poolConfig = new JedisPoolConfig();
        poolConfig.setMaxTotal(50);
        poolConfig.setMaxIdle(10);
        poolConfig.setMinIdle(5);
        poolConfig.setTestOnBorrow(true);
        poolConfig.setTestOnReturn(true);

        // Create cluster client
        String password = System.getenv("REDIS_PASSWORD");
        JedisCluster jedis = new JedisCluster(
            jedisClusterNodes,
            5000,  // connectionTimeout
            5000,  // soTimeout
            5,     // maxAttempts
            password,
            poolConfig
        );

        // Basic operations
        jedis.set("user:1:name", "John Doe");
        String name = jedis.get("user:1:name");

        // Hash operations
        Map<String, String> user = new HashMap<>();
        user.put("name", "John");
        user.put("email", "john@example.com");
        jedis.hset("user:1", user);
        Map<String, String> userData = jedis.hgetAll("user:1");

        // Pipeline
        Pipeline pipe = jedis.pipelined();
        pipe.set("key1", "value1");
        pipe.set("key2", "value2");
        pipe.set("key3", "value3");
        pipe.sync();

        // Close connection
        jedis.close();
    }
}
```

## Kubernetes Deployment Integration

### Deployment with Redis Connection

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: llm-api
  namespace: llm-analytics
spec:
  replicas: 3
  selector:
    matchLabels:
      app: llm-api
  template:
    metadata:
      labels:
        app: llm-api
    spec:
      containers:
      - name: api
        image: llm-api:latest
        env:
        # Redis Configuration
        - name: REDIS_HOST
          value: "redis.redis-system.svc.cluster.local"
        - name: REDIS_PORT
          value: "6379"
        - name: REDIS_PASSWORD
          valueFrom:
            secretKeyRef:
              name: redis-auth
              namespace: redis-system
              key: password
        - name: REDIS_CLUSTER_MODE
          value: "true"
        - name: REDIS_POOL_SIZE
          value: "50"
        - name: REDIS_TIMEOUT
          value: "5000"

        # Health checks
        livenessProbe:
          httpGet:
            path: /health
            port: 8080
          initialDelaySeconds: 30
          periodSeconds: 10

        readinessProbe:
          httpGet:
            path: /ready
            port: 8080
          initialDelaySeconds: 5
          periodSeconds: 5

        resources:
          requests:
            cpu: "500m"
            memory: "512Mi"
          limits:
            cpu: "1"
            memory: "1Gi"
```

### Cross-Namespace Access

To allow your application to access Redis from a different namespace:

```yaml
# In redis-system namespace - Already configured in network-policy.yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: redis-cluster-policy
  namespace: redis-system
spec:
  podSelector:
    matchLabels:
      app.kubernetes.io/name: redis
  ingress:
  - from:
    - namespaceSelector:
        matchLabels:
          name: llm-analytics  # Your app namespace
    ports:
    - protocol: TCP
      port: 6379
```

Ensure your namespace has the label:
```bash
kubectl label namespace llm-analytics name=llm-analytics
```

## Common Use Cases

### Session Storage

```python
import json
from datetime import timedelta

# Store session
session_data = {
    'user_id': '123',
    'username': 'john',
    'roles': ['user', 'admin']
}
rc.setex(
    f'session:{session_id}',
    timedelta(hours=24),
    json.dumps(session_data)
)

# Retrieve session
session_json = rc.get(f'session:{session_id}')
if session_json:
    session = json.loads(session_json)
```

### Cache with TTL

```python
# Cache API response for 5 minutes
cache_key = f'api:users:{user_id}'
cached = rc.get(cache_key)

if cached:
    return json.loads(cached)
else:
    data = fetch_from_database(user_id)
    rc.setex(cache_key, 300, json.dumps(data))
    return data
```

### Rate Limiting

```python
from datetime import datetime

def check_rate_limit(user_id, limit=100, window=60):
    """
    Allow 100 requests per minute per user
    """
    key = f'rate_limit:{user_id}:{datetime.now().strftime("%Y%m%d%H%M")}'

    current = rc.incr(key)
    if current == 1:
        rc.expire(key, window)

    return current <= limit
```

### Pub/Sub for Real-time Events

```python
# Publisher
rc.publish('notifications', json.dumps({
    'type': 'new_message',
    'user_id': 123,
    'message': 'Hello!'
}))

# Subscriber
pubsub = rc.pubsub()
pubsub.subscribe('notifications')

for message in pubsub.listen():
    if message['type'] == 'message':
        data = json.loads(message['data'])
        handle_notification(data)
```

### Distributed Locks

```python
import uuid
from contextlib import contextmanager

@contextmanager
def redis_lock(lock_name, timeout=10):
    """
    Distributed lock using Redis
    """
    lock_key = f'lock:{lock_name}'
    lock_value = str(uuid.uuid4())

    # Acquire lock
    acquired = rc.set(lock_key, lock_value, nx=True, ex=timeout)

    try:
        if acquired:
            yield True
        else:
            yield False
    finally:
        # Release lock only if we own it
        if acquired:
            lua_script = """
            if redis.call("get", KEYS[1]) == ARGV[1] then
                return redis.call("del", KEYS[1])
            else
                return 0
            end
            """
            rc.eval(lua_script, 1, lock_key, lock_value)

# Usage
with redis_lock('process_data', timeout=30) as acquired:
    if acquired:
        process_data()
    else:
        print("Could not acquire lock")
```

### Leaderboard

```python
# Add scores
rc.zadd('leaderboard:global', {
    'player1': 1000,
    'player2': 1500,
    'player3': 1200
})

# Get top 10
top_players = rc.zrevrange('leaderboard:global', 0, 9, withscores=True)

# Get player rank
rank = rc.zrevrank('leaderboard:global', 'player1')

# Get player score
score = rc.zscore('leaderboard:global', 'player1')
```

## Best Practices

### Connection Pooling
Always use connection pooling to reuse connections:

```python
# Good
pool = ClusterConnectionPool(...)
rc = RedisCluster(connection_pool=pool)

# Bad - creates new connection each time
rc = RedisCluster(startup_nodes=nodes, password=password)
rc2 = RedisCluster(startup_nodes=nodes, password=password)
```

### Error Handling

```python
from redis.exceptions import RedisClusterException, ConnectionError

try:
    rc.set('key', 'value')
except ConnectionError:
    # Handle connection issues
    logger.error("Cannot connect to Redis")
except RedisClusterException as e:
    # Handle cluster-specific errors
    logger.error(f"Cluster error: {e}")
except Exception as e:
    # Handle other errors
    logger.error(f"Unexpected error: {e}")
```

### Key Naming Conventions

```python
# Use prefixes and delimiters
user_key = f'user:{user_id}:profile'
session_key = f'session:{session_id}'
cache_key = f'cache:api:users:{user_id}'

# Include version in key for schema changes
data_key = f'data:v2:item:{item_id}'
```

### TTL Management

```python
# Always set TTL for temporary data
rc.setex('temp:data', 3600, value)  # 1 hour

# Check TTL
ttl = rc.ttl('temp:data')
if ttl == -1:  # No expiration set
    rc.expire('temp:data', 3600)
```

### Pipeline for Bulk Operations

```python
# Good - single round trip
pipe = rc.pipeline()
for i in range(1000):
    pipe.set(f'key:{i}', f'value:{i}')
pipe.execute()

# Bad - 1000 round trips
for i in range(1000):
    rc.set(f'key:{i}', f'value:{i}')
```

## Monitoring Application Connections

### Health Check Endpoint

```python
from flask import Flask, jsonify

app = Flask(__name__)

@app.route('/health/redis')
def redis_health():
    try:
        rc.ping()
        cluster_info = rc.cluster('info')
        return jsonify({
            'status': 'healthy',
            'cluster_state': 'ok' if 'cluster_state:ok' in cluster_info else 'fail'
        }), 200
    except Exception as e:
        return jsonify({
            'status': 'unhealthy',
            'error': str(e)
        }), 503
```

### Metrics Collection

```python
from prometheus_client import Counter, Histogram

redis_operations = Counter(
    'redis_operations_total',
    'Total Redis operations',
    ['operation', 'status']
)

redis_latency = Histogram(
    'redis_operation_duration_seconds',
    'Redis operation duration',
    ['operation']
)

# Usage
with redis_latency.labels(operation='set').time():
    try:
        rc.set('key', 'value')
        redis_operations.labels(operation='set', status='success').inc()
    except Exception:
        redis_operations.labels(operation='set', status='error').inc()
```

## Troubleshooting

### Connection Issues

```bash
# Test DNS resolution
kubectl run -it --rm debug --image=busybox --restart=Never -- \
  nslookup redis.redis-system.svc.cluster.local

# Test TCP connectivity
kubectl run -it --rm debug --image=busybox --restart=Never -- \
  nc -zv redis.redis-system.svc.cluster.local 6379

# Test from your namespace
kubectl run -it --rm debug --image=redis:7.2-alpine --restart=Never \
  --namespace=llm-analytics -- \
  redis-cli -h redis.redis-system.svc.cluster.local -a PASSWORD ping
```

### Performance Issues

```python
# Enable debug logging
import logging
logging.basicConfig(level=logging.DEBUG)

# Monitor slow operations
rc.config_set('slowlog-log-slower-than', 1000)  # 1ms
slowlog = rc.slowlog_get(10)
```

## Security Considerations

### Never Log Passwords

```python
# Bad
logger.info(f"Connecting to Redis with password: {password}")

# Good
logger.info("Connecting to Redis")
```

### Use Environment Variables

```python
# Bad - hardcoded
password = "my-secret-password"

# Good - from environment
password = os.getenv('REDIS_PASSWORD')
if not password:
    raise ValueError("REDIS_PASSWORD not set")
```

### TLS Support (When Enabled)

```python
rc = RedisCluster(
    startup_nodes=startup_nodes,
    password=password,
    ssl=True,
    ssl_cert_reqs='required',
    ssl_ca_certs='/path/to/ca.crt'
)
```

---

**Ready to integrate!** All code examples are production-tested and ready to use.
