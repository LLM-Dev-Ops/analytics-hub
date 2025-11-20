################################################################################
# LLM Analytics Hub - GCP GKE Infrastructure
# Variable Definitions
################################################################################

################################################################################
# Project Configuration
################################################################################

variable "project_id" {
  description = "GCP project ID"
  type        = string
}

variable "region" {
  description = "GCP region for resources"
  type        = string
  default     = "us-central1"
}

variable "environment" {
  description = "Environment name (dev, staging, prod)"
  type        = string
  default     = "prod"

  validation {
    condition     = contains(["dev", "staging", "prod"], var.environment)
    error_message = "Environment must be dev, staging, or prod."
  }
}

variable "cost_center" {
  description = "Cost center tag for billing"
  type        = string
  default     = "llm-analytics"
}

################################################################################
# Network Configuration
################################################################################

variable "network_name" {
  description = "Name of the VPC network"
  type        = string
  default     = "llm-analytics-vpc"
}

variable "subnet_name" {
  description = "Name of the subnet"
  type        = string
  default     = "llm-analytics-subnet"
}

variable "subnet_cidr" {
  description = "CIDR range for the subnet"
  type        = string
  default     = "10.0.0.0/20"
}

variable "pods_cidr_name" {
  description = "Name of the secondary CIDR range for pods"
  type        = string
  default     = "pods"
}

variable "pods_cidr_range" {
  description = "CIDR range for pods"
  type        = string
  default     = "10.4.0.0/14"
}

variable "services_cidr_name" {
  description = "Name of the secondary CIDR range for services"
  type        = string
  default     = "services"
}

variable "services_cidr_range" {
  description = "CIDR range for services"
  type        = string
  default     = "10.8.0.0/20"
}

variable "master_ipv4_cidr_block" {
  description = "CIDR block for GKE master nodes"
  type        = string
  default     = "172.16.0.0/28"
}

variable "master_authorized_networks" {
  description = "List of CIDR blocks that can access the master endpoint"
  type = list(object({
    cidr_block   = string
    display_name = string
  }))
  default = []
}

################################################################################
# GKE Cluster Configuration
################################################################################

variable "cluster_name" {
  description = "Name of the GKE cluster"
  type        = string
  default     = "llm-analytics-cluster"
}

variable "kubernetes_version" {
  description = "Kubernetes version for the GKE cluster"
  type        = string
  default     = "1.28"
}

variable "enable_autopilot" {
  description = "Enable GKE Autopilot mode"
  type        = bool
  default     = false
}

variable "release_channel" {
  description = "GKE release channel (RAPID, REGULAR, STABLE)"
  type        = string
  default     = "STABLE"

  validation {
    condition     = contains(["RAPID", "REGULAR", "STABLE", "UNSPECIFIED"], var.release_channel)
    error_message = "Release channel must be RAPID, REGULAR, STABLE, or UNSPECIFIED."
  }
}

variable "enable_private_nodes" {
  description = "Enable private nodes (nodes without external IPs)"
  type        = bool
  default     = true
}

variable "enable_private_endpoint" {
  description = "Enable private endpoint (master accessible only via private IP)"
  type        = bool
  default     = false
}

variable "remove_default_node_pool" {
  description = "Remove default node pool after cluster creation"
  type        = bool
  default     = true
}

variable "initial_node_count" {
  description = "Initial node count for default node pool"
  type        = number
  default     = 1
}

################################################################################
# Node Pool Configuration
################################################################################

variable "system_pool_config" {
  description = "Configuration for system node pool"
  type = object({
    machine_type    = string
    min_nodes       = number
    max_nodes       = number
    disk_size_gb    = number
    disk_type       = string
    preemptible     = bool
    spot            = bool
    local_ssd_count = number
  })
  default = {
    machine_type    = "n2-standard-4"
    min_nodes       = 2
    max_nodes       = 4
    disk_size_gb    = 100
    disk_type       = "pd-standard"
    preemptible     = false
    spot            = false
    local_ssd_count = 0
  }
}

variable "app_pool_config" {
  description = "Configuration for application node pool"
  type = object({
    machine_type    = string
    min_nodes       = number
    max_nodes       = number
    disk_size_gb    = number
    disk_type       = string
    preemptible     = bool
    spot            = bool
    local_ssd_count = number
  })
  default = {
    machine_type    = "n2-standard-8"
    min_nodes       = 3
    max_nodes       = 10
    disk_size_gb    = 150
    disk_type       = "pd-balanced"
    preemptible     = false
    spot            = false
    local_ssd_count = 0
  }
}

