# Managed Identity for AKS Cluster
resource "azurerm_user_assigned_identity" "aks_cluster" {
  name                = "${var.resource_prefix}-${var.environment}-aks-identity"
  resource_group_name = azurerm_resource_group.main.name
  location            = azurerm_resource_group.main.location

  tags = merge(
    var.common_tags,
    {
      Environment = var.environment
      Component   = "Identity"
    }
  )
}

# Managed Identity for AKS Kubelet
resource "azurerm_user_assigned_identity" "aks_kubelet" {
  name                = "${var.resource_prefix}-${var.environment}-kubelet-identity"
  resource_group_name = azurerm_resource_group.main.name
  location            = azurerm_resource_group.main.location

  tags = merge(
    var.common_tags,
    {
      Environment = var.environment
      Component   = "Identity"
    }
  )
}

# Role Assignments for AKS Cluster Identity

# Network Contributor on VNet
resource "azurerm_role_assignment" "aks_network_contributor" {
  scope                = azurerm_virtual_network.main.id
  role_definition_name = "Network Contributor"
  principal_id         = azurerm_user_assigned_identity.aks_cluster.principal_id

  skip_service_principal_aad_check = true
}

# Private DNS Zone Contributor (for private cluster)
resource "azurerm_role_assignment" "aks_dns_contributor" {
  count = var.enable_private_cluster ? 1 : 0

  scope                = azurerm_private_dns_zone.aks[0].id
  role_definition_name = "Private DNS Zone Contributor"
  principal_id         = azurerm_user_assigned_identity.aks_cluster.principal_id

  skip_service_principal_aad_check = true
}

# Role Assignments for Kubelet Identity

# AcrPull on Container Registry
resource "azurerm_role_assignment" "kubelet_acr_pull" {
  scope                = azurerm_container_registry.main.id
  role_definition_name = "AcrPull"
  principal_id         = azurerm_user_assigned_identity.aks_kubelet.principal_id

  skip_service_principal_aad_check = true
}

# Managed Identity Operator (for pod identity)
resource "azurerm_role_assignment" "aks_managed_identity_operator" {
  count = var.enable_pod_identity ? 1 : 0

  scope                = azurerm_resource_group.main.id
  role_definition_name = "Managed Identity Operator"
  principal_id         = azurerm_user_assigned_identity.aks_cluster.principal_id

  skip_service_principal_aad_check = true
}

# Virtual Machine Contributor (for pod identity)
resource "azurerm_role_assignment" "aks_vm_contributor" {
  count = var.enable_pod_identity ? 1 : 0

  scope                = azurerm_resource_group.main.id
  role_definition_name = "Virtual Machine Contributor"
  principal_id         = azurerm_user_assigned_identity.aks_cluster.principal_id

  skip_service_principal_aad_check = true
}

# Key Vault Secrets Officer for AKS
resource "azurerm_role_assignment" "aks_keyvault_secrets_officer" {
  scope                = azurerm_key_vault.main.id
  role_definition_name = "Key Vault Secrets Officer"
  principal_id         = azurerm_user_assigned_identity.aks_kubelet.principal_id

  skip_service_principal_aad_check = true
}

# Azure AD Groups for RBAC (optional)
resource "azuread_group" "aks_admins" {
  count = var.enable_azure_ad_rbac ? 1 : 0

  display_name     = "${var.resource_prefix}-${var.environment}-aks-admins"
  description      = "AKS Cluster Administrators"
  security_enabled = true
}

resource "azuread_group" "aks_developers" {
  count = var.enable_azure_ad_rbac ? 1 : 0

  display_name     = "${var.resource_prefix}-${var.environment}-aks-developers"
  description      = "AKS Cluster Developers"
  security_enabled = true
}

resource "azuread_group" "aks_viewers" {
  count = var.enable_azure_ad_rbac ? 1 : 0

  display_name     = "${var.resource_prefix}-${var.environment}-aks-viewers"
  description      = "AKS Cluster Viewers"
  security_enabled = true
}

# Role Assignments for Azure AD Groups
resource "azurerm_role_assignment" "aks_admins_cluster_admin" {
  count = var.enable_azure_ad_rbac ? 1 : 0

  scope                = azurerm_kubernetes_cluster.main.id
  role_definition_name = "Azure Kubernetes Service Cluster Admin Role"
  principal_id         = azuread_group.aks_admins[0].object_id
}

resource "azurerm_role_assignment" "aks_developers_cluster_user" {
  count = var.enable_azure_ad_rbac ? 1 : 0

  scope                = azurerm_kubernetes_cluster.main.id
  role_definition_name = "Azure Kubernetes Service Cluster User Role"
  principal_id         = azuread_group.aks_developers[0].object_id
}

resource "azurerm_role_assignment" "aks_viewers_cluster_user" {
  count = var.enable_azure_ad_rbac ? 1 : 0

  scope                = azurerm_kubernetes_cluster.main.id
  role_definition_name = "Azure Kubernetes Service Cluster User Role"
  principal_id         = azuread_group.aks_viewers[0].object_id
}

# Workload Identity (for applications running in AKS)
resource "azurerm_user_assigned_identity" "workload_identity" {
  for_each = var.workload_identities

  name                = "${var.resource_prefix}-${var.environment}-${each.key}-identity"
  resource_group_name = azurerm_resource_group.main.name
  location            = azurerm_resource_group.main.location

  tags = merge(
    var.common_tags,
    {
      Environment = var.environment
      Component   = "Identity"
      Workload    = each.key
    }
  )
}

# Federated Identity Credentials for Workload Identity
resource "azurerm_federated_identity_credential" "workload_identity" {
  for_each = var.workload_identities

  name                = "${var.resource_prefix}-${var.environment}-${each.key}-federated"
  resource_group_name = azurerm_resource_group.main.name
  parent_id           = azurerm_user_assigned_identity.workload_identity[each.key].id
  audience            = ["api://AzureADTokenExchange"]
  issuer              = azurerm_kubernetes_cluster.main.oidc_issuer_url
  subject             = "system:serviceaccount:${each.value.namespace}:${each.value.service_account}"

  depends_on = [azurerm_kubernetes_cluster.main]
}

# Role Assignments for Workload Identities
resource "azurerm_role_assignment" "workload_identity_storage" {
  for_each = {
    for k, v in var.workload_identities : k => v
    if contains(v.required_permissions, "storage")
  }

  scope                = azurerm_resource_group.main.id
  role_definition_name = "Storage Blob Data Contributor"
  principal_id         = azurerm_user_assigned_identity.workload_identity[each.key].principal_id

  skip_service_principal_aad_check = true
}

resource "azurerm_role_assignment" "workload_identity_keyvault" {
  for_each = {
    for k, v in var.workload_identities : k => v
    if contains(v.required_permissions, "keyvault")
  }

  scope                = azurerm_key_vault.main.id
  role_definition_name = "Key Vault Secrets User"
  principal_id         = azurerm_user_assigned_identity.workload_identity[each.key].principal_id

  skip_service_principal_aad_check = true
}
