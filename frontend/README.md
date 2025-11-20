# LLM Analytics Hub - Frontend Dashboard

Enterprise-grade analytics dashboard and visualization layer for the LLM DevOps Platform.

## Overview

The LLM Analytics Hub frontend is a comprehensive TypeScript/React application providing real-time analytics, customizable dashboards, and advanced data visualizations for LLM monitoring and operations.

## Features

### Core Capabilities

- **50+ Chart Types**: Comprehensive visualization library including:
  - Time-series charts (line, area, candlestick)
  - Comparison charts (bar, grouped, stacked)
  - Distribution charts (heatmap, box plot, violin)
  - Relationship charts (Sankey, force-directed graphs, chord diagrams)
  - Geographic visualizations (choropleth, dot maps)
  - Statistical charts (histograms, scatter plots)
  - Indicators (gauges, KPI cards, progress bars)

- **Drag-and-Drop Dashboard Builder**:
  - Responsive grid layout
  - Widget resizing and repositioning
  - Copy/paste/duplicate widgets
  - Real-time layout persistence

- **Real-Time Data Streaming**:
  - WebSocket integration with <30s lag
  - Automatic reconnection and buffering
  - Live chart updates without page refresh
  - Configurable refresh intervals

- **Pre-Built Dashboards**:
  - Executive Dashboard (high-level KPIs)
  - Performance Dashboard (latency, throughput)
  - Cost Dashboard (spending, optimization)
  - Security Dashboard (threats, vulnerabilities)
  - Governance Dashboard (compliance, policies)

- **Interactive Features**:
  - Drill-down navigation
  - Cross-chart correlation highlighting
  - Time range selection
  - Global filters
  - Data export (CSV, JSON, Excel)

- **Multi-Tenant Support**:
  - Organization hierarchy
  - Role-based access control
  - Dashboard sharing and permissions
  - Embedded dashboards

## Technology Stack

### Core Libraries

- **React 18.2**: Modern React with hooks and concurrent features
- **TypeScript 5.3**: Type-safe development
- **Vite 5.0**: Fast build tool and dev server
- **Zustand 4.4**: Lightweight state management
- **React Query 3.39**: Server state management

### UI Components

- **Material-UI 5.15**: Comprehensive component library
- **React Grid Layout 1.4**: Drag-and-drop grid system
- **React Beautiful DnD**: Drag-and-drop interactions
- **Framer Motion**: Smooth animations

### Visualization Libraries

- **D3.js 7.8**: Advanced custom visualizations
- **Recharts 2.10**: React-friendly charts
- **Chart.js 4.4**: Simple charting library

### Data & Communication

- **Axios 1.6**: HTTP client
- **Socket.IO Client 4.6**: WebSocket communication
- **Date-fns 2.30**: Date manipulation
- **Lodash 4.17**: Utility functions

## Project Structure

```
frontend/
├── src/
│   ├── components/
│   │   ├── charts/           # 50+ chart components
│   │   │   ├── ChartRegistry.tsx
│   │   │   ├── LineChart.tsx
│   │   │   ├── TimeSeriesLineChart.tsx
│   │   │   ├── Heatmap.tsx
│   │   │   ├── SankeyDiagram.tsx
│   │   │   └── ... (47 more)
│   │   ├── dashboards/       # Dashboard components
│   │   │   ├── DashboardBuilder.tsx
│   │   │   ├── DashboardWidget.tsx
│   │   │   ├── DashboardView.tsx
│   │   │   ├── DashboardList.tsx
│   │   │   ├── ChartSelector.tsx
│   │   │   ├── WidgetConfigPanel.tsx
│   │   │   └── templates/    # Pre-built templates
│   │   │       ├── ExecutiveDashboard.ts
│   │   │       ├── PerformanceDashboard.ts
│   │   │       ├── CostDashboard.ts
│   │   │       ├── SecurityDashboard.ts
│   │   │       └── GovernanceDashboard.ts
│   │   ├── layout/           # Layout components
│   │   │   ├── MainLayout.tsx
│   │   │   ├── Sidebar.tsx
│   │   │   ├── Header.tsx
│   │   │   └── Footer.tsx
│   │   ├── common/           # Reusable components
│   │   └── widgets/          # Widget components
│   ├── store/                # Zustand stores
│   │   ├── dashboardStore.ts
│   │   ├── metricsStore.ts
│   │   └── uiStore.ts
│   ├── services/             # API and WebSocket services
│   │   ├── api.ts
│   │   └── websocket.ts
│   ├── hooks/                # Custom React hooks
│   │   ├── useMetrics.ts
│   │   ├── useRealtime.ts
│   │   └── useDashboard.ts
│   ├── types/                # TypeScript definitions
│   │   ├── events.ts
│   │   ├── metrics.ts
│   │   ├── dashboard.ts
│   │   ├── api.ts
│   │   └── index.ts
│   ├── utils/                # Utility functions
│   ├── test/                 # Test utilities
│   ├── App.tsx               # Root component
│   ├── main.tsx              # Entry point
│   └── index.css             # Global styles
├── public/                   # Static assets
├── index.html                # HTML template
├── package.json              # Dependencies
├── tsconfig.json             # TypeScript config
├── vite.config.ts            # Vite config
└── README.md                 # This file
```

