# General Variables
variable "resource_prefix" {
  description = "Prefix for all resource names"
  type        = string
  default     = "llmhub"

  validation {
    condition     = can(regex("^[a-z0-9]{3,8}$", var.resource_prefix))
    error_message = "Resource prefix must be 3-8 characters, lowercase alphanumeric only"
  }
}

variable "environment" {
  description = "Environment name (dev, staging, production)"
  type        = string

  validation {
    condition     = contains(["dev", "staging", "production"], var.environment)
    error_message = "Environment must be dev, staging, or production"
  }
}

variable "location" {
  description = "Azure region for resources"
  type        = string
  default     = "eastus2"
}

variable "availability_zones" {
  description = "Availability zones for resources"
  type        = list(string)
  default     = ["1", "2", "3"]
}

variable "common_tags" {
  description = "Common tags to apply to all resources"
  type        = map(string)
  default = {
    Project   = "LLM-Analytics-Hub"
    ManagedBy = "Terraform"
  }
}

# Network Variables
variable "vnet_address_space" {
  description = "Address space for the virtual network"
  type        = string
  default     = "10.0.0.0/16"
}

variable "aks_subnet_address_prefix" {
  description = "Address prefix for AKS subnet"
  type        = string
  default     = "10.0.1.0/24"
}

variable "database_subnet_address_prefix" {
  description = "Address prefix for database subnet"
  type        = string
  default     = "10.0.2.0/24"
}

variable "appgw_subnet_address_prefix" {
  description = "Address prefix for Application Gateway subnet"
  type        = string
  default     = "10.0.3.0/24"
}

variable "private_endpoint_subnet_address_prefix" {
  description = "Address prefix for private endpoints subnet"
  type        = string
  default     = "10.0.4.0/24"
}

variable "service_cidr" {
  description = "CIDR for Kubernetes services"
  type        = string
  default     = "10.1.0.0/16"
}

variable "dns_service_ip" {
  description = "IP address for Kubernetes DNS service"
  type        = string
  default     = "10.1.0.10"
}

variable "allowed_cidr_blocks" {
  description = "CIDR blocks allowed to access the cluster"
  type        = list(string)
  default     = ["0.0.0.0/0"]
}

variable "enable_nat_gateway" {
  description = "Enable NAT Gateway for AKS egress"
  type        = bool
  default     = true
}

variable "enable_application_gateway" {
  description = "Enable Application Gateway for ingress"
  type        = bool
  default     = false
}

variable "enable_custom_route_table" {
  description = "Enable custom route table for AKS"
  type        = bool
  default     = false
}

variable "load_balancer_outbound_ip_count" {
  description = "Number of outbound IPs for load balancer (when NAT Gateway is disabled)"
  type        = number
  default     = 2
}

# AKS Cluster Variables
variable "kubernetes_version" {
  description = "Kubernetes version"
  type        = string
  default     = "1.28.3"
}

variable "aks_sku_tier" {
  description = "AKS SKU tier (Free, Standard, Premium)"
  type        = string
  default     = "Standard"

  validation {
    condition     = contains(["Free", "Standard", "Premium"], var.aks_sku_tier)
    error_message = "AKS SKU tier must be Free, Standard, or Premium"
  }
}

variable "automatic_channel_upgrade" {
  description = "Automatic upgrade channel (patch, rapid, node-image, stable, none)"
  type        = string
  default     = "stable"

  validation {
    condition     = contains(["patch", "rapid", "node-image", "stable", "none"], var.automatic_channel_upgrade)
    error_message = "Invalid automatic upgrade channel"
  }
}

variable "enable_private_cluster" {
  description = "Enable private cluster (API server not publicly accessible)"
  type        = bool
  default     = false
}

variable "enable_azure_ad_rbac" {
  description = "Enable Azure AD RBAC for cluster access"
  type        = bool
  default     = true
}

variable "enable_pod_identity" {
  description = "Enable AAD Pod Identity"
  type        = bool
  default     = false
}

variable "enable_host_encryption" {
  description = "Enable host-based encryption on node pools"
  type        = bool
  default     = true
}

