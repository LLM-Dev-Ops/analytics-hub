/**
 * Dashboard Configuration Types
 * Definitions for dashboard builder, widgets, and layouts
 */

import { TimeRange, TimeWindow, AggregationFunction } from './metrics';
import { EventType, SourceModule, Severity } from './events';
import type { UUID } from './events';

// Chart types supported (50+ variations)
export enum ChartType {
  // Line charts
  Line = 'line',
  SmoothLine = 'smooth-line',
  SteppedLine = 'stepped-line',
  MultiLine = 'multi-line',
  StackedLine = 'stacked-line',
  AreaLine = 'area-line',

  // Bar charts
  Bar = 'bar',
  HorizontalBar = 'horizontal-bar',
  StackedBar = 'stacked-bar',
  GroupedBar = 'grouped-bar',

  // Pie/Donut charts
  Pie = 'pie',
  Donut = 'donut',
  SemiDonut = 'semi-donut',

  // Scatter/Bubble
  Scatter = 'scatter',
  Bubble = 'bubble',

  // Heatmaps
  Heatmap = 'heatmap',
  CalendarHeatmap = 'calendar-heatmap',

  // Specialized charts
  Sankey = 'sankey',
  Treemap = 'treemap',
  Sunburst = 'sunburst',
  Funnel = 'funnel',
  Gauge = 'gauge',
  Radar = 'radar',
  Polar = 'polar',

  // Time-series specific
  TimeSeriesLine = 'timeseries-line',
  TimeSeriesArea = 'timeseries-area',
  Candlestick = 'candlestick',

  // Network/Graph
  ForceDirectedGraph = 'force-directed-graph',
  ChordDiagram = 'chord-diagram',

  // Statistical
  BoxPlot = 'box-plot',
  Violin = 'violin',
  Histogram = 'histogram',

  // Comparison
  BulletChart = 'bullet-chart',
  WaterfallChart = 'waterfall',

  // Geographic
  Choropleth = 'choropleth',
  DotMap = 'dot-map',

  // Tables
  DataTable = 'data-table',
  PivotTable = 'pivot-table',

  // Single value displays
  SingleValue = 'single-value',
  SingleValueWithTrend = 'single-value-trend',
  StatusIndicator = 'status-indicator',
  ProgressBar = 'progress-bar',

  // Custom composites
  SparkLine = 'sparkline',
  MiniChart = 'mini-chart',
  ComparisonCard = 'comparison-card',
}

// Widget configuration
export interface WidgetConfig {
  id: UUID;
  type: ChartType;
  title: string;
  description?: string;

  // Data source
  data_source: DataSourceConfig;

  // Visual configuration
  visual_config: VisualConfig;

  // Interaction config
  interaction_config: InteractionConfig;

  // Refresh settings
  refresh_interval?: number; // seconds
  auto_refresh: boolean;

  // Size and position (grid units)
  layout: WidgetLayout;
}

export interface WidgetLayout {
  x: number;
  y: number;
  w: number; // width in grid units
  h: number; // height in grid units
  minW?: number;
  minH?: number;
  maxW?: number;
  maxH?: number;
  static?: boolean; // non-draggable
}

export interface DataSourceConfig {
  type: 'metric' | 'event' | 'custom_query';

  // For metric data
  measurement?: string;
  fields?: string[];
  aggregation?: {
    function: AggregationFunction | string;
    window: TimeWindow | string;
    fields?: string[];
  };

  // For event data
  event_types?: (EventType | string)[];
  source_modules?: (SourceModule | string)[];
  severities?: (Severity | string)[];

  // Filters
  filters?: Record<string, string | string[]>;

  // Time range
  time_range: TimeRange | 'relative';
  relative_time?: string; // e.g., 'last_1h', 'last_24h'

  // Grouping
  group_by?: string[];

  // Limit
  limit?: number;
}

export interface VisualConfig {
  // Colors
  color_scheme?: string | string[];
  custom_colors?: Record<string, string>;

  // Axes
  x_axis?: AxisConfig;
  y_axis?: AxisConfig;

