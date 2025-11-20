#!/usr/bin/env python3
"""
TimescaleDB Load Testing Script
Tests insert throughput, query latency, and concurrent connections
"""

import asyncio
import asyncpg
import time
import random
import statistics
from datetime import datetime, timedelta
from typing import List, Dict
import sys

# Configuration
DB_HOST = "timescaledb.llm-analytics.svc.cluster.local"
DB_PORT = 5432
DB_NAME = "analytics"
DB_USER = "postgres"
DB_PASSWORD = "postgres"  # Should be loaded from secret in production

# Test parameters
NUM_CONNECTIONS = 100
DURATION_SECONDS = 60
INSERTS_PER_CONNECTION = 1000

# Colors for output
GREEN = '\033[0;32m'
BLUE = '\033[0;34m'
RED = '\033[0;31m'
YELLOW = '\033[1;33m'
NC = '\033[0m'


def log_info(msg):
    print(f"{BLUE}[LOAD-TEST]{NC} {msg}")


def log_success(msg):
    print(f"{GREEN}[LOAD-TEST]{NC} {msg}")


def log_error(msg):
    print(f"{RED}[LOAD-TEST]{NC} {msg}")


async def create_connection_pool():
    """Create database connection pool"""
    try:
        pool = await asyncpg.create_pool(
            host=DB_HOST,
            port=DB_PORT,
            database=DB_NAME,
            user=DB_USER,
            password=DB_PASSWORD,
            min_size=10,
            max_size=NUM_CONNECTIONS
        )
        return pool
    except Exception as e:
        log_error(f"Failed to create connection pool: {e}")
        sys.exit(1)


async def insert_metrics_batch(pool: asyncpg.Pool, batch_size: int) -> float:
    """Insert batch of metrics and return time taken"""
    async with pool.acquire() as conn:
        start_time = time.time()

        # Generate batch data
        data = []
        for _ in range(batch_size):
            data.append((
                datetime.utcnow(),
                random.choice(['gpt-4', 'gpt-3.5-turbo', 'claude-3', 'claude-2']),
                random.choice(['openai', 'anthropic']),
                random.randint(1, 100),
                random.randint(100, 10000),
                random.randint(100, 10000),
                random.randint(200, 20000),
                round(random.uniform(0.001, 0.5), 6),
                round(random.uniform(50, 500), 2),
                random.randint(0, 10),
                random.randint(90, 100),
                random.choice(['user-1', 'user-2', 'user-3']),
                random.choice(['app-1', 'app-2', 'app-3']),
                random.choice(['dev', 'staging', 'prod'])
            ))

        # Batch insert
        await conn.executemany('''
            INSERT INTO llm_usage_metrics (
                time, model_id, provider, request_count,
                token_input, token_output, token_total,
                cost_usd, avg_latency_ms, error_count,
                success_count, user_id, application_id, environment
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
        ''', data)

        return time.time() - start_time


async def query_metrics(pool: asyncpg.Pool) -> float:
    """Execute query and return time taken"""
    async with pool.acquire() as conn:
        start_time = time.time()

        await conn.fetch('''
            SELECT
                model_id,
                provider,
                SUM(request_count) as total_requests,
                SUM(token_total) as total_tokens,
                SUM(cost_usd) as total_cost,
                AVG(avg_latency_ms) as avg_latency
            FROM llm_usage_metrics
            WHERE time >= NOW() - INTERVAL '1 hour'
            GROUP BY model_id, provider
            ORDER BY total_requests DESC
            LIMIT 10
        ''')

        return time.time() - start_time