variable "enable_flux" {
  description = "Enable Flux GitOps extension"
  type        = bool
  default     = false
}

variable "enable_dapr" {
  description = "Enable Dapr extension"
  type        = bool
  default     = false
}

# System Node Pool Variables
variable "system_node_pool_vm_size" {
  description = "VM size for system node pool"
  type        = string
  default     = "Standard_D4s_v5"
}

variable "system_node_pool_node_count" {
  description = "Number of nodes in system node pool (when auto-scaling disabled)"
  type        = number
  default     = 3
}

variable "system_node_pool_min_count" {
  description = "Minimum number of nodes in system node pool"
  type        = number
  default     = 2
}

variable "system_node_pool_max_count" {
  description = "Maximum number of nodes in system node pool"
  type        = number
  default     = 5
}

variable "system_node_pool_enable_auto_scaling" {
  description = "Enable auto-scaling for system node pool"
  type        = bool
  default     = true
}

# Application Node Pool Variables
variable "app_node_pool_vm_size" {
  description = "VM size for application node pool"
  type        = string
  default     = "Standard_D8s_v5"
}

variable "app_node_pool_node_count" {
  description = "Number of nodes in application node pool (when auto-scaling disabled)"
  type        = number
  default     = 3
}

variable "app_node_pool_min_count" {
  description = "Minimum number of nodes in application node pool"
  type        = number
  default     = 3
}

variable "app_node_pool_max_count" {
  description = "Maximum number of nodes in application node pool"
  type        = number
  default     = 10
}

variable "app_node_pool_enable_auto_scaling" {
  description = "Enable auto-scaling for application node pool"
  type        = bool
  default     = true
}

# Database Node Pool Variables
variable "db_node_pool_vm_size" {
  description = "VM size for database node pool"
  type        = string
  default     = "Standard_E8s_v5"
}

variable "db_node_pool_node_count" {
  description = "Number of nodes in database node pool (when auto-scaling disabled)"
  type        = number
  default     = 3
}

variable "db_node_pool_min_count" {
  description = "Minimum number of nodes in database node pool"
  type        = number
  default     = 3
}

variable "db_node_pool_max_count" {
  description = "Maximum number of nodes in database node pool"
  type        = number
  default     = 6
}

variable "db_node_pool_enable_auto_scaling" {
  description = "Enable auto-scaling for database node pool"
  type        = bool
  default     = true
}

# Spot Node Pool Variables
variable "enable_spot_node_pool" {
  description = "Enable spot instance node pool"
  type        = bool
  default     = true
}

variable "spot_node_pool_vm_size" {
  description = "VM size for spot node pool"
  type        = string
  default     = "Standard_D8s_v5"
}

variable "spot_node_pool_node_count" {
  description = "Number of nodes in spot node pool (when auto-scaling disabled)"
  type        = number
  default     = 0
}

variable "spot_node_pool_min_count" {
  description = "Minimum number of nodes in spot node pool"
  type        = number
  default     = 0
}

variable "spot_node_pool_max_count" {
  description = "Maximum number of nodes in spot node pool"
  type        = number
  default     = 10
}

variable "spot_node_pool_enable_auto_scaling" {
  description = "Enable auto-scaling for spot node pool"
  type        = bool
  default     = true
}

variable "spot_max_price" {
  description = "Maximum price for spot instances (-1 for max price)"
  type        = number
  default     = -1
}

# GPU Node Pool Variables
variable "enable_gpu_node_pool" {
  description = "Enable GPU node pool"
  type        = bool
  default     = false
}

variable "gpu_node_pool_vm_size" {
  description = "VM size for GPU node pool"
  type        = string
  default     = "Standard_NC6s_v3"
}

variable "gpu_node_pool_node_count" {
  description = "Number of nodes in GPU node pool (when auto-scaling disabled)"
  type        = number
  default     = 0
}

variable "gpu_node_pool_min_count" {
  description = "Minimum number of nodes in GPU node pool"
  type        = number
  default     = 0
}

