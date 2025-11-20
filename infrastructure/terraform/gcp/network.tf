################################################################################
# LLM Analytics Hub - GCP GKE Infrastructure
# Network Configuration
################################################################################

################################################################################
# VPC Network
################################################################################

resource "google_compute_network" "vpc" {
  name                            = "${var.environment}-${var.network_name}"
  auto_create_subnetworks         = false
  routing_mode                    = "REGIONAL"
  delete_default_routes_on_create = false
  project                         = var.project_id

  depends_on = [google_project_service.required_apis]
}

################################################################################
# Subnet for GKE
################################################################################

resource "google_compute_subnetwork" "gke_subnet" {
  name                     = "${var.environment}-${var.subnet_name}"
  ip_cidr_range            = var.subnet_cidr
  region                   = var.region
  network                  = google_compute_network.vpc.id
  project                  = var.project_id
  private_ip_google_access = true

  # Secondary IP ranges for GKE pods and services
  secondary_ip_range {
    range_name    = var.pods_cidr_name
    ip_cidr_range = var.pods_cidr_range
  }

  secondary_ip_range {
    range_name    = var.services_cidr_name
    ip_cidr_range = var.services_cidr_range
  }

  log_config {
    aggregation_interval = "INTERVAL_5_SEC"
    flow_sampling        = 0.5
    metadata             = "INCLUDE_ALL_METADATA"
  }
}

################################################################################
# Cloud Router for NAT
################################################################################

resource "google_compute_router" "router" {
  name    = "${var.environment}-${var.network_name}-router"
  region  = var.region
  network = google_compute_network.vpc.id
  project = var.project_id

  bgp {
    asn = 64514
  }
}

################################################################################
# Cloud NAT for Outbound Traffic
################################################################################

resource "google_compute_router_nat" "nat" {
  name                               = "${var.environment}-${var.network_name}-nat"
  router                             = google_compute_router.router.name
  region                             = var.region
  project                            = var.project_id
  nat_ip_allocate_option             = "AUTO_ONLY"
  source_subnetwork_ip_ranges_to_nat = "ALL_SUBNETWORKS_ALL_IP_RANGES"

  log_config {
    enable = true
    filter = "ERRORS_ONLY"
  }
}

################################################################################
# Static IP for NAT Gateway (Optional for whitelisting)
################################################################################

resource "google_compute_address" "nat_ip" {
  count   = 2
  name    = "${var.environment}-nat-ip-${count.index + 1}"
  region  = var.region
  project = var.project_id
}

################################################################################
# Private Service Connection for Google Services
################################################################################

resource "google_compute_global_address" "private_ip_range" {
  name          = "${var.environment}-private-ip-range"
  purpose       = "VPC_PEERING"
  address_type  = "INTERNAL"
  prefix_length = 16
  network       = google_compute_network.vpc.id
  project       = var.project_id
}

resource "google_service_networking_connection" "private_vpc_connection" {
  network                 = google_compute_network.vpc.id
  service                 = "servicenetworking.googleapis.com"
  reserved_peering_ranges = [google_compute_global_address.private_ip_range.name]

  depends_on = [google_project_service.required_apis]
}

################################################################################
# DNS Configuration
################################################################################

resource "google_dns_managed_zone" "private_zone" {
  name        = "${var.environment}-llm-analytics-private-zone"
  dns_name    = "llm-analytics.internal."
  description = "Private DNS zone for LLM Analytics Hub"
  project     = var.project_id

  visibility = "private"

  private_visibility_config {
    networks {
      network_url = google_compute_network.vpc.id
    }
  }
}

################################################################################
# VPC Peering for Additional Services (if needed)
################################################################################

# Example: Peering with another VPC
# resource "google_compute_network_peering" "peering" {
#   name         = "${var.environment}-peering"
#   network      = google_compute_network.vpc.id
#   peer_network = "projects/OTHER_PROJECT/global/networks/OTHER_NETWORK"
# }
