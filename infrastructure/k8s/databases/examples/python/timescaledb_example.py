#!/usr/bin/env python3
"""
TimescaleDB Connection Example for Python
Demonstrates connection pooling, queries, and error handling
"""

import asyncio
import asyncpg
from datetime import datetime
from typing import Optional, List, Dict
import logging

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


class TimescaleDBClient:
    """TimescaleDB client with connection pooling and error handling"""

    def __init__(
        self,
        host: str = "timescaledb.llm-analytics.svc.cluster.local",
        port: int = 5432,
        database: str = "analytics",
        user: str = "postgres",
        password: str = "postgres",
        min_pool_size: int = 10,
        max_pool_size: int = 20
    ):
        self.host = host
        self.port = port
        self.database = database
        self.user = user
        self.password = password
        self.min_pool_size = min_pool_size
        self.max_pool_size = max_pool_size
        self.pool: Optional[asyncpg.Pool] = None

    async def connect(self):
        """Create connection pool"""
        try:
            self.pool = await asyncpg.create_pool(
                host=self.host,
                port=self.port,
                database=self.database,
                user=self.user,
                password=self.password,
                min_size=self.min_pool_size,
                max_size=self.max_pool_size,
                command_timeout=60
            )
            logger.info(f"Connected to TimescaleDB at {self.host}:{self.port}")
        except Exception as e:
            logger.error(f"Failed to connect to TimescaleDB: {e}")
            raise

    async def disconnect(self):
        """Close connection pool"""
        if self.pool:
            await self.pool.close()
            logger.info("Disconnected from TimescaleDB")

    async def insert_usage_metric(
        self,
        model_id: str,
        provider: str,
        request_count: int = 1,
        token_input: int = 0,
        token_output: int = 0,
        cost_usd: float = 0.0,
        latency_ms: float = 0.0,
        user_id: Optional[str] = None,
        application_id: Optional[str] = None,
        environment: str = "production"
    ) -> bool:
        """Insert LLM usage metric"""
        if not self.pool:
            raise RuntimeError("Not connected to database")

        try:
            async with self.pool.acquire() as conn:
                await conn.execute('''
                    INSERT INTO llm_usage_metrics (
                        time, model_id, provider, request_count,
                        token_input, token_output, token_total,
                        cost_usd, avg_latency_ms, error_count,
                        success_count, user_id, application_id, environment
                    ) VALUES (
                        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14
                    )
                ''',
                    datetime.utcnow(),
                    model_id,
                    provider,
                    request_count,
                    token_input,
                    token_output,
                    token_input + token_output,
                    cost_usd,
                    latency_ms,
                    0,  # error_count
                    request_count,  # success_count
                    user_id,
                    application_id,
                    environment
                )

            logger.info(f"Inserted metric for {model_id}")
            return True

        except Exception as e:
            logger.error(f"Failed to insert metric: {e}")
            return False

    async def get_usage_summary(
        self,
        hours: int = 24,
        model_id: Optional[str] = None
    ) -> List[Dict]:
        """Get usage summary for specified time period"""
        if not self.pool:
            raise RuntimeError("Not connected to database")

        try:
            async with self.pool.acquire() as conn:
                query = '''
                    SELECT
                        model_id,
                        provider,
                        SUM(request_count) as total_requests,
                        SUM(token_input) as total_input_tokens,
                        SUM(token_output) as total_output_tokens,
                        SUM(token_total) as total_tokens,
                        SUM(cost_usd) as total_cost,
                        AVG(avg_latency_ms) as avg_latency,
                        SUM(error_count) as total_errors
                    FROM llm_usage_metrics
                    WHERE time >= NOW() - INTERVAL '{} hours'
                '''.format(hours)

                if model_id:
                    query += f" AND model_id = '{model_id}'"

                query += '''
                    GROUP BY model_id, provider
                    ORDER BY total_requests DESC
                '''

                rows = await conn.fetch(query)

                results = []
                for row in rows:
                    results.append({
                        'model_id': row['model_id'],
                        'provider': row['provider'],
                        'total_requests': row['total_requests'],
                        'total_input_tokens': row['total_input_tokens'],
                        'total_output_tokens': row['total_output_tokens'],
                        'total_tokens': row['total_tokens'],
                        'total_cost': float(row['total_cost']),
                        'avg_latency': float(row['avg_latency']),
                        'total_errors': row['total_errors']
                    })

                return results

        except Exception as e:
            logger.error(f"Failed to get usage summary: {e}")
            return []

    async def get_cost_by_department(self, hours: int = 24) -> List[Dict]:
        """Get cost breakdown by department"""
        if not self.pool:
            raise RuntimeError("Not connected to database")

        try:
            async with self.pool.acquire() as conn:
                rows = await conn.fetch('''
                    SELECT
                        department,
                        SUM(amount_usd) as total_cost,
                        COUNT(*) as transaction_count
                    FROM cost_analytics
                    WHERE time >= NOW() - INTERVAL '{} hours'
                    GROUP BY department
                    ORDER BY total_cost DESC
                '''.format(hours))

                results = []
                for row in rows:
                    results.append({
                        'department': row['department'],
                        'total_cost': float(row['total_cost']),
                        'transaction_count': row['transaction_count']
                    })

                return results

        except Exception as e:
            logger.error(f"Failed to get cost by department: {e}")
            return []


async def main():
    """Example usage"""
    # Create client
    client = TimescaleDBClient(
        host="timescaledb.llm-analytics.svc.cluster.local",
        database="analytics",
        min_pool_size=5,
        max_pool_size=10
    )

    try:
        # Connect
        await client.connect()

        # Insert sample metric
        await client.insert_usage_metric(
            model_id="gpt-4",
            provider="openai",
            request_count=1,
            token_input=500,
            token_output=200,
            cost_usd=0.03,
            latency_ms=1200.5,
            user_id="user-123",
            application_id="app-456",
            environment="production"
        )

        # Get usage summary
        summary = await client.get_usage_summary(hours=24)
        for item in summary:
            print(f"Model: {item['model_id']}")
            print(f"  Requests: {item['total_requests']}")
            print(f"  Tokens: {item['total_tokens']:,}")
            print(f"  Cost: ${item['total_cost']:.2f}")
            print(f"  Avg Latency: {item['avg_latency']:.2f}ms")
            print()

    finally:
        # Disconnect
        await client.disconnect()


if __name__ == "__main__":
    asyncio.run(main())