async def run_insert_load_test(pool: asyncpg.Pool) -> Dict:
    """Run insert load test"""
    log_info("Running insert load test...")

    tasks = []
    batch_size = 100

    start_time = time.time()

    # Create concurrent insert tasks
    for _ in range(NUM_CONNECTIONS):
        for _ in range(INSERTS_PER_CONNECTION // batch_size):
            task = asyncio.create_task(insert_metrics_batch(pool, batch_size))
            tasks.append(task)

    # Wait for all tasks
    times = await asyncio.gather(*tasks, return_exceptions=True)

    # Filter out exceptions
    valid_times = [t for t in times if isinstance(t, (int, float))]

    end_time = time.time()
    total_time = end_time - start_time

    total_inserts = NUM_CONNECTIONS * INSERTS_PER_CONNECTION
    inserts_per_sec = total_inserts / total_time

    return {
        'total_inserts': total_inserts,
        'total_time': total_time,
        'inserts_per_sec': inserts_per_sec,
        'avg_batch_time': statistics.mean(valid_times) if valid_times else 0,
        'p95_batch_time': statistics.quantiles(valid_times, n=20)[18] if len(valid_times) > 20 else 0,
        'p99_batch_time': statistics.quantiles(valid_times, n=100)[98] if len(valid_times) > 100 else 0
    }


async def run_query_load_test(pool: asyncpg.Pool) -> Dict:
    """Run query load test"""
    log_info("Running query load test...")

    tasks = []
    num_queries = 1000

    start_time = time.time()

    # Create concurrent query tasks
    for _ in range(num_queries):
        task = asyncio.create_task(query_metrics(pool))
        tasks.append(task)

    # Wait for all tasks
    times = await asyncio.gather(*tasks, return_exceptions=True)

    # Filter out exceptions
    valid_times = [t for t in times if isinstance(t, (int, float))]

    end_time = time.time()
    total_time = end_time - start_time

    queries_per_sec = num_queries / total_time

    return {
        'total_queries': num_queries,
        'total_time': total_time,
        'queries_per_sec': queries_per_sec,
        'avg_query_time': statistics.mean(valid_times) * 1000 if valid_times else 0,  # Convert to ms
        'p95_query_time': statistics.quantiles(valid_times, n=20)[18] * 1000 if len(valid_times) > 20 else 0,
        'p99_query_time': statistics.quantiles(valid_times, n=100)[98] * 1000 if len(valid_times) > 100 else 0
    }


async def test_concurrent_connections(pool: asyncpg.Pool) -> Dict:
    """Test concurrent connection handling"""
    log_info("Testing concurrent connections...")

    max_connections = NUM_CONNECTIONS
    connections = []

    try:
        start_time = time.time()

        # Acquire connections
        for _ in range(max_connections):
            conn = await pool.acquire()
            connections.append(conn)

        acquisition_time = time.time() - start_time

        # Execute query on each connection
        tasks = []
        for conn in connections:
            task = asyncio.create_task(conn.fetchval('SELECT 1'))
            tasks.append(task)

        await asyncio.gather(*tasks)

        return {
            'max_connections': max_connections,
            'acquisition_time': acquisition_time,
            'status': 'success'
        }

    finally:
        # Release all connections
        for conn in connections:
            await pool.release(conn)


async def main():
    """Main load test execution"""
    log_info("=" * 50)
    log_info("TimescaleDB Load Test")
    log_info("=" * 50)

    # Create connection pool
    log_info(f"Connecting to {DB_HOST}:{DB_PORT}/{DB_NAME}...")
    pool = await create_connection_pool()
    log_success("Connection pool created")

    try:
        # Run insert load test
        insert_results = await run_insert_load_test(pool)

        log_success("Insert Load Test Results:")
        print(f"  Total Inserts:      {insert_results['total_inserts']:,}")
        print(f"  Total Time:         {insert_results['total_time']:.2f}s")
        print(f"  Inserts/sec:        {insert_results['inserts_per_sec']:,.0f}")
        print(f"  Avg Batch Time:     {insert_results['avg_batch_time']*1000:.2f}ms")
        print(f"  P95 Batch Time:     {insert_results['p95_batch_time']*1000:.2f}ms")
        print(f"  P99 Batch Time:     {insert_results['p99_batch_time']*1000:.2f}ms")
        print()

        # Run query load test
        query_results = await run_query_load_test(pool)

        log_success("Query Load Test Results:")
        print(f"  Total Queries:      {query_results['total_queries']:,}")
        print(f"  Total Time:         {query_results['total_time']:.2f}s")
        print(f"  Queries/sec:        {query_results['queries_per_sec']:,.0f}")
        print(f"  Avg Query Time:     {query_results['avg_query_time']:.2f}ms")
        print(f"  P95 Query Time:     {query_results['p95_query_time']:.2f}ms")
        print(f"  P99 Query Time:     {query_results['p99_query_time']:.2f}ms")
        print()

        # Test concurrent connections
        conn_results = await test_concurrent_connections(pool)

        log_success("Concurrent Connection Test Results:")
        print(f"  Max Connections:    {conn_results['max_connections']}")
        print(f"  Acquisition Time:   {conn_results['acquisition_time']:.2f}s")
        print(f"  Status:             {conn_results['status']}")
        print()

        # Performance assessment
        log_info("Performance Assessment:")

        if insert_results['inserts_per_sec'] >= 100000:
            log_success("  Insert Throughput:  EXCELLENT (>=100k/sec)")
        elif insert_results['inserts_per_sec'] >= 50000:
            log_success("  Insert Throughput:  GOOD (>=50k/sec)")
        else:
            log_error("  Insert Throughput:  NEEDS IMPROVEMENT (<50k/sec)")

        if query_results['p95_query_time'] < 100:
            log_success("  Query Latency:      EXCELLENT (P95 <100ms)")
        elif query_results['p95_query_time'] < 200:
            log_success("  Query Latency:      GOOD (P95 <200ms)")
        else:
            log_error("  Query Latency:      NEEDS IMPROVEMENT (P95 >=200ms)")

        if conn_results['max_connections'] >= 1000:
            log_success("  Concurrency:        EXCELLENT (>=1000 conns)")
        elif conn_results['max_connections'] >= 500:
            log_success("  Concurrency:        GOOD (>=500 conns)")
        else:
            log_error("  Concurrency:        NEEDS IMPROVEMENT (<500 conns)")

    finally:
        await pool.close()
        log_info("Connection pool closed")

    log_success("=" * 50)
    log_success("Load test completed")
    log_success("=" * 50)


if __name__ == "__main__":
    asyncio.run(main())
