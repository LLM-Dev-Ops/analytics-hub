# Database Integration Guide

Guide for integrating applications with the LLM Analytics Hub databases.

## Table of Contents

- [Overview](#overview)
- [Connection Methods](#connection-methods)
- [TimescaleDB Integration](#timescaledb-integration)
- [Redis Integration](#redis-integration)
- [Kafka Integration](#kafka-integration)
- [Best Practices](#best-practices)
- [Error Handling](#error-handling)

## Overview

The LLM Analytics Hub provides three database services for different use cases:

| Database | Use Case | Connection Type |
|----------|----------|----------------|
| TimescaleDB | Analytics, metrics storage | PostgreSQL protocol |
| Redis | Caching, sessions, rate limiting | Redis protocol |
| Kafka | Event streaming | Kafka protocol |

## Connection Methods

### From Kubernetes Pods

Use internal service DNS names:

```
timescaledb.llm-analytics.svc.cluster.local:5432
redis-master.llm-analytics.svc.cluster.local:6379
kafka.llm-analytics.svc.cluster.local:9092
```

### From Outside Kubernetes

Use port forwarding for development:

```bash
# TimescaleDB
kubectl port-forward svc/timescaledb 5432:5432 -n llm-analytics

# Redis
kubectl port-forward svc/redis-master 6379:6379 -n llm-analytics

# Kafka
kubectl port-forward svc/kafka 9092:9092 -n llm-analytics
```

For production, configure ingress or load balancer.

## TimescaleDB Integration

### Connection Examples

#### Python (asyncpg)

```python
import asyncpg
from typing import Optional

class TimescaleDBClient:
    def __init__(self):
        self.pool: Optional[asyncpg.Pool] = None

    async def connect(self):
        self.pool = await asyncpg.create_pool(
            host="timescaledb.llm-analytics.svc.cluster.local",
            port=5432,
            database="analytics",
            user="postgres",
            password="postgres",  # Use secret in production
            min_size=10,
            max_size=20
        )

    async def insert_metric(self, model_id: str, tokens: int, cost: float):
        async with self.pool.acquire() as conn:
            await conn.execute('''
                INSERT INTO llm_usage_metrics (
                    time, model_id, provider, token_total, cost_usd
                ) VALUES ($1, $2, $3, $4, $5)
            ''', datetime.utcnow(), model_id, 'openai', tokens, cost)
```

See [examples/python/timescaledb_example.py](../examples/python/timescaledb_example.py) for complete example.

#### Node.js (pg)

```javascript
const { Pool } = require('pg');

const pool = new Pool({
  host: 'timescaledb.llm-analytics.svc.cluster.local',
  port: 5432,
  database: 'analytics',
  user: 'postgres',
  password: 'postgres',
  max: 20,
  min: 10
});

async function insertMetric(modelId, tokens, cost) {
  const client = await pool.connect();
  try {
    await client.query(
      'INSERT INTO llm_usage_metrics (time, model_id, token_total, cost_usd) VALUES ($1, $2, $3, $4)',
      [new Date(), modelId, tokens, cost]
    );
  } finally {
    client.release();
  }
}
```

#### Go (pgx)

```go
import (
    "context"
    "github.com/jackc/pgx/v5/pgxpool"
)

func createPool(ctx context.Context) (*pgxpool.Pool, error) {
    connStr := "postgres://postgres:postgres@timescaledb.llm-analytics.svc.cluster.local:5432/analytics"
    return pgxpool.New(ctx, connStr)
}

func insertMetric(ctx context.Context, pool *pgxpool.Pool, modelID string, tokens int, cost float64) error {
    _, err := pool.Exec(ctx,
        "INSERT INTO llm_usage_metrics (time, model_id, token_total, cost_usd) VALUES ($1, $2, $3, $4)",
        time.Now(), modelID, tokens, cost)
    return err
}
```

### Schema Overview

#### llm_usage_metrics

Primary table for LLM usage data:

```sql
CREATE TABLE llm_usage_metrics (
    time TIMESTAMPTZ NOT NULL,
    model_id VARCHAR(255) NOT NULL,
    provider VARCHAR(100) NOT NULL,
    request_count INTEGER DEFAULT 0,
    token_input INTEGER DEFAULT 0,
    token_output INTEGER DEFAULT 0,
    token_total INTEGER DEFAULT 0,
    cost_usd NUMERIC(10, 6) DEFAULT 0,
    avg_latency_ms NUMERIC(10, 2) DEFAULT 0,
    error_count INTEGER DEFAULT 0,
    success_count INTEGER DEFAULT 0,
    user_id VARCHAR(255),
    application_id VARCHAR(255),
    environment VARCHAR(50),
    metadata JSONB
);
```

#### Continuous Aggregates

Pre-aggregated views for faster queries:

```sql
-- Hourly aggregates
SELECT * FROM llm_usage_hourly
WHERE hour >= NOW() - INTERVAL '24 hours';

-- Daily aggregates
SELECT * FROM llm_usage_daily
WHERE day >= NOW() - INTERVAL '30 days';
```

### Query Patterns

#### Insert Metrics

```sql
INSERT INTO llm_usage_metrics (
    time, model_id, provider, request_count,
    token_input, token_output, cost_usd
) VALUES (
    NOW(), 'gpt-4', 'openai', 1, 500, 200, 0.03
);
```

#### Query Usage Summary

```sql
SELECT
    model_id,
    SUM(request_count) as total_requests,
    SUM(token_total) as total_tokens,
    SUM(cost_usd) as total_cost
FROM llm_usage_metrics
WHERE time >= NOW() - INTERVAL '24 hours'
GROUP BY model_id
ORDER BY total_cost DESC;
```

#### Query Time-Series Data

```sql
SELECT
    time_bucket('1 hour', time) AS hour,
    model_id,
    SUM(request_count) as requests,
    AVG(avg_latency_ms) as avg_latency
FROM llm_usage_metrics
WHERE time >= NOW() - INTERVAL '7 days'
GROUP BY hour, model_id
ORDER BY hour DESC;
```

## Redis Integration

### Connection Examples

#### Python (aioredis)

```python
import aioredis

async def create_redis_client():
    return await aioredis.create_redis_pool(
        'redis://redis-master.llm-analytics.svc.cluster.local:6379',
        minsize=10,
        maxsize=20
    )

async def cache_response(redis, key: str, value: str, ttl: int = 300):
    await redis.set(key, value, expire=ttl)

async def get_cached_response(redis, key: str):
    return await redis.get(key)
```

See [examples/python/redis_example.py](../examples/python/redis_example.py) for complete example.

#### Node.js (ioredis)

```javascript
const Redis = require('ioredis');

const redis = new Redis({
  host: 'redis-master.llm-analytics.svc.cluster.local',
  port: 6379,
  retryStrategy: (times) => Math.min(times * 50, 2000)
});

async function cacheResponse(key, value, ttl = 300) {
  await redis.setex(key, ttl, value);
}

async function getCachedResponse(key) {
  return await redis.get(key);
}
```

#### Go (go-redis)

```go
import (
    "github.com/go-redis/redis/v8"
    "time"
)

func createRedisClient() *redis.Client {
    return redis.NewClient(&redis.Options{
        Addr: "redis-master.llm-analytics.svc.cluster.local:6379",
        PoolSize: 20,
    })
}

func cacheResponse(ctx context.Context, rdb *redis.Client, key string, value string) error {
    return rdb.Set(ctx, key, value, 5*time.Minute).Err()
}
```

### Use Cases

#### 1. Response Caching

Cache LLM responses to reduce costs:

```python
import hashlib

async def get_llm_response(redis, prompt: str, model: str):
    # Generate cache key
    prompt_hash = hashlib.sha256(prompt.encode()).hexdigest()
    cache_key = f"llm:response:{model}:{prompt_hash}"

    # Check cache
    cached = await redis.get(cache_key)
    if cached:
        return cached

    # Generate response (expensive operation)
    response = await call_llm_api(prompt, model)

    # Cache for 1 hour
    await redis.setex(cache_key, 3600, response)

    return response
```

#### 2. Session Management

Store user sessions:

```python
async def create_session(redis, session_id: str, user_data: dict):
    session_key = f"session:{session_id}"
    await redis.setex(
        session_key,
        3600,  # 1 hour
        json.dumps(user_data)
    )

async def get_session(redis, session_id: str):
    session_key = f"session:{session_id}"
    data = await redis.get(session_key)
    return json.loads(data) if data else None
```

#### 3. Rate Limiting

Implement rate limiting:

```python
async def check_rate_limit(redis, user_id: str, limit: int = 100):
    key = f"ratelimit:{user_id}"
    current = await redis.incr(key)

    if current == 1:
        await redis.expire(key, 60)  # 1 minute window

    return current <= limit
```

## Kafka Integration

### Connection Examples

#### Python (aiokafka)

```python
from aiokafka import AIOKafkaProducer, AIOKafkaConsumer
import json

async def create_producer():
    return AIOKafkaProducer(
        bootstrap_servers='kafka.llm-analytics.svc.cluster.local:9092',
        value_serializer=lambda v: json.dumps(v).encode('utf-8')
    )

async def publish_event(producer, topic: str, event: dict):
    await producer.send(topic, event)
```

See [examples/python/kafka_example.py](../examples/python/kafka_example.py) for complete example.

#### Node.js (kafkajs)

```javascript
const { Kafka } = require('kafkajs');

const kafka = new Kafka({
  clientId: 'llm-analytics',
  brokers: ['kafka.llm-analytics.svc.cluster.local:9092']
});

const producer = kafka.producer();

async function publishEvent(topic, event) {
  await producer.send({
    topic,
    messages: [{ value: JSON.stringify(event) }]
  });
}
```

#### Go (sarama)

```go
import (
    "github.com/Shopify/sarama"
)

func createProducer() (sarama.SyncProducer, error) {
    config := sarama.NewConfig()
    config.Producer.Return.Successes = true

    return sarama.NewSyncProducer(
        []string{"kafka.llm-analytics.svc.cluster.local:9092"},
        config,
    )
}
```

### Topics

Available topics:

| Topic | Purpose | Partitions | Retention |
|-------|---------|------------|-----------|
| llm-events | LLM API calls | 6 | 7 days |
| llm-metrics | Performance metrics | 3 | 7 days |
| llm-alerts | Alert events | 3 | 30 days |
| llm-logs | Application logs | 6 | 3 days |
| llm-analytics | Analytics events | 3 | 30 days |

### Event Patterns

#### Publish LLM Event

```python
async def publish_llm_event(producer, event_data: dict):
    event = {
        'timestamp': datetime.utcnow().isoformat(),
        'event_type': 'completion',
        'model_id': event_data['model_id'],
        'provider': event_data['provider'],
        'user_id': event_data['user_id'],
        'tokens': event_data['tokens'],
        'latency_ms': event_data['latency_ms'],
        'cost_usd': event_data['cost_usd']
    }

    await producer.send('llm-events', event)
```

#### Consume Events

```python
async def consume_events(consumer):
    async for message in consumer:
        event = message.value
        await process_event(event)
```

## Best Practices

### Connection Pooling

Always use connection pooling to manage database connections efficiently:

- **TimescaleDB**: 10-20 connections per service
- **Redis**: 10-20 connections per service
- **Kafka**: Use async producers/consumers

### Error Handling

Implement retry logic with exponential backoff:

```python
import asyncio
from functools import wraps

def retry_with_backoff(max_retries=3, base_delay=1):
    def decorator(func):
        @wraps(func)
        async def wrapper(*args, **kwargs):
            for attempt in range(max_retries):
                try:
                    return await func(*args, **kwargs)
                except Exception as e:
                    if attempt == max_retries - 1:
                        raise
                    delay = base_delay * (2 ** attempt)
                    await asyncio.sleep(delay)
        return wrapper
    return decorator

@retry_with_backoff(max_retries=3)
async def insert_metric(pool, data):
    async with pool.acquire() as conn:
        await conn.execute(...)
```

### Security

1. **Use Kubernetes Secrets** for credentials:

```yaml
apiVersion: v1
kind: Secret
metadata:
  name: database-credentials
type: Opaque
stringData:
  postgres-password: <password>
  redis-password: <password>
```

2. **Use TLS** for connections in production

3. **Implement RBAC** for database access

### Monitoring

Monitor connection pools and database performance:

```python
# Example: Log pool stats
async def log_pool_stats(pool):
    print(f"Pool size: {pool.get_size()}")
    print(f"Free connections: {pool.get_idle_size()}")
```

### Batch Operations

Use batch operations for better performance:

```python
async def batch_insert_metrics(pool, metrics: list):
    async with pool.acquire() as conn:
        await conn.executemany('''
            INSERT INTO llm_usage_metrics (...) VALUES ($1, $2, ...)
        ''', metrics)
```

## Next Steps

1. Review example code in `examples/`
2. Set up monitoring and alerting
3. Implement backup strategies
4. Load test your integration
5. Review [TESTING.md](TESTING.md) for testing guidelines
