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

  // Initialize infrastructure (optional - gracefully handle missing services)
  let db = null;
  let redis = null;
  let kafka = null;

  try {
    db = await setupDatabase();
    fastify.decorate('db', db);
  } catch (err) {
    fastify.log.warn('Database connection not available - running without database');
    fastify.decorate('db', null);
  }

  try {
    redis = await setupRedis();
    fastify.decorate('redis', redis);
  } catch (err) {
    fastify.log.warn('Redis connection not available - running without cache');
    fastify.decorate('redis', null);
  }

  try {
    kafka = await setupKafka();
    fastify.decorate('kafka', kafka);
  } catch (err) {
    fastify.log.warn('Kafka connection not available - running without message queue');
    fastify.decorate('kafka', null);
  }

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
