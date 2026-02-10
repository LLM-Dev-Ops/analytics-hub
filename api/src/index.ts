/**
 * LLM Analytics Hub - API Server
 *
 * Main entry point for the TypeScript API server.
 * Provides REST and WebSocket endpoints for analytics data.
 */

import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { config } from './config';
import { registerRoutes } from './routes';
import { setupDatabase } from './database';
import { setupRedis } from './cache';
import { setupKafka } from './kafka';
import { setupMetrics } from './metrics';
import { logger } from './logger';
import executionContextPlugin from './execution/fastify-plugin';

async function buildServer() {
  const fastify = Fastify({
    logger: true,
    requestIdLogLabel: 'requestId',
    disableRequestLogging: false,
    trustProxy: true,
  });

  // Register plugins
  await fastify.register(helmet, {
    contentSecurityPolicy: false, // Disable for development
  });

  await fastify.register(cors, {
    origin: config.cors.origin,
    credentials: true,
  });

  await fastify.register(rateLimit, {
    max: config.rateLimit.max,
    timeWindow: config.rateLimit.timeWindow,
  });

  // Swagger documentation
  await fastify.register(swagger, {
    openapi: {
      info: {
        title: 'LLM Analytics Hub API',
        description: 'Centralized analytics API for LLM ecosystem monitoring',
        version: '0.1.0',
      },
      servers: [
        {
          url: `http://localhost:${config.port}`,
          description: 'Development server',
        },
      ],
      tags: [
        { name: 'events', description: 'Event ingestion and retrieval' },
        { name: 'metrics', description: 'Metrics aggregation and querying' },
        { name: 'analytics', description: 'Advanced analytics and predictions' },
        { name: 'health', description: 'Health checks and monitoring' },
      ],
    },
  });

  await fastify.register(swaggerUi, {
    routePrefix: '/documentation',
    uiConfig: {
      docExpansion: 'list',
      deepLinking: false,
    },
  });

  // Agentics execution context — must be registered before routes
  await fastify.register(executionContextPlugin);

  // Initialize infrastructure (optional - skip if not explicitly configured)
  let db = null;
  let redis = null;
  let kafka = null;

  // Only connect to database if explicitly configured (not localhost default)
  if (process.env.DB_HOST && process.env.DB_HOST !== 'localhost') {
    try {
      db = await setupDatabase();
      fastify.log.info('Database connected');
    } catch (err) {
      fastify.log.warn({ err }, 'Database connection failed - running without database');
    }
  } else {
    fastify.log.info('Database not configured - running without database');
  }
  fastify.decorate('db', db as any);

  // Only connect to Redis if explicitly configured (not localhost default)
  if (process.env.REDIS_HOST && process.env.REDIS_HOST !== 'localhost') {
    try {
      redis = await setupRedis();
      fastify.log.info('Redis connected');
    } catch (err) {
      fastify.log.warn({ err }, 'Redis connection failed - running without cache');
    }
  } else {
    fastify.log.info('Redis not configured - running without cache');
  }
  fastify.decorate('redis', redis as any);

  // Only connect to Kafka if explicitly configured (not localhost default)
  if (process.env.KAFKA_BROKERS && !process.env.KAFKA_BROKERS.includes('localhost')) {
    try {
      kafka = await setupKafka();
      fastify.log.info('Kafka connected');
    } catch (err) {
      fastify.log.warn({ err }, 'Kafka connection failed - running without message queue');
    }
  } else {
    fastify.log.info('Kafka not configured - running without message queue');
  }
  fastify.decorate('kafka', kafka as any);

  const metrics = setupMetrics();
  fastify.decorate('metrics', metrics);

  // Register routes
  registerRoutes(fastify);

  // Health check endpoint
  fastify.get('/health', async () => {
    return {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      version: '0.1.0',
      services: {
        database: db ? await db.healthCheck() : 'not configured',
        redis: redis ? await redis.ping() : 'not configured',
        kafka: kafka ? true : 'not configured',
      },
    };
  });

  // Readiness check
  fastify.get('/ready', async () => {
    return {
      ready: true,
      timestamp: new Date().toISOString(),
    };
  });

  // Metrics endpoint (Prometheus)
  fastify.get('/metrics', async (_, reply) => {
    reply.type('text/plain');
    return metrics.register.metrics();
  });

  return fastify;
}

async function start() {
  try {
    const fastify = await buildServer();

    await fastify.listen({
      port: config.port,
      host: config.host,
    });

    logger.info(`Server listening on ${config.host}:${config.port}`);
    logger.info(`Swagger documentation: http://${config.host}:${config.port}/documentation`);

    // Graceful shutdown
    const signals = ['SIGINT', 'SIGTERM'];
    signals.forEach((signal) => {
      process.on(signal, async () => {
        logger.info(`Received ${signal}, shutting down gracefully`);
        await fastify.close();
        process.exit(0);
      });
    });
  } catch (err) {
    logger.error(err);
    process.exit(1);
  }
}

if (require.main === module) {
  start();
}

export { buildServer, start };
