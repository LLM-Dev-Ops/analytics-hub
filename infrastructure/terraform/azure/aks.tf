# AKS Cluster
resource "azurerm_kubernetes_cluster" "main" {
  name                             = "${var.resource_prefix}-${var.environment}-aks"
  location                         = azurerm_resource_group.main.location
  resource_group_name              = azurerm_resource_group.main.name
  dns_prefix                       = "${var.resource_prefix}-${var.environment}"
  kubernetes_version               = var.kubernetes_version
  sku_tier                         = var.aks_sku_tier
  automatic_channel_upgrade        = var.automatic_channel_upgrade
  node_resource_group              = "${var.resource_prefix}-${var.environment}-aks-nodes-rg"
  oidc_issuer_enabled             = true
  workload_identity_enabled       = true
  private_cluster_enabled         = var.enable_private_cluster
  private_dns_zone_id             = var.enable_private_cluster ? azurerm_private_dns_zone.aks[0].id : null
  azure_policy_enabled            = true
  local_account_disabled          = var.enable_azure_ad_rbac
  role_based_access_control_enabled = true

  # System Node Pool
  default_node_pool {
    name                         = "system"
    vm_size                      = var.system_node_pool_vm_size
    node_count                   = var.system_node_pool_enable_auto_scaling ? null : var.system_node_pool_node_count
    min_count                    = var.system_node_pool_enable_auto_scaling ? var.system_node_pool_min_count : null
    max_count                    = var.system_node_pool_enable_auto_scaling ? var.system_node_pool_max_count : null
    enable_auto_scaling          = var.system_node_pool_enable_auto_scaling
    zones                        = var.availability_zones
    vnet_subnet_id              = azurerm_subnet.aks.id
    orchestrator_version        = var.kubernetes_version
    max_pods                    = 110
    os_disk_size_gb             = 128
    os_disk_type                = "Managed"
    type                        = "VirtualMachineScaleSets"
    enable_host_encryption      = var.enable_host_encryption
    enable_node_public_ip       = false
    only_critical_addons_enabled = true

    upgrade_settings {
      max_surge = "33%"
    }

    node_labels = {
      "nodepool-type" = "system"
      "environment"   = var.environment
      "workload"      = "system"
    }

    tags = merge(
      var.common_tags,
      {
        Environment = var.environment
        Component   = "AKS-System"
      }
    )
  }

  # Identity Configuration
  identity {
    type         = "UserAssigned"
    identity_ids = [azurerm_user_assigned_identity.aks_cluster.id]
  }

  kubelet_identity {
    client_id                 = azurerm_user_assigned_identity.aks_kubelet.client_id
    object_id                 = azurerm_user_assigned_identity.aks_kubelet.principal_id
    user_assigned_identity_id = azurerm_user_assigned_identity.aks_kubelet.id
  }

  # Network Configuration
  network_profile {
    network_plugin      = "azure"
    network_policy      = "azure"
    dns_service_ip      = var.dns_service_ip
    service_cidr        = var.service_cidr
    load_balancer_sku   = "standard"
    outbound_type       = var.enable_nat_gateway ? "userAssignedNATGateway" : "loadBalancer"

    dynamic "load_balancer_profile" {
      for_each = var.enable_nat_gateway ? [] : [1]
      content {
        managed_outbound_ip_count = var.load_balancer_outbound_ip_count
        idle_timeout_in_minutes   = 30
      }
    }
  }

  # Azure AD Integration
  dynamic "azure_active_directory_role_based_access_control" {
    for_each = var.enable_azure_ad_rbac ? [1] : []
    content {
      managed                = true
      admin_group_object_ids = var.enable_azure_ad_rbac ? [azuread_group.aks_admins[0].object_id] : []
      azure_rbac_enabled     = true
    }
  }

  # Auto Scaler Profile
  auto_scaler_profile {
    balance_similar_node_groups      = true
    expander                         = "random"
    max_graceful_termination_sec     = 600
    max_node_provisioning_time       = "15m"
    max_unready_nodes                = 3
    max_unready_percentage          = 45
    new_pod_scale_up_delay          = "10s"
    scale_down_delay_after_add      = "10m"
    scale_down_delay_after_delete   = "10s"
    scale_down_delay_after_failure  = "3m"
    scan_interval                   = "10s"
    scale_down_unneeded             = "10m"
    scale_down_unready              = "20m"
    scale_down_utilization_threshold = 0.5
    skip_nodes_with_local_storage   = false
    skip_nodes_with_system_pods     = true
  }

  # Azure Monitor (Container Insights)
  oms_agent {
    log_analytics_workspace_id = azurerm_log_analytics_workspace.main.id
  }

  # Microsoft Defender for Containers
  dynamic "microsoft_defender" {
    for_each = var.enable_defender ? [1] : []
    content {
      log_analytics_workspace_id = azurerm_log_analytics_workspace.main.id
    }
  }

  # Azure Key Vault Secrets Provider
  key_vault_secrets_provider {
    secret_rotation_enabled  = true
    secret_rotation_interval = "2m"
  }

  # Maintenance Window
  maintenance_window {
    allowed {
      day   = "Sunday"
      hours = [0, 1, 2, 3, 4, 5]
    }
  }

  # Maintenance Window for Auto Upgrade
  maintenance_window_auto_upgrade {
    frequency    = "Weekly"
    interval     = 1
    duration     = 4
    day_of_week  = "Sunday"
    start_time   = "00:00"
    utc_offset   = "+00:00"
    start_date   = "2024-01-01T00:00:00Z"

    not_allowed {
      start = "2024-12-24T00:00:00Z"
      end   = "2024-12-26T23:59:59Z"
    }
  }

  # Maintenance Window for Node OS
  maintenance_window_node_os {
    frequency    = "Weekly"
    interval     = 1
    duration     = 4
    day_of_week  = "Saturday"
    start_time   = "00:00"
    utc_offset   = "+00:00"
    start_date   = "2024-01-01T00:00:00Z"
  }

  # HTTP Application Routing (disabled for production)
  http_application_routing_enabled = false

  # Storage Profile
  storage_profile {
    blob_driver_enabled         = true
    disk_driver_enabled         = true
    disk_driver_version         = "v1"
    file_driver_enabled         = true
    snapshot_controller_enabled = true
  }

  tags = merge(
    var.common_tags,
    {
      Environment = var.environment
      Component   = "AKS"
    }
  )

  depends_on = [
    azurerm_role_assignment.aks_network_contributor,
    azurerm_role_assignment.kubelet_acr_pull
  ]

  lifecycle {
    ignore_changes = [
      default_node_pool[0].node_count
    ]
  }
}

