/**
 * Chart Registry
 * Central registry for all 50+ chart types with lazy loading
 */

import { lazy, ComponentType } from 'react';
import { ChartType } from '@/types/dashboard';

export interface ChartComponentProps {
  data: unknown;
  config: Record<string, unknown>;
  width?: number;
  height?: number;
  onDataPointClick?: (data: unknown) => void;
  isRealtime?: boolean;
}

// Chart component registry with lazy loading
const chartComponents: Record<ChartType, ComponentType<ChartComponentProps>> = {
  // Line charts
  [ChartType.Line]: lazy(() => import('./LineChart')),
  [ChartType.SmoothLine]: lazy(() => import('./SmoothLineChart')),
  [ChartType.SteppedLine]: lazy(() => import('./SteppedLineChart')),
  [ChartType.MultiLine]: lazy(() => import('./MultiLineChart')),
  [ChartType.StackedLine]: lazy(() => import('./StackedLineChart')),
  [ChartType.AreaLine]: lazy(() => import('./AreaLineChart')),

  // Bar charts
  [ChartType.Bar]: lazy(() => import('./BarChart')),
  [ChartType.HorizontalBar]: lazy(() => import('./HorizontalBarChart')),
  [ChartType.StackedBar]: lazy(() => import('./StackedBarChart')),
  [ChartType.GroupedBar]: lazy(() => import('./GroupedBarChart')),

  // Pie/Donut charts
  [ChartType.Pie]: lazy(() => import('./PieChart')),
  [ChartType.Donut]: lazy(() => import('./DonutChart')),
  [ChartType.SemiDonut]: lazy(() => import('./SemiDonutChart')),

  // Scatter/Bubble
  [ChartType.Scatter]: lazy(() => import('./ScatterChart')),
  [ChartType.Bubble]: lazy(() => import('./BubbleChart')),

  // Heatmaps
  [ChartType.Heatmap]: lazy(() => import('./Heatmap')),
  [ChartType.CalendarHeatmap]: lazy(() => import('./CalendarHeatmap')),

  // Specialized charts
  [ChartType.Sankey]: lazy(() => import('./SankeyDiagram')),
  [ChartType.Treemap]: lazy(() => import('./TreemapChart')),
  [ChartType.Sunburst]: lazy(() => import('./SunburstChart')),
  [ChartType.Funnel]: lazy(() => import('./FunnelChart')),
  [ChartType.Gauge]: lazy(() => import('./GaugeChart')),
  [ChartType.Radar]: lazy(() => import('./RadarChart')),
  [ChartType.Polar]: lazy(() => import('./PolarChart')),

  // Time-series specific
  [ChartType.TimeSeriesLine]: lazy(() => import('./TimeSeriesLineChart')),
  [ChartType.TimeSeriesArea]: lazy(() => import('./TimeSeriesAreaChart')),
  [ChartType.Candlestick]: lazy(() => import('./CandlestickChart')),

  // Network/Graph
  [ChartType.ForceDirectedGraph]: lazy(() => import('./ForceDirectedGraph')),
  [ChartType.ChordDiagram]: lazy(() => import('./ChordDiagram')),

  // Statistical
  [ChartType.BoxPlot]: lazy(() => import('./BoxPlot')),
  [ChartType.Violin]: lazy(() => import('./ViolinPlot')),
  [ChartType.Histogram]: lazy(() => import('./HistogramChart')),

  // Comparison
  [ChartType.BulletChart]: lazy(() => import('./BulletChart')),
  [ChartType.WaterfallChart]: lazy(() => import('./WaterfallChart')),

  // Geographic
  [ChartType.Choropleth]: lazy(() => import('./ChoroplethMap')),
  [ChartType.DotMap]: lazy(() => import('./DotMap')),

  // Tables
  [ChartType.DataTable]: lazy(() => import('./DataTable')),
  [ChartType.PivotTable]: lazy(() => import('./PivotTable')),

  // Single value displays
  [ChartType.SingleValue]: lazy(() => import('./SingleValue')),
  [ChartType.SingleValueWithTrend]: lazy(() => import('./SingleValueTrend')),
  [ChartType.StatusIndicator]: lazy(() => import('./StatusIndicator')),
  [ChartType.ProgressBar]: lazy(() => import('./ProgressBar')),

  // Custom composites
  [ChartType.SparkLine]: lazy(() => import('./SparkLine')),
  [ChartType.MiniChart]: lazy(() => import('./MiniChart')),
  [ChartType.ComparisonCard]: lazy(() => import('./ComparisonCard')),
};

