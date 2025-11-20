################################################################################
# LLM Analytics Hub - GCP GKE Infrastructure
# Node Pool Configuration
################################################################################

################################################################################
# System Node Pool (for system components)
################################################################################

resource "google_container_node_pool" "system" {
  name     = "${local.cluster_name}-system-pool"
  location = var.region
  cluster  = google_container_cluster.primary.name
  project  = var.project_id

  # Number of nodes per zone
  node_count = var.system_pool_config.min_nodes

  # Autoscaling configuration
  autoscaling {
    min_node_count = var.system_pool_config.min_nodes
    max_node_count = var.system_pool_config.max_nodes
  }

  # Node management
  management {
    auto_repair  = var.enable_auto_repair
    auto_upgrade = var.enable_auto_upgrade
  }

  # Node configuration
  node_config {
    machine_type = var.system_pool_config.machine_type
    disk_size_gb = var.system_pool_config.disk_size_gb
    disk_type    = var.system_pool_config.disk_type

    service_account = google_service_account.gke_nodes.email
    oauth_scopes = [
      "https://www.googleapis.com/auth/cloud-platform"
    ]

    # Labels for node selection
    labels = merge(
      local.common_tags,
      {
        "workload-type" = "system"
        "node-pool"     = "system"
      }
    )

    # Taints to prevent non-system workloads
    taint {
      key    = "workload-type"
      value  = "system"
      effect = "NO_SCHEDULE"
    }

    # Tags for firewall rules
    tags = ["gke-${local.cluster_name}", "gke-${local.cluster_name}-system"]

    # Metadata
    metadata = {
      disable-legacy-endpoints = "true"
    }

    # Shielded instance config
    shielded_instance_config {
      enable_secure_boot          = var.enable_secure_boot
      enable_integrity_monitoring = var.enable_integrity_monitoring
    }

    # Workload Identity
    workload_metadata_config {
      mode = var.enable_workload_identity ? "GKE_METADATA" : "GCE_METADATA"
    }

    # Resource reservations
    reservation_affinity {
      consume_reservation_type = "NO_RESERVATION"
    }
  }

  lifecycle {
    ignore_changes = [
      initial_node_count,
      node_count,
    ]
  }
}

################################################################################
# Application Node Pool (for application workloads)
################################################################################

resource "google_container_node_pool" "application" {
  name     = "${local.cluster_name}-app-pool"
  location = var.region
  cluster  = google_container_cluster.primary.name
  project  = var.project_id

  node_count = var.app_pool_config.min_nodes

  autoscaling {
    min_node_count = var.app_pool_config.min_nodes
    max_node_count = var.app_pool_config.max_nodes
  }

  management {
    auto_repair  = var.enable_auto_repair
    auto_upgrade = var.enable_auto_upgrade
  }

  node_config {
    machine_type = var.app_pool_config.machine_type
    disk_size_gb = var.app_pool_config.disk_size_gb
    disk_type    = var.app_pool_config.disk_type

    service_account = google_service_account.gke_nodes.email
    oauth_scopes = [
      "https://www.googleapis.com/auth/cloud-platform"
    ]

    labels = merge(
      local.common_tags,
      {
        "workload-type" = "application"
        "node-pool"     = "application"
      }
    )

    tags = ["gke-${local.cluster_name}", "gke-${local.cluster_name}-app"]

    metadata = {
      disable-legacy-endpoints = "true"
    }

    shielded_instance_config {
      enable_secure_boot          = var.enable_secure_boot
      enable_integrity_monitoring = var.enable_integrity_monitoring
    }

    workload_metadata_config {
      mode = var.enable_workload_identity ? "GKE_METADATA" : "GCE_METADATA"
    }

    # Additional features
    gvnic {
      enabled = true
    }

    reservation_affinity {
      consume_reservation_type = "NO_RESERVATION"
    }
  }

  lifecycle {
    ignore_changes = [
      initial_node_count,
      node_count,
    ]
  }
}

################################################################################
# Database Node Pool (for stateful workloads)
################################################################################

