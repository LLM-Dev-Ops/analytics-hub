/**
 * Main Application Component
 * Root component with routing and theme provider
 */

import React, { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ThemeProvider, createTheme, CssBaseline } from '@mui/material';
import { QueryClient, QueryClientProvider } from 'react-query';
import { Toaster } from 'react-hot-toast';

import { useUIStore } from '@/store/uiStore';
import { initApi } from '@/services/api';
import { initWebSocket } from '@/services/websocket';

import MainLayout from '@/components/layout/MainLayout';
import DashboardView from '@/components/dashboards/DashboardView';
import DashboardList from '@/components/dashboards/DashboardList';
import DashboardBuilder from '@/components/dashboards/DashboardBuilder';

// Initialize services
const API_BASE_URL = import.meta.env.VITE_API_URL || '/api';
const WS_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:8080';

initApi(API_BASE_URL);
initWebSocket({ url: WS_URL, autoConnect: true });

// Query client for react-query
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
      staleTime: 30000,
    },
  },
});

const App: React.FC = () => {
  const theme = useUIStore((state) => state.theme);
  const effectiveTheme = useUIStore((state) => state.effectiveTheme);
  const setEffectiveTheme = useUIStore((state) => state.setEffectiveTheme);

  // Handle theme changes
  useEffect(() => {
    if (theme === 'auto') {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      setEffectiveTheme(mediaQuery.matches ? 'dark' : 'light');

      const handler = (e: MediaQueryListEvent) => {
        setEffectiveTheme(e.matches ? 'dark' : 'light');
      };

      mediaQuery.addEventListener('change', handler);
      return () => mediaQuery.removeEventListener('change', handler);
    } else {
      setEffectiveTheme(theme);
    }
  }, [theme, setEffectiveTheme]);

  // Create MUI theme
  const muiTheme = createTheme({
    palette: {
      mode: effectiveTheme,
      primary: {
        main: '#3b82f6',
      },
      secondary: {
        main: '#10b981',
      },
      error: {
        main: '#ef4444',
      },
      warning: {
        main: '#f59e0b',
      },
      success: {
        main: '#10b981',
      },
    },
    typography: {
      fontFamily: '"Inter", "Roboto", "Helvetica", "Arial", sans-serif',
    },
    components: {
      MuiButton: {
        styleOverrides: {
          root: {
            textTransform: 'none',
          },
        },
      },
    },
  });

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider theme={muiTheme}>
        <CssBaseline />
        <BrowserRouter>
          <MainLayout>
            <Routes>
              <Route path="/" element={<Navigate to="/dashboards" replace />} />
              <Route path="/dashboards" element={<DashboardList />} />
              <Route path="/dashboards/:id" element={<DashboardView />} />
              <Route path="/dashboards/:id/edit" element={<DashboardBuilder dashboardId="" isEditMode />} />
              <Route path="/dashboards/new" element={<DashboardBuilder dashboardId="" isEditMode />} />
              <Route path="*" element={<Navigate to="/dashboards" replace />} />
            </Routes>
          </MainLayout>
        </BrowserRouter>
        <Toaster
          position="top-right"
          toastOptions={{
            duration: 4000,
            style: {
              background: effectiveTheme === 'dark' ? '#333' : '#fff',
              color: effectiveTheme === 'dark' ? '#fff' : '#333',
            },
          }}
        />
      </ThemeProvider>
    </QueryClientProvider>
  );
};

export default App;