## Getting Started

### Prerequisites

- Node.js >= 18.0.0
- npm >= 9.0.0

### Installation

```bash
cd frontend
npm install
```

### Development

Start the development server:

```bash
npm run dev
```

The application will be available at `http://localhost:3000`.

### Build

Build for production:

```bash
npm run build
```

Preview production build:

```bash
npm run preview
```

### Type Checking

Run TypeScript type checking:

```bash
npm run type-check
```

### Linting

```bash
npm run lint
```

### Testing

Run tests:

```bash
npm test
```

Run tests with UI:

```bash
npm run test:ui
```

Generate coverage report:

```bash
npm run test:coverage
```

## Configuration

### Environment Variables

Create a `.env` file in the frontend directory:

```env
# API Configuration
VITE_API_URL=http://localhost:8080/api

# WebSocket Configuration
VITE_WS_URL=ws://localhost:8080

# Feature Flags
VITE_ENABLE_REALTIME=true
VITE_ENABLE_EXPORT=true
VITE_ENABLE_SHARING=true

# Analytics (optional)
VITE_ANALYTICS_ID=
```

### Backend Integration

The frontend expects the backend to be running on `http://localhost:8080` by default. Update `VITE_API_URL` and `VITE_WS_URL` to match your backend configuration.

## Usage

### Creating a Dashboard

1. Navigate to `/dashboards/new`
2. Select widgets from the chart selector
3. Configure data sources and visualizations
4. Arrange widgets using drag-and-drop
5. Save the dashboard

### Using Pre-Built Templates

```typescript
import { ExecutiveDashboard } from '@/components/dashboards/templates/ExecutiveDashboard';
import { useDashboardStore } from '@/store/dashboardStore';

const createDashboard = useDashboardStore((state) => state.createDashboard);

// Create dashboard from template
createDashboard(ExecutiveDashboard.config);
```

### Adding Custom Charts

1. Create chart component in `src/components/charts/`
2. Register in `ChartRegistry.tsx`
3. Add metadata for chart selector
4. Use in dashboard builder

Example:

```typescript
// CustomChart.tsx
import { ChartComponentProps } from './ChartRegistry';

const CustomChart: React.FC<ChartComponentProps> = ({ data, config }) => {
  return <div>Custom Chart Implementation</div>;
};

export default CustomChart;

// Register in ChartRegistry.tsx
const chartComponents = {
  // ... existing charts
  [ChartType.Custom]: lazy(() => import('./CustomChart')),
};
```

### Real-Time Data Updates

Charts automatically receive real-time updates when:

1. `auto_refresh` is enabled on the widget
2. WebSocket connection is active
3. Widget subscribes to relevant data channels

```typescript
// Automatic real-time updates
const widget: WidgetConfig = {
  // ... other config
  auto_refresh: true,
  refresh_interval: 30, // seconds
};
```

## API Integration

### REST API

All API calls use the centralized `ApiService`:

