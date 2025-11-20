/**
 * Dashboard State Management
 * Zustand store for dashboard configuration, widgets, and layout
 */

import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { DashboardConfig, WidgetConfig } from '@/types/dashboard';
import { nanoid } from 'nanoid';

interface DashboardState {
  // Current dashboards
  dashboards: Record<string, DashboardConfig>;
  activeDashboardId: string | null;

  // Dashboard builder state
  isBuilderMode: boolean;
  selectedWidgetId: string | null;
  clipboardWidget: WidgetConfig | null;

  // Global filters
  activeGlobalFilters: Record<string, unknown>;

  // Actions
  loadDashboard: (dashboard: DashboardConfig) => void;
  createDashboard: (dashboard: Omit<DashboardConfig, 'id' | 'created_at' | 'updated_at'>) => string;
  updateDashboard: (id: string, updates: Partial<DashboardConfig>) => void;
  deleteDashboard: (id: string) => void;
  setActiveDashboard: (id: string | null) => void;

  // Widget actions
  addWidget: (dashboardId: string, widget: Omit<WidgetConfig, 'id'>) => string;
  updateWidget: (dashboardId: string, widgetId: string, updates: Partial<WidgetConfig>) => void;
  deleteWidget: (dashboardId: string, widgetId: string) => void;
  duplicateWidget: (dashboardId: string, widgetId: string) => string;
  moveWidget: (dashboardId: string, widgetId: string, newLayout: WidgetConfig['layout']) => void;

  // Builder mode
  setBuilderMode: (enabled: boolean) => void;
  selectWidget: (widgetId: string | null) => void;
  copyWidget: (dashboardId: string, widgetId: string) => void;
  pasteWidget: (dashboardId: string) => void;

  // Global filters
  setGlobalFilter: (filterId: string, value: unknown) => void;
  clearGlobalFilters: () => void;

  // Utilities
  getActiveDashboard: () => DashboardConfig | null;
  getWidget: (dashboardId: string, widgetId: string) => WidgetConfig | null;
}

export const useDashboardStore = create<DashboardState>()(
  immer((set, get) => ({
    dashboards: {},
    activeDashboardId: null,
    isBuilderMode: false,
    selectedWidgetId: null,
    clipboardWidget: null,
    activeGlobalFilters: {},

    loadDashboard: (dashboard) =>
      set((state) => {
        state.dashboards[dashboard.id] = dashboard;
      }),

    createDashboard: (dashboardData) => {
      const id = nanoid();
      const now = new Date().toISOString();
      const dashboard: DashboardConfig = {
        ...dashboardData,
        id,
        created_at: now,
        updated_at: now,
      };

      set((state) => {
        state.dashboards[id] = dashboard;
        state.activeDashboardId = id;
      });

      return id;
    },

    updateDashboard: (id, updates) =>
      set((state) => {
        if (state.dashboards[id]) {
          state.dashboards[id] = {
            ...state.dashboards[id],
            ...updates,
            updated_at: new Date().toISOString(),
          };
        }
      }),

    deleteDashboard: (id) =>
      set((state) => {
        delete state.dashboards[id];
        if (state.activeDashboardId === id) {
          state.activeDashboardId = null;
        }
      }),

    setActiveDashboard: (id) =>
      set((state) => {
        state.activeDashboardId = id;
        state.selectedWidgetId = null;
        state.activeGlobalFilters = {};
      }),

    addWidget: (dashboardId, widgetData) => {
      const id = nanoid();
      const widget: WidgetConfig = {
        ...widgetData,
        id,
      };

      set((state) => {
        const dashboard = state.dashboards[dashboardId];
        if (dashboard) {
          dashboard.widgets.push(widget);
          dashboard.updated_at = new Date().toISOString();
        }
      });

      return id;
    },

    updateWidget: (dashboardId, widgetId, updates) =>
      set((state) => {
        const dashboard = state.dashboards[dashboardId];
        if (dashboard) {
          const widgetIndex = dashboard.widgets.findIndex((w) => w.id === widgetId);
          if (widgetIndex !== -1) {
            dashboard.widgets[widgetIndex] = {
              ...dashboard.widgets[widgetIndex],
              ...updates,
            };
            dashboard.updated_at = new Date().toISOString();
          }
        }
      }),

    deleteWidget: (dashboardId, widgetId) =>
      set((state) => {
        const dashboard = state.dashboards[dashboardId];
        if (dashboard) {
          dashboard.widgets = dashboard.widgets.filter((w) => w.id !== widgetId);
          dashboard.updated_at = new Date().toISOString();
          if (state.selectedWidgetId === widgetId) {
            state.selectedWidgetId = null;
          }
        }
      }),

    duplicateWidget: (dashboardId, widgetId) => {
      const widget = get().getWidget(dashboardId, widgetId);
      if (!widget) return '';

      const newId = nanoid();
      const duplicatedWidget: WidgetConfig = {
        ...widget,
        id: newId,
        title: `${widget.title} (Copy)`,
        layout: {
          ...widget.layout,
          y: widget.layout.y + widget.layout.h, // Place below original
        },
      };

      set((state) => {
        const dashboard = state.dashboards[dashboardId];
        if (dashboard) {
          dashboard.widgets.push(duplicatedWidget);
          dashboard.updated_at = new Date().toISOString();
        }
      });

      return newId;
    },

    moveWidget: (dashboardId, widgetId, newLayout) =>
      set((state) => {
        const dashboard = state.dashboards[dashboardId];
        if (dashboard) {
          const widget = dashboard.widgets.find((w) => w.id === widgetId);
          if (widget) {
            widget.layout = newLayout;
            dashboard.updated_at = new Date().toISOString();
          }
        }
      }),

    setBuilderMode: (enabled) =>
      set((state) => {
        state.isBuilderMode = enabled;
        if (!enabled) {
          state.selectedWidgetId = null;
        }
      }),

    selectWidget: (widgetId) =>
      set((state) => {
        state.selectedWidgetId = widgetId;
      }),

    copyWidget: (dashboardId, widgetId) => {
      const widget = get().getWidget(dashboardId, widgetId);
      if (widget) {
        set((state) => {
          state.clipboardWidget = widget;
        });
      }
    },

    pasteWidget: (dashboardId) => {
      const { clipboardWidget } = get();
      if (!clipboardWidget) return;

      const newId = nanoid();
      const pastedWidget: WidgetConfig = {
        ...clipboardWidget,
        id: newId,
        title: `${clipboardWidget.title} (Pasted)`,
        layout: {
          ...clipboardWidget.layout,
          y: 0, // Place at top
        },
      };

      set((state) => {
        const dashboard = state.dashboards[dashboardId];
        if (dashboard) {
          dashboard.widgets.push(pastedWidget);
          dashboard.updated_at = new Date().toISOString();
        }
      });
    },

    setGlobalFilter: (filterId, value) =>
      set((state) => {
        state.activeGlobalFilters[filterId] = value;
      }),

    clearGlobalFilters: () =>
      set((state) => {
        state.activeGlobalFilters = {};
      }),

    getActiveDashboard: () => {
      const { dashboards, activeDashboardId } = get();
      return activeDashboardId ? dashboards[activeDashboardId] || null : null;
    },

    getWidget: (dashboardId, widgetId) => {
      const { dashboards } = get();
      const dashboard = dashboards[dashboardId];
      return dashboard?.widgets.find((w) => w.id === widgetId) || null;
    },
  }))
);
