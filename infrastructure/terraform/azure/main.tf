terraform {
  required_version = ">= 1.6.0"

  required_providers {
    azurerm = {
      source  = "hashicorp/azurerm"
      version = "~> 3.80"
    }
    azuread = {
      source  = "hashicorp/azuread"
      version = "~> 2.45"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.6"
    }
    time = {
      source  = "hashicorp/time"
      version = "~> 0.10"
    }
  }

  backend "azurerm" {
    # Backend configuration should be provided via backend config file or CLI
    # Example: terraform init -backend-config="backend.hcl"
    # resource_group_name  = "tfstate-rg"
    # storage_account_name = "tfstate<random>"
    # container_name       = "tfstate"
    # key                  = "llm-analytics-hub.terraform.tfstate"
  }
}

provider "azurerm" {
  features {
    resource_group {
      prevent_deletion_if_contains_resources = var.prevent_resource_group_deletion
    }

    key_vault {
      purge_soft_delete_on_destroy    = var.environment != "production"
      recover_soft_deleted_key_vaults = true
    }

    virtual_machine {
      delete_os_disk_on_deletion     = true
      graceful_shutdown              = true
      skip_shutdown_and_force_delete = false
    }

    log_analytics_workspace {
      permanently_delete_on_destroy = var.environment != "production"
    }
  }

  skip_provider_registration = var.skip_provider_registration
}

provider "azuread" {
  # Azure AD provider configuration
}

# Random suffix for unique resource names
resource "random_string" "suffix" {
  length  = 6
  special = false
  upper   = false
}

# Data sources
data "azurerm_client_config" "current" {}

data "azuread_client_config" "current" {}

# Resource Group
resource "azurerm_resource_group" "main" {
  name     = "${var.resource_prefix}-${var.environment}-rg"
  location = var.location

  tags = merge(
    var.common_tags,
    {
      Environment = var.environment
      ManagedBy   = "Terraform"
      Project     = "LLM-Analytics-Hub"
    }
  )
}

# Log Analytics Workspace
resource "azurerm_log_analytics_workspace" "main" {
  name                = "${var.resource_prefix}-${var.environment}-law-${random_string.suffix.result}"
  location            = azurerm_resource_group.main.location
  resource_group_name = azurerm_resource_group.main.name
  sku                 = var.log_analytics_sku
  retention_in_days   = var.log_analytics_retention_days

  tags = merge(
    var.common_tags,
    {
      Environment = var.environment
      Component   = "Monitoring"
    }
  )
}

# Application Insights
resource "azurerm_application_insights" "main" {
  name                = "${var.resource_prefix}-${var.environment}-ai-${random_string.suffix.result}"
  location            = azurerm_resource_group.main.location
  resource_group_name = azurerm_resource_group.main.name
  workspace_id        = azurerm_log_analytics_workspace.main.id
  application_type    = "other"

  tags = merge(
    var.common_tags,
    {
      Environment = var.environment
      Component   = "Monitoring"
    }
  )
}

# Container Registry
resource "azurerm_container_registry" "main" {
  name                = "${var.resource_prefix}${var.environment}acr${random_string.suffix.result}"
  resource_group_name = azurerm_resource_group.main.name
  location            = azurerm_resource_group.main.location
  sku                 = var.acr_sku
  admin_enabled       = false

  # Enable geo-replication for Premium SKU
  dynamic "georeplications" {
    for_each = var.acr_sku == "Premium" ? var.acr_georeplications : []
    content {
      location                = georeplications.value
      zone_redundancy_enabled = true
      tags                    = var.common_tags
    }
  }

  # Enable network rules for Premium SKU
  dynamic "network_rule_set" {
    for_each = var.acr_sku == "Premium" && var.acr_enable_private_endpoint ? [1] : []
    content {
      default_action = "Deny"
    }
  }

  tags = merge(
    var.common_tags,
    {
      Environment = var.environment
      Component   = "Registry"
    }
  )
}

# Key Vault for secrets management
resource "azurerm_key_vault" "main" {
  name                       = "${var.resource_prefix}-${var.environment}-kv-${random_string.suffix.result}"
  location                   = azurerm_resource_group.main.location
  resource_group_name        = azurerm_resource_group.main.name
  tenant_id                  = data.azurerm_client_config.current.tenant_id
  sku_name                   = "standard"
  soft_delete_retention_days = 7
  purge_protection_enabled   = var.environment == "production"

  enable_rbac_authorization = true

  network_acls {
    bypass         = "AzureServices"
    default_action = var.key_vault_network_acls_default_action
  }

  tags = merge(
    var.common_tags,
    {
      Environment = var.environment
      Component   = "Security"
    }
  )
}

# Azure Monitor Diagnostic Settings for AKS
resource "azurerm_monitor_diagnostic_setting" "aks" {
  name                       = "${var.resource_prefix}-${var.environment}-aks-diagnostics"
  target_resource_id         = azurerm_kubernetes_cluster.main.id
  log_analytics_workspace_id = azurerm_log_analytics_workspace.main.id

  enabled_log {
    category = "kube-apiserver"
  }

  enabled_log {
    category = "kube-audit"
  }

  enabled_log {
    category = "kube-audit-admin"
  }

  enabled_log {
    category = "kube-controller-manager"
  }

  enabled_log {
    category = "kube-scheduler"
  }

  enabled_log {
    category = "cluster-autoscaler"
  }

  enabled_log {
    category = "guard"
  }

  metric {
    category = "AllMetrics"
    enabled  = true
  }

  depends_on = [azurerm_kubernetes_cluster.main]
}
