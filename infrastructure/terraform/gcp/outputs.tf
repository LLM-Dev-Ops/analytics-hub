################################################################################
# LLM Analytics Hub - GCP GKE Infrastructure
# Output Values
################################################################################

################################################################################
# Project Information
################################################################################

output "project_id" {
  description = "GCP project ID"
  value       = var.project_id
}

output "region" {
  description = "GCP region"
  value       = var.region
}

output "environment" {
  description = "Environment name"
  value       = var.environment
}

################################################################################
# Network Information
################################################################################

output "network_name" {
  description = "Name of the VPC network"
  value       = google_compute_network.vpc.name
}

output "network_id" {
  description = "ID of the VPC network"
  value       = google_compute_network.vpc.id
}

output "network_self_link" {
  description = "Self link of the VPC network"
  value       = google_compute_network.vpc.self_link
}

output "subnet_name" {
  description = "Name of the GKE subnet"
  value       = google_compute_subnetwork.gke_subnet.name
}

output "subnet_id" {
  description = "ID of the GKE subnet"
  value       = google_compute_subnetwork.gke_subnet.id
}

output "subnet_cidr" {
  description = "CIDR range of the GKE subnet"
  value       = google_compute_subnetwork.gke_subnet.ip_cidr_range
}

output "pods_cidr_range" {
  description = "CIDR range for pods"
  value       = var.pods_cidr_range
}

output "services_cidr_range" {
  description = "CIDR range for services"
  value       = var.services_cidr_range
}

output "nat_ip_addresses" {
  description = "NAT gateway IP addresses"
  value       = google_compute_address.nat_ip[*].address
}

################################################################################
# GKE Cluster Information
################################################################################

output "cluster_name" {
  description = "Name of the GKE cluster"
  value       = google_container_cluster.primary.name
}

output "cluster_id" {
  description = "ID of the GKE cluster"
  value       = google_container_cluster.primary.id
}

output "cluster_endpoint" {
  description = "Endpoint for accessing the GKE cluster"
  value       = google_container_cluster.primary.endpoint
  sensitive   = true
}

output "cluster_ca_certificate" {
  description = "CA certificate for the GKE cluster"
  value       = google_container_cluster.primary.master_auth[0].cluster_ca_certificate
  sensitive   = true
}

output "cluster_version" {
  description = "Kubernetes version of the GKE cluster"
  value       = google_container_cluster.primary.master_version
}

output "cluster_location" {
  description = "Location of the GKE cluster"
  value       = google_container_cluster.primary.location
}

output "cluster_zones" {
  description = "Zones where the cluster nodes are deployed"
  value       = google_container_cluster.primary.node_locations
}

output "cluster_master_ipv4_cidr" {
  description = "IPv4 CIDR block for the master nodes"
  value       = google_container_cluster.primary.private_cluster_config[0].master_ipv4_cidr_block
}

################################################################################
# Node Pool Information
################################################################################

output "system_node_pool_name" {
  description = "Name of the system node pool"
  value       = google_container_node_pool.system.name
}

output "app_node_pool_name" {
  description = "Name of the application node pool"
  value       = google_container_node_pool.application.name
}

output "db_node_pool_name" {
  description = "Name of the database node pool"
  value       = google_container_node_pool.database.name
}

output "spot_node_pool_name" {
  description = "Name of the spot/preemptible node pool"
  value       = google_container_node_pool.preemptible.name
}

################################################################################
# Service Account Information
################################################################################

output "gke_nodes_service_account_email" {
  description = "Email of the service account used by GKE nodes"
  value       = google_service_account.gke_nodes.email
}

output "app_workload_service_account_email" {
  description = "Email of the service account for application workloads"
  value       = google_service_account.app_workload.email
}

output "db_workload_service_account_email" {
  description = "Email of the service account for database workloads"
  value       = google_service_account.db_workload.email
}

output "monitoring_workload_service_account_email" {
  description = "Email of the service account for monitoring workloads"
  value       = google_service_account.monitoring_workload.email
}

output "secrets_workload_service_account_email" {
  description = "Email of the service account for secrets access"
  value       = google_service_account.secrets_workload.email
}

output "storage_workload_service_account_email" {
  description = "Email of the service account for storage access"
  value       = google_service_account.storage_workload.email
}

output "external_dns_service_account_email" {
  description = "Email of the service account for External DNS"
  value       = google_service_account.external_dns.email
}

output "cert_manager_service_account_email" {
  description = "Email of the service account for Cert Manager"
  value       = google_service_account.cert_manager.email
}

################################################################################
# Storage Information
################################################################################

output "app_data_bucket_name" {
  description = "Name of the GCS bucket for application data"
  value       = google_storage_bucket.app_data.name
}

