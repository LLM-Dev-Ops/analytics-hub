/**
 * Metrics and Time-Series Types
 * TypeScript definitions for metrics aggregation and time-series data
 */

import { ISODateString } from './events';

// Time windows for aggregation
export enum TimeWindow {
  OneMinute = '1m',
  FiveMinutes = '5m',
  FifteenMinutes = '15m',
  OneHour = '1h',
  SixHours = '6h',
  OneDay = '1d',
  OneWeek = '1w',
  OneMonth = '1M',
}

export const TIME_WINDOW_SECONDS: Record<TimeWindow, number> = {
  [TimeWindow.OneMinute]: 60,
  [TimeWindow.FiveMinutes]: 300,
  [TimeWindow.FifteenMinutes]: 900,
  [TimeWindow.OneHour]: 3600,
  [TimeWindow.SixHours]: 21600,
  [TimeWindow.OneDay]: 86400,
  [TimeWindow.OneWeek]: 604800,
  [TimeWindow.OneMonth]: 2592000,
};

export const TIME_WINDOW_LABELS: Record<TimeWindow, string> = {
  [TimeWindow.OneMinute]: '1m',
  [TimeWindow.FiveMinutes]: '5m',
  [TimeWindow.FifteenMinutes]: '15m',
  [TimeWindow.OneHour]: '1h',
  [TimeWindow.SixHours]: '6h',
  [TimeWindow.OneDay]: '1d',
  [TimeWindow.OneWeek]: '1w',
  [TimeWindow.OneMonth]: '1M',
};

// Statistical measures
export interface StatisticalMeasures {
  avg: number;
  min: number;
  max: number;
  p50: number;
  p95: number;
  p99: number;
  stddev?: number;
  count: number;
  sum: number;
}

// Metric types
export interface CounterMetric {
  metric_type: 'counter';
  name: string;
  value: number;
  rate?: number;
  tags: Record<string, string>;
  timestamp: ISODateString;
}

export interface GaugeMetric {
  metric_type: 'gauge';
  name: string;
  value: number;
  change?: number;
  tags: Record<string, string>;
  timestamp: ISODateString;
}

export interface HistogramMetric {
  metric_type: 'histogram';
  name: string;
  statistics: StatisticalMeasures;
  buckets?: HistogramBucket[];
  tags: Record<string, string>;
  timestamp: ISODateString;
}

export interface HistogramBucket {
  upper_bound: number;
  count: number;
  cumulative_count: number;
}

export interface SummaryMetric {
  metric_type: 'summary';
  name: string;
  statistics: StatisticalMeasures;
  quantiles?: Quantile[];
  tags: Record<string, string>;
  timestamp: ISODateString;
}

export interface Quantile {
  quantile: number;
  value: number;
}

export type Metric = CounterMetric | GaugeMetric | HistogramMetric | SummaryMetric;

// Time-series data models
export interface TimeSeriesPoint {
  timestamp: ISODateString;
  value: number;
  tags?: Record<string, string>;
}

export interface TimeSeriesData {
  measurement: string;
  field: string;
  points: TimeSeriesPoint[];
  metadata?: Record<string, unknown>;
}

export enum AggregationFunction {
  Mean = 'mean',
  Sum = 'sum',
  Min = 'min',
  Max = 'max',
  Count = 'count',
  P50 = 'p50',
  P95 = 'p95',
  P99 = 'p99',
  StdDev = 'stddev',
  First = 'first',
  Last = 'last',
}

export interface Aggregation {
  function: AggregationFunction | string;
  window: string;
  fields?: string[];
}

export enum FillStrategy {
  None = 'none',
  Null = 'null',
  Previous = 'previous',
  Linear = 'linear',
  Zero = 'zero',
}

export interface TimeRange {
  start: ISODateString;
  end: ISODateString;
}

export interface TimeSeriesQuery {
  measurement: string;
  time_range: TimeRange;
  tag_filters: Record<string, string | string[]>;
  select_fields: string[];
  aggregation?: Aggregation;
  group_by: string[];
  fill?: FillStrategy;
  limit?: number;
  offset?: number;
}

// Aggregated metrics
export interface AggregatedMetric {
  name: string;
  time_window: TimeWindow;
  statistics: StatisticalMeasures;
  tags: Record<string, string>;
  window_start: ISODateString;
  window_end: ISODateString;
  data_points: number;
}

// Composite metrics (cross-module)
export interface CompositeMetric {
  name: string;
  description: string;
  formula: string;
  component_metrics: string[];
  value: number;
  tags: Record<string, string>;
  timestamp: ISODateString;
}

// Real-time metric update
export interface MetricUpdate {
  metric: Metric;
  is_realtime: boolean;
  lag_ms?: number;
}
