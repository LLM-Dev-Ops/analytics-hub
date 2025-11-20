################################################################################
# LLM Analytics Hub - GCP GKE Infrastructure
# Main Terraform Configuration
################################################################################

terraform {
  required_version = ">= 1.6.0"

  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 5.0"
    }
    google-beta = {
      source  = "hashicorp/google-beta"
      version = "~> 5.0"
    }
  }

  backend "gcs" {
    bucket = "llm-analytics-hub-terraform-state"
    prefix = "gke/state"
  }
}

################################################################################
# Provider Configuration
################################################################################

provider "google" {
  project = var.project_id
  region  = var.region
}

provider "google-beta" {
  project = var.project_id
  region  = var.region
}

################################################################################
# Local Variables
################################################################################

locals {
  cluster_name = "${var.environment}-${var.cluster_name}"

  common_tags = {
    environment = var.environment
    project     = "llm-analytics-hub"
    managed_by  = "terraform"
    cost_center = var.cost_center
  }

  zones = [
    "${var.region}-a",
    "${var.region}-b",
    "${var.region}-c"
  ]
}

################################################################################
# Enable Required APIs
################################################################################

resource "google_project_service" "required_apis" {
  for_each = toset([
    "compute.googleapis.com",
    "container.googleapis.com",
    "cloudresourcemanager.googleapis.com",
    "iam.googleapis.com",
    "logging.googleapis.com",
    "monitoring.googleapis.com",
    "cloudtrace.googleapis.com",
    "binaryauthorization.googleapis.com",
    "secretmanager.googleapis.com",
    "artifactregistry.googleapis.com",
  ])

  project = var.project_id
  service = each.value

  disable_on_destroy = false
}

################################################################################
# Data Sources
################################################################################

data "google_client_config" "default" {}

data "google_compute_zones" "available" {
  project = var.project_id
  region  = var.region
  status  = "UP"
}
