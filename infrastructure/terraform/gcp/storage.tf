################################################################################
# LLM Analytics Hub - GCP GKE Infrastructure
# Storage Configuration
################################################################################

################################################################################
# Storage Classes for Persistent Disks
################################################################################

# Note: Storage classes are typically managed via Kubernetes manifests
# This file provides Terraform resources for GCS buckets and disk templates

################################################################################
# GCS Bucket for Application Data
################################################################################

resource "google_storage_bucket" "app_data" {
  name          = "${var.project_id}-${var.environment}-app-data"
  location      = var.region
  project       = var.project_id
  force_destroy = var.environment == "dev" ? true : false

  uniform_bucket_level_access = true

  versioning {
    enabled = var.environment == "prod" ? true : false
  }

  lifecycle_rule {
    condition {
      age = 90
    }
    action {
      type          = "SetStorageClass"
      storage_class = "NEARLINE"
    }
  }

  lifecycle_rule {
    condition {
      age = 365
    }
    action {
      type          = "SetStorageClass"
      storage_class = "COLDLINE"
    }
  }

  labels = local.common_tags
}

################################################################################
# GCS Bucket for Logs
################################################################################

resource "google_storage_bucket" "logs" {
  name          = "${var.project_id}-${var.environment}-logs"
  location      = var.region
  project       = var.project_id
  force_destroy = var.environment == "dev" ? true : false

  uniform_bucket_level_access = true

  lifecycle_rule {
    condition {
      age = 30
    }
    action {
      type          = "SetStorageClass"
      storage_class = "NEARLINE"
    }
  }

  lifecycle_rule {
    condition {
      age = 90
    }
    action {
      type = "Delete"
    }
  }

  labels = local.common_tags
}

################################################################################
# GCS Bucket for Backups
################################################################################

resource "google_storage_bucket" "backups" {
  name          = "${var.project_id}-${var.environment}-backups"
  location      = var.region
  project       = var.project_id
  force_destroy = false

  uniform_bucket_level_access = true

  versioning {
    enabled = true
  }

  lifecycle_rule {
    condition {
      age                   = 30
      with_state            = "ARCHIVED"
      num_newer_versions    = 3
    }
    action {
      type = "Delete"
    }
  }

  lifecycle_rule {
    condition {
      age = 7
    }
    action {
      type          = "SetStorageClass"
      storage_class = "NEARLINE"
    }
  }

  labels = local.common_tags
}

################################################################################
# GCS Bucket for ML Models and Artifacts
################################################################################

resource "google_storage_bucket" "ml_artifacts" {
  name          = "${var.project_id}-${var.environment}-ml-artifacts"
  location      = var.region
  project       = var.project_id
  force_destroy = var.environment == "dev" ? true : false

  uniform_bucket_level_access = true

  versioning {
    enabled = true
  }

  labels = local.common_tags
}

################################################################################
# GCS Bucket IAM
################################################################################

resource "google_storage_bucket_iam_member" "app_data_storage_admin" {
  bucket = google_storage_bucket.app_data.name
  role   = "roles/storage.objectAdmin"
  member = "serviceAccount:${google_service_account.storage_workload.email}"
}

resource "google_storage_bucket_iam_member" "logs_storage_admin" {
  bucket = google_storage_bucket.logs.name
  role   = "roles/storage.objectCreator"
  member = "serviceAccount:${google_service_account.gke_nodes.email}"
}

resource "google_storage_bucket_iam_member" "backups_storage_admin" {
  bucket = google_storage_bucket.backups.name
  role   = "roles/storage.objectAdmin"
  member = "serviceAccount:${google_service_account.storage_workload.email}"
}

################################################################################
# Persistent Disk Snapshot Schedule
################################################################################

resource "google_compute_resource_policy" "daily_snapshot" {
  name    = "${var.environment}-daily-snapshot-policy"
  region  = var.region
  project = var.project_id

  snapshot_schedule_policy {
    schedule {
      daily_schedule {
        days_in_cycle = 1
        start_time    = "02:00"
      }
    }

    retention_policy {
      max_retention_days    = 14
      on_source_disk_delete = "KEEP_AUTO_SNAPSHOTS"
    }

    snapshot_properties {
      labels = merge(
        local.common_tags,
        {
          "snapshot-type" = "automated"
        }
      )
      storage_locations = [var.region]
      guest_flush       = false
    }
  }
}

resource "google_compute_resource_policy" "weekly_snapshot" {
  name    = "${var.environment}-weekly-snapshot-policy"
  region  = var.region
  project = var.project_id

  snapshot_schedule_policy {
    schedule {
      weekly_schedule {
        day_of_weeks {
          day        = "SUNDAY"
          start_time = "02:00"
        }
      }
    }

    retention_policy {
      max_retention_days    = 90
      on_source_disk_delete = "KEEP_AUTO_SNAPSHOTS"
    }

    snapshot_properties {
      labels = merge(
        local.common_tags,
        {
          "snapshot-type" = "weekly"
        }
      )
      storage_locations = [var.region]
      guest_flush       = false
    }
  }
}

################################################################################
# Regional Persistent Disk (Example for HA databases)
################################################################################

resource "google_compute_region_disk" "database_disk" {
  count = var.environment == "prod" ? 1 : 0

  name                      = "${var.environment}-database-disk"
  region                    = var.region
  project                   = var.project_id
  size                      = 500
  type                      = "pd-ssd"
  replica_zones             = [local.zones[0], local.zones[1]]
  physical_block_size_bytes = 4096

  labels = merge(
    local.common_tags,
    {
      "disk-type" = "database"
    }
  )
}

################################################################################
# Filestore Instance for Shared Storage
################################################################################

resource "google_filestore_instance" "shared_storage" {
  count = var.environment == "prod" ? 1 : 0

  name     = "${var.environment}-shared-storage"
  location = local.zones[0]
  tier     = "BASIC_HDD"
  project  = var.project_id

  file_shares {
    capacity_gb = 1024
    name        = "shared"

    nfs_export_options {
      ip_ranges   = [var.subnet_cidr]
      access_mode = "READ_WRITE"
      squash_mode = "NO_ROOT_SQUASH"
    }
  }

  networks {
    network = google_compute_network.vpc.name
    modes   = ["MODE_IPV4"]
  }

  labels = local.common_tags
}

################################################################################
# Artifact Registry for Container Images
################################################################################

resource "google_artifact_registry_repository" "docker" {
  location      = var.region
  repository_id = "${var.environment}-docker"
  description   = "Docker repository for ${var.environment} environment"
  format        = "DOCKER"
  project       = var.project_id

  labels = local.common_tags
}

resource "google_artifact_registry_repository" "helm" {
  location      = var.region
  repository_id = "${var.environment}-helm"
  description   = "Helm repository for ${var.environment} environment"
  format        = "DOCKER"
  project       = var.project_id

  labels = local.common_tags
}

################################################################################
# Artifact Registry IAM
################################################################################

resource "google_artifact_registry_repository_iam_member" "docker_reader" {
  location   = google_artifact_registry_repository.docker.location
  repository = google_artifact_registry_repository.docker.name
  role       = "roles/artifactregistry.reader"
  member     = "serviceAccount:${google_service_account.gke_nodes.email}"
  project    = var.project_id
}

resource "google_artifact_registry_repository_iam_member" "helm_reader" {
  location   = google_artifact_registry_repository.helm.location
  repository = google_artifact_registry_repository.helm.name
  role       = "roles/artifactregistry.reader"
  member     = "serviceAccount:${google_service_account.gke_nodes.email}"
  project    = var.project_id
}
