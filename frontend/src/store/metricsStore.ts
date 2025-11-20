/**
 * Metrics State Management
 * Zustand store for metrics data and real-time updates
 */

import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { Metric, TimeSeriesData, AggregatedMetric } from '@/types/metrics';

interface MetricsState {
  // Real-time metrics
  realtimeMetrics: Record<string, Metric>;

  // Time-series data cache
  timeSeriesCache: Record<string, TimeSeriesData>;

  // Aggregated metrics cache
  aggregatedMetricsCache: Record<string, AggregatedMetric[]>;

  // Loading states
  loadingStates: Record<string, boolean>;

  // Error states
  errors: Record<string, Error | null>;

  // Last update timestamps
  lastUpdates: Record<string, number>;

  // Actions
  setRealtimeMetric: (key: string, metric: Metric) => void;
  setTimeSeries: (key: string, data: TimeSeriesData) => void;
  setAggregatedMetrics: (key: string, metrics: AggregatedMetric[]) => void;

  setLoading: (key: string, loading: boolean) => void;
  setError: (key: string, error: Error | null) => void;

  clearMetric: (key: string) => void;
  clearTimeSeries: (key: string) => void;
  clearAll: () => void;

  // Utilities
  getRealtimeMetric: (key: string) => Metric | null;
  getTimeSeries: (key: string) => TimeSeriesData | null;
  getAggregatedMetrics: (key: string) => AggregatedMetric[] | null;
  isLoading: (key: string) => boolean;
  getError: (key: string) => Error | null;
  isStale: (key: string, maxAgeMs: number) => boolean;
}

export const useMetricsStore = create<MetricsState>()(
  immer((set, get) => ({
    realtimeMetrics: {},
    timeSeriesCache: {},
    aggregatedMetricsCache: {},
    loadingStates: {},
    errors: {},
    lastUpdates: {},

    setRealtimeMetric: (key, metric) =>
      set((state) => {
        state.realtimeMetrics[key] = metric;
        state.lastUpdates[key] = Date.now();
        state.errors[key] = null;
      }),

    setTimeSeries: (key, data) =>
      set((state) => {
        state.timeSeriesCache[key] = data;
        state.lastUpdates[key] = Date.now();
        state.errors[key] = null;
      }),

    setAggregatedMetrics: (key, metrics) =>
      set((state) => {
        state.aggregatedMetricsCache[key] = metrics;
        state.lastUpdates[key] = Date.now();
        state.errors[key] = null;
      }),

    setLoading: (key, loading) =>
      set((state) => {
        state.loadingStates[key] = loading;
      }),

    setError: (key, error) =>
      set((state) => {
        state.errors[key] = error;
        state.loadingStates[key] = false;
      }),

    clearMetric: (key) =>
      set((state) => {
        delete state.realtimeMetrics[key];
        delete state.lastUpdates[key];
        delete state.errors[key];
      }),

    clearTimeSeries: (key) =>
      set((state) => {
        delete state.timeSeriesCache[key];
        delete state.lastUpdates[key];
        delete state.errors[key];
      }),

    clearAll: () =>
      set((state) => {
        state.realtimeMetrics = {};
        state.timeSeriesCache = {};
        state.aggregatedMetricsCache = {};
        state.loadingStates = {};
        state.errors = {};
        state.lastUpdates = {};
      }),

    getRealtimeMetric: (key) => get().realtimeMetrics[key] || null,

    getTimeSeries: (key) => get().timeSeriesCache[key] || null,

    getAggregatedMetrics: (key) => get().aggregatedMetricsCache[key] || null,

    isLoading: (key) => get().loadingStates[key] || false,

    getError: (key) => get().errors[key] || null,

    isStale: (key, maxAgeMs) => {
      const lastUpdate = get().lastUpdates[key];
      if (!lastUpdate) return true;
      return Date.now() - lastUpdate > maxAgeMs;
    },
  }))
);
