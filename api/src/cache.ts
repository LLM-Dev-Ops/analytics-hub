/**
 * Redis cache management
 */

import { createClient, RedisClientType, createCluster, RedisClusterType } from 'redis';
import { config } from './config';
import { logger } from './logger';

type RedisClient = RedisClientType | RedisClusterType;

export class CacheManager {
  private client: RedisClient;

  constructor(client: RedisClient) {
    this.client = client;
  }

  async get<T = any>(key: string): Promise<T | null> {
    try {
      const value = await this.client.get(key);
      return value ? JSON.parse(value) : null;
    } catch (err) {
      logger.error({ err, key }, 'Cache get error');
      return null;
    }
  }

  async set(key: string, value: any, ttl?: number): Promise<void> {
    try {
      const serialized = JSON.stringify(value);
      if (ttl) {
        await this.client.setEx(key, ttl, serialized);
      } else {
        await this.client.set(key, serialized);
      }
    } catch (err) {
      logger.error({ err, key }, 'Cache set error');
    }
  }

  async del(key: string): Promise<void> {
    try {
      await this.client.del(key);
    } catch (err) {
      logger.error({ err, key }, 'Cache delete error');
    }
  }

  async delPattern(pattern: string): Promise<number> {
    try {
      const keys = await this.client.keys(pattern);
      if (keys.length > 0) {
        await this.client.del(keys);
      }
      return keys.length;
    } catch (err) {
      logger.error({ err, pattern }, 'Cache pattern delete error');
      return 0;
    }
  }

  async increment(key: string, amount: number = 1): Promise<number> {
    try {
      return await this.client.incrBy(key, amount);
    } catch (err) {
      logger.error({ err, key }, 'Cache increment error');
      return 0;
    }
  }

  async ping(): Promise<boolean> {
    try {
      const result = await this.client.ping();
      return result === 'PONG';
    } catch {
      return false;
    }
  }

  async close(): Promise<void> {
    await this.client.quit();
  }

  // Cache key generators
  static metricKey(metricName: string, window: string): string {
    return `metrics:${metricName}:${window}`;
  }

  static eventKey(eventId: string): string {
    return `event:${eventId}`;
  }

  static predictionKey(metricName: string): string {
    return `prediction:${metricName}`;
  }
}

export async function setupRedis(): Promise<CacheManager> {
  let client: RedisClient;

  if (config.redis.cluster) {
    client = createCluster({
      rootNodes: config.redis.nodes,
      defaults: {
        password: config.redis.password,
      },
    });
  } else {
    client = createClient({
      socket: {
        host: config.redis.host,
        port: config.redis.port,
      },
      password: config.redis.password,
      database: config.redis.db,
    });
  }

  client.on('error', (err) => {
    logger.error({ err }, 'Redis error');
  });

  await client.connect();
  logger.info('Redis connected successfully');

  return new CacheManager(client);
}
