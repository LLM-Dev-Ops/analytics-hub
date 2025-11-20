# Frontend Implementation Guide

Complete guide for implementing and extending the LLM Analytics Hub frontend dashboard.

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Chart Implementation](#chart-implementation)
3. [Dashboard Builder](#dashboard-builder)
4. [Real-Time Data Flow](#real-time-data-flow)
5. [State Management](#state-management)
6. [API Integration](#api-integration)
7. [Performance Optimization](#performance-optimization)
8. [Testing Strategy](#testing-strategy)
9. [Deployment](#deployment)

## Architecture Overview

### Component Hierarchy

```
App
├── MainLayout
│   ├── Header
│   ├── Sidebar
│   └── Content
│       ├── DashboardList
│       ├── DashboardView
│       │   └── DashboardBuilder
│       │       └── DashboardWidget (multiple)
│       │           └── Chart Component
│       └── Settings
├── ThemeProvider
└── QueryClientProvider
```

### Data Flow

```
Backend API
    ↓
API Service → Metrics Store → Components
    ↑              ↑
    |              |
WebSocket ─────────┘
```

## Chart Implementation

### Creating a New Chart

#### 1. Define Chart Component

Create a new file in `src/components/charts/`:

```typescript
// src/components/charts/MyCustomChart.tsx
import React from 'react';
import { ChartComponentProps } from './ChartRegistry';

interface MyCustomChartData {
  x: number;
  y: number;
  label: string;
}

interface MyCustomChartProps extends ChartComponentProps {
  data: MyCustomChartData[];
  config?: {
    color?: string;
    showLabels?: boolean;
    // ... custom options
  };
}

const MyCustomChart: React.FC<MyCustomChartProps> = ({
  data,
  config = {},
  width,
  height,
  onDataPointClick,
  isRealtime = false,
}) => {
  const {
    color = '#3b82f6',
    showLabels = true,
  } = config;

  // Implementation using D3, Recharts, or Chart.js
  return (
    <div style={{ width, height }}>
      {/* Chart implementation */}
    </div>
  );
};

export default MyCustomChart;
```

#### 2. Register Chart

Add to `ChartRegistry.tsx`:

```typescript
import { ChartType } from '@/types/dashboard';

// Add to enum in dashboard.ts
export enum ChartType {
  // ... existing types
  MyCustom = 'my-custom',
}

// Register component
const chartComponents = {
  // ... existing charts
  [ChartType.MyCustom]: lazy(() => import('./MyCustomChart')),
};

// Add metadata
export const chartMetadata = {
  // ... existing metadata
  [ChartType.MyCustom]: {
    type: ChartType.MyCustom,
    name: 'My Custom Chart',
    description: 'Description of what this chart does',
    category: ChartCategory.Comparison,
    icon: 'BarChart',
    requiredDataFields: ['x', 'y'],
    supportedDataTypes: [DataType.Numeric],
    useCases: ['Use case 1', 'Use case 2'],
  },
};
```

#### 3. Chart Categories

Charts are organized into categories:

- **Time Series**: Line, area, candlestick charts
- **Comparison**: Bar, grouped, stacked charts
- **Distribution**: Heatmaps, box plots, histograms
- **Composition**: Pie, donut, treemap charts
- **Relationship**: Sankey, network, chord diagrams
- **Geographic**: Maps, choropleths
- **Statistical**: Box plots, violin plots
- **Tables**: Data tables, pivot tables
- **Indicators**: KPIs, gauges, status indicators

### Chart Best Practices

#### Performance

```typescript
// Use React.memo for expensive charts
const MyChart = React.memo<ChartComponentProps>(({ data, config }) => {
  // Chart implementation
}, (prevProps, nextProps) => {
  // Custom comparison for re-render optimization
  return prevProps.data === nextProps.data &&
         prevProps.config === nextProps.config;
});

// Use useMemo for data transformations
const transformedData = useMemo(() => {
  return expensiveTransformation(data);
}, [data]);

// Use useCallback for event handlers
const handleClick = useCallback((point) => {
  if (onDataPointClick) {
    onDataPointClick(point);
  }
}, [onDataPointClick]);
```

#### Accessibility

```typescript
// Add ARIA labels
<svg
  role="img"
  aria-label={`${chartType} showing ${data.length} data points`}
>
  {/* Chart elements */}
</svg>

// Keyboard navigation
<button
  onKeyDown={(e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      handleDataPointClick(data);
    }
  }}
>
  {/* Interactive element */}
</button>

// Focus management
const chartRef = useRef<HTMLDivElement>(null);
useEffect(() => {
  if (focused) {
    chartRef.current?.focus();
  }
}, [focused]);
```

#### Responsive Design

```typescript
// Use ResizeObserver for responsive charts
useEffect(() => {
  if (!containerRef.current) return;

  const resizeObserver = new ResizeObserver((entries) => {
    const { width, height } = entries[0].contentRect;
    setDimensions({ width, height });
  });

  resizeObserver.observe(containerRef.current);

  return () => {
    resizeObserver.disconnect();
  };
}, []);
```

## Dashboard Builder

### Widget Configuration

#### Data Source Configuration

```typescript
const widget: WidgetConfig = {
  id: 'unique-id',
  type: ChartType.Line,
  title: 'Request Latency',

  data_source: {
    type: 'metric',
    measurement: 'llm_latency',
    fields: ['latency_ms'],

    // Aggregation
    aggregation: {
      function: 'p95',
      window: '5m',
    },

    // Time range
    time_range: 'relative',
    relative_time: 'last_1h',

    // Filters
    filters: {
      model_id: 'gpt-4',
      environment: 'production',
    },

    // Grouping
    group_by: ['region'],

    // Limit
    limit: 1000,
  },

  // ... visual and interaction config
};
```

#### Visual Configuration

```typescript
visual_config: {
  // Color scheme
  color_scheme: ['#3b82f6', '#10b981', '#f59e0b'],

  // Axes
  x_axis: {
    label: 'Time',
    type: 'time',
    show_grid: true,
    format: 'HH:mm',
  },

  y_axis: {
    label: 'Latency (ms)',
    type: 'linear',
    min: 0,
    max: 1000,
    show_grid: true,
  },

  // Legend
  legend: {
    show: true,
    position: 'bottom',
    align: 'center',
  },

  // Thresholds
  thresholds: [
    {
      value: 500,
      color: '#f59e0b',
      label: 'Warning',
      operator: '>',
    },
    {
      value: 1000,
      color: '#ef4444',
      label: 'Critical',
      operator: '>',
    },
  ],

  // Annotations
  annotations: [
    {
      type: 'line',
      value: 750,
      label: 'SLA Target',
      color: '#8b5cf6',
    },
  ],
}
```

#### Interaction Configuration

```typescript
interaction_config: {
  // Zoom and pan
  enable_zoom: true,
  enable_pan: true,

  // Drill-down
  enable_drill_down: true,
  drill_down_target: 'performance-detail-dashboard',

  // Tooltips
  enable_tooltip: true,
  tooltip_format: '{name}: {value} ms at {time}',

  // Crosshair
  enable_crosshair: true,

  // Click actions
  clickable: true,
  on_click_action: {
    type: 'filter',
    target: 'related-widget',
    parameters: {
      filter_field: 'model_id',
    },
  },
}
```

### Grid Layout

#### Layout Configuration

```typescript
const layoutConfig: DashboardLayoutConfig = {
  grid_columns: 12,     // Number of columns
  row_height: 60,       // Height of each row in pixels

  // Breakpoints for responsive design
  breakpoints: {
    lg: 1200,
    md: 996,
    sm: 768,
    xs: 480,
    xxs: 0,
  },

  // Compaction
  compact_type: 'vertical', // 'vertical' | 'horizontal' | null

  // Collision prevention
  prevent_collision: false,
};
```

#### Widget Layout

```typescript
const widgetLayout: WidgetLayout = {
  x: 0,       // Column position (0-11 for 12-column grid)
  y: 0,       // Row position
  w: 6,       // Width in grid units
  h: 4,       // Height in grid units
  minW: 3,    // Minimum width
  minH: 2,    // Minimum height
  maxW: 12,   // Maximum width
  maxH: 10,   // Maximum height
  static: false, // If true, widget cannot be moved/resized
};
```

## Real-Time Data Flow

### WebSocket Integration

#### Setup

```typescript
import { initWebSocket } from '@/services/websocket';

// Initialize on app start
const ws = initWebSocket({
  url: 'ws://localhost:8080',
  reconnectionAttempts: 5,
  reconnectionDelay: 3000,
  timeout: 30000,
  autoConnect: true,
});
```

#### Subscribe to Channels

```typescript
import { getWebSocket } from '@/services/websocket';

const ws = getWebSocket();

// Subscribe to specific channels
ws.subscribe([
  'metric:llm_latency',
  'metric:llm_requests',
  'event:security',
]);

// Handle updates
ws.onUpdate('metric:llm_latency', (update) => {
  console.log('Latency update:', update.payload);

  // Update metrics store
  metricsStore.setRealtimeMetric('latency', update.payload);
});
```

#### Update Handling

```typescript
// In widget component
useEffect(() => {
  if (!widget.auto_refresh) return;

  const ws = getWebSocket();
  if (!ws) return;

  // Subscribe to widget-specific channel
  const channel = `dashboard:${dashboardId}:widget:${widget.id}`;
  ws.subscribe([channel]);

  // Handle updates
  const unsubscribe = ws.onUpdate(channel, (update) => {
    setData((prevData) => {
      // Append new data
      if (Array.isArray(prevData)) {
        return [...prevData, update.payload].slice(-maxPoints);
      }
      return update.payload;
    });
  });

  return () => {
    ws.unsubscribe([channel]);
    unsubscribe();
  };
}, [widget, dashboardId]);
```

### Data Buffering

The WebSocket service includes automatic buffering:

```typescript
// Configure buffer size
const maxBufferSize = 1000;

// Buffer overflow handling
if (messageBuffer.length >= maxBufferSize) {
  messageBuffer.shift(); // Remove oldest message
}
messageBuffer.push(newMessage);

// Retrieve buffered messages
const bufferedMessages = ws.getMessageBuffer();

// Clear buffer
ws.clearMessageBuffer();
```

## State Management

### Zustand Store Patterns

#### Creating a Store

```typescript
import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { persist } from 'zustand/middleware';

interface MyStore {
  // State
  items: Item[];

  // Actions
  addItem: (item: Item) => void;
  removeItem: (id: string) => void;
  updateItem: (id: string, updates: Partial<Item>) => void;
}

export const useMyStore = create<MyStore>()(
  persist(
    immer((set, get) => ({
      items: [],

      addItem: (item) =>
        set((state) => {
          state.items.push(item);
        }),

      removeItem: (id) =>
        set((state) => {
          state.items = state.items.filter((item) => item.id !== id);
        }),

      updateItem: (id, updates) =>
        set((state) => {
          const item = state.items.find((i) => i.id === id);
          if (item) {
            Object.assign(item, updates);
          }
        }),
    })),
    {
      name: 'my-store',
      // Optionally persist only specific fields
      partialize: (state) => ({ items: state.items }),
    }
  )
);
```

#### Using Stores

```typescript
// Select specific state
const items = useMyStore((state) => state.items);
const addItem = useMyStore((state) => state.addItem);

// Multiple selections with shallow equality
const { items, addItem, removeItem } = useMyStore((state) => ({
  items: state.items,
  addItem: state.addItem,
  removeItem: state.removeItem,
}), shallow);

// Derived state with selector
const activeItems = useMyStore((state) =>
  state.items.filter((item) => item.active)
);
```

## API Integration

### Type-Safe API Calls

```typescript
import { getApi } from '@/services/api';

const api = getApi();

// Time-series query
const timeSeriesData = await api.getTimeSeries({
  measurement: 'llm_latency',
  time_range: {
    start: '2024-01-01T00:00:00Z',
    end: '2024-01-02T00:00:00Z',
  },
  tag_filters: {
    model_id: 'gpt-4',
    environment: 'production',
  },
  select_fields: ['latency_ms', 'tokens_per_second'],
  aggregation: {
    function: 'p95',
    window: '5m',
    fields: ['latency_ms'],
  },
  group_by: ['region'],
  fill: 'linear',
  limit: 1000,
});

// Event query
const events = await api.getEvents({
  event_types: ['security', 'governance'],
  source_modules: ['llm-sentinel'],
  severities: ['critical', 'error'],
  start_time: '2024-01-01T00:00:00Z',
  end_time: '2024-01-02T00:00:00Z',
}, {
  offset: 0,
  limit: 100,
});
```

### Error Handling

```typescript
try {
  const data = await api.getMetrics('llm_latency');
  setData(data);
} catch (error) {
  if (error.code === 'UNAUTHORIZED') {
    // Handle authentication error
    redirectToLogin();
  } else if (error.code === 'NETWORK_ERROR') {
    // Handle network error
    showRetryDialog();
  } else {
    // Generic error handling
    showErrorNotification(error.message);
  }
}
```

## Performance Optimization

### Code Splitting

```typescript
// Route-based splitting
const DashboardList = lazy(() => import('./DashboardList'));
const DashboardView = lazy(() => import('./DashboardView'));

// Component-based splitting
const HeavyChart = lazy(() => import('./charts/HeavyChart'));
```

### Memoization

```typescript
// Expensive computations
const processedData = useMemo(() => {
  return data
    .filter((item) => item.value > threshold)
    .map((item) => ({
      ...item,
      normalized: item.value / maxValue,
    }))
    .sort((a, b) => a.timestamp - b.timestamp);
}, [data, threshold, maxValue]);

// Event handlers
const handleClick = useCallback((item: Item) => {
  console.log('Clicked:', item);
  onItemClick?.(item);
}, [onItemClick]);
```

### Virtual Scrolling

```typescript
import { FixedSizeList } from 'react-window';

const VirtualList = ({ items }) => (
  <FixedSizeList
    height={600}
    itemCount={items.length}
    itemSize={50}
    width="100%"
  >
    {({ index, style }) => (
      <div style={style}>
        {items[index].name}
      </div>
    )}
  </FixedSizeList>
);
```

## Testing Strategy

### Unit Tests

```typescript
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import MyComponent from './MyComponent';

describe('MyComponent', () => {
  it('renders correctly', () => {
    render(<MyComponent />);
    expect(screen.getByText('Hello')).toBeInTheDocument();
  });

  it('handles user interaction', async () => {
    const handleClick = vi.fn();
    render(<MyComponent onClick={handleClick} />);

    await userEvent.click(screen.getByRole('button'));
    expect(handleClick).toHaveBeenCalled();
  });
});
```

### Integration Tests

```typescript
import { renderWithProviders } from '@/test/utils';

describe('Dashboard Integration', () => {
  it('loads and displays dashboard', async () => {
    const { store } = renderWithProviders(<DashboardView id="test-123" />);

    await waitFor(() => {
      expect(screen.getByText('Test Dashboard')).toBeInTheDocument();
    });

    expect(store.getState().dashboards['test-123']).toBeDefined();
  });
});
```

## Deployment

### Production Build

```bash
# Build
npm run build

# Preview
npm run preview

# Deploy to CDN
npm run deploy
```

### Environment Configuration

```typescript
// .env.production
VITE_API_URL=https://api.analytics.example.com
VITE_WS_URL=wss://ws.analytics.example.com
VITE_ENABLE_REALTIME=true
```

### Docker Deployment

```dockerfile
FROM node:18-alpine as builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/nginx.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
```

## Additional Resources

- [React Documentation](https://react.dev)
- [TypeScript Handbook](https://www.typescriptlang.org/docs)
- [Zustand Documentation](https://github.com/pmndrs/zustand)
- [D3.js Documentation](https://d3js.org)
- [Material-UI Documentation](https://mui.com)
