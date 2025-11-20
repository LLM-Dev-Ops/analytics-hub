# Resource Group Outputs
output "resource_group_name" {
  description = "Name of the resource group"
  value       = azurerm_resource_group.main.name
}

output "resource_group_id" {
  description = "ID of the resource group"
  value       = azurerm_resource_group.main.id
}

output "location" {
  description = "Azure region where resources are deployed"
  value       = azurerm_resource_group.main.location
}

# Network Outputs
output "vnet_id" {
  description = "ID of the virtual network"
  value       = azurerm_virtual_network.main.id
}

output "vnet_name" {
  description = "Name of the virtual network"
  value       = azurerm_virtual_network.main.name
}

output "aks_subnet_id" {
  description = "ID of the AKS subnet"
  value       = azurerm_subnet.aks.id
}

output "database_subnet_id" {
  description = "ID of the database subnet"
  value       = azurerm_subnet.database.id
}

output "private_endpoints_subnet_id" {
  description = "ID of the private endpoints subnet"
  value       = azurerm_subnet.private_endpoints.id
}

output "nat_gateway_id" {
  description = "ID of the NAT gateway"
  value       = var.enable_nat_gateway ? azurerm_nat_gateway.main[0].id : null
}

# AKS Cluster Outputs
output "aks_cluster_id" {
  description = "ID of the AKS cluster"
  value       = azurerm_kubernetes_cluster.main.id
}

output "aks_cluster_name" {
  description = "Name of the AKS cluster"
  value       = azurerm_kubernetes_cluster.main.name
}

output "aks_cluster_fqdn" {
  description = "FQDN of the AKS cluster"
  value       = azurerm_kubernetes_cluster.main.fqdn
}

output "aks_cluster_private_fqdn" {
  description = "Private FQDN of the AKS cluster"
  value       = var.enable_private_cluster ? azurerm_kubernetes_cluster.main.private_fqdn : null
}

output "aks_cluster_kube_config" {
  description = "Kubernetes configuration for the AKS cluster"
  value       = azurerm_kubernetes_cluster.main.kube_config_raw
  sensitive   = true
}

output "aks_cluster_kube_config_host" {
  description = "Kubernetes API server host"
  value       = azurerm_kubernetes_cluster.main.kube_config[0].host
  sensitive   = true
}

output "aks_cluster_node_resource_group" {
  description = "Resource group containing AKS cluster nodes"
  value       = azurerm_kubernetes_cluster.main.node_resource_group
}

output "aks_cluster_oidc_issuer_url" {
  description = "OIDC issuer URL for workload identity"
  value       = azurerm_kubernetes_cluster.main.oidc_issuer_url
}

output "aks_cluster_kubelet_identity" {
  description = "Kubelet identity information"
  value = {
    client_id = azurerm_user_assigned_identity.aks_kubelet.client_id
    object_id = azurerm_user_assigned_identity.aks_kubelet.principal_id
    id        = azurerm_user_assigned_identity.aks_kubelet.id
  }
}

# Identity Outputs
output "aks_cluster_identity_id" {
  description = "ID of the AKS cluster managed identity"
  value       = azurerm_user_assigned_identity.aks_cluster.id
}

output "aks_cluster_identity_principal_id" {
  description = "Principal ID of the AKS cluster managed identity"
  value       = azurerm_user_assigned_identity.aks_cluster.principal_id
}

output "aks_cluster_identity_client_id" {
  description = "Client ID of the AKS cluster managed identity"
  value       = azurerm_user_assigned_identity.aks_cluster.client_id
}

output "workload_identities" {
  description = "Workload identities information"
  value = {
    for k, v in azurerm_user_assigned_identity.workload_identity : k => {
      client_id = v.client_id
      object_id = v.principal_id
      id        = v.id
    }
  }
}

# Container Registry Outputs
output "acr_id" {
  description = "ID of the Azure Container Registry"
  value       = azurerm_container_registry.main.id
}

