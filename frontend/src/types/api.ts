/**
 * API Response Types
 * Standard API response formats, pagination, and error handling
 */

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: ApiError;
  metadata?: ResponseMetadata;
}

export interface ApiError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
  suggestions?: string[];
  trace_id?: string;
}

export interface ResponseMetadata {
  timestamp: string;
  request_id: string;
  processing_time_ms: number;
  version: string;
}

// Pagination
export interface PaginatedResponse<T> {
  items: T[];
  pagination: PaginationInfo;
  total_count: number;
}

export interface PaginationInfo {
  page: number;
  page_size: number;
  total_pages: number;
  has_next: boolean;
  has_previous: boolean;
  next_cursor?: string;
  previous_cursor?: string;
}

export interface CursorPaginationParams {
  cursor?: string;
  limit: number;
  direction?: 'forward' | 'backward';
}

export interface OffsetPaginationParams {
  offset: number;
  limit: number;
}

// Batch operations
export interface BatchOperationRequest<T> {
  operations: T[];
  transaction_id?: string;
  fail_fast?: boolean;
}

export interface BatchOperationResponse<T> {
  results: BatchResult<T>[];
  total_count: number;
  success_count: number;
  failure_count: number;
}

export interface BatchResult<T> {
  index: number;
  success: boolean;
  data?: T;
  error?: ApiError;
}

// Query builders
export interface QueryBuilder {
  filters?: FilterExpression[];
  sort?: SortExpression[];
  include?: string[];
  exclude?: string[];
}

export interface FilterExpression {
  field: string;
  operator: FilterOperator;
  value: unknown;
  case_sensitive?: boolean;
}

export enum FilterOperator {
  Equals = 'eq',
  NotEquals = 'ne',
  GreaterThan = 'gt',
  GreaterThanOrEqual = 'gte',
  LessThan = 'lt',
  LessThanOrEqual = 'lte',
  In = 'in',
  NotIn = 'nin',
  Contains = 'contains',
  StartsWith = 'starts_with',
  EndsWith = 'ends_with',
  Regex = 'regex',
  IsNull = 'is_null',
  IsNotNull = 'is_not_null',
}

export interface SortExpression {
  field: string;
  direction: 'asc' | 'desc';
}

// WebSocket message types
export interface WebSocketMessage<T = unknown> {
  type: WebSocketMessageType;
  data: T;
  timestamp: string;
  correlation_id?: string;
}

export enum WebSocketMessageType {
  Subscribe = 'subscribe',
  Unsubscribe = 'unsubscribe',
  Update = 'update',
  Heartbeat = 'heartbeat',
  Error = 'error',
  Connected = 'connected',
  Disconnected = 'disconnected',
}

export interface SubscriptionRequest {
  channels: string[];
  filters?: Record<string, unknown>;
}

export interface UpdateMessage<T> {
  channel: string;
  payload: T;
  sequence_number: number;
  is_partial_update: boolean;
}