```typescript
import { getApi } from '@/services/api';

const api = getApi();

// Fetch metrics
const metrics = await api.getTimeSeries({
  measurement: 'llm_latency',
  time_range: { start: '2024-01-01', end: '2024-01-02' },
  tag_filters: { model_id: 'gpt-4' },
  select_fields: ['latency_ms'],
});

// Fetch events
const events = await api.getEvents({
  event_types: ['security'],
  severities: ['critical'],
});
```

### WebSocket

Real-time data streaming:

```typescript
import { getWebSocket } from '@/services/websocket';

const ws = getWebSocket();

// Subscribe to channels
ws.subscribe(['metric:llm_latency', 'event:security']);

// Handle updates
ws.onUpdate('metric:llm_latency', (update) => {
  console.log('New metric:', update.payload);
});
```

## State Management

### Dashboard State

```typescript
import { useDashboardStore } from '@/store/dashboardStore';

const Component = () => {
  const dashboard = useDashboardStore((state) =>
    state.dashboards[dashboardId]
  );

  const addWidget = useDashboardStore((state) => state.addWidget);
  const updateWidget = useDashboardStore((state) => state.updateWidget);

  // Use state and actions
};
```

### Metrics State

```typescript
import { useMetricsStore } from '@/store/metricsStore';

const Component = () => {
  const timeSeries = useMetricsStore((state) =>
    state.getTimeSeries('latency-1h')
  );

  const setTimeSeries = useMetricsStore((state) => state.setTimeSeries);

  // Use metrics state
};
```

### UI State

```typescript
import { useUIStore } from '@/store/uiStore';

const Component = () => {
  const theme = useUIStore((state) => state.theme);
  const preferences = useUIStore((state) => state.preferences);

  const setTheme = useUIStore((state) => state.setTheme);
  const addNotification = useUIStore((state) => state.addNotification);

  // Use UI state
};
```

## Performance Optimization

### Code Splitting

Charts are lazy-loaded to reduce initial bundle size:

```typescript
const LineChart = lazy(() => import('./LineChart'));
```

### Data Virtualization

Large datasets use virtualization for smooth scrolling:

```typescript
import { FixedSizeList } from 'react-window';
```

### Memoization

Expensive computations are memoized:

```typescript
const processedData = useMemo(() => {
  return expensiveDataTransformation(rawData);
}, [rawData]);
```

### WebSocket Buffering

Real-time updates are buffered to prevent UI thrashing:

- Max buffer size: 1000 messages
- Update batching: 100ms intervals
- Automatic oldest-message eviction

## Responsive Design

### Breakpoints

```typescript
const breakpoints = {
  xs: 480,
  sm: 768,
  md: 996,
  lg: 1200,
  xl: 1536,
};
```

### Grid Columns

```typescript
const cols = {
  lg: 12, // Desktop
  md: 10, // Tablet landscape
  sm: 6,  // Tablet portrait
  xs: 4,  // Mobile landscape
  xxs: 2, // Mobile portrait
};
```

## Dashboard Sharing

### Public Sharing

```typescript
const api = getApi();

// Create share token
const { share_token } = await api.shareDashboard(dashboardId, {
  is_public: true,
  shared_with: ['user@example.com'],
});

// Share URL
const shareUrl = `https://analytics.example.com/shared/${share_token}`;
```

### Embedding

```typescript
const embedConfig = {
  dashboard_id: 'dashboard-123',
  theme: 'light',
  hide_header: true,
  hide_filters: false,
  auto_refresh: true,
};

// Generate embed code
const embedUrl = generateEmbedUrl(embedConfig);
```

## Accessibility

- WCAG 2.1 AA compliant
- Keyboard navigation support
- Screen reader compatible
- High contrast mode
- Reduced motion support

## Browser Support

- Chrome >= 90
- Firefox >= 88
- Safari >= 14
- Edge >= 90

## Contributing

See main project [CONTRIBUTING.md](../CONTRIBUTING.md) for guidelines.

## License

Apache 2.0 - See [LICENSE](../LICENSE) for details.

## Support

For issues and questions:
- GitHub Issues
- Documentation: [/docs](../docs)
- Examples: [/src/examples](./src/examples)
