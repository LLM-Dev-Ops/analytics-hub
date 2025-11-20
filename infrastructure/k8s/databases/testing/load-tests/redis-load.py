#!/usr/bin/env python3
"""
Redis Load Testing Script
Tests operations per second, cache hit ratio, and concurrent connections
"""

import asyncio
import aioredis
import time
import random
import statistics
from typing import List, Dict
import sys

# Configuration
REDIS_HOST = "redis-master.llm-analytics.svc.cluster.local"
REDIS_PORT = 6379

# Test parameters
NUM_CONNECTIONS = 100
NUM_OPERATIONS = 100000
CACHE_KEYS = 10000

# Colors for output
GREEN = '\033[0;32m'
BLUE = '\033[0;34m'
RED = '\033[0;31m'
YELLOW = '\033[1;33m'
NC = '\033[0m'


def log_info(msg):
    print(f"{BLUE}[REDIS-LOAD]{NC} {msg}")


def log_success(msg):
    print(f"{GREEN}[REDIS-LOAD]{NC} {msg}")


def log_error(msg):
    print(f"{RED}[REDIS-LOAD]{NC} {msg}")


async def create_redis_connection():
    """Create Redis connection"""
    try:
        redis = await aioredis.create_redis_pool(
            f'redis://{REDIS_HOST}:{REDIS_PORT}',
            minsize=10,
            maxsize=NUM_CONNECTIONS
        )
        return redis
    except Exception as e:
        log_error(f"Failed to connect to Redis: {e}")
        sys.exit(1)


async def run_set_operations(redis, num_ops: int) -> float:
    """Run SET operations and return time taken"""
    start_time = time.time()

    for i in range(num_ops):
        key = f"load_test:key:{random.randint(0, CACHE_KEYS)}"
        value = f"value_{i}_{random.randint(0, 1000000)}"
        await redis.set(key, value, expire=300)

    return time.time() - start_time


async def run_get_operations(redis, num_ops: int) -> tuple:
    """Run GET operations and return time taken and hit ratio"""
    start_time = time.time()
    hits = 0

    for _ in range(num_ops):
        key = f"load_test:key:{random.randint(0, CACHE_KEYS)}"
        value = await redis.get(key)
        if value:
            hits += 1

    elapsed = time.time() - start_time
    hit_ratio = hits / num_ops

    return elapsed, hit_ratio


async def run_mixed_operations(redis, num_ops: int) -> float:
    """Run mixed operations and return time taken"""
    start_time = time.time()

    for i in range(num_ops):
        operation = random.choice(['set', 'get', 'incr', 'lpush', 'hset'])

        if operation == 'set':
            key = f"load_test:mixed:{random.randint(0, CACHE_KEYS)}"
            await redis.set(key, f"value_{i}", expire=300)

        elif operation == 'get':
            key = f"load_test:mixed:{random.randint(0, CACHE_KEYS)}"
            await redis.get(key)

        elif operation == 'incr':
            key = f"load_test:counter:{random.randint(0, 100)}"
            await redis.incr(key)

        elif operation == 'lpush':
            key = f"load_test:list:{random.randint(0, 100)}"
            await redis.lpush(key, f"item_{i}")

        elif operation == 'hset':
            key = f"load_test:hash:{random.randint(0, 100)}"
            await redis.hset(key, f"field_{i}", f"value_{i}")

    return time.time() - start_time


async def run_set_load_test(redis) -> Dict:
    """Run SET operations load test"""
    log_info("Running SET operations load test...")

    tasks = []
    ops_per_task = NUM_OPERATIONS // NUM_CONNECTIONS

    start_time = time.time()

    # Create concurrent tasks
    for _ in range(NUM_CONNECTIONS):
        task = asyncio.create_task(run_set_operations(redis, ops_per_task))
        tasks.append(task)

    # Wait for all tasks
    times = await asyncio.gather(*tasks, return_exceptions=True)

    # Filter out exceptions
    valid_times = [t for t in times if isinstance(t, (int, float))]

    end_time = time.time()
    total_time = end_time - start_time

    total_ops = NUM_CONNECTIONS * ops_per_task
    ops_per_sec = total_ops / total_time

    return {
        'operation': 'SET',
        'total_ops': total_ops,
        'total_time': total_time,
        'ops_per_sec': ops_per_sec,
        'avg_time': statistics.mean(valid_times) if valid_times else 0
    }


async def run_get_load_test(redis) -> Dict:
    """Run GET operations load test"""
    log_info("Running GET operations load test...")

    # Pre-populate cache
    log_info("Pre-populating cache...")
    for i in range(CACHE_KEYS):
        await redis.set(f"load_test:key:{i}", f"value_{i}", expire=600)

    tasks = []
    ops_per_task = NUM_OPERATIONS // NUM_CONNECTIONS

    start_time = time.time()

    # Create concurrent tasks
    for _ in range(NUM_CONNECTIONS):
        task = asyncio.create_task(run_get_operations(redis, ops_per_task))
        tasks.append(task)

    # Wait for all tasks
    results = await asyncio.gather(*tasks, return_exceptions=True)

    # Filter out exceptions
    valid_results = [r for r in results if isinstance(r, tuple)]

    end_time = time.time()
    total_time = end_time - start_time

    total_ops = NUM_CONNECTIONS * ops_per_task
    ops_per_sec = total_ops / total_time

    # Calculate average hit ratio
    hit_ratios = [r[1] for r in valid_results]
    avg_hit_ratio = statistics.mean(hit_ratios) if hit_ratios else 0

    return {
        'operation': 'GET',
        'total_ops': total_ops,
        'total_time': total_time,
        'ops_per_sec': ops_per_sec,
        'hit_ratio': avg_hit_ratio
    }


