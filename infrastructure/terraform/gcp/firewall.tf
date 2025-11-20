################################################################################
# LLM Analytics Hub - GCP GKE Infrastructure
# Firewall Rules
################################################################################

################################################################################
# Deny All Ingress (Default Deny)
################################################################################

resource "google_compute_firewall" "deny_all_ingress" {
  name      = "${var.environment}-deny-all-ingress"
  network   = google_compute_network.vpc.name
  project   = var.project_id
  priority  = 65534
  direction = "INGRESS"

  deny {
    protocol = "all"
  }

  source_ranges = ["0.0.0.0/0"]
}

################################################################################
# Allow Internal Traffic
################################################################################

resource "google_compute_firewall" "allow_internal" {
  name      = "${var.environment}-allow-internal"
  network   = google_compute_network.vpc.name
  project   = var.project_id
  priority  = 1000
  direction = "INGRESS"

  allow {
    protocol = "tcp"
    ports    = ["0-65535"]
  }

  allow {
    protocol = "udp"
    ports    = ["0-65535"]
  }

  allow {
    protocol = "icmp"
  }

  source_ranges = [
    var.subnet_cidr,
    var.pods_cidr_range,
    var.services_cidr_range
  ]
}

################################################################################
# Allow GKE Master to Nodes
################################################################################

resource "google_compute_firewall" "allow_master_to_nodes" {
  name      = "${var.environment}-allow-master-to-nodes"
  network   = google_compute_network.vpc.name
  project   = var.project_id
  priority  = 1000
  direction = "INGRESS"

  allow {
    protocol = "tcp"
    ports    = ["443", "10250", "8443"]
  }

  source_ranges = [var.master_ipv4_cidr_block]

  target_tags = ["gke-${local.cluster_name}"]
}

################################################################################
# Allow Health Checks
################################################################################

resource "google_compute_firewall" "allow_health_checks" {
  name      = "${var.environment}-allow-health-checks"
  network   = google_compute_network.vpc.name
  project   = var.project_id
  priority  = 1000
  direction = "INGRESS"

  allow {
    protocol = "tcp"
    ports    = ["80", "443", "8080", "8443"]
  }

  # GCP Health Check IP ranges
  source_ranges = [
    "35.191.0.0/16",
    "130.211.0.0/22",
    "209.85.152.0/22",
    "209.85.204.0/22"
  ]

  target_tags = ["gke-${local.cluster_name}"]
}

################################################################################
# Allow SSH (Conditional - for debugging only)
################################################################################

resource "google_compute_firewall" "allow_ssh" {
  count     = var.environment == "dev" ? 1 : 0
  name      = "${var.environment}-allow-ssh"
  network   = google_compute_network.vpc.name
  project   = var.project_id
  priority  = 1000
  direction = "INGRESS"

  allow {
    protocol = "tcp"
    ports    = ["22"]
  }

  # IAP for TCP forwarding
  source_ranges = ["35.235.240.0/20"]

  target_tags = ["gke-${local.cluster_name}"]
}

################################################################################
# Allow HTTPS to Ingress
################################################################################

resource "google_compute_firewall" "allow_ingress_https" {
  name      = "${var.environment}-allow-ingress-https"
  network   = google_compute_network.vpc.name
  project   = var.project_id
  priority  = 1000
  direction = "INGRESS"

  allow {
    protocol = "tcp"
    ports    = ["443", "8443"]
  }

  source_ranges = ["0.0.0.0/0"]

  target_tags = ["gke-${local.cluster_name}-ingress"]
}

################################################################################
# Allow HTTP to Ingress (Redirect to HTTPS)
################################################################################

resource "google_compute_firewall" "allow_ingress_http" {
  name      = "${var.environment}-allow-ingress-http"
  network   = google_compute_network.vpc.name
  project   = var.project_id
  priority  = 1000
  direction = "INGRESS"

  allow {
    protocol = "tcp"
    ports    = ["80", "8080"]
  }

  source_ranges = ["0.0.0.0/0"]

  target_tags = ["gke-${local.cluster_name}-ingress"]
}

################################################################################
# Allow Webhook Communication
################################################################################

resource "google_compute_firewall" "allow_webhooks" {
  name      = "${var.environment}-allow-webhooks"
  network   = google_compute_network.vpc.name
  project   = var.project_id
  priority  = 1000
  direction = "INGRESS"

  allow {
    protocol = "tcp"
    ports    = ["443", "8443", "9443"]
  }

  source_ranges = [var.master_ipv4_cidr_block]

  target_tags = ["gke-${local.cluster_name}"]

  description = "Allow webhooks for admission controllers and operators"
}

################################################################################
# Allow DNS
################################################################################

resource "google_compute_firewall" "allow_dns" {
  name      = "${var.environment}-allow-dns"
  network   = google_compute_network.vpc.name
  project   = var.project_id
  priority  = 1000
  direction = "INGRESS"

  allow {
    protocol = "tcp"
    ports    = ["53"]
  }

  allow {
    protocol = "udp"
    ports    = ["53"]
  }

  source_ranges = [
    var.subnet_cidr,
    var.pods_cidr_range
  ]

  target_tags = ["gke-${local.cluster_name}"]
}

################################################################################
# Egress Rules
################################################################################

resource "google_compute_firewall" "allow_egress_internet" {
  name      = "${var.environment}-allow-egress-internet"
  network   = google_compute_network.vpc.name
  project   = var.project_id
  priority  = 1000
  direction = "EGRESS"

  allow {
    protocol = "tcp"
    ports    = ["443", "80"]
  }

  allow {
    protocol = "udp"
    ports    = ["53"]
  }

  destination_ranges = ["0.0.0.0/0"]

  target_tags = ["gke-${local.cluster_name}"]

  description = "Allow internet access for package updates and external APIs"
}

################################################################################
# Block Egress to Metadata Server (Security Best Practice)
################################################################################

resource "google_compute_firewall" "deny_metadata_server" {
  name      = "${var.environment}-deny-metadata-server"
  network   = google_compute_network.vpc.name
  project   = var.project_id
  priority  = 900
  direction = "EGRESS"

  deny {
    protocol = "tcp"
    ports    = ["80"]
  }

  destination_ranges = ["169.254.169.254/32"]

  target_tags = ["gke-${local.cluster_name}-deny-metadata"]

  description = "Block access to metadata server for security"
}
