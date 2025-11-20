################################################################################
# LLM Analytics Hub - GCP GKE Infrastructure
# IAM Configuration
################################################################################

################################################################################
# Service Account for GKE Nodes
################################################################################

resource "google_service_account" "gke_nodes" {
  account_id   = "${var.environment}-gke-nodes"
  display_name = "Service Account for GKE nodes"
  project      = var.project_id
  description  = "Service account used by GKE nodes in ${var.environment} environment"
}

# Grant necessary permissions to the node service account
resource "google_project_iam_member" "gke_nodes_log_writer" {
  project = var.project_id
  role    = "roles/logging.logWriter"
  member  = "serviceAccount:${google_service_account.gke_nodes.email}"
}

resource "google_project_iam_member" "gke_nodes_metric_writer" {
  project = var.project_id
  role    = "roles/monitoring.metricWriter"
  member  = "serviceAccount:${google_service_account.gke_nodes.email}"
}

resource "google_project_iam_member" "gke_nodes_monitoring_viewer" {
  project = var.project_id
  role    = "roles/monitoring.viewer"
  member  = "serviceAccount:${google_service_account.gke_nodes.email}"
}

resource "google_project_iam_member" "gke_nodes_resource_metadata_writer" {
  project = var.project_id
  role    = "roles/stackdriver.resourceMetadata.writer"
  member  = "serviceAccount:${google_service_account.gke_nodes.email}"
}

resource "google_project_iam_member" "gke_nodes_artifact_registry_reader" {
  project = var.project_id
  role    = "roles/artifactregistry.reader"
  member  = "serviceAccount:${google_service_account.gke_nodes.email}"
}

################################################################################
# Service Account for Workload Identity - Application
################################################################################

resource "google_service_account" "app_workload" {
  account_id   = "${var.environment}-app-workload"
  display_name = "Workload Identity SA for applications"
  project      = var.project_id
  description  = "Service account for application workloads using Workload Identity"
}

# Bind Kubernetes service account to Google service account
resource "google_service_account_iam_member" "app_workload_identity_binding" {
  count = var.enable_workload_identity ? 1 : 0

  service_account_id = google_service_account.app_workload.name
  role               = "roles/iam.workloadIdentityUser"
  member             = "serviceAccount:${var.project_id}.svc.id.goog[llm-analytics/app-service-account]"
}

################################################################################
# Service Account for Workload Identity - Database
################################################################################

resource "google_service_account" "db_workload" {
  account_id   = "${var.environment}-db-workload"
  display_name = "Workload Identity SA for databases"
  project      = var.project_id
  description  = "Service account for database workloads using Workload Identity"
}

resource "google_service_account_iam_member" "db_workload_identity_binding" {
  count = var.enable_workload_identity ? 1 : 0

  service_account_id = google_service_account.db_workload.name
  role               = "roles/iam.workloadIdentityUser"
  member             = "serviceAccount:${var.project_id}.svc.id.goog[llm-analytics/db-service-account]"
}

# Grant Cloud SQL Client role for database connections
resource "google_project_iam_member" "db_workload_cloudsql_client" {
  project = var.project_id
  role    = "roles/cloudsql.client"
  member  = "serviceAccount:${google_service_account.db_workload.email}"
}

################################################################################
# Service Account for Workload Identity - Monitoring
################################################################################

resource "google_service_account" "monitoring_workload" {
  account_id   = "${var.environment}-monitoring-workload"
  display_name = "Workload Identity SA for monitoring"
  project      = var.project_id
  description  = "Service account for monitoring workloads using Workload Identity"
}

resource "google_service_account_iam_member" "monitoring_workload_identity_binding" {
  count = var.enable_workload_identity ? 1 : 0

  service_account_id = google_service_account.monitoring_workload.name
  role               = "roles/iam.workloadIdentityUser"
  member             = "serviceAccount:${var.project_id}.svc.id.goog[monitoring/prometheus-service-account]"
}

resource "google_project_iam_member" "monitoring_workload_metric_writer" {
  project = var.project_id
  role    = "roles/monitoring.metricWriter"
  member  = "serviceAccount:${google_service_account.monitoring_workload.email}"
}

