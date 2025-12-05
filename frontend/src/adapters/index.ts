/**
 * LLM-Dev-Ops Ecosystem Adapters for Frontend
 *
 * Thin adapters for consuming data from upstream LLM-Dev-Ops modules.
 * These adapters provide read-only access to external data sources
 * for dashboard visualization and analytics display.
 *
 * Phase 2B: Runtime consumption integrations
 */

export * from './observatory';
export * from './costops';
export * from './memory-graph';
export * from './registry';
export * from './config-manager';
export * from './types';

import { ObservatoryAdapter } from './observatory';
import { CostOpsAdapter } from './costops';
import { MemoryGraphAdapter } from './memory-graph';
import { RegistryAdapter } from './registry';
import { ConfigManagerAdapter } from './config-manager';
import type { AdapterHealth } from './types';

/**
 * Unified adapter manager for all ecosystem integrations
 */
export class AdapterManager {
  public readonly observatory: ObservatoryAdapter;
  public readonly costops: CostOpsAdapter;
  public readonly memoryGraph: MemoryGraphAdapter;
  public readonly registry: RegistryAdapter;
  public readonly configManager: ConfigManagerAdapter;

  constructor() {
    this.observatory = new ObservatoryAdapter();
    this.costops = new CostOpsAdapter();
    this.memoryGraph = new MemoryGraphAdapter();
    this.registry = new RegistryAdapter();
    this.configManager = new ConfigManagerAdapter();
  }

  /**
   * Connect all adapters
   */
  async connectAll(): Promise<void> {
    console.info('[AdapterManager] Connecting all ecosystem adapters...');

    await Promise.all([
      this.observatory.connect(),
      this.costops.connect(),
      this.memoryGraph.connect(),
      this.registry.connect(),
      this.configManager.connect(),
    ]);

    console.info('[AdapterManager] All ecosystem adapters connected successfully');
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
    console.info('[AdapterManager] Disconnecting all ecosystem adapters...');

    await Promise.all([
      this.observatory.disconnect(),
      this.costops.disconnect(),
      this.memoryGraph.disconnect(),
      this.registry.disconnect(),
      this.configManager.disconnect(),
    ]);

    console.info('[AdapterManager] All ecosystem adapters disconnected');
  }
}

// Singleton instance
let adapterManagerInstance: AdapterManager | null = null;

/**
 * Initialize the adapter manager
 */
export function initAdapterManager(): AdapterManager {
  if (!adapterManagerInstance) {
    adapterManagerInstance = new AdapterManager();
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
