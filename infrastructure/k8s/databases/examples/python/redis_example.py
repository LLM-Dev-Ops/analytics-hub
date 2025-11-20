#!/usr/bin/env python3
"""
Redis Connection Example for Python
Demonstrates caching, session management, and rate limiting
"""

import asyncio
import aioredis
import json
from typing import Optional, Any, Dict
import logging
from datetime import datetime

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


class RedisClient:
    """Redis client with connection pooling and error handling"""

    def __init__(
        self,
        host: str = "redis-master.llm-analytics.svc.cluster.local",
        port: int = 6379,
        db: int = 0,
        min_pool_size: int = 10,
        max_pool_size: int = 20
    ):
        self.host = host
        self.port = port
        self.db = db
        self.min_pool_size = min_pool_size
        self.max_pool_size = max_pool_size
        self.redis: Optional[aioredis.Redis] = None

    async def connect(self):
        """Create Redis connection pool"""
        try:
            self.redis = await aioredis.create_redis_pool(
                f'redis://{self.host}:{self.port}/{self.db}',
                minsize=self.min_pool_size,
                maxsize=self.max_pool_size
            )
            logger.info(f"Connected to Redis at {self.host}:{self.port}")
        except Exception as e:
            logger.error(f"Failed to connect to Redis: {e}")
            raise

    async def disconnect(self):
        """Close Redis connection"""
        if self.redis:
            self.redis.close()
            await self.redis.wait_closed()
            logger.info("Disconnected from Redis")

    # Cache operations
    async def cache_set(
        self,
        key: str,
        value: Any,
        ttl: int = 300
    ) -> bool:
        """Set cache value with TTL"""
        if not self.redis:
            raise RuntimeError("Not connected to Redis")

        try:
            # Serialize if not string
            if not isinstance(value, str):
                value = json.dumps(value)

            await self.redis.set(key, value, expire=ttl)
            logger.debug(f"Cached key: {key} (TTL: {ttl}s)")
            return True

        except Exception as e:
            logger.error(f"Failed to set cache: {e}")
            return False

    async def cache_get(self, key: str) -> Optional[Any]:
        """Get cache value"""
        if not self.redis:
            raise RuntimeError("Not connected to Redis")

        try:
            value = await self.redis.get(key)

            if value:
                # Try to deserialize JSON
                try:
                    return json.loads(value)
                except json.JSONDecodeError:
                    return value.decode('utf-8')

            return None

        except Exception as e:
            logger.error(f"Failed to get cache: {e}")
            return None

    async def cache_delete(self, key: str) -> bool:
        """Delete cache value"""
        if not self.redis:
            raise RuntimeError("Not connected to Redis")

        try:
            await self.redis.delete(key)
            logger.debug(f"Deleted cache key: {key}")
            return True

        except Exception as e:
            logger.error(f"Failed to delete cache: {e}")
            return False

    # Session management
    async def session_create(
        self,
        session_id: str,
        user_id: str,
        data: Dict,
        ttl: int = 3600
    ) -> bool:
        """Create user session"""
        session_key = f"session:{session_id}"

        session_data = {
            'user_id': user_id,
            'created_at': datetime.utcnow().isoformat(),
            'data': data
        }

        return await self.cache_set(session_key, session_data, ttl)

    async def session_get(self, session_id: str) -> Optional[Dict]:
        """Get session data"""
        session_key = f"session:{session_id}"
        return await self.cache_get(session_key)

    async def session_update(
        self,
        session_id: str,
        data: Dict,
        ttl: int = 3600
    ) -> bool:
        """Update session data"""
        session_key = f"session:{session_id}"

        # Get existing session
        session = await self.session_get(session_id)
        if not session:
            return False

        # Update data
        session['data'].update(data)

        return await self.cache_set(session_key, session, ttl)

    async def session_delete(self, session_id: str) -> bool:
        """Delete session"""
        session_key = f"session:{session_id}"
        return await self.cache_delete(session_key)

    # Rate limiting
    async def rate_limit_check(
        self,
        identifier: str,
        limit: int = 100,
        window: int = 60
    ) -> tuple[bool, int]:
        """
        Check rate limit using sliding window

        Returns:
            (allowed, remaining): Whether request is allowed and remaining requests
        """
        if not self.redis:
            raise RuntimeError("Not connected to Redis")

        try:
            key = f"ratelimit:{identifier}"
            current_time = int(datetime.utcnow().timestamp())

            # Remove old entries
            await self.redis.zremrangebyscore(
                key,
                '-inf',
                current_time - window
            )

            # Count requests in window
            count = await self.redis.zcard(key)

            if count >= limit:
                return False, 0

            # Add current request
            await self.redis.zadd(
                key,
                current_time,
                f"{current_time}:{id(object())}"
            )

            # Set expiry
            await self.redis.expire(key, window)

            remaining = limit - count - 1
            return True, remaining

        except Exception as e:
            logger.error(f"Failed to check rate limit: {e}")
            # Fail open on error
            return True, limit

    # Model response caching
    async def cache_model_response(
        self,
        prompt_hash: str,
        model_id: str,
        response: str,
        ttl: int = 3600
    ) -> bool:
        """Cache LLM model response"""
        cache_key = f"llm:response:{model_id}:{prompt_hash}"

        cache_data = {
            'response': response,
            'model_id': model_id,
            'cached_at': datetime.utcnow().isoformat()
        }

        return await self.cache_set(cache_key, cache_data, ttl)

    async def get_cached_model_response(
        self,
        prompt_hash: str,
        model_id: str
    ) -> Optional[str]:
        """Get cached LLM model response"""
        cache_key = f"llm:response:{model_id}:{prompt_hash}"
        cached = await self.cache_get(cache_key)

        if cached:
            return cached.get('response')

        return None

    # Metrics caching
    async def cache_metrics(
        self,
        metric_key: str,
        metrics: Dict,
        ttl: int = 60
    ) -> bool:
        """Cache metrics data"""
        cache_key = f"metrics:{metric_key}"
        return await self.cache_set(cache_key, metrics, ttl)

    async def get_cached_metrics(self, metric_key: str) -> Optional[Dict]:
        """Get cached metrics"""
        cache_key = f"metrics:{metric_key}"
        return await self.cache_get(cache_key)