output "acr_name" {
  description = "Name of the Azure Container Registry"
  value       = azurerm_container_registry.main.name
}

output "acr_login_server" {
  description = "Login server for the Azure Container Registry"
  value       = azurerm_container_registry.main.login_server
}

# Key Vault Outputs
output "key_vault_id" {
  description = "ID of the Key Vault"
  value       = azurerm_key_vault.main.id
}

output "key_vault_name" {
  description = "Name of the Key Vault"
  value       = azurerm_key_vault.main.name
}

output "key_vault_uri" {
  description = "URI of the Key Vault"
  value       = azurerm_key_vault.main.vault_uri
}

# Log Analytics Outputs
output "log_analytics_workspace_id" {
  description = "ID of the Log Analytics workspace"
  value       = azurerm_log_analytics_workspace.main.id
}

output "log_analytics_workspace_name" {
  description = "Name of the Log Analytics workspace"
  value       = azurerm_log_analytics_workspace.main.name
}

output "log_analytics_workspace_workspace_id" {
  description = "Workspace ID of the Log Analytics workspace"
  value       = azurerm_log_analytics_workspace.main.workspace_id
}

output "log_analytics_workspace_primary_shared_key" {
  description = "Primary shared key of the Log Analytics workspace"
  value       = azurerm_log_analytics_workspace.main.primary_shared_key
  sensitive   = true
}

# Application Insights Outputs
output "application_insights_id" {
  description = "ID of Application Insights"
  value       = azurerm_application_insights.main.id
}

output "application_insights_name" {
  description = "Name of Application Insights"
  value       = azurerm_application_insights.main.name
}

output "application_insights_instrumentation_key" {
  description = "Instrumentation key of Application Insights"
  value       = azurerm_application_insights.main.instrumentation_key
  sensitive   = true
}

output "application_insights_connection_string" {
  description = "Connection string of Application Insights"
  value       = azurerm_application_insights.main.connection_string
  sensitive   = true
}

# Azure AD Groups Outputs (if enabled)
output "aks_admin_group_id" {
  description = "Object ID of AKS admin Azure AD group"
  value       = var.enable_azure_ad_rbac ? azuread_group.aks_admins[0].object_id : null
}

output "aks_developers_group_id" {
  description = "Object ID of AKS developers Azure AD group"
  value       = var.enable_azure_ad_rbac ? azuread_group.aks_developers[0].object_id : null
}

output "aks_viewers_group_id" {
  description = "Object ID of AKS viewers Azure AD group"
  value       = var.enable_azure_ad_rbac ? azuread_group.aks_viewers[0].object_id : null
}

# Commands Output (for easy copy-paste)
output "connect_to_cluster_command" {
  description = "Command to connect to the AKS cluster"
  value       = "az aks get-credentials --resource-group ${azurerm_resource_group.main.name} --name ${azurerm_kubernetes_cluster.main.name}"
}

output "acr_login_command" {
  description = "Command to login to Azure Container Registry"
  value       = "az acr login --name ${azurerm_container_registry.main.name}"
}

# Summary Output
output "deployment_summary" {
  description = "Summary of deployed resources"
  value = {
    resource_group        = azurerm_resource_group.main.name
    location              = azurerm_resource_group.main.location
    aks_cluster           = azurerm_kubernetes_cluster.main.name
    kubernetes_version    = azurerm_kubernetes_cluster.main.kubernetes_version
    container_registry    = azurerm_container_registry.main.name
    key_vault             = azurerm_key_vault.main.name
    log_analytics         = azurerm_log_analytics_workspace.main.name
    application_insights  = azurerm_application_insights.main.name
    private_cluster       = var.enable_private_cluster
    azure_ad_rbac_enabled = var.enable_azure_ad_rbac
    spot_pool_enabled     = var.enable_spot_node_pool
    gpu_pool_enabled      = var.enable_gpu_node_pool
    defender_enabled      = var.enable_defender
  }
}
