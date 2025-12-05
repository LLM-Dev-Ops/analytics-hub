/**
 * Common types for ecosystem adapters
 */

/**
 * Adapter health status
 */
export interface AdapterHealth {
  adapterName: string;
  isHealthy: boolean;
  latencyMs?: number;
  lastSuccessfulFetch?: Date;
  errorMessage?: string;
}

/**
 * Common interface for all ecosystem adapters
 */
export interface EcosystemAdapter {
  connect(): Promise<void>;
  healthCheck(): Promise<AdapterHealth>;
  disconnect(): Promise<void>;
}

/**
 * Time range for queries
 */
export interface TimeRange {
  start: Date;
  end: Date;
}

/**
 * Pagination options
 */
export interface PaginationOptions {
  limit?: number;
  offset?: number;
  cursor?: string;
}

/**
 * Base adapter configuration
 */
export interface BaseAdapterConfig {
  endpoint: string;
  apiKey?: string;
  timeoutMs?: number;
}

/**
 * Create a healthy adapter status
 */
export function healthyAdapter(adapterName: string, latencyMs: number): AdapterHealth {
  return {
    adapterName,
    isHealthy: true,
    latencyMs,
    lastSuccessfulFetch: new Date(),
  };
}

/**
 * Create an unhealthy adapter status
 */
export function unhealthyAdapter(adapterName: string, errorMessage: string): AdapterHealth {
  return {
    adapterName,
    isHealthy: false,
    errorMessage,
  };
}
