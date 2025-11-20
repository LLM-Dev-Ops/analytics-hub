################################################################################
# LLM Analytics Hub - GCP GKE Infrastructure
# GKE Cluster Configuration
################################################################################

################################################################################
# GKE Cluster
################################################################################

resource "google_container_cluster" "primary" {
  name     = local.cluster_name
  location = var.region
  project  = var.project_id

  # Regional cluster across multiple zones
  node_locations = local.zones

  # Minimum version for the master
  min_master_version = var.kubernetes_version

  # Release channel for automatic updates
  release_channel {
    channel = var.release_channel
  }

  # Remove default node pool
  remove_default_node_pool = var.remove_default_node_pool
  initial_node_count       = var.initial_node_count

  # Network configuration
  network    = google_compute_network.vpc.name
  subnetwork = google_compute_subnetwork.gke_subnet.name

  # IP allocation policy for VPC-native cluster
  ip_allocation_policy {
    cluster_secondary_range_name  = var.pods_cidr_name
    services_secondary_range_name = var.services_cidr_name
  }

  # Private cluster configuration
  private_cluster_config {
    enable_private_nodes    = var.enable_private_nodes
    enable_private_endpoint = var.enable_private_endpoint
    master_ipv4_cidr_block  = var.master_ipv4_cidr_block

    master_global_access_config {
      enabled = true
    }
  }

  # Master authorized networks
  dynamic "master_authorized_networks_config" {
    for_each = length(var.master_authorized_networks) > 0 ? [1] : []

    content {
      dynamic "cidr_blocks" {
        for_each = var.master_authorized_networks

        content {
          cidr_block   = cidr_blocks.value.cidr_block
          display_name = cidr_blocks.value.display_name
        }
      }
    }
  }

  # Workload Identity configuration
  workload_identity_config {
    workload_pool = var.enable_workload_identity ? "${var.project_id}.svc.id.goog" : null
  }

  # Addons configuration
  addons_config {
    http_load_balancing {
      disabled = false
    }

    horizontal_pod_autoscaling {
      disabled = !var.enable_horizontal_pod_autoscaling
    }

    network_policy_config {
      disabled = !var.enable_network_policy
    }

    gcp_filestore_csi_driver_config {
      enabled = true
    }

    gce_persistent_disk_csi_driver_config {
      enabled = true
    }

    gcs_fuse_csi_driver_config {
      enabled = true
    }
  }

  # Vertical Pod Autoscaling
  vertical_pod_autoscaling {
    enabled = var.enable_vertical_pod_autoscaling
  }

  # Network policy
  network_policy {
    enabled  = var.enable_network_policy
    provider = var.enable_network_policy ? "CALICO" : "PROVIDER_UNSPECIFIED"
  }

  # Binary Authorization
  binary_authorization {
    evaluation_mode = var.enable_binary_authorization ? "PROJECT_SINGLETON_POLICY_ENFORCE" : "DISABLED"
  }

  # Logging configuration
  logging_config {
    enable_components = var.enable_cloud_logging ? var.logging_components : []
  }

  # Monitoring configuration
  monitoring_config {
    enable_components = var.enable_cloud_monitoring ? ["SYSTEM_COMPONENTS", "WORKLOADS"] : []

    managed_prometheus {
      enabled = var.monitoring_enable_managed_prometheus
    }
  }

  # Maintenance policy
  maintenance_policy {
    recurring_window {
      start_time = "${formatdate("YYYY-MM-DD", timestamp())}T${var.maintenance_start_time}:00Z"
      end_time   = "${formatdate("YYYY-MM-DD", timestamp())}T${timeadd(format("%sT%s:00Z", formatdate("YYYY-MM-DD", timestamp()), var.maintenance_start_time), var.maintenance_duration)}Z"
      recurrence = var.maintenance_recurrence
    }
  }

  # Cluster autoscaling
  cluster_autoscaling {
    enabled = !var.enable_autopilot

    dynamic "auto_provisioning_defaults" {
      for_each = var.enable_autopilot ? [] : [1]

      content {
        service_account = google_service_account.gke_nodes.email
        oauth_scopes = [
          "https://www.googleapis.com/auth/cloud-platform"
        ]

        management {
          auto_repair  = var.enable_auto_repair
          auto_upgrade = var.enable_auto_upgrade
        }

        shielded_instance_config {
          enable_secure_boot          = var.enable_secure_boot
          enable_integrity_monitoring = var.enable_integrity_monitoring
        }
      }
    }

    # Resource limits for autoscaling
    resource_limits {
      resource_type = "cpu"
      minimum       = 4
      maximum       = 200
    }

    resource_limits {
      resource_type = "memory"
      minimum       = 16
      maximum       = 800
    }
  }

  # Security posture
  security_posture_config {
    mode               = "BASIC"
    vulnerability_mode = "VULNERABILITY_BASIC"
  }

  # Cost allocation
  resource_usage_export_config {
    enable_network_egress_metering = var.enable_cost_allocation
    enable_resource_consumption_metering = var.enable_cost_allocation

    bigquery_destination {
      dataset_id = var.enable_cost_allocation ? google_bigquery_dataset.gke_usage[0].dataset_id : null
    }
  }

  # Intranode visibility
  enable_intranode_visibility = var.enable_intranode_visibility

  # Enable shielded nodes
  enable_shielded_nodes = var.enable_shielded_nodes

  # Datapath provider (use advanced networking)
  datapath_provider = "ADVANCED_DATAPATH"

  # DNS configuration
  dns_config {
    cluster_dns        = "CLOUD_DNS"
    cluster_dns_scope  = "VPC_SCOPE"
    cluster_dns_domain = "cluster.local"
  }

  # Gateway API configuration
  gateway_api_config {
    channel = "CHANNEL_STANDARD"
  }

  # Notification configuration
  notification_config {
    pubsub {
      enabled = true
      topic   = google_pubsub_topic.gke_notifications.id
    }
  }

  # Resource labels
  resource_labels = local.common_tags

  # Lifecycle
  lifecycle {
    ignore_changes = [
      initial_node_count,
      node_pool,
    ]
  }

  depends_on = [
    google_project_service.required_apis,
    google_compute_subnetwork.gke_subnet,
    google_service_account.gke_nodes
  ]
}

