/**
 * UI State Management
 * Zustand store for UI preferences, theme, and layout state
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';

export type Theme = 'light' | 'dark' | 'auto';
export type ViewMode = 'desktop' | 'tablet' | 'mobile';

interface Notification {
  id: string;
  type: 'success' | 'error' | 'warning' | 'info';
  message: string;
  duration?: number;
  action?: {
    label: string;
    onClick: () => void;
  };
}

interface UIState {
  // Theme
  theme: Theme;
  effectiveTheme: 'light' | 'dark';

  // Layout
  sidebarOpen: boolean;
  sidebarCollapsed: boolean;
  viewMode: ViewMode;

  // Modals and dialogs
  activeModal: string | null;
  modalData: Record<string, unknown>;

  // Notifications
  notifications: Notification[];

  // User preferences
  preferences: UserPreferences;

  // Actions
  setTheme: (theme: Theme) => void;
  setEffectiveTheme: (theme: 'light' | 'dark') => void;
  toggleSidebar: () => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
  setViewMode: (mode: ViewMode) => void;

  openModal: (modalId: string, data?: Record<string, unknown>) => void;
  closeModal: () => void;

  addNotification: (notification: Omit<Notification, 'id'>) => string;
  removeNotification: (id: string) => void;
  clearNotifications: () => void;

  updatePreferences: (updates: Partial<UserPreferences>) => void;
}

interface UserPreferences {
  // Display
  compactMode: boolean;
  showGridLines: boolean;
  animationsEnabled: boolean;

  // Charts
  defaultChartColors: string[];
  chartAnimationDuration: number;

  // Data refresh
  defaultRefreshInterval: number;
  autoRefreshEnabled: boolean;

  // Timezone
  timezone: string;
  dateFormat: string;
  timeFormat: '12h' | '24h';

  // Accessibility
  highContrast: boolean;
  reducedMotion: boolean;
  fontSize: 'small' | 'medium' | 'large';

  // Notifications
  enableSoundNotifications: boolean;
  enableDesktopNotifications: boolean;

  // Advanced
  developerMode: boolean;
  debugMode: boolean;
}

const defaultPreferences: UserPreferences = {
  compactMode: false,
  showGridLines: true,
  animationsEnabled: true,
  defaultChartColors: [
    '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6',
    '#ec4899', '#14b8a6', '#f97316', '#06b6d4', '#84cc16',
  ],
  chartAnimationDuration: 300,
  defaultRefreshInterval: 30000,
  autoRefreshEnabled: true,
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  dateFormat: 'MMM dd, yyyy',
  timeFormat: '24h',
  highContrast: false,
  reducedMotion: false,
  fontSize: 'medium',
  enableSoundNotifications: false,
  enableDesktopNotifications: true,
  developerMode: false,
  debugMode: false,
};

export const useUIStore = create<UIState>()(
  persist(
    immer((set, get) => ({
      theme: 'auto',
      effectiveTheme: 'light',
      sidebarOpen: true,
      sidebarCollapsed: false,
      viewMode: 'desktop',
      activeModal: null,
      modalData: {},
      notifications: [],
      preferences: defaultPreferences,

      setTheme: (theme) =>
        set((state) => {
          state.theme = theme;
        }),

      setEffectiveTheme: (theme) =>
        set((state) => {
          state.effectiveTheme = theme;
        }),

      toggleSidebar: () =>
        set((state) => {
          state.sidebarOpen = !state.sidebarOpen;
        }),

      setSidebarCollapsed: (collapsed) =>
        set((state) => {
          state.sidebarCollapsed = collapsed;
        }),

      setViewMode: (mode) =>
        set((state) => {
          state.viewMode = mode;
        }),

      openModal: (modalId, data = {}) =>
        set((state) => {
          state.activeModal = modalId;
          state.modalData = data;
        }),

      closeModal: () =>
        set((state) => {
          state.activeModal = null;
          state.modalData = {};
        }),

      addNotification: (notification) => {
        const id = `notif-${Date.now()}-${Math.random()}`;
        set((state) => {
          state.notifications.push({ ...notification, id });
        });

        // Auto-remove after duration
        const duration = notification.duration || 5000;
        if (duration > 0) {
          setTimeout(() => {
            get().removeNotification(id);
          }, duration);
        }

        return id;
      },

      removeNotification: (id) =>
        set((state) => {
          state.notifications = state.notifications.filter((n) => n.id !== id);
        }),

      clearNotifications: () =>
        set((state) => {
          state.notifications = [];
        }),

      updatePreferences: (updates) =>
        set((state) => {
          state.preferences = { ...state.preferences, ...updates };
        }),
    })),
    {
      name: 'llm-analytics-ui-store',
      partialize: (state) => ({
        theme: state.theme,
        sidebarCollapsed: state.sidebarCollapsed,
        preferences: state.preferences,
      }),
    }
  )
);
