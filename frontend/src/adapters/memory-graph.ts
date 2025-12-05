/**
 * LLM-Memory-Graph Adapter (Frontend)
 *
 * Thin adapter for consuming context lineage and graph-based interaction
 * metadata from LLM-Memory-Graph via the API.
 */

import type {
  AdapterHealth,
  EcosystemAdapter,
  TimeRange,
} from './types';
import { healthyAdapter, unhealthyAdapter } from './types';

/**
 * Context lineage for visualization
 */
export interface ContextLineage {
  lineageId: string;
  rootContextId: string;
  createdAt: Date;
  depth: number;
  nodes: LineageNode[];
  edges: LineageEdge[];
  metadata: {
    totalTokens: number;
    totalInteractions: number;
    activeBranches: number;
    compressionRatio: number;
  };
}

export interface LineageNode {
  nodeId: string;
  nodeType: 'user_message' | 'assistant_response' | 'system_prompt' | 'tool_call' | 'tool_result' | 'context_injection' | 'summary';
  createdAt: Date;
  contentHash: string;
  tokenCount: number;
  attributes: Record<string, unknown>;
}

export interface LineageEdge {
  edgeId: string;
  sourceNodeId: string;
  targetNodeId: string;
  edgeType: 'follows' | 'references' | 'summarizes' | 'derived_from' | 'tool_invocation';
  weight: number;
  createdAt: Date;
}

/**
 * Interaction graph for network visualization
 */
export interface InteractionGraph {
  graphId: string;
  sessionId: string;
  createdAt: Date;
  lastUpdated: Date;
  statistics: {
    nodeCount: number;
    edgeCount: number;
    avgDegree: number;
    clusteringCoefficient: number;
    diameter: number;
    density: number;
  };
  topics: Array<{
    clusterId: string;
    topic: string;
    relevanceScore: number;
    nodeIds: string[];
    keywords: string[];
  }>;
  entities: Array<{
    entityId: string;
    entityType: string;
    name: string;
    firstMentioned: Date;
    mentionCount: number;
    nodeIds: string[];
  }>;
}

/**
 * Memory snapshot for status displays
 */
export interface MemorySnapshot {
  snapshotId: string;
  sessionId: string;
  createdAt: Date;
  contextWindowTokens: number;
  summarizedTokens: number;
  activeMemories: Array<{
    memoryId: string;
    memoryType: 'short_term' | 'long_term' | 'working' | 'episodic' | 'semantic';
    contentPreview: string;
    tokenCount: number;
    relevanceScore: number;
    lastAccessed: Date;
    accessCount: number;
  }>;
  retrievalStats: {
    totalRetrievals: number;
    avgLatencyMs: number;
    cacheHitRate: number;
    relevanceAvg: number;
  };
}

/**
 * Graph analytics for dashboard metrics
 */
export interface GraphAnalytics {
  periodStart: Date;
  periodEnd: Date;
  totalSessions: number;
  totalNodesCreated: number;
  totalEdgesCreated: number;
  avgSessionDepth: number;
  avgSessionTokens: number;
  topTopics: string[];
  memoryEfficiency: {
    avgCompressionRatio: number;
    cacheHitRate: number;
    retrievalLatencyP50Ms: number;
    retrievalLatencyP99Ms: number;
  };
}

/**
 * Query parameters
 */
export interface LineageQuery {
  contextId?: string;
  sessionId?: string;
  startTime?: Date;
  endTime?: Date;
  minDepth?: number;
  maxDepth?: number;
  includeContent?: boolean;
}

/**
 * LLM-Memory-Graph adapter for frontend
 */
export class MemoryGraphAdapter implements EcosystemAdapter {
  private connected: boolean = false;

  async connect(): Promise<void> {
    console.debug('[MemoryGraphAdapter] Connecting...');
    this.connected = true;
    console.debug('[MemoryGraphAdapter] Connected');
  }

  async healthCheck(): Promise<AdapterHealth> {
    const start = Date.now();

    if (!this.connected) {
      return unhealthyAdapter('memory_graph', 'Not connected');
    }

    const latencyMs = Date.now() - start;
    return healthyAdapter('memory_graph', latencyMs);
  }

  async disconnect(): Promise<void> {
    console.debug('[MemoryGraphAdapter] Disconnecting...');
    this.connected = false;
  }

  /**
   * Fetch context lineage for tree visualization
   */
  async fetchContextLineage(query: LineageQuery): Promise<ContextLineage> {
    if (!this.connected) {
      throw new Error('Memory-Graph adapter not connected');
    }

    console.debug('[MemoryGraphAdapter] Fetching context lineage', query);
    return {
      lineageId: crypto.randomUUID(),
      rootContextId: query.contextId || 'root',
      createdAt: new Date(),
      depth: 0,
      nodes: [],
      edges: [],
      metadata: {
        totalTokens: 0,
        totalInteractions: 0,
        activeBranches: 0,
        compressionRatio: 1.0,
      },
    };
  }

  /**
   * Fetch interaction graph for network chart
   */
  async fetchInteractionGraph(sessionId: string): Promise<InteractionGraph> {
    if (!this.connected) {
      throw new Error('Memory-Graph adapter not connected');
    }

    console.debug('[MemoryGraphAdapter] Fetching interaction graph', { sessionId });
    return {
      graphId: crypto.randomUUID(),
      sessionId,
      createdAt: new Date(),
      lastUpdated: new Date(),
      statistics: {
        nodeCount: 0,
        edgeCount: 0,
        avgDegree: 0,
        clusteringCoefficient: 0,
        diameter: 0,
        density: 0,
      },
      topics: [],
      entities: [],
    };
  }

  /**
   * Fetch memory snapshot for memory status panel
   */
  async fetchMemorySnapshot(sessionId: string): Promise<MemorySnapshot> {
    if (!this.connected) {
      throw new Error('Memory-Graph adapter not connected');
    }

    console.debug('[MemoryGraphAdapter] Fetching memory snapshot', { sessionId });
    return {
      snapshotId: crypto.randomUUID(),
      sessionId,
      createdAt: new Date(),
      contextWindowTokens: 0,
      summarizedTokens: 0,
      activeMemories: [],
      retrievalStats: {
        totalRetrievals: 0,
        avgLatencyMs: 0,
        cacheHitRate: 0,
        relevanceAvg: 0,
      },
    };
  }

  /**
   * Fetch graph analytics for analytics dashboard
   */
  async fetchGraphAnalytics(timeRange: TimeRange): Promise<GraphAnalytics> {
    if (!this.connected) {
      throw new Error('Memory-Graph adapter not connected');
    }

    console.debug('[MemoryGraphAdapter] Fetching graph analytics', timeRange);
    return {
      periodStart: timeRange.start,
      periodEnd: timeRange.end,
      totalSessions: 0,
      totalNodesCreated: 0,
      totalEdgesCreated: 0,
      avgSessionDepth: 0,
      avgSessionTokens: 0,
      topTopics: [],
      memoryEfficiency: {
        avgCompressionRatio: 0,
        cacheHitRate: 0,
        retrievalLatencyP50Ms: 0,
        retrievalLatencyP99Ms: 0,
      },
    };
  }
}
