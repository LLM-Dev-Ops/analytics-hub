/**
 * Dashboard Builder
 * Drag-and-drop dashboard builder with grid layout
 */

import React, { useState, useCallback } from 'react';
import { Responsive, WidthProvider, Layout } from 'react-grid-layout';
import { Box, IconButton, Paper, Tooltip, Fab } from '@mui/material';
import {
  Add as AddIcon,
  Delete as DeleteIcon,
  Edit as EditIcon,
  FileCopy as CopyIcon,
  Save as SaveIcon,
} from '@mui/icons-material';
import { useDashboardStore } from '@/store/dashboardStore';
import { WidgetConfig, ChartType } from '@/types/dashboard';
import DashboardWidget from './DashboardWidget';
import WidgetConfigPanel from './WidgetConfigPanel';
import ChartSelector from './ChartSelector';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';

const ResponsiveGridLayout = WidthProvider(Responsive);

interface DashboardBuilderProps {
  dashboardId: string;
  isEditMode?: boolean;
}

const DashboardBuilder: React.FC<DashboardBuilderProps> = ({
  dashboardId,
  isEditMode: propEditMode = false,
}) => {
  const [isEditMode, setIsEditMode] = useState(propEditMode);
  const [showChartSelector, setShowChartSelector] = useState(false);
  const [editingWidget, setEditingWidget] = useState<string | null>(null);

  const dashboard = useDashboardStore((state) => state.dashboards[dashboardId]);
  const updateWidget = useDashboardStore((state) => state.updateWidget);
  const deleteWidget = useDashboardStore((state) => state.deleteWidget);
  const duplicateWidget = useDashboardStore((state) => state.duplicateWidget);
  const addWidget = useDashboardStore((state) => state.addWidget);
  const moveWidget = useDashboardStore((state) => state.moveWidget);
  const selectedWidgetId = useDashboardStore((state) => state.selectedWidgetId);
  const selectWidget = useDashboardStore((state) => state.selectWidget);

  if (!dashboard) {
    return <div>Dashboard not found</div>;
  }

  // Convert widgets to grid layout format
  const layouts: Layout[] = dashboard.widgets.map((widget) => ({
    i: widget.id,
    x: widget.layout.x,
    y: widget.layout.y,
    w: widget.layout.w,
    h: widget.layout.h,
    minW: widget.layout.minW,
    minH: widget.layout.minH,
    maxW: widget.layout.maxW,
    maxH: widget.layout.maxH,
    static: widget.layout.static || false,
  }));

  const handleLayoutChange = useCallback(
    (newLayouts: Layout[]) => {
      newLayouts.forEach((layout) => {
        const widget = dashboard.widgets.find((w) => w.id === layout.i);
        if (widget) {
          const newLayout: WidgetConfig['layout'] = {
            x: layout.x,
            y: layout.y,
            w: layout.w,
            h: layout.h,
            minW: layout.minW,
            minH: layout.minH,
            maxW: layout.maxW,
            maxH: layout.maxH,
            static: layout.static,
          };

          if (
            newLayout.x !== widget.layout.x ||
            newLayout.y !== widget.layout.y ||
            newLayout.w !== widget.layout.w ||
            newLayout.h !== widget.layout.h
          ) {
            moveWidget(dashboardId, layout.i, newLayout);
          }
        }
      });
    },
    [dashboard.widgets, dashboardId, moveWidget]
  );

  const handleAddWidget = (chartType: ChartType) => {
    // Find available position
    const maxY = Math.max(...dashboard.widgets.map((w) => w.layout.y + w.layout.h), 0);

    const newWidget: Omit<WidgetConfig, 'id'> = {
      type: chartType,
      title: `New ${chartType} Chart`,
      data_source: {
        type: 'metric',
        time_range: 'relative',
        relative_time: 'last_1h',
        filters: {},
        group_by: [],
      },
      visual_config: {
        color_scheme: 'default',
        legend: { show: true, position: 'bottom' },
      },
      interaction_config: {
        enable_zoom: true,
        enable_pan: true,
        enable_drill_down: false,
        enable_tooltip: true,
        enable_crosshair: false,
        clickable: false,
      },
      auto_refresh: true,
      refresh_interval: 30,
      layout: {
        x: 0,
        y: maxY,
        w: 6,
        h: 4,
        minW: 3,
        minH: 2,
      },
    };

    addWidget(dashboardId, newWidget);
    setShowChartSelector(false);
  };

  const handleDeleteWidget = (widgetId: string) => {
    if (confirm('Are you sure you want to delete this widget?')) {
      deleteWidget(dashboardId, widgetId);
      if (selectedWidgetId === widgetId) {
        selectWidget(null);
      }
    }
  };

  const handleDuplicateWidget = (widgetId: string) => {
    duplicateWidget(dashboardId, widgetId);
  };

  const handleEditWidget = (widgetId: string) => {
    setEditingWidget(widgetId);
  };

  const handleSaveWidgetConfig = (widgetId: string, config: Partial<WidgetConfig>) => {
    updateWidget(dashboardId, widgetId, config);
    setEditingWidget(null);
  };

  return (
    <Box sx={{ position: 'relative', width: '100%', minHeight: '100vh', p: 2 }}>
      <ResponsiveGridLayout
        className="dashboard-grid"
        layouts={{ lg: layouts }}
        breakpoints={{ lg: 1200, md: 996, sm: 768, xs: 480, xxs: 0 }}
        cols={{ lg: 12, md: 10, sm: 6, xs: 4, xxs: 2 }}
        rowHeight={dashboard.layout_config.row_height || 60}
        isDraggable={isEditMode}
        isResizable={isEditMode}
        onLayoutChange={handleLayoutChange}
        compactType={dashboard.layout_config.compact_type || 'vertical'}
        preventCollision={dashboard.layout_config.prevent_collision || false}
      >
        {dashboard.widgets.map((widget) => (
          <div key={widget.id}>
            <Paper
              elevation={selectedWidgetId === widget.id ? 8 : 2}
              sx={{
                height: '100%',
                position: 'relative',
                border: selectedWidgetId === widget.id ? '2px solid #1976d2' : 'none',
                '&:hover .widget-actions': {
                  opacity: 1,
                },
              }}
              onClick={() => selectWidget(widget.id)}
            >
              {isEditMode && (
                <Box
                  className="widget-actions"
                  sx={{
                    position: 'absolute',
                    top: 4,
                    right: 4,
                    zIndex: 10,
                    opacity: 0,
                    transition: 'opacity 0.2s',
                    display: 'flex',
                    gap: 0.5,
                    backgroundColor: 'rgba(255, 255, 255, 0.9)',
                    borderRadius: 1,
                    padding: 0.5,
                  }}
                >
                  <Tooltip title="Edit">
                    <IconButton
                      size="small"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleEditWidget(widget.id);
                      }}
                    >
                      <EditIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title="Duplicate">
                    <IconButton
                      size="small"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDuplicateWidget(widget.id);
                      }}
                    >
                      <CopyIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title="Delete">
                    <IconButton
                      size="small"
                      color="error"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteWidget(widget.id);
                      }}
                    >
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                </Box>
              )}

              <DashboardWidget
                widget={widget}
                dashboardId={dashboardId}
                isEditMode={isEditMode}
              />
            </Paper>
          </div>
        ))}
      </ResponsiveGridLayout>

      {isEditMode && (
        <Fab
          color="primary"
          aria-label="add widget"
          sx={{
            position: 'fixed',
            bottom: 16,
            right: 16,
          }}
          onClick={() => setShowChartSelector(true)}
        >
          <AddIcon />
        </Fab>
      )}

      {showChartSelector && (
        <ChartSelector
          open={showChartSelector}
          onClose={() => setShowChartSelector(false)}
          onSelect={handleAddWidget}
        />
      )}

      {editingWidget && (
        <WidgetConfigPanel
          widget={dashboard.widgets.find((w) => w.id === editingWidget)!}
          open={!!editingWidget}
          onClose={() => setEditingWidget(null)}
          onSave={(config) => handleSaveWidgetConfig(editingWidget, config)}
        />
      )}
    </Box>
  );
};

export default DashboardBuilder;