################################################################################
# BigQuery Dataset for Cost Allocation
################################################################################

resource "google_bigquery_dataset" "gke_usage" {
  count = var.enable_cost_allocation ? 1 : 0

  dataset_id                 = "${var.environment}_gke_usage"
  project                    = var.project_id
  location                   = var.region
  description                = "GKE cluster resource usage data"
  delete_contents_on_destroy = false

  labels = local.common_tags
}

################################################################################
# Pub/Sub Topic for GKE Notifications
################################################################################

resource "google_pubsub_topic" "gke_notifications" {
  name    = "${var.environment}-gke-notifications"
  project = var.project_id

  labels = local.common_tags
}

resource "google_pubsub_subscription" "gke_notifications" {
  name    = "${var.environment}-gke-notifications-sub"
  topic   = google_pubsub_topic.gke_notifications.name
  project = var.project_id

  ack_deadline_seconds = 20

  expiration_policy {
    ttl = "2678400s" # 31 days
  }

  labels = local.common_tags
}

################################################################################
# Binary Authorization Policy
################################################################################

resource "google_binary_authorization_policy" "policy" {
  count = var.enable_binary_authorization ? 1 : 0

  project = var.project_id

  admission_whitelist_patterns {
    name_pattern = "gcr.io/${var.project_id}/*"
  }

  admission_whitelist_patterns {
    name_pattern = "us-docker.pkg.dev/${var.project_id}/*"
  }

  # Allow GKE system images
  admission_whitelist_patterns {
    name_pattern = "gke.gcr.io/*"
  }

  # Allow GCP Marketplace images
  admission_whitelist_patterns {
    name_pattern = "marketplace.gcr.io/*"
  }

  default_admission_rule {
    evaluation_mode  = "ALWAYS_ALLOW"
    enforcement_mode = "ENFORCED_BLOCK_AND_AUDIT_LOG"
  }

  # Cluster-specific admission rules
  cluster_admission_rules {
    cluster                 = "${var.region}.${local.cluster_name}"
    evaluation_mode         = "REQUIRE_ATTESTATION"
    enforcement_mode        = "ENFORCED_BLOCK_AND_AUDIT_LOG"
    require_attestations_by = []
  }
}

################################################################################
# GKE Backup Plan
################################################################################

resource "google_gke_backup_backup_plan" "primary" {
  count = var.enable_backup_restore ? 1 : 0

  name     = "${var.environment}-backup-plan"
  cluster  = google_container_cluster.primary.id
  location = var.region
  project  = var.project_id

  retention_policy {
    backup_delete_lock_days = 7
    backup_retain_days      = var.backup_plan_retention_days
  }

  backup_schedule {
    cron_schedule = "0 2 * * *" # Daily at 2 AM
  }

  backup_config {
    include_volume_data = true
    include_secrets     = true

    selected_namespaces {
      namespaces = ["default", "kube-system", "llm-analytics"]
    }

    encryption_key {
      gcp_kms_encryption_key = google_kms_crypto_key.gke_backup[0].id
    }
  }

  labels = local.common_tags
}

################################################################################
# KMS for GKE Backup Encryption
################################################################################

resource "google_kms_key_ring" "gke" {
  count = var.enable_backup_restore ? 1 : 0

  name     = "${var.environment}-gke-keyring"
  location = var.region
  project  = var.project_id
}

resource "google_kms_crypto_key" "gke_backup" {
  count = var.enable_backup_restore ? 1 : 0

  name            = "${var.environment}-gke-backup-key"
  key_ring        = google_kms_key_ring.gke[0].id
  rotation_period = "7776000s" # 90 days

  lifecycle {
    prevent_destroy = true
  }
}

resource "google_kms_crypto_key_iam_member" "gke_backup" {
  count = var.enable_backup_restore ? 1 : 0

  crypto_key_id = google_kms_crypto_key.gke_backup[0].id
  role          = "roles/cloudkms.cryptoKeyEncrypterDecrypter"
  member        = "serviceAccount:service-${data.google_project.project.number}@gcp-sa-gkebackup.iam.gserviceaccount.com"
}

data "google_project" "project" {
  project_id = var.project_id
}