# Azure Policy Assignment for AKS
resource "azurerm_resource_policy_assignment" "aks_policies" {
  for_each = var.azure_policy_assignments

  name                 = "${var.resource_prefix}-${var.environment}-${each.key}"
  resource_id          = azurerm_kubernetes_cluster.main.id
  policy_definition_id = each.value.policy_definition_id

  dynamic "parameters" {
    for_each = each.value.parameters != null ? [each.value.parameters] : []
    content {
      value = jsonencode(parameters.value)
    }
  }

  depends_on = [azurerm_kubernetes_cluster.main]
}

# Flux Configuration (GitOps)
resource "azurerm_kubernetes_cluster_extension" "flux" {
  count = var.enable_flux ? 1 : 0

  name           = "flux"
  cluster_id     = azurerm_kubernetes_cluster.main.id
  extension_type = "microsoft.flux"

  configuration_settings = {
    "helm-controller.enabled"         = "true"
    "source-controller.enabled"       = "true"
    "kustomize-controller.enabled"    = "true"
    "notification-controller.enabled" = "true"
    "image-automation-controller.enabled" = "false"
    "image-reflector-controller.enabled"  = "false"
  }
}

# Dapr Extension
resource "azurerm_kubernetes_cluster_extension" "dapr" {
  count = var.enable_dapr ? 1 : 0

  name           = "dapr"
  cluster_id     = azurerm_kubernetes_cluster.main.id
  extension_type = "Microsoft.Dapr"

  configuration_settings = {
    "global.ha.enabled" = "true"
  }
}