export function getChartComponent(type: ChartType): ComponentType<ChartComponentProps> | null {
  return chartComponents[type] || null;
}

export function getAvailableChartTypes(): ChartType[] {
  return Object.keys(chartComponents) as ChartType[];
}

// Chart metadata for UI display
export interface ChartMetadata {
  type: ChartType;
  name: string;
  description: string;
  category: ChartCategory;
  icon: string;
  preview?: string;
  requiredDataFields: string[];
  supportedDataTypes: DataType[];
  useCases: string[];
}

export enum ChartCategory {
  TimeSeries = 'Time Series',
  Comparison = 'Comparison',
  Distribution = 'Distribution',
  Composition = 'Composition',
  Relationship = 'Relationship',
  Geographic = 'Geographic',
  Statistical = 'Statistical',
  Tables = 'Tables',
  Indicators = 'Indicators',
}

export enum DataType {
  Numeric = 'numeric',
  Categorical = 'categorical',
  Temporal = 'temporal',
  Geospatial = 'geospatial',
  Hierarchical = 'hierarchical',
  Network = 'network',
}

export const chartMetadata: Record<ChartType, ChartMetadata> = {
  [ChartType.Line]: {
    type: ChartType.Line,
    name: 'Line Chart',
    description: 'Display trends over time with connected data points',
    category: ChartCategory.TimeSeries,
    icon: 'TrendingUp',
    requiredDataFields: ['x', 'y'],
    supportedDataTypes: [DataType.Numeric, DataType.Temporal],
    useCases: ['Trend analysis', 'Performance monitoring', 'Time-series data'],
  },
  [ChartType.Bar]: {
    type: ChartType.Bar,
    name: 'Bar Chart',
    description: 'Compare values across categories with vertical bars',
    category: ChartCategory.Comparison,
    icon: 'BarChart3',
    requiredDataFields: ['category', 'value'],
    supportedDataTypes: [DataType.Categorical, DataType.Numeric],
    useCases: ['Category comparison', 'Ranking', 'Distribution'],
  },
  [ChartType.Heatmap]: {
    type: ChartType.Heatmap,
    name: 'Heatmap',
    description: 'Visualize matrix data with color-coded cells',
    category: ChartCategory.Distribution,
    icon: 'Grid',
    requiredDataFields: ['x', 'y', 'value'],
    supportedDataTypes: [DataType.Numeric, DataType.Categorical],
    useCases: ['Correlation analysis', 'Time patterns', 'Intensity mapping'],
  },
  [ChartType.Sankey]: {
    type: ChartType.Sankey,
    name: 'Sankey Diagram',
    description: 'Show flow and relationships between entities',
    category: ChartCategory.Relationship,
    icon: 'Network',
    requiredDataFields: ['source', 'target', 'value'],
    supportedDataTypes: [DataType.Network, DataType.Numeric],
    useCases: ['Flow analysis', 'Resource allocation', 'Process visualization'],
  },
  [ChartType.Gauge]: {
    type: ChartType.Gauge,
    name: 'Gauge Chart',
    description: 'Display single metric with target ranges',
    category: ChartCategory.Indicators,
    icon: 'Gauge',
    requiredDataFields: ['value'],
    supportedDataTypes: [DataType.Numeric],
    useCases: ['KPI monitoring', 'Performance indicators', 'Progress tracking'],
  },
  // ... Add metadata for all other chart types
  [ChartType.DataTable]: {
    type: ChartType.DataTable,
    name: 'Data Table',
    description: 'Display data in tabular format with sorting and filtering',
    category: ChartCategory.Tables,
    icon: 'Table',
    requiredDataFields: [],
    supportedDataTypes: [DataType.Numeric, DataType.Categorical, DataType.Temporal],
    useCases: ['Detailed data view', 'Data exploration', 'Export preparation'],
  },
} as Record<ChartType, ChartMetadata>;

export function getChartMetadata(type: ChartType): ChartMetadata | null {
  return chartMetadata[type] || null;
}

export function getChartsByCategory(category: ChartCategory): ChartMetadata[] {
  return Object.values(chartMetadata).filter((meta) => meta.category === category);
}
