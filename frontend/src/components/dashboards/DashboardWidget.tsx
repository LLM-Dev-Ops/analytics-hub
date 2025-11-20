/**
 * Dashboard Widget
 * Wrapper component for rendering individual chart widgets
 */

import React, { Suspense, useEffect, useState } from 'react';
import { Box, Typography, CircularProgress, Alert } from '@mui/material';
import { WidgetConfig } from '@/types/dashboard';
import { getChartComponent } from '@/components/charts/ChartRegistry';
import { getApi } from '@/services/api';
import { getWebSocket } from '@/services/websocket';

interface DashboardWidgetProps {
  widget: WidgetConfig;
  dashboardId: string;
  isEditMode?: boolean;
}

const DashboardWidget: React.FC<DashboardWidgetProps> = ({
  widget,
  dashboardId,
  isEditMode = false,
}) => {
  const [data, setData] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const ChartComponent = getChartComponent(widget.type);

  // Fetch data
  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      setError(null);

      try {
        const api = getApi();

        if (widget.data_source.type === 'metric') {
          // Fetch time-series data
          const query = {
            measurement: widget.data_source.measurement || '',
            time_range: widget.data_source.time_range === 'relative'
              ? getTimeRange(widget.data_source.relative_time || 'last_1h')
              : widget.data_source.time_range as any,
            tag_filters: widget.data_source.filters || {},
            select_fields: widget.data_source.fields || [],
            aggregation: widget.data_source.aggregation,
            group_by: widget.data_source.group_by || [],
            limit: widget.data_source.limit,
          };

          const result = await api.getTimeSeries(query);
          setData(result.points);
        } else if (widget.data_source.type === 'event') {
          // Fetch events
          const filters = {
            event_types: widget.data_source.event_types,
            source_modules: widget.data_source.source_modules,
            severities: widget.data_source.severities,
            start_time: widget.data_source.time_range === 'relative'
              ? getTimeRange(widget.data_source.relative_time || 'last_1h').start
              : (widget.data_source.time_range as any).start,
            end_time: widget.data_source.time_range === 'relative'
              ? getTimeRange(widget.data_source.relative_time || 'last_1h').end
              : (widget.data_source.time_range as any).end,
          };

          const result = await api.getEvents(filters);
          setData(result.items);
        }

        setLoading(false);
      } catch (err) {
        console.error('Error fetching widget data:', err);
        setError(err instanceof Error ? err.message : 'Failed to load data');
        setLoading(false);
      }
    };

    fetchData();

    // Set up auto-refresh
    let intervalId: NodeJS.Timeout | null = null;
    if (widget.auto_refresh && widget.refresh_interval && !isEditMode) {
      intervalId = setInterval(fetchData, widget.refresh_interval * 1000);
    }

    return () => {
      if (intervalId) {
        clearInterval(intervalId);
      }
    };
  }, [widget, isEditMode]);

  // Set up real-time updates
  useEffect(() => {
    if (!widget.auto_refresh || isEditMode) return;

    const ws = getWebSocket();
    if (!ws) return;

    // Subscribe to relevant channels
    const channels = [`dashboard:${dashboardId}:widget:${widget.id}`];
    if (widget.data_source.measurement) {
      channels.push(`metric:${widget.data_source.measurement}`);
    }

    ws.subscribe(channels);

    const unsubscribe = ws.onUpdate('*', (update) => {
      // Handle real-time update
      if (update.channel.includes(widget.id)) {
        setData((prevData: any) => {
          // Append or update data based on update type
          if (Array.isArray(prevData)) {
            return [...prevData, update.payload];
          }
          return update.payload;
        });
      }
    });

    return () => {
      ws.unsubscribe(channels);
      unsubscribe();
    };
  }, [widget, dashboardId, isEditMode]);

  if (!ChartComponent) {
    return (
      <Box p={2}>
        <Alert severity="error">
          Chart type "{widget.type}" is not supported
        </Alert>
      </Box>
    );
  }

  if (loading) {
    return (
      <Box
        display="flex"
        alignItems="center"
        justifyContent="center"
        height="100%"
        flexDirection="column"
        gap={2}
      >
        <CircularProgress />
        <Typography variant="caption" color="textSecondary">
          Loading {widget.title}...
        </Typography>
      </Box>
    );
  }

  if (error) {
    return (
      <Box p={2}>
        <Alert severity="error">
          <Typography variant="subtitle2">{widget.title}</Typography>
          <Typography variant="body2">{error}</Typography>
        </Alert>
      </Box>
    );
  }

  return (
    <Box
      sx={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      <Box px={2} pt={2} pb={1}>
        <Typography variant="h6" component="h3" gutterBottom>
          {widget.title}
        </Typography>
        {widget.description && (
          <Typography variant="caption" color="textSecondary">
            {widget.description}
          </Typography>
        )}
      </Box>

      <Box flex={1} p={2} overflow="auto">
        <Suspense
          fallback={
            <Box display="flex" justifyContent="center" alignItems="center" height="100%">
              <CircularProgress />
            </Box>
          }
        >
          <ChartComponent
            data={data}
            config={widget.visual_config.options || {}}
            onDataPointClick={
              widget.interaction_config.clickable
                ? (data) => console.log('Data point clicked:', data)
                : undefined
            }
            isRealtime={widget.auto_refresh}
          />
        </Suspense>
      </Box>
    </Box>
  );
};

// Helper function to convert relative time to time range
function getTimeRange(relativeTime: string): { start: string; end: string } {
  const now = new Date();
  const end = now.toISOString();

  const timeMap: Record<string, number> = {
    last_5m: 5 * 60 * 1000,
    last_15m: 15 * 60 * 1000,
    last_30m: 30 * 60 * 1000,
    last_1h: 60 * 60 * 1000,
    last_3h: 3 * 60 * 60 * 1000,
    last_6h: 6 * 60 * 60 * 1000,
    last_12h: 12 * 60 * 60 * 1000,
    last_24h: 24 * 60 * 60 * 1000,
    last_7d: 7 * 24 * 60 * 60 * 1000,
    last_30d: 30 * 24 * 60 * 60 * 1000,
  };

  const ms = timeMap[relativeTime] || timeMap.last_1h;
  const start = new Date(now.getTime() - ms).toISOString();

  return { start, end };
}

export default DashboardWidget;