resource "google_container_node_pool" "database" {
  name     = "${local.cluster_name}-db-pool"
  location = var.region
  cluster  = google_container_cluster.primary.name
  project  = var.project_id

  node_count = var.db_pool_config.min_nodes

  autoscaling {
    min_node_count = var.db_pool_config.min_nodes
    max_node_count = var.db_pool_config.max_nodes
  }

  management {
    auto_repair  = var.enable_auto_repair
    auto_upgrade = var.enable_auto_upgrade
  }

  node_config {
    machine_type    = var.db_pool_config.machine_type
    disk_size_gb    = var.db_pool_config.disk_size_gb
    disk_type       = var.db_pool_config.disk_type
    local_ssd_count = var.db_pool_config.local_ssd_count

    service_account = google_service_account.gke_nodes.email
    oauth_scopes = [
      "https://www.googleapis.com/auth/cloud-platform"
    ]

    labels = merge(
      local.common_tags,
      {
        "workload-type" = "database"
        "node-pool"     = "database"
      }
    )

    # Taint for database workloads only
    taint {
      key    = "workload-type"
      value  = "database"
      effect = "NO_SCHEDULE"
    }

    tags = ["gke-${local.cluster_name}", "gke-${local.cluster_name}-db"]

    metadata = {
      disable-legacy-endpoints = "true"
    }

    shielded_instance_config {
      enable_secure_boot          = var.enable_secure_boot
      enable_integrity_monitoring = var.enable_integrity_monitoring
    }

    workload_metadata_config {
      mode = var.enable_workload_identity ? "GKE_METADATA" : "GCE_METADATA"
    }

    gvnic {
      enabled = true
    }

    reservation_affinity {
      consume_reservation_type = "NO_RESERVATION"
    }

    # Advanced machine features for database workloads
    advanced_machine_features {
      threads_per_core = 1 # Disable hyperthreading for better performance
    }
  }

  lifecycle {
    ignore_changes = [
      initial_node_count,
      node_count,
    ]
  }
}

################################################################################
# Preemptible/Spot Node Pool (for cost optimization)
################################################################################

resource "google_container_node_pool" "preemptible" {
  name     = "${local.cluster_name}-spot-pool"
  location = var.region
  cluster  = google_container_cluster.primary.name
  project  = var.project_id

  node_count = var.preemptible_pool_config.min_nodes

  autoscaling {
    min_node_count = var.preemptible_pool_config.min_nodes
    max_node_count = var.preemptible_pool_config.max_nodes
  }

  management {
    auto_repair  = var.enable_auto_repair
    auto_upgrade = var.enable_auto_upgrade
  }

  node_config {
    machine_type = var.preemptible_pool_config.machine_type
    disk_size_gb = var.preemptible_pool_config.disk_size_gb
    disk_type    = var.preemptible_pool_config.disk_type

    # Enable spot instances
    spot = var.preemptible_pool_config.spot

    service_account = google_service_account.gke_nodes.email
    oauth_scopes = [
      "https://www.googleapis.com/auth/cloud-platform"
    ]

    labels = merge(
      local.common_tags,
      {
        "workload-type" = "batch"
        "node-pool"     = "preemptible"
        "spot"          = "true"
      }
    )

    # Taint to ensure only tolerant workloads run here
    taint {
      key    = "workload-type"
      value  = "batch"
      effect = "NO_SCHEDULE"
    }

    taint {
      key    = "cloud.google.com/gke-spot"
      value  = "true"
      effect = "NO_SCHEDULE"
    }

    tags = ["gke-${local.cluster_name}", "gke-${local.cluster_name}-spot"]

    metadata = {
      disable-legacy-endpoints = "true"
    }

    shielded_instance_config {
      enable_secure_boot          = var.enable_secure_boot
      enable_integrity_monitoring = var.enable_integrity_monitoring
    }

    workload_metadata_config {
      mode = var.enable_workload_identity ? "GKE_METADATA" : "GCE_METADATA"
    }

    gvnic {
      enabled = true
    }

    reservation_affinity {
      consume_reservation_type = "NO_RESERVATION"
    }
  }

  lifecycle {
    ignore_changes = [
      initial_node_count,
      node_count,
    ]
  }
}

################################################################################
# Node Pool Upgrade Settings
################################################################################

# Blue/Green upgrade strategy for production
resource "google_container_node_pool" "blue_green_example" {
  count = var.environment == "prod" ? 0 : 0 # Disabled by default, enable as needed

  name     = "${local.cluster_name}-bg-pool"
  location = var.region
  cluster  = google_container_cluster.primary.name
  project  = var.project_id

  node_count = 3

  upgrade_settings {
    max_surge       = 1
    max_unavailable = 0
    strategy        = "SURGE"

    blue_green_settings {
      standard_rollout_policy {
        batch_percentage    = 0.33
        batch_soak_duration = "300s"
      }
      node_pool_soak_duration = "600s"
    }
  }

  node_config {
    machine_type = "n2-standard-4"

    service_account = google_service_account.gke_nodes.email
    oauth_scopes = [
      "https://www.googleapis.com/auth/cloud-platform"
    ]

    labels = merge(
      local.common_tags,
      {
        "node-pool" = "blue-green"
      }
    )
  }
}