################################################################################
# Service Account for Secrets Access
################################################################################

resource "google_service_account" "secrets_workload" {
  account_id   = "${var.environment}-secrets-workload"
  display_name = "Workload Identity SA for secrets access"
  project      = var.project_id
  description  = "Service account for workloads accessing Secret Manager"
}

resource "google_service_account_iam_member" "secrets_workload_identity_binding" {
  count = var.enable_workload_identity ? 1 : 0

  service_account_id = google_service_account.secrets_workload.name
  role               = "roles/iam.workloadIdentityUser"
  member             = "serviceAccount:${var.project_id}.svc.id.goog[llm-analytics/secrets-service-account]"
}

resource "google_project_iam_member" "secrets_workload_accessor" {
  project = var.project_id
  role    = "roles/secretmanager.secretAccessor"
  member  = "serviceAccount:${google_service_account.secrets_workload.email}"
}

################################################################################
# Service Account for Storage Access
################################################################################

resource "google_service_account" "storage_workload" {
  account_id   = "${var.environment}-storage-workload"
  display_name = "Workload Identity SA for storage access"
  project      = var.project_id
  description  = "Service account for workloads accessing Cloud Storage"
}

resource "google_service_account_iam_member" "storage_workload_identity_binding" {
  count = var.enable_workload_identity ? 1 : 0

  service_account_id = google_service_account.storage_workload.name
  role               = "roles/iam.workloadIdentityUser"
  member             = "serviceAccount:${var.project_id}.svc.id.goog[llm-analytics/storage-service-account]"
}

resource "google_project_iam_member" "storage_workload_object_viewer" {
  project = var.project_id
  role    = "roles/storage.objectViewer"
  member  = "serviceAccount:${google_service_account.storage_workload.email}"
}

resource "google_project_iam_member" "storage_workload_object_creator" {
  project = var.project_id
  role    = "roles/storage.objectCreator"
  member  = "serviceAccount:${google_service_account.storage_workload.email}"
}

################################################################################
# Service Account for External DNS
################################################################################

resource "google_service_account" "external_dns" {
  account_id   = "${var.environment}-external-dns"
  display_name = "Service Account for External DNS"
  project      = var.project_id
  description  = "Service account for External DNS to manage DNS records"
}

resource "google_service_account_iam_member" "external_dns_workload_identity_binding" {
  count = var.enable_workload_identity ? 1 : 0

  service_account_id = google_service_account.external_dns.name
  role               = "roles/iam.workloadIdentityUser"
  member             = "serviceAccount:${var.project_id}.svc.id.goog[kube-system/external-dns]"
}

resource "google_project_iam_member" "external_dns_admin" {
  project = var.project_id
  role    = "roles/dns.admin"
  member  = "serviceAccount:${google_service_account.external_dns.email}"
}

################################################################################
# Service Account for Cert Manager
################################################################################

resource "google_service_account" "cert_manager" {
  account_id   = "${var.environment}-cert-manager"
  display_name = "Service Account for Cert Manager"
  project      = var.project_id
  description  = "Service account for Cert Manager to manage DNS challenges"
}

resource "google_service_account_iam_member" "cert_manager_workload_identity_binding" {
  count = var.enable_workload_identity ? 1 : 0

  service_account_id = google_service_account.cert_manager.name
  role               = "roles/iam.workloadIdentityUser"
  member             = "serviceAccount:${var.project_id}.svc.id.goog[cert-manager/cert-manager]"
}

resource "google_project_iam_member" "cert_manager_dns_admin" {
  project = var.project_id
  role    = "roles/dns.admin"
  member  = "serviceAccount:${google_service_account.cert_manager.email}"
}

################################################################################
# Service Account for Cluster Autoscaler
################################################################################

resource "google_service_account" "cluster_autoscaler" {
  account_id   = "${var.environment}-cluster-autoscaler"
  display_name = "Service Account for Cluster Autoscaler"
  project      = var.project_id
  description  = "Service account for Cluster Autoscaler"
}

