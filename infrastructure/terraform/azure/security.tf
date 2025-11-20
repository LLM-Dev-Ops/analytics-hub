# Azure Defender for Containers
resource "azurerm_security_center_subscription_pricing" "defender_containers" {
  count = var.enable_defender ? 1 : 0

  tier          = "Standard"
  resource_type = "Containers"
}

# Azure Defender for Key Vault
resource "azurerm_security_center_subscription_pricing" "defender_keyvault" {
  count = var.enable_defender ? 1 : 0

  tier          = "Standard"
  resource_type = "KeyVaults"
}

# Azure Defender for Container Registries
resource "azurerm_security_center_subscription_pricing" "defender_acr" {
  count = var.enable_defender ? 1 : 0

  tier          = "Standard"
  resource_type = "ContainerRegistry"
}

# Azure Policy Definitions for AKS
locals {
  aks_policy_definitions = {
    enforce_https_ingress = {
      display_name = "Kubernetes cluster should only use HTTPS"
      policy_type  = "Custom"
      mode         = "Microsoft.Kubernetes.Data"
      description  = "Enforce HTTPS for ingress resources in Kubernetes cluster"
    }
    restrict_privileged_containers = {
      display_name = "Kubernetes cluster should not allow privileged containers"
      policy_type  = "Custom"
      mode         = "Microsoft.Kubernetes.Data"
      description  = "Prevent privileged containers from running in Kubernetes cluster"
    }
    require_pod_security_standards = {
      display_name = "Kubernetes cluster pods should use restricted security context"
      policy_type  = "Custom"
      mode         = "Microsoft.Kubernetes.Data"
      description  = "Enforce restricted pod security standards"
    }
  }
}

# Network Policies (Calico/Azure CNI)
# Note: These are applied via Kubernetes NetworkPolicy resources, not Terraform

# Pod Security Standards
# Note: Applied via Kubernetes Pod Security Admission, configured in cluster

# Azure RBAC for Key Vault
resource "azurerm_role_assignment" "current_user_kv_admin" {
  count = var.enable_key_vault_rbac ? 1 : 0

  scope                = azurerm_key_vault.main.id
  role_definition_name = "Key Vault Administrator"
  principal_id         = data.azurerm_client_config.current.object_id
}

# Diagnostic Settings for Network Security Groups
resource "azurerm_monitor_diagnostic_setting" "aks_nsg" {
  name                       = "${var.resource_prefix}-${var.environment}-aks-nsg-diag"
  target_resource_id         = azurerm_network_security_group.aks.id
  log_analytics_workspace_id = azurerm_log_analytics_workspace.main.id

  enabled_log {
    category = "NetworkSecurityGroupEvent"
  }

  enabled_log {
    category = "NetworkSecurityGroupRuleCounter"
  }
}

resource "azurerm_monitor_diagnostic_setting" "database_nsg" {
  name                       = "${var.resource_prefix}-${var.environment}-db-nsg-diag"
  target_resource_id         = azurerm_network_security_group.database.id
  log_analytics_workspace_id = azurerm_log_analytics_workspace.main.id

  enabled_log {
    category = "NetworkSecurityGroupEvent"
  }

  enabled_log {
    category = "NetworkSecurityGroupRuleCounter"
  }
}

# Diagnostic Settings for Virtual Network
resource "azurerm_monitor_diagnostic_setting" "vnet" {
  name                       = "${var.resource_prefix}-${var.environment}-vnet-diag"
  target_resource_id         = azurerm_virtual_network.main.id
  log_analytics_workspace_id = azurerm_log_analytics_workspace.main.id

  metric {
    category = "AllMetrics"
    enabled  = true
  }
}

# Diagnostic Settings for Key Vault
resource "azurerm_monitor_diagnostic_setting" "keyvault" {
  name                       = "${var.resource_prefix}-${var.environment}-kv-diag"
  target_resource_id         = azurerm_key_vault.main.id
  log_analytics_workspace_id = azurerm_log_analytics_workspace.main.id

  enabled_log {
    category = "AuditEvent"
  }

  enabled_log {
    category = "AzurePolicyEvaluationDetails"
  }

  metric {
    category = "AllMetrics"
    enabled  = true
  }
}

# Diagnostic Settings for Container Registry
resource "azurerm_monitor_diagnostic_setting" "acr" {
  name                       = "${var.resource_prefix}-${var.environment}-acr-diag"
  target_resource_id         = azurerm_container_registry.main.id
  log_analytics_workspace_id = azurerm_log_analytics_workspace.main.id

  enabled_log {
    category = "ContainerRegistryRepositoryEvents"
  }

  enabled_log {
    category = "ContainerRegistryLoginEvents"
  }

  metric {
    category = "AllMetrics"
    enabled  = true
  }
}

# Azure Security Center Contact
resource "azurerm_security_center_contact" "main" {
  count = var.enable_defender ? 1 : 0

  email               = var.security_contact_email
  phone               = var.security_contact_phone
  alert_notifications = true
  alerts_to_admins    = true
}

# Azure Security Center Auto Provisioning
resource "azurerm_security_center_auto_provisioning" "main" {
  count = var.enable_defender ? 1 : 0

  auto_provision = "On"
}

