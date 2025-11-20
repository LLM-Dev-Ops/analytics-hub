/**
 * Database connection and query utilities (TimescaleDB/PostgreSQL)
 */

import { Pool, PoolClient, QueryResult } from 'pg';
import { config } from './config';
import { logger } from './logger';

let pool: Pool;

export async function setupDatabase(): Promise<Database> {
  pool = new Pool(config.database);

  pool.on('error', (err) => {
    logger.error({ err }, 'Unexpected database error');
  });

  // Test connection
  try {
    const client = await pool.connect();
    await client.query('SELECT NOW()');
    client.release();
    logger.info('Database connected successfully');
  } catch (err) {
    logger.error({ err }, 'Failed to connect to database');
    throw err;
  }

  return new Database(pool);
}

export class Database {
  constructor(private pool: Pool) {}

  async query<T = any>(text: string, params?: any[]): Promise<QueryResult<T>> {
    const start = Date.now();
    try {
      const result = await this.pool.query<T>(text, params);
      const duration = Date.now() - start;
      logger.debug({ text, duration, rows: result.rowCount }, 'Query executed');
      return result;
    } catch (err) {
      logger.error({ err, text, params }, 'Query error');
      throw err;
    }
  }

  async getClient(): Promise<PoolClient> {
    return this.pool.connect();
  }

  async transaction<T>(callback: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await callback(client);
      await client.query('COMMIT');
      return result;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
      await this.query('SELECT 1');
      return true;
    } catch {
      return false;
    }
  }

  async close(): Promise<void> {
    await this.pool.end();
  }

  // Event queries
  async insertEvent(event: any): Promise<void> {
    await this.query(
      `INSERT INTO analytics_events
       (event_id, timestamp, source_module, event_type, correlation_id,
        parent_event_id, schema_version, severity, environment, tags, payload)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       ON CONFLICT (event_id) DO NOTHING`,
      [
        event.event_id,
        event.timestamp,
        event.source_module,
        event.event_type,
        event.correlation_id,
        event.parent_event_id,
        event.schema_version,
        event.severity,
        event.environment,
        JSON.stringify(event.tags),
        JSON.stringify(event.payload),
      ]
    );
  }

  async queryEvents(
    startTime: Date,
    endTime: Date,
    filters: {
      sourceModule?: string;
      eventType?: string;
      severity?: string;
      limit?: number;
      offset?: number;
    }
  ): Promise<any[]> {
    let query = `
      SELECT * FROM analytics_events
      WHERE timestamp >= $1 AND timestamp <= $2
    `;
    const params: any[] = [startTime, endTime];
    let paramIndex = 3;

    if (filters.sourceModule) {
      query += ` AND source_module = $${paramIndex}`;
      params.push(filters.sourceModule);
      paramIndex++;
    }

    if (filters.eventType) {
      query += ` AND event_type = $${paramIndex}`;
      params.push(filters.eventType);
      paramIndex++;
    }

    if (filters.severity) {
      query += ` AND severity = $${paramIndex}`;
      params.push(filters.severity);
      paramIndex++;
    }

    query += ` ORDER BY timestamp DESC`;

    if (filters.limit) {
      query += ` LIMIT $${paramIndex}`;
      params.push(filters.limit);
      paramIndex++;
    }

    if (filters.offset) {
      query += ` OFFSET $${paramIndex}`;
      params.push(filters.offset);
    }

    const result = await this.query(query, params);
    return result.rows;
  }

  // Metrics queries
  async getAggregatedMetrics(
    metricName: string,
    window: string,
    startTime: Date,
    endTime: Date
  ): Promise<any[]> {
    const result = await this.query(
      `SELECT * FROM aggregated_metrics
       WHERE metric_name = $1 AND window_size = $2
       AND timestamp >= $3 AND timestamp <= $4
       ORDER BY timestamp DESC`,
      [metricName, window, startTime, endTime]
    );
    return result.rows;
  }

  async getEventCountsByModule(startTime: Date, endTime: Date): Promise<any[]> {
    const result = await this.query(
      `SELECT source_module, COUNT(*) as count
       FROM analytics_events
       WHERE timestamp >= $1 AND timestamp <= $2
       GROUP BY source_module
       ORDER BY count DESC`,
      [startTime, endTime]
    );
    return result.rows;
  }
}

export { pool };
