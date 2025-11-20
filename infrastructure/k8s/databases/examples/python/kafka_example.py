#!/usr/bin/env python3
"""
Kafka Connection Example for Python
Demonstrates event streaming, producer, and consumer patterns
"""

import asyncio
import json
from datetime import datetime
from typing import Optional, Callable, Dict, Any
import logging
from aiokafka import AIOKafkaProducer, AIOKafkaConsumer
from aiokafka.errors import KafkaError

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


class KafkaClient:
    """Kafka client for event streaming"""

    def __init__(
        self,
        bootstrap_servers: str = "kafka.llm-analytics.svc.cluster.local:9092",
        client_id: str = "llm-analytics-client"
    ):
        self.bootstrap_servers = bootstrap_servers
        self.client_id = client_id
        self.producer: Optional[AIOKafkaProducer] = None
        self.consumers: Dict[str, AIOKafkaConsumer] = {}

    async def create_producer(self):
        """Create Kafka producer"""
        try:
            self.producer = AIOKafkaProducer(
                bootstrap_servers=self.bootstrap_servers,
                client_id=self.client_id,
                value_serializer=lambda v: json.dumps(v).encode('utf-8'),
                compression_type='gzip',
                acks='all',
                retries=3
            )
            await self.producer.start()
            logger.info(f"Kafka producer started: {self.bootstrap_servers}")

        except Exception as e:
            logger.error(f"Failed to create producer: {e}")
            raise

    async def create_consumer(
        self,
        topic: str,
        group_id: str = "llm-analytics-group",
        auto_offset_reset: str = "latest"
    ) -> AIOKafkaConsumer:
        """Create Kafka consumer"""
        try:
            consumer = AIOKafkaConsumer(
                topic,
                bootstrap_servers=self.bootstrap_servers,
                client_id=self.client_id,
                group_id=group_id,
                value_deserializer=lambda v: json.loads(v.decode('utf-8')),
                auto_offset_reset=auto_offset_reset,
                enable_auto_commit=True
            )
            await consumer.start()
            self.consumers[topic] = consumer
            logger.info(f"Kafka consumer started for topic: {topic}")
            return consumer

        except Exception as e:
            logger.error(f"Failed to create consumer: {e}")
            raise

    async def close(self):
        """Close all connections"""
        if self.producer:
            await self.producer.stop()
            logger.info("Producer stopped")

        for topic, consumer in self.consumers.items():
            await consumer.stop()
            logger.info(f"Consumer stopped for topic: {topic}")

    # Producer methods
    async def publish_event(
        self,
        topic: str,
        event: Dict[str, Any],
        key: Optional[str] = None
    ) -> bool:
        """Publish event to topic"""
        if not self.producer:
            raise RuntimeError("Producer not initialized")

        try:
            key_bytes = key.encode('utf-8') if key else None

            await self.producer.send(
                topic,
                value=event,
                key=key_bytes
            )

            logger.debug(f"Published event to {topic}")
            return True

        except KafkaError as e:
            logger.error(f"Failed to publish event: {e}")
            return False

    async def publish_llm_event(
        self,
        model_id: str,
        provider: str,
        event_type: str,
        user_id: str,
        request_id: str,
        prompt_tokens: int,
        completion_tokens: int,
        latency_ms: float,
        cost_usd: float,
        status: str = "success",
        metadata: Optional[Dict] = None
    ) -> bool:
        """Publish LLM usage event"""
        event = {
            'timestamp': datetime.utcnow().isoformat(),
            'event_type': event_type,
            'model_id': model_id,
            'provider': provider,
            'user_id': user_id,
            'request_id': request_id,
            'prompt_tokens': prompt_tokens,
            'completion_tokens': completion_tokens,
            'total_tokens': prompt_tokens + completion_tokens,
            'latency_ms': latency_ms,
            'cost_usd': cost_usd,
            'status': status,
            'metadata': metadata or {}
        }

        return await self.publish_event(
            topic='llm-events',
            event=event,
            key=request_id
        )

    async def publish_metric(
        self,
        metric_name: str,
        metric_value: float,
        tags: Optional[Dict] = None
    ) -> bool:
        """Publish metric event"""
        event = {
            'timestamp': datetime.utcnow().isoformat(),
            'metric_name': metric_name,
            'metric_value': metric_value,
            'tags': tags or {}
        }

        return await self.publish_event(
            topic='llm-metrics',
            event=event
        )

    async def publish_alert(
        self,
        alert_type: str,
        severity: str,
        message: str,
        details: Optional[Dict] = None
    ) -> bool:
        """Publish alert event"""
        event = {
            'timestamp': datetime.utcnow().isoformat(),
            'alert_type': alert_type,
            'severity': severity,
            'message': message,
            'details': details or {}
        }

        return await self.publish_event(
            topic='llm-alerts',
            event=event
        )

    # Consumer methods
    async def consume_events(
        self,
        topic: str,
        handler: Callable[[Dict], None],
        group_id: str = "llm-analytics-group"
    ):
        """Consume events from topic with handler"""
        consumer = await self.create_consumer(topic, group_id)

        try:
            async for message in consumer:
                try:
                    event = message.value
                    await handler(event)

                except Exception as e:
                    logger.error(f"Error processing event: {e}")

        except Exception as e:
            logger.error(f"Consumer error: {e}")

    async def consume_llm_events(
        self,
        handler: Callable[[Dict], None]
    ):
        """Consume LLM events"""
        await self.consume_events('llm-events', handler)

    async def consume_metrics(
        self,
        handler: Callable[[Dict], None]
    ):
        """Consume metric events"""
        await self.consume_events('llm-metrics', handler)