async def run_mixed_load_test(redis) -> Dict:
    """Run mixed operations load test"""
    log_info("Running mixed operations load test...")

    tasks = []
    ops_per_task = NUM_OPERATIONS // NUM_CONNECTIONS

    start_time = time.time()

    # Create concurrent tasks
    for _ in range(NUM_CONNECTIONS):
        task = asyncio.create_task(run_mixed_operations(redis, ops_per_task))
        tasks.append(task)

    # Wait for all tasks
    times = await asyncio.gather(*tasks, return_exceptions=True)

    # Filter out exceptions
    valid_times = [t for t in times if isinstance(t, (int, float))]

    end_time = time.time()
    total_time = end_time - start_time

    total_ops = NUM_CONNECTIONS * ops_per_task
    ops_per_sec = total_ops / total_time

    return {
        'operation': 'MIXED',
        'total_ops': total_ops,
        'total_time': total_time,
        'ops_per_sec': ops_per_sec,
        'avg_time': statistics.mean(valid_times) if valid_times else 0
    }


async def test_concurrent_connections() -> Dict:
    """Test concurrent connection handling"""
    log_info("Testing concurrent connections...")

    max_connections = NUM_CONNECTIONS
    connections = []

    try:
        start_time = time.time()

        # Create connections
        for _ in range(max_connections):
            conn = await aioredis.create_redis(f'redis://{REDIS_HOST}:{REDIS_PORT}')
            connections.append(conn)

        acquisition_time = time.time() - start_time

        # Test each connection
        tasks = []
        for conn in connections:
            task = asyncio.create_task(conn.ping())
            tasks.append(task)

        await asyncio.gather(*tasks)

        return {
            'max_connections': max_connections,
            'acquisition_time': acquisition_time,
            'status': 'success'
        }

    finally:
        # Close all connections
        for conn in connections:
            conn.close()
            await conn.wait_closed()


async def main():
    """Main load test execution"""
    log_info("=" * 50)
    log_info("Redis Load Test")
    log_info("=" * 50)

    # Create Redis connection
    log_info(f"Connecting to {REDIS_HOST}:{REDIS_PORT}...")
    redis = await create_redis_connection()
    log_success("Connected to Redis")

    try:
        # Run SET load test
        set_results = await run_set_load_test(redis)

        log_success("SET Load Test Results:")
        print(f"  Total Operations:   {set_results['total_ops']:,}")
        print(f"  Total Time:         {set_results['total_time']:.2f}s")
        print(f"  Operations/sec:     {set_results['ops_per_sec']:,.0f}")
        print()

        # Run GET load test
        get_results = await run_get_load_test(redis)

        log_success("GET Load Test Results:")
        print(f"  Total Operations:   {get_results['total_ops']:,}")
        print(f"  Total Time:         {get_results['total_time']:.2f}s")
        print(f"  Operations/sec:     {get_results['ops_per_sec']:,.0f}")
        print(f"  Cache Hit Ratio:    {get_results['hit_ratio']*100:.1f}%")
        print()

        # Run mixed load test
        mixed_results = await run_mixed_load_test(redis)

        log_success("Mixed Operations Load Test Results:")
        print(f"  Total Operations:   {mixed_results['total_ops']:,}")
        print(f"  Total Time:         {mixed_results['total_time']:.2f}s")
        print(f"  Operations/sec:     {mixed_results['ops_per_sec']:,.0f}")
        print()

        # Test concurrent connections
        conn_results = await test_concurrent_connections()

        log_success("Concurrent Connection Test Results:")
        print(f"  Max Connections:    {conn_results['max_connections']}")
        print(f"  Acquisition Time:   {conn_results['acquisition_time']:.2f}s")
        print(f"  Status:             {conn_results['status']}")
        print()

        # Performance assessment
        log_info("Performance Assessment:")

        avg_ops = (set_results['ops_per_sec'] + get_results['ops_per_sec'] + mixed_results['ops_per_sec']) / 3

        if avg_ops >= 100000:
            log_success("  Throughput:         EXCELLENT (>=100k ops/sec)")
        elif avg_ops >= 50000:
            log_success("  Throughput:         GOOD (>=50k ops/sec)")
        else:
            log_error("  Throughput:         NEEDS IMPROVEMENT (<50k ops/sec)")

        if get_results['hit_ratio'] >= 0.90:
            log_success("  Cache Hit Ratio:    EXCELLENT (>=90%)")
        elif get_results['hit_ratio'] >= 0.70:
            log_success("  Cache Hit Ratio:    GOOD (>=70%)")
        else:
            log_error("  Cache Hit Ratio:    NEEDS IMPROVEMENT (<70%)")

        # Cleanup
        log_info("Cleaning up test data...")
        for i in range(CACHE_KEYS):
            await redis.delete(f"load_test:key:{i}")

    finally:
        redis.close()
        await redis.wait_closed()
        log_info("Redis connection closed")

    log_success("=" * 50)
    log_success("Load test completed")
    log_success("=" * 50)


if __name__ == "__main__":
    asyncio.run(main())