  // Legend
  legend?: LegendConfig;

  // Chart-specific options
  options?: Record<string, unknown>;

  // Thresholds
  thresholds?: Threshold[];

  // Annotations
  annotations?: Annotation[];
}

export interface AxisConfig {
  label?: string;
  type?: 'linear' | 'logarithmic' | 'time' | 'category';
  min?: number;
  max?: number;
  format?: string;
  show_grid?: boolean;
}

export interface LegendConfig {
  show: boolean;
  position: 'top' | 'bottom' | 'left' | 'right';
  align?: 'start' | 'center' | 'end';
}

export interface Threshold {
  value: number;
  color: string;
  label?: string;
  operator: '>' | '<' | '>=' | '<=' | '==';
}

export interface Annotation {
  type: 'line' | 'region' | 'point' | 'text';
  value?: number | [number, number];
  timestamp?: string;
  label?: string;
  color?: string;
}

export interface InteractionConfig {
  enable_zoom: boolean;
  enable_pan: boolean;
  enable_drill_down: boolean;
  drill_down_target?: UUID; // target widget or dashboard
  enable_tooltip: boolean;
  tooltip_format?: string;
  enable_crosshair: boolean;
  clickable: boolean;
  on_click_action?: ClickAction;
}

export interface ClickAction {
  type: 'drill_down' | 'filter' | 'navigate' | 'custom';
  target?: string;
  parameters?: Record<string, unknown>;
}

// Dashboard configuration
export interface DashboardConfig {
  id: UUID;
  name: string;
  description?: string;
  category: DashboardCategory;

  // Widgets
  widgets: WidgetConfig[];

  // Layout settings
  layout_config: DashboardLayoutConfig;

  // Global filters
  global_filters?: GlobalFilter[];

  // Time range
  default_time_range: TimeRange | string;

  // Refresh
  auto_refresh: boolean;
  refresh_interval?: number; // seconds

  // Permissions
  is_public: boolean;
  shared_with?: string[]; // user IDs or team IDs

  // Metadata
  created_by: string;
  created_at: string;
  updated_at: string;
  tags?: string[];
}

export enum DashboardCategory {
  Executive = 'executive',
  Performance = 'performance',
  Cost = 'cost',
  Security = 'security',
  Governance = 'governance',
  Custom = 'custom',
}

export interface DashboardLayoutConfig {
  grid_columns: number; // typically 12 or 24
  row_height: number; // pixels
  breakpoints?: Record<string, number>;
  compact_type?: 'vertical' | 'horizontal' | null;
  prevent_collision?: boolean;
}

export interface GlobalFilter {
  id: string;
  name: string;
  type: 'dropdown' | 'multi-select' | 'date-range' | 'text';
  field: string;
  options?: { label: string; value: string }[];
  default_value?: unknown;
}

// Pre-built dashboard templates
export interface DashboardTemplate {
  id: string;
  name: string;
  description: string;
  category: DashboardCategory;
  preview_image?: string;
  config: Omit<DashboardConfig, 'id' | 'created_by' | 'created_at' | 'updated_at'>;
}

// Dashboard sharing and embedding
export interface DashboardShare {
  dashboard_id: UUID;
  share_token: string;
  expires_at?: string;
  is_public: boolean;
  allowed_domains?: string[];
  permissions: SharePermissions;
}

export interface SharePermissions {
  can_view: boolean;
  can_edit: boolean;
  can_comment: boolean;
  can_export: boolean;
}

export interface EmbedConfig {
  dashboard_id: UUID;
  theme?: 'light' | 'dark' | 'auto';
  hide_header?: boolean;
  hide_filters?: boolean;
  auto_refresh?: boolean;
  width?: string;
  height?: string;
}

// Widget data correlation
export interface CorrelationConfig {
  enabled: boolean;
  correlation_field: string;
  highlight_color?: string;
  linked_widgets: UUID[];
}

// Real-time updates
export interface RealtimeConfig {
  enabled: boolean;
  max_lag_ms: number;
  buffer_size?: number;
  fallback_to_polling?: boolean;
  polling_interval_ms?: number;
}