# Example event handlers
async def handle_llm_event(event: Dict):
    """Example LLM event handler"""
    logger.info(f"Received LLM event: {event['event_type']}")
    logger.info(f"  Model: {event['model_id']}")
    logger.info(f"  Tokens: {event['total_tokens']}")
    logger.info(f"  Latency: {event['latency_ms']}ms")
    logger.info(f"  Cost: ${event['cost_usd']:.4f}")


async def handle_metric_event(event: Dict):
    """Example metric event handler"""
    logger.info(f"Received metric: {event['metric_name']} = {event['metric_value']}")


async def producer_example():
    """Example producer usage"""
    print("\n=== Producer Example ===")

    client = KafkaClient()

    try:
        await client.create_producer()

        # Publish LLM event
        await client.publish_llm_event(
            model_id="gpt-4",
            provider="openai",
            event_type="completion",
            user_id="user-123",
            request_id="req-456",
            prompt_tokens=500,
            completion_tokens=200,
            latency_ms=1200.5,
            cost_usd=0.03,
            metadata={"application": "chatbot"}
        )
        print("Published LLM event")

        # Publish metric
        await client.publish_metric(
            metric_name="request_latency",
            metric_value=150.5,
            tags={"model": "gpt-4", "provider": "openai"}
        )
        print("Published metric")

        # Publish alert
        await client.publish_alert(
            alert_type="high_cost",
            severity="warning",
            message="Cost threshold exceeded",
            details={"cost": 100.50, "threshold": 100.00}
        )
        print("Published alert")

        # Ensure all messages are sent
        await client.producer.flush()

    finally:
        await client.close()


async def consumer_example():
    """Example consumer usage"""
    print("\n=== Consumer Example ===")

    client = KafkaClient()

    try:
        await client.create_producer()

        # Produce some test events
        for i in range(5):
            await client.publish_llm_event(
                model_id=f"model-{i}",
                provider="openai",
                event_type="completion",
                user_id=f"user-{i}",
                request_id=f"req-{i}",
                prompt_tokens=100 * i,
                completion_tokens=50 * i,
                latency_ms=100.0 + i * 10,
                cost_usd=0.01 * i
            )

        await client.producer.flush()
        print("Published 5 test events")

        # Consume events (with timeout for example)
        print("Consuming events...")

        consumer = await client.create_consumer(
            topic='llm-events',
            group_id='example-consumer',
            auto_offset_reset='earliest'
        )

        count = 0
        async for message in consumer:
            event = message.value
            await handle_llm_event(event)
            count += 1

            if count >= 5:
                break

    finally:
        await client.close()


async def main():
    """Main example"""
    print("=== Kafka Example ===")

    # Run producer example
    await producer_example()

    # Run consumer example
    await consumer_example()

    print("\n=== Example completed ===")


if __name__ == "__main__":
    asyncio.run(main())