output "app_data_bucket_url" {
  description = "URL of the GCS bucket for application data"
  value       = google_storage_bucket.app_data.url
}

output "logs_bucket_name" {
  description = "Name of the GCS bucket for logs"
  value       = google_storage_bucket.logs.name
}

output "backups_bucket_name" {
  description = "Name of the GCS bucket for backups"
  value       = google_storage_bucket.backups.name
}

output "ml_artifacts_bucket_name" {
  description = "Name of the GCS bucket for ML artifacts"
  value       = google_storage_bucket.ml_artifacts.name
}

output "docker_registry_url" {
  description = "URL of the Artifact Registry Docker repository"
  value       = "${google_artifact_registry_repository.docker.location}-docker.pkg.dev/${var.project_id}/${google_artifact_registry_repository.docker.repository_id}"
}

output "helm_registry_url" {
  description = "URL of the Artifact Registry Helm repository"
  value       = "${google_artifact_registry_repository.helm.location}-docker.pkg.dev/${var.project_id}/${google_artifact_registry_repository.helm.repository_id}"
}

output "filestore_instance_name" {
  description = "Name of the Filestore instance"
  value       = var.environment == "prod" ? google_filestore_instance.shared_storage[0].name : null
}

output "filestore_instance_ip" {
  description = "IP address of the Filestore instance"
  value       = var.environment == "prod" ? google_filestore_instance.shared_storage[0].networks[0].ip_addresses[0] : null
}

################################################################################
# Monitoring Information
################################################################################

output "gke_usage_dataset_id" {
  description = "BigQuery dataset ID for GKE usage data"
  value       = var.enable_cost_allocation ? google_bigquery_dataset.gke_usage[0].dataset_id : null
}

output "gke_notifications_topic" {
  description = "Pub/Sub topic for GKE notifications"
  value       = google_pubsub_topic.gke_notifications.name
}

output "gke_notifications_subscription" {
  description = "Pub/Sub subscription for GKE notifications"
  value       = google_pubsub_subscription.gke_notifications.name
}

################################################################################
# DNS Information
################################################################################

output "private_dns_zone_name" {
  description = "Name of the private DNS zone"
  value       = google_dns_managed_zone.private_zone.name
}

output "private_dns_zone_dns_name" {
  description = "DNS name of the private DNS zone"
  value       = google_dns_managed_zone.private_zone.dns_name
}

################################################################################
# kubectl Configuration
################################################################################

output "kubectl_config_command" {
  description = "Command to configure kubectl"
  value       = "gcloud container clusters get-credentials ${google_container_cluster.primary.name} --region ${var.region} --project ${var.project_id}"
}

output "kubeconfig_command" {
  description = "Command to set KUBECONFIG environment variable"
  value       = "export KUBECONFIG=$(mktemp) && gcloud container clusters get-credentials ${google_container_cluster.primary.name} --region ${var.region} --project ${var.project_id}"
}

################################################################################
# Workload Identity Configuration
################################################################################

output "workload_identity_pool" {
  description = "Workload Identity pool for the cluster"
  value       = var.enable_workload_identity ? "${var.project_id}.svc.id.goog" : null
}

output "workload_identity_namespace" {
  description = "Kubernetes namespace for Workload Identity bindings"
  value       = "llm-analytics"
}

################################################################################
# Connection Information (for automation)
################################################################################

output "cluster_connection_info" {
  description = "Complete cluster connection information"
  value = {
    name               = google_container_cluster.primary.name
    endpoint           = google_container_cluster.primary.endpoint
    location           = google_container_cluster.primary.location
    project            = var.project_id
    ca_certificate     = google_container_cluster.primary.master_auth[0].cluster_ca_certificate
    kubernetes_version = google_container_cluster.primary.master_version
  }
  sensitive = true
}

################################################################################
# Summary Output
################################################################################

output "deployment_summary" {
  description = "Summary of the deployed infrastructure"
  value = {
    cluster_name           = google_container_cluster.primary.name
    cluster_location       = google_container_cluster.primary.location
    kubernetes_version     = google_container_cluster.primary.master_version
    network_name           = google_compute_network.vpc.name
    subnet_cidr            = google_compute_subnetwork.gke_subnet.ip_cidr_range
    node_pools             = [
      google_container_node_pool.system.name,
      google_container_node_pool.application.name,
      google_container_node_pool.database.name,
      google_container_node_pool.preemptible.name
    ]
    workload_identity      = var.enable_workload_identity
    binary_authorization   = var.enable_binary_authorization
    private_cluster        = var.enable_private_nodes
    monitoring_enabled     = var.enable_cloud_monitoring
    logging_enabled        = var.enable_cloud_logging
  }
}