# Container Registry Content Trust
resource "azurerm_container_registry_task" "acr_content_trust" {
  count = var.acr_enable_content_trust ? 1 : 0

  name                  = "content-trust-validation"
  container_registry_id = azurerm_container_registry.main.id

  platform {
    os = "Linux"
  }

  docker_step {
    dockerfile_path      = "Dockerfile"
    context_path         = "https://github.com/Azure-Samples/acr-tasks.git"
    context_access_token = ""
    image_names          = ["sample/hello-world:{{.Run.ID}}"]
  }
}

# Private Link for Key Vault
resource "azurerm_private_endpoint" "keyvault" {
  count = var.enable_key_vault_private_endpoint ? 1 : 0

  name                = "${var.resource_prefix}-${var.environment}-kv-pe"
  location            = azurerm_resource_group.main.location
  resource_group_name = azurerm_resource_group.main.name
  subnet_id           = azurerm_subnet.private_endpoints.id

  private_service_connection {
    name                           = "${var.resource_prefix}-${var.environment}-kv-psc"
    private_connection_resource_id = azurerm_key_vault.main.id
    is_manual_connection           = false
    subresource_names              = ["vault"]
  }

  private_dns_zone_group {
    name                 = "keyvault-dns-zone-group"
    private_dns_zone_ids = [azurerm_private_dns_zone.keyvault[0].id]
  }

  tags = merge(
    var.common_tags,
    {
      Environment = var.environment
      Component   = "Security"
    }
  )
}

resource "azurerm_private_dns_zone" "keyvault" {
  count = var.enable_key_vault_private_endpoint ? 1 : 0

  name                = "privatelink.vaultcore.azure.net"
  resource_group_name = azurerm_resource_group.main.name

  tags = merge(
    var.common_tags,
    {
      Environment = var.environment
      Component   = "Network"
    }
  )
}

resource "azurerm_private_dns_zone_virtual_network_link" "keyvault" {
  count = var.enable_key_vault_private_endpoint ? 1 : 0

  name                  = "${var.resource_prefix}-${var.environment}-kv-dns-link"
  resource_group_name   = azurerm_resource_group.main.name
  private_dns_zone_name = azurerm_private_dns_zone.keyvault[0].name
  virtual_network_id    = azurerm_virtual_network.main.id

  tags = merge(
    var.common_tags,
    {
      Environment = var.environment
      Component   = "Network"
    }
  )
}

# Secrets for AKS
resource "azurerm_key_vault_secret" "aks_kubeconfig" {
  name         = "aks-kubeconfig"
  value        = azurerm_kubernetes_cluster.main.kube_config_raw
  key_vault_id = azurerm_key_vault.main.id

  depends_on = [
    azurerm_role_assignment.current_user_kv_admin
  ]
}

resource "azurerm_key_vault_secret" "acr_username" {
  count = var.acr_sku == "Premium" ? 1 : 0

  name         = "acr-username"
  value        = azurerm_container_registry.main.admin_username
  key_vault_id = azurerm_key_vault.main.id

  depends_on = [
    azurerm_role_assignment.current_user_kv_admin
  ]
}

# Azure Monitor Alerts for Security
resource "azurerm_monitor_metric_alert" "aks_cpu_high" {
  name                = "${var.resource_prefix}-${var.environment}-aks-cpu-high"
  resource_group_name = azurerm_resource_group.main.name
  scopes              = [azurerm_kubernetes_cluster.main.id]
  description         = "Alert when AKS cluster CPU usage is high"
  severity            = 2
  frequency           = "PT5M"
  window_size         = "PT15M"

  criteria {
    metric_namespace = "Microsoft.ContainerService/managedClusters"
    metric_name      = "node_cpu_usage_percentage"
    aggregation      = "Average"
    operator         = "GreaterThan"
    threshold        = 80
  }

  action {
    action_group_id = azurerm_monitor_action_group.main.id
  }

  tags = merge(
    var.common_tags,
    {
      Environment = var.environment
      Component   = "Monitoring"
    }
  )
}

resource "azurerm_monitor_metric_alert" "aks_memory_high" {
  name                = "${var.resource_prefix}-${var.environment}-aks-memory-high"
  resource_group_name = azurerm_resource_group.main.name
  scopes              = [azurerm_kubernetes_cluster.main.id]
  description         = "Alert when AKS cluster memory usage is high"
  severity            = 2
  frequency           = "PT5M"
  window_size         = "PT15M"

  criteria {
    metric_namespace = "Microsoft.ContainerService/managedClusters"
    metric_name      = "node_memory_working_set_percentage"
    aggregation      = "Average"
    operator         = "GreaterThan"
    threshold        = 80
  }

  action {
    action_group_id = azurerm_monitor_action_group.main.id
  }

  tags = merge(
    var.common_tags,
    {
      Environment = var.environment
      Component   = "Monitoring"
    }
  )
}

# Action Group for Alerts
resource "azurerm_monitor_action_group" "main" {
  name                = "${var.resource_prefix}-${var.environment}-action-group"
  resource_group_name = azurerm_resource_group.main.name
  short_name          = "aksalerts"

  email_receiver {
    name          = "send-to-admin"
    email_address = var.alert_email_address
  }

  tags = merge(
    var.common_tags,
    {
      Environment = var.environment
      Component   = "Monitoring"
    }
  )
}
