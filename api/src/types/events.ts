/**
 * Analytics Event Types
 * TypeScript definitions matching the Rust backend event schemas
 *
 * This is a mirrored copy for use in the API.
 * Shared with frontend/src/types/events.ts
 */

export type UUID = string;
export type ISODateString = string;

// Schema version
export const SCHEMA_VERSION = '1.0.0';

// Source modules in the LLM ecosystem
export enum SourceModule {
  LlmObservatory = 'llm-observatory',
  LlmSentinel = 'llm-sentinel',
  LlmCostOps = 'llm-cost-ops',
  LlmGovernanceDashboard = 'llm-governance-dashboard',
  LlmRegistry = 'llm-registry',
  LlmPolicyEngine = 'llm-policy-engine',
  LlmAnalyticsHub = 'llm-analytics-hub',
}

// Event type classification
export enum EventType {
  Telemetry = 'telemetry',
  Security = 'security',
  Cost = 'cost',
  Governance = 'governance',
  Lifecycle = 'lifecycle',
  Audit = 'audit',
  Alert = 'alert',
}

// Lowercase string literals that map to EventType enum values
export type EventTypeValue = 'telemetry' | 'security' | 'cost' | 'governance' | 'lifecycle' | 'audit' | 'alert';

// Severity levels
export enum Severity {
  Debug = 'debug',
  Info = 'info',
  Warning = 'warning',
  Error = 'error',
  Critical = 'critical',
}

// Common fields present in all analytics events
export interface CommonEventFields {
  event_id: UUID;
  timestamp: ISODateString;
  source_module: SourceModule;
  event_type: EventType;
  correlation_id?: UUID;
  parent_event_id?: UUID;
  schema_version: string;
  severity: Severity;
  environment: string;
  tags: Record<string, string>;
}

// Telemetry Payloads
export interface LatencyMetrics {
  model_id: string;
  request_id: string;
  total_latency_ms: number;
  ttft_ms?: number;
  tokens_per_second?: number;
  breakdown?: LatencyBreakdown;
}

export interface LatencyBreakdown {
  network_ms?: number;
  queue_ms?: number;
  processing_ms?: number;
  deserialization_ms?: number;
}

export interface ThroughputMetrics {
  model_id: string;
  requests_per_second: number;
  tokens_per_second: number;
  concurrent_requests: number;
  queue_depth: number;
}

export interface ErrorMetrics {
  error_type: string;
  error_code?: string;
  error_message: string;
  stack_trace?: string;
  model_id?: string;
  request_id?: string;
  retry_count?: number;
  is_recoverable: boolean;
}

export interface TokenUsageMetrics {
  model_id: string;
  request_id: string;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  estimated_cost?: number;
}

export type TelemetryPayload =
  | { type: 'latency'; data: LatencyMetrics }
  | { type: 'throughput'; data: ThroughputMetrics }
  | { type: 'error'; data: ErrorMetrics }
  | { type: 'token_usage'; data: TokenUsageMetrics };

// Security Payloads
export interface ThreatDetection {
  threat_type: string;
  threat_level: Severity;
  description: string;
  source_ip?: string;
  target_resource: string;
  indicators: string[];
  mitigation_actions: string[];
}

export interface VulnerabilityReport {
  vulnerability_id: string;
  cve_id?: string;
  severity: Severity;
  affected_component: string;
  description: string;
  remediation?: string;
  exploitable: boolean;
}

export interface ComplianceViolation {
  policy_id: string;
  policy_name: string;
  violation_type: string;
  description: string;
  resource_id: string;
  remediation_steps?: string[];
}

export type SecurityPayload =
  | { type: 'threat'; data: ThreatDetection }
  | { type: 'vulnerability'; data: VulnerabilityReport }
  | { type: 'compliance'; data: ComplianceViolation };

// Cost Payloads
export interface TokenCostMetrics {
  model_id: string;
  request_id: string;
  prompt_tokens: number;
  completion_tokens: number;
  prompt_cost: number;
  completion_cost: number;
  total_cost: number;
  currency: string;
  pricing_tier?: string;
}

export interface ApiCostMetrics {
  api_endpoint: string;
  request_count: number;
  total_cost: number;
  average_cost_per_request: number;
  currency: string;
  billing_period_start: ISODateString;
  billing_period_end: ISODateString;
}

export interface ResourceConsumption {
  resource_type: string;
  resource_id: string;
  units_consumed: number;
  cost_per_unit: number;
  total_cost: number;
  currency: string;
}

export type CostPayload =
  | { type: 'token_cost'; data: TokenCostMetrics }
  | { type: 'api_cost'; data: ApiCostMetrics }
  | { type: 'resource'; data: ResourceConsumption };

// Governance Payloads
export interface PolicyViolation {
  policy_id: string;
  policy_name: string;
  policy_type: string;
  violation_description: string;
  resource_id: string;
  user_id?: string;
  severity: Severity;
  auto_remediated: boolean;
  remediation_action?: string;
}

export interface AuditLogEntry {
  action: string;
  resource_type: string;
  resource_id: string;
  user_id: string;
  user_role?: string;
  ip_address?: string;
  user_agent?: string;
  changes?: Record<string, unknown>;
  success: boolean;
  error_message?: string;
}

export type GovernancePayload =
  | { type: 'policy_violation'; data: PolicyViolation }
  | { type: 'audit'; data: AuditLogEntry };

// Event payload union type
export type EventPayload =
  | { payload_type: 'telemetry'; data: TelemetryPayload }
  | { payload_type: 'security'; data: SecurityPayload }
  | { payload_type: 'cost'; data: CostPayload }
  | { payload_type: 'governance'; data: GovernancePayload };

// Complete analytics event
export interface AnalyticsEvent extends CommonEventFields {
  payload: EventPayload;
}

// Event filters for queries
export interface EventFilters {
  source_modules?: (SourceModule | string)[];
  event_types?: (EventType | string)[];
  severities?: (Severity | string)[];
  start_time?: ISODateString;
  end_time?: ISODateString;
  tags?: Record<string, string>;
  correlation_id?: UUID;
}
