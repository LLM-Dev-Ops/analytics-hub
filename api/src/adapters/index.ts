/**
 * LLM-Dev-Ops Ecosystem Adapters
 *
 * Thin adapters for consuming data from upstream LLM-Dev-Ops modules.
 * These adapters provide read-only access to external data sources
 * without modifying existing analytics, clustering, forecasting, or statistical logic.
 *
 * Phase 2B: Runtime consumption integrations
 */

export * from './observatory';
export * from './costops';
export * from './memory-graph';
export * from './registry';
export * from './config-manager';
export * from './types';

import { ObservatoryAdapter, ObservatoryConfig } from './observatory';
import { CostOpsAdapter, CostOpsConfig } from './costops';
import { MemoryGraphAdapter, MemoryGraphConfig } from './memory-graph';
import { RegistryAdapter, RegistryConfig } from './registry';
import { ConfigManagerAdapter, ConfigManagerConfig } from './config-manager';
import { AdapterHealth } from './types';
import { logger } from '../logger';

/**
 * Unified adapter manager for all ecosystem integrations
 */
export class AdapterManager {
  public readonly observatory: ObservatoryAdapter;
  public readonly costops: CostOpsAdapter;
  public readonly memoryGraph: MemoryGraphAdapter;
  public readonly registry: RegistryAdapter;
  public readonly configManager: ConfigManagerAdapter;

  constructor(config?: {
    observatory?: Partial<ObservatoryConfig>;
    costops?: Partial<CostOpsConfig>;
    memoryGraph?: Partial<MemoryGraphConfig>;
    registry?: Partial<RegistryConfig>;
    configManager?: Partial<ConfigManagerConfig>;
  }) {
    this.observatory = new ObservatoryAdapter(config?.observatory);
    this.costops = new CostOpsAdapter(config?.costops);
    this.memoryGraph = new MemoryGraphAdapter(config?.memoryGraph);
    this.registry = new RegistryAdapter(config?.registry);
    this.configManager = new ConfigManagerAdapter(config?.configManager);
  }

  /**
   * Connect all adapters
   */
  async connectAll(): Promise<void> {
    logger.info('Connecting all ecosystem adapters...');

    await Promise.all([
      this.observatory.connect(),
      this.costops.connect(),
      this.memoryGraph.connect(),
      this.registry.connect(),
      this.configManager.connect(),
    ]);

    logger.info('All ecosystem adapters connected successfully');
  }

  /**
   * Check health of all adapters
   */
  async healthCheckAll(): Promise<AdapterHealth[]> {
    const results = await Promise.all([
      this.observatory.healthCheck(),
      this.costops.healthCheck(),
      this.memoryGraph.healthCheck(),
      this.registry.healthCheck(),
      this.configManager.healthCheck(),
    ]);

    return results;
  }

  /**
   * Disconnect all adapters
   */
  async disconnectAll(): Promise<void> {
    logger.info('Disconnecting all ecosystem adapters...');

    await Promise.all([
      this.observatory.disconnect(),
      this.costops.disconnect(),
      this.memoryGraph.disconnect(),
      this.registry.disconnect(),
      this.configManager.disconnect(),
    ]);

    logger.info('All ecosystem adapters disconnected');
  }
}

// Singleton instance
let adapterManagerInstance: AdapterManager | null = null;

/**
 * Initialize the adapter manager
 */
export function initAdapterManager(config?: ConstructorParameters<typeof AdapterManager>[0]): AdapterManager {
  if (!adapterManagerInstance) {
    adapterManagerInstance = new AdapterManager(config);
  }
  return adapterManagerInstance;
}

/**
 * Get the adapter manager instance
 */
export function getAdapterManager(): AdapterManager {
  if (!adapterManagerInstance) {
    throw new Error('AdapterManager not initialized. Call initAdapterManager() first.');
  }
  return adapterManagerInstance;
}
