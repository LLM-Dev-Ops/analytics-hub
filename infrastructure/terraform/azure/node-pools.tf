# Application Node Pool
resource "azurerm_kubernetes_cluster_node_pool" "application" {
  name                  = "app"
  kubernetes_cluster_id = azurerm_kubernetes_cluster.main.id
  vm_size              = var.app_node_pool_vm_size
  node_count           = var.app_node_pool_enable_auto_scaling ? null : var.app_node_pool_node_count
  min_count            = var.app_node_pool_enable_auto_scaling ? var.app_node_pool_min_count : null
  max_count            = var.app_node_pool_enable_auto_scaling ? var.app_node_pool_max_count : null
  enable_auto_scaling  = var.app_node_pool_enable_auto_scaling
  zones                = var.availability_zones
  vnet_subnet_id       = azurerm_subnet.aks.id
  orchestrator_version = var.kubernetes_version
  max_pods             = 110
  os_disk_size_gb      = 256
  os_disk_type         = "Managed"
  os_type              = "Linux"
  enable_host_encryption = var.enable_host_encryption
  enable_node_public_ip  = false
  mode                   = "User"

  upgrade_settings {
    max_surge = "33%"
  }

  node_labels = {
    "nodepool-type" = "application"
    "environment"   = var.environment
    "workload"      = "application"
  }

  node_taints = []

  tags = merge(
    var.common_tags,
    {
      Environment = var.environment
      Component   = "AKS-Application"
    }
  )

  lifecycle {
    ignore_changes = [
      node_count
    ]
  }
}

# Database Node Pool (with Premium SSD)
resource "azurerm_kubernetes_cluster_node_pool" "database" {
  name                  = "db"
  kubernetes_cluster_id = azurerm_kubernetes_cluster.main.id
  vm_size              = var.db_node_pool_vm_size
  node_count           = var.db_node_pool_enable_auto_scaling ? null : var.db_node_pool_node_count
  min_count            = var.db_node_pool_enable_auto_scaling ? var.db_node_pool_min_count : null
  max_count            = var.db_node_pool_enable_auto_scaling ? var.db_node_pool_max_count : null
  enable_auto_scaling  = var.db_node_pool_enable_auto_scaling
  zones                = var.availability_zones
  vnet_subnet_id       = azurerm_subnet.aks.id
  orchestrator_version = var.kubernetes_version
  max_pods             = 110
  os_disk_size_gb      = 512
  os_disk_type         = "Ephemeral"
  os_type              = "Linux"
  enable_host_encryption = var.enable_host_encryption
  enable_node_public_ip  = false
  mode                   = "User"

  upgrade_settings {
    max_surge = "33%"
  }

  node_labels = {
    "nodepool-type" = "database"
    "environment"   = var.environment
    "workload"      = "database"
    "storage-type"  = "premium-ssd"
  }

  node_taints = [
    "workload=database:NoSchedule"
  ]

  tags = merge(
    var.common_tags,
    {
      Environment = var.environment
      Component   = "AKS-Database"
      Storage     = "Premium-SSD"
    }
  )

  lifecycle {
    ignore_changes = [
      node_count
    ]
  }
}

# Spot Instance Node Pool (for cost savings on non-critical workloads)
resource "azurerm_kubernetes_cluster_node_pool" "spot" {
  count = var.enable_spot_node_pool ? 1 : 0

  name                  = "spot"
  kubernetes_cluster_id = azurerm_kubernetes_cluster.main.id
  vm_size              = var.spot_node_pool_vm_size
  priority             = "Spot"
  eviction_policy      = "Delete"
  spot_max_price       = var.spot_max_price
  node_count           = var.spot_node_pool_enable_auto_scaling ? null : var.spot_node_pool_node_count
  min_count            = var.spot_node_pool_enable_auto_scaling ? var.spot_node_pool_min_count : null
  max_count            = var.spot_node_pool_enable_auto_scaling ? var.spot_node_pool_max_count : null
  enable_auto_scaling  = var.spot_node_pool_enable_auto_scaling
  zones                = var.availability_zones
  vnet_subnet_id       = azurerm_subnet.aks.id
  orchestrator_version = var.kubernetes_version
  max_pods             = 110
  os_disk_size_gb      = 128
  os_disk_type         = "Managed"
  os_type              = "Linux"
  enable_host_encryption = false
  enable_node_public_ip  = false
  mode                   = "User"

  upgrade_settings {
    max_surge = "33%"
  }

  node_labels = {
    "nodepool-type"        = "spot"
    "environment"          = var.environment
    "workload"             = "batch"
    "kubernetes.azure.com/scalesetpriority" = "spot"
  }

  node_taints = [
    "kubernetes.azure.com/scalesetpriority=spot:NoSchedule"
  ]

  tags = merge(
    var.common_tags,
    {
      Environment = var.environment
      Component   = "AKS-Spot"
      CostSaving  = "true"
    }
  )

  lifecycle {
    ignore_changes = [
      node_count
    ]
  }
}

