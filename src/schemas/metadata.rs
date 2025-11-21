//! Metadata Schemas
//!
//! Asset metadata from LLM-Registry, policy definitions from LLM-Policy-Engine,
//! dashboard configuration schemas, and user preference models.

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

// ============================================================================
// ASSET METADATA (LLM-Registry)
// ============================================================================

/// Asset metadata from LLM-Registry
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AssetMetadata {
    /// Unique asset identifier
    pub asset_id: String,

    /// Asset type
    pub asset_type: AssetType,

    /// Asset name
    pub name: String,

    /// Description
    pub description: String,

    /// Version information
    pub version: VersionInfo,

    /// Owner/team information
    pub owner: OwnerInfo,

    /// Tags for categorization
    #[serde(default)]
    pub tags: HashMap<String, String>,

    /// Creation timestamp
    pub created_at: DateTime<Utc>,

    /// Last updated timestamp
    pub updated_at: DateTime<Utc>,

    /// Asset status
    pub status: AssetStatus,

    /// Asset-specific metadata
    pub metadata: AssetSpecificMetadata,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum AssetType {
    /// Language model
    Model,

    /// Fine-tuned model
    FineTunedModel,

    /// Prompt template
    PromptTemplate,

    /// Dataset
    Dataset,

    /// API endpoint
    Endpoint,

    /// Application or service
    Application,

    /// Custom asset type
    Custom(String),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VersionInfo {
    pub version: String,
    pub previous_version: Option<String>,
    pub changelog: Option<String>,
    pub release_notes: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OwnerInfo {
    pub user_id: String,
    pub username: String,
    pub email: Option<String>,
    pub team: Option<String>,
    pub department: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum AssetStatus {
    Draft,
    Active,
    Deprecated,
    Archived,
    Deleted,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "metadata_type")]
pub enum AssetSpecificMetadata {
    #[serde(rename = "model")]
    Model(ModelMetadata),

    #[serde(rename = "prompt_template")]
    PromptTemplate(PromptTemplateMetadata),

    #[serde(rename = "dataset")]
    Dataset(DatasetMetadata),

    #[serde(rename = "endpoint")]
    Endpoint(EndpointMetadata),

    #[serde(rename = "application")]
    Application(ApplicationMetadata),

    #[serde(rename = "custom")]
    Custom(HashMap<String, serde_json::Value>),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModelMetadata {
    /// Model provider (e.g., OpenAI, Anthropic, HuggingFace)
    pub provider: String,

    /// Model family (e.g., GPT-4, Claude, Llama)
    pub family: String,

    /// Model size (parameters)
    pub parameters: Option<String>,

    /// Context window size
    pub context_window: Option<u32>,

    /// Supported capabilities
    pub capabilities: Vec<String>,

    /// Cost information
    pub cost_info: Option<CostInfo>,

    /// Performance benchmarks
    #[serde(default)]
    pub benchmarks: HashMap<String, f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CostInfo {
    pub cost_per_input_token: f64,
    pub cost_per_output_token: f64,
    pub currency: String,
    pub billing_unit: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PromptTemplateMetadata {
    /// Template content
    pub template: String,

    /// Variables in the template
    pub variables: Vec<TemplateVariable>,

    /// Use case category
    pub category: String,

    /// Expected output format
    pub output_format: Option<String>,

    /// Example inputs/outputs
    #[serde(default)]
    pub examples: Vec<PromptExample>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TemplateVariable {
    pub name: String,
    pub description: String,
    pub required: bool,
    pub default_value: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PromptExample {
    pub input: HashMap<String, String>,
    pub output: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DatasetMetadata {
    /// Dataset size
    pub size_bytes: u64,

    /// Number of records
    pub record_count: u64,

    /// Schema definition
    pub schema: Option<DataSchema>,

    /// Data sources
    pub sources: Vec<String>,

    /// Data quality metrics
    #[serde(default)]
    pub quality_metrics: HashMap<String, f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DataSchema {
    pub fields: Vec<SchemaField>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SchemaField {
    pub name: String,
    pub field_type: String,
    pub required: bool,
    pub description: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EndpointMetadata {
    /// Endpoint URL
    pub url: String,

    /// HTTP method
    pub method: String,

    /// Authentication type
    pub auth_type: String,

    /// Rate limits
    pub rate_limit: Option<RateLimit>,

    /// SLA information
    pub sla: Option<SlaInfo>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RateLimit {
    pub requests_per_minute: u32,
    pub tokens_per_minute: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SlaInfo {
    pub uptime_percent: f64,
    pub max_latency_ms: u32,
    pub support_level: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ApplicationMetadata {
    /// Application URL
    pub url: Option<String>,

    /// Technology stack
    pub tech_stack: Vec<String>,

    /// Dependencies
    pub dependencies: Vec<Dependency>,

    /// Deployment info
    pub deployment: Option<DeploymentInfo>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Dependency {
    pub name: String,
    pub version: String,
    pub dependency_type: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DeploymentInfo {
    pub environment: String,
    pub region: String,
    pub deployed_at: DateTime<Utc>,
    pub deployed_by: String,
}

// ============================================================================
// POLICY DEFINITIONS (LLM-Policy-Engine)
// ============================================================================

/// Policy definition from LLM-Policy-Engine
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PolicyDefinition {
    /// Unique policy identifier
    pub policy_id: String,

    /// Policy name
    pub name: String,

    /// Policy description
    pub description: String,

    /// Policy version
    pub version: String,

    /// Policy type
    pub policy_type: PolicyType,

    /// Policy rules
    pub rules: Vec<PolicyRule>,

    /// Enforcement mode
    pub enforcement: EnforcementMode,

    /// Target scope
    pub scope: PolicyScope,

    /// Policy owner
    pub owner: OwnerInfo,

    /// Creation timestamp
    pub created_at: DateTime<Utc>,

    /// Last updated timestamp
    pub updated_at: DateTime<Utc>,

    /// Policy status
    pub status: PolicyStatus,

    /// Policy metadata
    #[serde(default)]
    pub metadata: HashMap<String, String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum PolicyType {
    /// Security policy
    Security,

    /// Compliance policy
    Compliance,

    /// Cost control policy
    CostControl,

    /// Performance policy
    Performance,

    /// Data governance policy
    DataGovernance,

    /// Usage policy
    Usage,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PolicyRule {
    /// Rule identifier
    pub rule_id: String,

    /// Rule name
    pub name: String,

    /// Rule condition (expression)
    pub condition: String,

    /// Action to take when rule is violated
    pub action: PolicyAction,

    /// Severity of violation
    pub severity: RuleSeverity,

    /// Rule enabled status
    pub enabled: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum PolicyAction {
    /// Block the action
    Block,

    /// Allow with warning
    Warn,

    /// Log the event
    Log,

    /// Require approval
    RequireApproval,

    /// Auto-remediate
    AutoRemediate,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, PartialOrd, Ord)]
#[serde(rename_all = "lowercase")]
pub enum RuleSeverity {
    Low,
    Medium,
    High,
    Critical,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum EnforcementMode {
    /// Actively enforce policies
    Active,

    /// Monitor only, don't enforce
    Monitor,

    /// Disabled
    Disabled,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PolicyScope {
    /// Scope type
    pub scope_type: ScopeType,

    /// Target resources
    pub targets: Vec<String>,

    /// Exclusions
    #[serde(default)]
    pub exclusions: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ScopeType {
    Global,
    Organization,
    Team,
    Project,
    User,
    Resource,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum PolicyStatus {
    Draft,
    Active,
    Suspended,
    Archived,
}

// ============================================================================
// DASHBOARD CONFIGURATION
// ============================================================================

/// Dashboard configuration schema
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DashboardConfig {
    /// Dashboard identifier
    pub dashboard_id: String,

    /// Dashboard name
    pub name: String,

    /// Description
    pub description: Option<String>,

    /// Dashboard layout
    pub layout: DashboardLayout,

    /// Widgets/panels
    pub widgets: Vec<Widget>,

    /// Refresh interval (seconds)
    pub refresh_interval: u32,

    /// Time range default
    pub default_time_range: String,

    /// Owner information
    pub owner: OwnerInfo,

    /// Visibility settings
    pub visibility: VisibilitySettings,

    /// Creation timestamp
    pub created_at: DateTime<Utc>,

    /// Last updated timestamp
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DashboardLayout {
    /// Layout type
    pub layout_type: LayoutType,

    /// Number of columns
    pub columns: u32,

    /// Row height
    pub row_height: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum LayoutType {
    Grid,
    Flex,
    Fixed,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Widget {
    /// Widget identifier
    pub widget_id: String,

    /// Widget title
    pub title: String,

    /// Widget type
    pub widget_type: WidgetType,

    /// Position in layout
    pub position: WidgetPosition,

    /// Data source configuration
    pub data_source: DataSourceConfig,

    /// Visualization settings
    pub visualization: VisualizationConfig,

    /// Widget-specific settings
    #[serde(default)]
    pub settings: HashMap<String, serde_json::Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WidgetPosition {
    pub x: u32,
    pub y: u32,
    pub width: u32,
    pub height: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum WidgetType {
    LineChart,
    BarChart,
    PieChart,
    Table,
    Stat,
    Heatmap,
    Gauge,
    Timeline,
    Graph,
    Custom(String),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DataSourceConfig {
    /// Data source type
    pub source_type: DataSourceType,

    /// Query/filter configuration
    pub query: String,

    /// Refresh interval (seconds)
    pub refresh_interval: Option<u32>,

    /// Additional parameters
    #[serde(default)]
    pub parameters: HashMap<String, String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum DataSourceType {
    Metrics,
    Events,
    Logs,
    Custom,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VisualizationConfig {
    /// Chart/visualization options
    #[serde(default)]
    pub options: HashMap<String, serde_json::Value>,

    /// Color scheme
    pub color_scheme: Option<String>,

    /// Legend settings
    pub show_legend: bool,

    /// Axis settings
    #[serde(skip_serializing_if = "Option::is_none")]
    pub axes: Option<AxesConfig>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AxesConfig {
    pub x_axis: AxisConfig,
    pub y_axis: AxisConfig,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AxisConfig {
    pub label: String,
    pub scale: String,
    pub min: Option<f64>,
    pub max: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VisibilitySettings {
    /// Public/private/shared
    pub visibility: Visibility,

    /// Users with access
    #[serde(default)]
    pub shared_with: Vec<String>,

    /// Teams with access
    #[serde(default)]
    pub shared_with_teams: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum Visibility {
    Public,
    Private,
    Shared,
}

// ============================================================================
// USER PREFERENCES
// ============================================================================

/// User preference model
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UserPreferences {
    /// User identifier
    pub user_id: String,

    /// Display preferences
    pub display: DisplayPreferences,

    /// Notification preferences
    pub notifications: NotificationPreferences,

    /// Default filters
    #[serde(default)]
    pub default_filters: HashMap<String, String>,

    /// Favorite dashboards
    #[serde(default)]
    pub favorite_dashboards: Vec<String>,

    /// Favorite queries
    #[serde(default)]
    pub saved_queries: Vec<SavedQuery>,

    /// Last updated
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DisplayPreferences {
    /// Theme (light/dark)
    pub theme: String,

    /// Timezone
    pub timezone: String,

    /// Date format
    pub date_format: String,

    /// Number format
    pub number_format: String,

    /// Language
    pub language: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NotificationPreferences {
    /// Email notifications enabled
    pub email_enabled: bool,

    /// In-app notifications enabled
    pub in_app_enabled: bool,

    /// Notification channels
    pub channels: Vec<NotificationChannel>,

    /// Alert thresholds
    #[serde(default)]
    pub alert_thresholds: HashMap<String, f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NotificationChannel {
    pub channel_type: String,
    pub destination: String,
    pub enabled: bool,
    pub event_types: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SavedQuery {
    pub query_id: String,
    pub name: String,
    pub description: Option<String>,
    pub query: String,
    pub parameters: HashMap<String, String>,
    pub created_at: DateTime<Utc>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_asset_metadata_serialization() {
        let asset = AssetMetadata {
            asset_id: "model-123".to_string(),
            asset_type: AssetType::Model,
            name: "GPT-4".to_string(),
            description: "Large language model".to_string(),
            version: VersionInfo {
                version: "1.0.0".to_string(),
                previous_version: None,
                changelog: None,
                release_notes: None,
            },
            owner: OwnerInfo {
                user_id: "user-1".to_string(),
                username: "admin".to_string(),
                email: None,
                team: Some("AI Team".to_string()),
                department: None,
            },
            tags: HashMap::new(),
            created_at: Utc::now(),
            updated_at: Utc::now(),
            status: AssetStatus::Active,
            metadata: AssetSpecificMetadata::Custom(HashMap::new()),
        };

        let json = serde_json::to_string_pretty(&asset).unwrap();
        assert!(json.contains("model-123"));
        assert!(json.contains("GPT-4"));
    }

    #[test]
    fn test_policy_definition() {
        let policy = PolicyDefinition {
            policy_id: "pol-123".to_string(),
            name: "Cost Control".to_string(),
            description: "Limit API costs".to_string(),
            version: "1.0".to_string(),
            policy_type: PolicyType::CostControl,
            rules: vec![],
            enforcement: EnforcementMode::Active,
            scope: PolicyScope {
                scope_type: ScopeType::Global,
                targets: vec![],
                exclusions: vec![],
            },
            owner: OwnerInfo {
                user_id: "user-1".to_string(),
                username: "admin".to_string(),
                email: None,
                team: None,
                department: None,
            },
            created_at: Utc::now(),
            updated_at: Utc::now(),
            status: PolicyStatus::Active,
            metadata: HashMap::new(),
        };

        let json = serde_json::to_string_pretty(&policy).unwrap();
        assert!(json.contains("cost_control"));
    }
}