async def main():
    """Example usage"""
    # Create client
    client = RedisClient(
        host="redis-master.llm-analytics.svc.cluster.local",
        min_pool_size=5,
        max_pool_size=10
    )

    try:
        # Connect
        await client.connect()

        # Cache example
        print("=== Cache Example ===")
        await client.cache_set("test:key", {"value": "Hello World"}, ttl=300)
        value = await client.cache_get("test:key")
        print(f"Cached value: {value}")

        # Session example
        print("\n=== Session Example ===")
        session_id = "sess-123"
        await client.session_create(
            session_id=session_id,
            user_id="user-456",
            data={"name": "John Doe", "role": "admin"},
            ttl=3600
        )
        session = await client.session_get(session_id)
        print(f"Session: {session}")

        # Rate limiting example
        print("\n=== Rate Limiting Example ===")
        for i in range(5):
            allowed, remaining = await client.rate_limit_check(
                identifier="user:123",
                limit=10,
                window=60
            )
            print(f"Request {i+1}: Allowed={allowed}, Remaining={remaining}")

        # Model response caching example
        print("\n=== Model Response Caching Example ===")
        prompt_hash = "abc123def456"
        await client.cache_model_response(
            prompt_hash=prompt_hash,
            model_id="gpt-4",
            response="This is a cached response",
            ttl=3600
        )
        cached_response = await client.get_cached_model_response(
            prompt_hash=prompt_hash,
            model_id="gpt-4"
        )
        print(f"Cached response: {cached_response}")

        # Metrics caching example
        print("\n=== Metrics Caching Example ===")
        metrics = {
            'total_requests': 1000,
            'avg_latency': 150.5,
            'error_rate': 0.01
        }
        await client.cache_metrics("hourly:summary", metrics, ttl=60)
        cached_metrics = await client.get_cached_metrics("hourly:summary")
        print(f"Cached metrics: {cached_metrics}")

    finally:
        # Disconnect
        await client.disconnect()


if __name__ == "__main__":
    asyncio.run(main())