# GPU Node Pool (optional, for ML workloads)
resource "azurerm_kubernetes_cluster_node_pool" "gpu" {
  count = var.enable_gpu_node_pool ? 1 : 0

  name                  = "gpu"
  kubernetes_cluster_id = azurerm_kubernetes_cluster.main.id
  vm_size              = var.gpu_node_pool_vm_size
  node_count           = var.gpu_node_pool_enable_auto_scaling ? null : var.gpu_node_pool_node_count
  min_count            = var.gpu_node_pool_enable_auto_scaling ? var.gpu_node_pool_min_count : null
  max_count            = var.gpu_node_pool_enable_auto_scaling ? var.gpu_node_pool_max_count : null
  enable_auto_scaling  = var.gpu_node_pool_enable_auto_scaling
  zones                = var.availability_zones
  vnet_subnet_id       = azurerm_subnet.aks.id
  orchestrator_version = var.kubernetes_version
  max_pods             = 110
  os_disk_size_gb      = 512
  os_disk_type         = "Managed"
  os_type              = "Linux"
  enable_host_encryption = var.enable_host_encryption
  enable_node_public_ip  = false
  mode                   = "User"

  upgrade_settings {
    max_surge = "33%"
  }

  node_labels = {
    "nodepool-type"     = "gpu"
    "environment"       = var.environment
    "workload"          = "ml"
    "accelerator"       = "nvidia-gpu"
  }

  node_taints = [
    "sku=gpu:NoSchedule"
  ]

  tags = merge(
    var.common_tags,
    {
      Environment = var.environment
      Component   = "AKS-GPU"
      Accelerator = "NVIDIA-GPU"
    }
  )

  lifecycle {
    ignore_changes = [
      node_count
    ]
  }
}

# Monitoring Node Pool (dedicated for observability stack)
resource "azurerm_kubernetes_cluster_node_pool" "monitoring" {
  count = var.enable_monitoring_node_pool ? 1 : 0

  name                  = "monitor"
  kubernetes_cluster_id = azurerm_kubernetes_cluster.main.id
  vm_size              = var.monitoring_node_pool_vm_size
  node_count           = var.monitoring_node_pool_node_count
  enable_auto_scaling  = false
  zones                = var.availability_zones
  vnet_subnet_id       = azurerm_subnet.aks.id
  orchestrator_version = var.kubernetes_version
  max_pods             = 110
  os_disk_size_gb      = 256
  os_disk_type         = "Managed"
  os_type              = "Linux"
  enable_host_encryption = var.enable_host_encryption
  enable_node_public_ip  = false
  mode                   = "User"

  upgrade_settings {
    max_surge = "33%"
  }

  node_labels = {
    "nodepool-type" = "monitoring"
    "environment"   = var.environment
    "workload"      = "observability"
  }

  node_taints = [
    "workload=monitoring:NoSchedule"
  ]

  tags = merge(
    var.common_tags,
    {
      Environment = var.environment
      Component   = "AKS-Monitoring"
    }
  )
}

# Outputs for node pools
output "application_node_pool_id" {
  description = "ID of the application node pool"
  value       = azurerm_kubernetes_cluster_node_pool.application.id
}

output "database_node_pool_id" {
  description = "ID of the database node pool"
  value       = azurerm_kubernetes_cluster_node_pool.database.id
}

output "spot_node_pool_id" {
  description = "ID of the spot node pool"
  value       = var.enable_spot_node_pool ? azurerm_kubernetes_cluster_node_pool.spot[0].id : null
}

output "gpu_node_pool_id" {
  description = "ID of the GPU node pool"
  value       = var.enable_gpu_node_pool ? azurerm_kubernetes_cluster_node_pool.gpu[0].id : null
}

output "monitoring_node_pool_id" {
  description = "ID of the monitoring node pool"
  value       = var.enable_monitoring_node_pool ? azurerm_kubernetes_cluster_node_pool.monitoring[0].id : null
}
