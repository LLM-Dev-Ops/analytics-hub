/**
 * API Service
 * REST API client with type-safe endpoints for backend integration
 */

import axios, { AxiosInstance, AxiosRequestConfig, AxiosError } from 'axios';
import {
  ApiResponse,
  ApiError,
  PaginatedResponse,
  OffsetPaginationParams,
  BatchOperationRequest,
  BatchOperationResponse,
  QueryBuilder,
} from '@/types/api';
import { AnalyticsEvent, EventFilters } from '@/types/events';
import { TimeSeriesQuery, TimeSeriesData, Metric, AggregatedMetric } from '@/types/metrics';
import { DashboardConfig, DashboardTemplate } from '@/types/dashboard';

export class ApiService {
  private client: AxiosInstance;

  constructor(baseURL: string = '/api') {
    this.client = axios.create({
      baseURL,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    this.setupInterceptors();
  }

  private setupInterceptors(): void {
    // Request interceptor
    this.client.interceptors.request.use(
      (config) => {
        // Add auth token if available
        const token = this.getAuthToken();
        if (token) {
          config.headers.Authorization = `Bearer ${token}`;
        }

        // Add request ID for tracing
        config.headers['X-Request-ID'] = this.generateRequestId();

        return config;
      },
      (error) => Promise.reject(error)
    );

    // Response interceptor
    this.client.interceptors.response.use(
      (response) => response,
      (error: AxiosError<ApiError>) => {
        if (error.response) {
          // Handle specific error codes
          const apiError = error.response.data;
          console.error('API Error:', apiError);

          if (error.response.status === 401) {
            // Handle unauthorized - trigger re-auth
            this.handleUnauthorized();
          }

          return Promise.reject(apiError);
        } else if (error.request) {
          // Request made but no response
          const networkError: ApiError = {
            code: 'NETWORK_ERROR',
            message: 'Network error occurred. Please check your connection.',
          };
          return Promise.reject(networkError);
        } else {
          // Something else happened
          const unknownError: ApiError = {
            code: 'UNKNOWN_ERROR',
            message: error.message || 'An unknown error occurred',
          };
          return Promise.reject(unknownError);
        }
      }
    );
  }

  private getAuthToken(): string | null {
    // Get from localStorage or auth store
    return localStorage.getItem('auth_token');
  }

  private generateRequestId(): string {
    return `req-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  private handleUnauthorized(): void {
    // Emit event or call auth service to handle re-authentication
    window.dispatchEvent(new CustomEvent('auth:unauthorized'));
  }

  // Generic request method
  private async request<T>(config: AxiosRequestConfig): Promise<ApiResponse<T>> {
    const response = await this.client.request<ApiResponse<T>>(config);
    return response.data;
  }

  // Events API
  async getEvents(filters?: EventFilters, pagination?: OffsetPaginationParams): Promise<PaginatedResponse<AnalyticsEvent>> {
    const params = { ...filters, ...pagination };
    const response = await this.request<PaginatedResponse<AnalyticsEvent>>({
      method: 'GET',
      url: '/events',
      params,
    });
    return response.data!;
  }

  async getEvent(eventId: string): Promise<AnalyticsEvent> {
    const response = await this.request<AnalyticsEvent>({
      method: 'GET',
      url: `/events/${eventId}`,
    });
    return response.data!;
  }

  async createEvent(event: AnalyticsEvent): Promise<AnalyticsEvent> {
    const response = await this.request<AnalyticsEvent>({
      method: 'POST',
      url: '/events',
      data: event,
    });
    return response.data!;
  }

  async batchCreateEvents(events: AnalyticsEvent[]): Promise<BatchOperationResponse<AnalyticsEvent>> {
    const request: BatchOperationRequest<AnalyticsEvent> = {
      operations: events,
      fail_fast: false,
    };
    const response = await this.request<BatchOperationResponse<AnalyticsEvent>>({
      method: 'POST',
      url: '/events/batch',
      data: request,
    });
    return response.data!;
  }

  // Metrics API
  async getMetrics(measurement: string, query?: QueryBuilder): Promise<Metric[]> {
    const response = await this.request<Metric[]>({
      method: 'GET',
      url: `/metrics/${measurement}`,
      params: query,
    });
    return response.data!;
  }

  async getTimeSeries(query: TimeSeriesQuery): Promise<TimeSeriesData> {
    const response = await this.request<TimeSeriesData>({
      method: 'POST',
      url: '/metrics/timeseries',
      data: query,
    });
    return response.data!;
  }

  async getAggregatedMetrics(measurement: string, timeWindow: string, filters?: Record<string, string>): Promise<AggregatedMetric[]> {
    const response = await this.request<AggregatedMetric[]>({
      method: 'GET',
      url: `/metrics/${measurement}/aggregated`,
      params: { time_window: timeWindow, ...filters },
    });
    return response.data!;
  }

  async recordMetric(metric: Metric): Promise<void> {
    await this.request({
      method: 'POST',
      url: '/metrics',
      data: metric,
    });
  }

  // Dashboards API
  async getDashboards(category?: string): Promise<DashboardConfig[]> {
    const response = await this.request<DashboardConfig[]>({
      method: 'GET',
      url: '/dashboards',
      params: category ? { category } : undefined,
    });
    return response.data!;
  }

  async getDashboard(id: string): Promise<DashboardConfig> {
    const response = await this.request<DashboardConfig>({
      method: 'GET',
      url: `/dashboards/${id}`,
    });
    return response.data!;
  }

  async createDashboard(dashboard: Omit<DashboardConfig, 'id' | 'created_at' | 'updated_at'>): Promise<DashboardConfig> {
    const response = await this.request<DashboardConfig>({
      method: 'POST',
      url: '/dashboards',
      data: dashboard,
    });
    return response.data!;
  }

  async updateDashboard(id: string, updates: Partial<DashboardConfig>): Promise<DashboardConfig> {
    const response = await this.request<DashboardConfig>({
      method: 'PATCH',
      url: `/dashboards/${id}`,
      data: updates,
    });
    return response.data!;
  }

  async deleteDashboard(id: string): Promise<void> {
    await this.request({
      method: 'DELETE',
      url: `/dashboards/${id}`,
    });
  }

  async getDashboardTemplates(): Promise<DashboardTemplate[]> {
    const response = await this.request<DashboardTemplate[]>({
      method: 'GET',
      url: '/dashboards/templates',
    });
    return response.data!;
  }

  async createDashboardFromTemplate(templateId: string, name: string): Promise<DashboardConfig> {
    const response = await this.request<DashboardConfig>({
      method: 'POST',
      url: `/dashboards/templates/${templateId}/instantiate`,
      data: { name },
    });
    return response.data!;
  }

  // Dashboard sharing
  async shareDashboard(dashboardId: string, permissions: { is_public: boolean; shared_with?: string[] }): Promise<{ share_token: string }> {
    const response = await this.request<{ share_token: string }>({
      method: 'POST',
      url: `/dashboards/${dashboardId}/share`,
      data: permissions,
    });
    return response.data!;
  }

  async getSharedDashboard(shareToken: string): Promise<DashboardConfig> {
    const response = await this.request<DashboardConfig>({
      method: 'GET',
      url: `/dashboards/shared/${shareToken}`,
    });
    return response.data!;
  }

  // User preferences API
  async getUserPreferences(): Promise<Record<string, unknown>> {
    const response = await this.request<Record<string, unknown>>({
      method: 'GET',
      url: '/users/me/preferences',
    });
    return response.data!;
  }

  async updateUserPreferences(preferences: Record<string, unknown>): Promise<Record<string, unknown>> {
    const response = await this.request<Record<string, unknown>>({
      method: 'PATCH',
      url: '/users/me/preferences',
      data: preferences,
    });
    return response.data!;
  }

  // Health check
  async healthCheck(): Promise<{ status: string; timestamp: string }> {
    const response = await this.request<{ status: string; timestamp: string }>({
      method: 'GET',
      url: '/health',
    });
    return response.data!;
  }

  // Export data
  async exportDashboard(dashboardId: string, format: 'json' | 'pdf' | 'png'): Promise<Blob> {
    const response = await this.client.request({
      method: 'GET',
      url: `/dashboards/${dashboardId}/export`,
      params: { format },
      responseType: 'blob',
    });
    return response.data;
  }

  async exportData(query: TimeSeriesQuery, format: 'csv' | 'json' | 'xlsx'): Promise<Blob> {
    const response = await this.client.request({
      method: 'POST',
      url: '/metrics/export',
      data: query,
      params: { format },
      responseType: 'blob',
    });
    return response.data;
  }
}

// Singleton instance
let apiInstance: ApiService | null = null;

export function initApi(baseURL?: string): ApiService {
  if (!apiInstance) {
    apiInstance = new ApiService(baseURL);
  }
  return apiInstance;
}

export function getApi(): ApiService {
  if (!apiInstance) {
    apiInstance = new ApiService();
  }
  return apiInstance;
}

export default ApiService;
