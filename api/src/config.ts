/**
 * Configuration management
 */

import dotenv from 'dotenv';

dotenv.config();

export const config = {
  // Server configuration
  port: parseInt(process.env.PORT || '3000', 10),
  host: process.env.HOST || '0.0.0.0',
  env: process.env.NODE_ENV || 'development',

  // Database configuration (TimescaleDB)
  database: {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    database: process.env.DB_NAME || 'llm_analytics',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
    max: parseInt(process.env.DB_POOL_MAX || '20', 10),
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
  },

  // Redis configuration
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD,
    db: parseInt(process.env.REDIS_DB || '0', 10),
    cluster: process.env.REDIS_CLUSTER === 'true',
    nodes: process.env.REDIS_NODES
      ? process.env.REDIS_NODES.split(',').map((node) => {
          const [host, port] = node.split(':');
          return { host, port: parseInt(port, 10) };
        })
      : [],
  },

  // Kafka configuration
  kafka: {
    brokers: process.env.KAFKA_BROKERS
      ? process.env.KAFKA_BROKERS.split(',')
      : ['localhost:9092'],
    clientId: 'llm-analytics-hub-api',
    groupId: 'llm-analytics-hub-api-group',
    topic: process.env.KAFKA_TOPIC || 'llm-analytics-events',
  },

  // CORS configuration
  cors: {
    origin: process.env.CORS_ORIGIN || '*',
  },

  // Rate limiting
  rateLimit: {
    max: parseInt(process.env.RATE_LIMIT_MAX || '100', 10),
    timeWindow: process.env.RATE_LIMIT_WINDOW || '1 minute',
  },

  // Logging
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    prettyPrint: process.env.NODE_ENV === 'development',
  },

  // Pagination
  pagination: {
    defaultLimit: parseInt(process.env.DEFAULT_PAGE_SIZE || '50', 10),
    maxLimit: parseInt(process.env.MAX_PAGE_SIZE || '1000', 10),
  },

  // Cache TTL (seconds)
  cache: {
    metrics: parseInt(process.env.CACHE_METRICS_TTL || '300', 10), // 5 minutes
    events: parseInt(process.env.CACHE_EVENTS_TTL || '60', 10), // 1 minute
    predictions: parseInt(process.env.CACHE_PREDICTIONS_TTL || '600', 10), // 10 minutes
  },
};
