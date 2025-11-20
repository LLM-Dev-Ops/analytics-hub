/**
 * Kafka producer and consumer setup
 */

import { Kafka, Producer, Consumer, EachMessagePayload } from 'kafkajs';
import { config } from './config';
import { logger } from './logger';

export class KafkaManager {
  private kafka: Kafka;
  private producer: Producer;
  private consumer?: Consumer;

  constructor(kafka: Kafka, producer: Producer) {
    this.kafka = kafka;
    this.producer = producer;
  }

  async publishEvent(event: any): Promise<void> {
    try {
      await this.producer.send({
        topic: config.kafka.topic,
        messages: [
          {
            key: event.event_id,
            value: JSON.stringify(event),
            headers: {
              'content-type': 'application/json',
              'schema-version': event.schema_version,
            },
          },
        ],
      });
      logger.debug({ eventId: event.event_id }, 'Event published to Kafka');
    } catch (err) {
      logger.error({ err, event }, 'Failed to publish event to Kafka');
      throw err;
    }
  }

  async publishBatch(events: any[]): Promise<void> {
    try {
      await this.producer.send({
        topic: config.kafka.topic,
        messages: events.map((event) => ({
          key: event.event_id,
          value: JSON.stringify(event),
          headers: {
            'content-type': 'application/json',
            'schema-version': event.schema_version,
          },
        })),
      });
      logger.debug({ count: events.length }, 'Batch published to Kafka');
    } catch (err) {
      logger.error({ err, count: events.length }, 'Failed to publish batch to Kafka');
      throw err;
    }
  }

  async startConsumer(
    groupId: string,
    onMessage: (payload: EachMessagePayload) => Promise<void>
  ): Promise<void> {
    this.consumer = this.kafka.consumer({ groupId });

    await this.consumer.connect();
    await this.consumer.subscribe({
      topic: config.kafka.topic,
      fromBeginning: false,
    });

    await this.consumer.run({
      eachMessage: onMessage,
    });

    logger.info({ groupId }, 'Kafka consumer started');
  }

  async disconnect(): Promise<void> {
    await this.producer.disconnect();
    if (this.consumer) {
      await this.consumer.disconnect();
    }
    logger.info('Kafka disconnected');
  }
}

export async function setupKafka(): Promise<KafkaManager> {
  const kafka = new Kafka({
    clientId: config.kafka.clientId,
    brokers: config.kafka.brokers,
    retry: {
      retries: 5,
      initialRetryTime: 300,
      maxRetryTime: 30000,
    },
  });

  const producer = kafka.producer({
    allowAutoTopicCreation: true,
    transactionalId: 'llm-analytics-hub-transactions',
  });

  await producer.connect();
  logger.info('Kafka producer connected');

  return new KafkaManager(kafka, producer);
}