variable "gpu_node_pool_max_count" {
  description = "Maximum number of nodes in GPU node pool"
  type        = number
  default     = 3
}

variable "gpu_node_pool_enable_auto_scaling" {
  description = "Enable auto-scaling for GPU node pool"
  type        = bool
  default     = true
}

# Monitoring Node Pool Variables
variable "enable_monitoring_node_pool" {
  description = "Enable dedicated monitoring node pool"
  type        = bool
  default     = false
}

variable "monitoring_node_pool_vm_size" {
  description = "VM size for monitoring node pool"
  type        = string
  default     = "Standard_D4s_v5"
}

variable "monitoring_node_pool_node_count" {
  description = "Number of nodes in monitoring node pool"
  type        = number
  default     = 3
}

# Container Registry Variables
variable "acr_sku" {
  description = "SKU for Azure Container Registry"
  type        = string
  default     = "Premium"

  validation {
    condition     = contains(["Basic", "Standard", "Premium"], var.acr_sku)
    error_message = "ACR SKU must be Basic, Standard, or Premium"
  }
}

variable "acr_georeplications" {
  description = "List of regions for ACR geo-replication (Premium SKU only)"
  type        = list(string)
  default     = []
}

variable "acr_enable_private_endpoint" {
  description = "Enable private endpoint for ACR"
  type        = bool
  default     = true
}

variable "acr_enable_content_trust" {
  description = "Enable content trust for ACR"
  type        = bool
  default     = false
}

# Log Analytics Variables
variable "log_analytics_sku" {
  description = "SKU for Log Analytics workspace"
  type        = string
  default     = "PerGB2018"
}

variable "log_analytics_retention_days" {
  description = "Retention period in days for Log Analytics"
  type        = number
  default     = 30

  validation {
    condition     = var.log_analytics_retention_days >= 30 && var.log_analytics_retention_days <= 730
    error_message = "Retention days must be between 30 and 730"
  }
}

# Key Vault Variables
variable "key_vault_network_acls_default_action" {
  description = "Default action for Key Vault network ACLs"
  type        = string
  default     = "Deny"

  validation {
    condition     = contains(["Allow", "Deny"], var.key_vault_network_acls_default_action)
    error_message = "Default action must be Allow or Deny"
  }
}

variable "enable_key_vault_rbac" {
  description = "Enable RBAC for Key Vault"
  type        = bool
  default     = true
}

variable "enable_key_vault_private_endpoint" {
  description = "Enable private endpoint for Key Vault"
  type        = bool
  default     = true
}

# Security Variables
variable "enable_defender" {
  description = "Enable Microsoft Defender for Cloud"
  type        = bool
  default     = true
}

variable "security_contact_email" {
  description = "Email address for security contact"
  type        = string
  default     = "security@example.com"
}

variable "security_contact_phone" {
  description = "Phone number for security contact"
  type        = string
  default     = "+1-555-555-5555"
}

variable "alert_email_address" {
  description = "Email address for alerts"
  type        = string
  default     = "alerts@example.com"
}

# Azure Policy Variables
variable "azure_policy_assignments" {
  description = "Map of Azure Policy assignments for AKS"
  type = map(object({
    policy_definition_id = string
    parameters           = map(any)
  }))
  default = {}
}

# Workload Identity Variables
variable "workload_identities" {
  description = "Map of workload identities to create"
  type = map(object({
    namespace           = string
    service_account     = string
    required_permissions = list(string)
  }))
  default = {
    app-backend = {
      namespace           = "default"
      service_account     = "app-backend-sa"
      required_permissions = ["storage", "keyvault"]
    }
    app-frontend = {
      namespace           = "default"
      service_account     = "app-frontend-sa"
      required_permissions = ["keyvault"]
    }
  }
}

# Provider Variables
variable "skip_provider_registration" {
  description = "Skip provider registration (set to true if running in environments where provider registration is not allowed)"
  type        = bool
  default     = false
}

variable "prevent_resource_group_deletion" {
  description = "Prevent deletion of resource group if it contains resources"
  type        = bool
  default     = true
}