resource "google_service_account_iam_member" "cluster_autoscaler_workload_identity_binding" {
  count = var.enable_workload_identity ? 1 : 0

  service_account_id = google_service_account.cluster_autoscaler.name
  role               = "roles/iam.workloadIdentityUser"
  member             = "serviceAccount:${var.project_id}.svc.id.goog[kube-system/cluster-autoscaler]"
}

resource "google_project_iam_member" "cluster_autoscaler_compute_viewer" {
  project = var.project_id
  role    = "roles/compute.viewer"
  member  = "serviceAccount:${google_service_account.cluster_autoscaler.email}"
}

resource "google_project_iam_member" "cluster_autoscaler_container_developer" {
  project = var.project_id
  role    = "roles/container.clusterAdmin"
  member  = "serviceAccount:${google_service_account.cluster_autoscaler.email}"
}

################################################################################
# Custom IAM Role for Limited Permissions
################################################################################

resource "google_project_iam_custom_role" "pod_reader" {
  role_id     = "${var.environment}_pod_reader"
  title       = "Pod Reader"
  description = "Custom role for reading pod information"
  project     = var.project_id

  permissions = [
    "container.pods.get",
    "container.pods.list",
    "container.deployments.get",
    "container.deployments.list",
  ]
}

################################################################################
# IAM Policy for GKE Cluster Access
################################################################################

# Grant developers view access to the cluster
resource "google_project_iam_member" "developers_container_viewer" {
  count = var.environment == "dev" ? 1 : 0

  project = var.project_id
  role    = "roles/container.viewer"
  member  = "group:developers@example.com"
}

# Grant admins full access to the cluster
resource "google_project_iam_member" "admins_container_admin" {
  project = var.project_id
  role    = "roles/container.admin"
  member  = "group:platform-admins@example.com"
}

################################################################################
# Workload Identity Pool (for external workloads)
################################################################################

resource "google_iam_workload_identity_pool" "github_actions" {
  count = var.environment == "prod" ? 1 : 0

  workload_identity_pool_id = "${var.environment}-github-actions"
  display_name              = "GitHub Actions Pool"
  description               = "Workload Identity Pool for GitHub Actions"
  project                   = var.project_id
}

resource "google_iam_workload_identity_pool_provider" "github_actions" {
  count = var.environment == "prod" ? 1 : 0

  workload_identity_pool_id          = google_iam_workload_identity_pool.github_actions[0].workload_identity_pool_id
  workload_identity_pool_provider_id = "github-provider"
  display_name                       = "GitHub Actions Provider"
  description                        = "OIDC provider for GitHub Actions"
  project                            = var.project_id

  attribute_mapping = {
    "google.subject"       = "assertion.sub"
    "attribute.actor"      = "assertion.actor"
    "attribute.repository" = "assertion.repository"
  }

  oidc {
    issuer_uri = "https://token.actions.githubusercontent.com"
  }
}

################################################################################
# Service Account Impersonation for CI/CD
################################################################################

resource "google_service_account" "cicd" {
  count = var.environment == "prod" ? 1 : 0

  account_id   = "${var.environment}-cicd"
  display_name = "CI/CD Service Account"
  project      = var.project_id
  description  = "Service account for CI/CD pipelines"
}

resource "google_service_account_iam_member" "cicd_workload_identity_user" {
  count = var.environment == "prod" ? 1 : 0

  service_account_id = google_service_account.cicd[0].name
  role               = "roles/iam.workloadIdentityUser"
  member             = "principalSet://iam.googleapis.com/${google_iam_workload_identity_pool.github_actions[0].name}/attribute.repository/your-org/llm-analytics-hub"
}

resource "google_project_iam_member" "cicd_artifact_registry_writer" {
  count = var.environment == "prod" ? 1 : 0

  project = var.project_id
  role    = "roles/artifactregistry.writer"
  member  = "serviceAccount:${google_service_account.cicd[0].email}"
}

resource "google_project_iam_member" "cicd_container_developer" {
  count = var.environment == "prod" ? 1 : 0

  project = var.project_id
  role    = "roles/container.developer"
  member  = "serviceAccount:${google_service_account.cicd[0].email}"
}