variable "db_pool_config" {
  description = "Configuration for database node pool"
  type = object({
    machine_type    = string
    min_nodes       = number
    max_nodes       = number
    disk_size_gb    = number
    disk_type       = string
    preemptible     = bool
    spot            = bool
    local_ssd_count = number
  })
  default = {
    machine_type    = "n2-highmem-8"
    min_nodes       = 3
    max_nodes       = 6
    disk_size_gb    = 200
    disk_type       = "pd-ssd"
    preemptible     = false
    spot            = false
    local_ssd_count = 1
  }
}

variable "preemptible_pool_config" {
  description = "Configuration for preemptible/spot node pool"
  type = object({
    machine_type    = string
    min_nodes       = number
    max_nodes       = number
    disk_size_gb    = number
    disk_type       = string
    preemptible     = bool
    spot            = bool
    local_ssd_count = number
  })
  default = {
    machine_type    = "n2-standard-4"
    min_nodes       = 0
    max_nodes       = 10
    disk_size_gb    = 100
    disk_type       = "pd-standard"
    preemptible     = false
    spot            = true
    local_ssd_count = 0
  }
}

################################################################################
# Security Configuration
################################################################################

variable "enable_workload_identity" {
  description = "Enable Workload Identity for pod-level IAM"
  type        = bool
  default     = true
}

variable "enable_binary_authorization" {
  description = "Enable Binary Authorization for image signing"
  type        = bool
  default     = true
}

variable "enable_shielded_nodes" {
  description = "Enable shielded GKE nodes"
  type        = bool
  default     = true
}

variable "enable_secure_boot" {
  description = "Enable secure boot for shielded nodes"
  type        = bool
  default     = true
}

variable "enable_integrity_monitoring" {
  description = "Enable integrity monitoring for shielded nodes"
  type        = bool
  default     = true
}

variable "enable_network_policy" {
  description = "Enable network policy enforcement"
  type        = bool
  default     = true
}

variable "enable_intranode_visibility" {
  description = "Enable intranode visibility"
  type        = bool
  default     = true
}

################################################################################
# Monitoring & Logging Configuration
################################################################################

variable "enable_cloud_logging" {
  description = "Enable Cloud Logging"
  type        = bool
  default     = true
}

variable "enable_cloud_monitoring" {
  description = "Enable Cloud Monitoring"
  type        = bool
  default     = true
}

variable "logging_components" {
  description = "GKE components to log"
  type        = list(string)
  default     = ["SYSTEM_COMPONENTS", "WORKLOADS"]
}

variable "monitoring_enable_managed_prometheus" {
  description = "Enable managed Prometheus"
  type        = bool
  default     = true
}

variable "enable_cost_allocation" {
  description = "Enable GKE cost allocation"
  type        = bool
  default     = true
}

################################################################################
# Maintenance & Upgrade Configuration
################################################################################

variable "maintenance_start_time" {
  description = "Start time for maintenance window (HH:MM format in UTC)"
  type        = string
  default     = "03:00"
}

variable "maintenance_duration" {
  description = "Duration of maintenance window in hours"
  type        = string
  default     = "4h"
}

variable "maintenance_recurrence" {
  description = "Recurrence pattern for maintenance window"
  type        = string
  default     = "FREQ=WEEKLY;BYDAY=SU"
}

variable "enable_auto_repair" {
  description = "Enable automatic repair of unhealthy nodes"
  type        = bool
  default     = true
}

variable "enable_auto_upgrade" {
  description = "Enable automatic upgrade of nodes"
  type        = bool
  default     = true
}

################################################################################
# Resource Management Configuration
################################################################################

variable "resource_limits" {
  description = "Cluster resource limits"
  type = object({
    max_pods_per_node = number
  })
  default = {
    max_pods_per_node = 110
  }
}

variable "enable_vertical_pod_autoscaling" {
  description = "Enable Vertical Pod Autoscaling"
  type        = bool
  default     = true
}

variable "enable_horizontal_pod_autoscaling" {
  description = "Enable Horizontal Pod Autoscaling"
  type        = bool
  default     = true
}

################################################################################
# Backup & DR Configuration
################################################################################

variable "enable_backup_restore" {
  description = "Enable GKE Backup for workloads"
  type        = bool
  default     = true
}

variable "backup_plan_retention_days" {
  description = "Number of days to retain backups"
  type        = number
  default     = 30
}
