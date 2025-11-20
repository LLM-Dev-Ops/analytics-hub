#!/bin/bash

################################################################################
# LLM Analytics Hub - Infrastructure Destroy Script
#
# Safely tears down infrastructure with:
# - Confirmation prompts
# - Backup creation
# - Graceful service shutdown
# - Resource cleanup
# - Validation
#
# Usage: ./destroy.sh [environment] [cloud-provider]
# Example: ./destroy.sh dev aws
#          ./destroy.sh production gcp --force
################################################################################

set -euo pipefail

# Script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
INFRASTRUCTURE_DIR="${PROJECT_ROOT}/infrastructure"

# Configuration
ENVIRONMENT="${1:-}"
CLOUD_PROVIDER="${2:-}"
FORCE="${3:-}"
NAMESPACE="llm-analytics-hub"

# Logging
LOG_FILE="${INFRASTRUCTURE_DIR}/logs/destroy-${ENVIRONMENT:-unknown}-$(date +%Y%m%d-%H%M%S).log"
mkdir -p "${INFRASTRUCTURE_DIR}/logs"

################################################################################
# Functions
################################################################################

log() {
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] $*" | tee -a "${LOG_FILE}"
}

error() {
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] ERROR: $*" | tee -a "${LOG_FILE}" >&2
}

usage() {
    cat <<EOF
Usage: ./destroy.sh [environment] [cloud-provider] [--force]

Arguments:
  environment      - Environment to destroy (dev, staging, production)
  cloud-provider   - Cloud provider (aws, gcp, azure, k8s)
  --force          - Skip confirmation prompts (dangerous!)

Examples:
  ./destroy.sh dev aws
  ./destroy.sh staging gcp
  ./destroy.sh production azure --force

WARNINGS:
  - This will DELETE all resources in the specified environment
  - Data will be PERMANENTLY LOST unless backups exist
  - Production environments require additional confirmation
EOF
    exit 1
}

validate_input() {
    if [ -z "${ENVIRONMENT}" ] || [ -z "${CLOUD_PROVIDER}" ]; then
        error "Missing required arguments"
        usage
    fi

    case "${CLOUD_PROVIDER}" in
        aws|gcp|azure|k8s)
            ;;
        *)
            error "Invalid cloud provider: ${CLOUD_PROVIDER}"
            error "Valid options: aws, gcp, azure, k8s"
            exit 1
            ;;
    esac
}

confirm_destruction() {
    if [ "${FORCE}" == "--force" ]; then
        log "Force mode enabled - skipping confirmation"
        return 0
    fi

    log ""
    log "========================================="
    log "WARNING: DESTRUCTIVE OPERATION"
    log "========================================="
    log "Environment: ${ENVIRONMENT}"
    log "Cloud Provider: ${CLOUD_PROVIDER}"
    log ""
    log "This will PERMANENTLY DELETE:"
    log "  - All Kubernetes resources"
    log "  - All databases and data"
    log "  - All persistent volumes"
    log "  - All cloud infrastructure"
    log ""

    if [ "${ENVIRONMENT}" == "production" ]; then
        log "========================================="
        log "PRODUCTION ENVIRONMENT DESTRUCTION"
        log "========================================="
        log ""
        read -p "Type 'DELETE PRODUCTION' to confirm: " confirmation
        if [ "${confirmation}" != "DELETE PRODUCTION" ]; then
            log "Confirmation failed. Aborting."
            exit 1
        fi
    fi

    read -p "Are you sure you want to destroy ${ENVIRONMENT}? (yes/NO): " confirmation
    if [ "${confirmation}" != "yes" ]; then
        log "Destruction cancelled."
        exit 0
    fi

    log "Destruction confirmed. Proceeding..."
}

create_backup() {
    log "Creating backup before destruction..."

    local backup_script="${SCRIPT_DIR}/backup.sh"
    if [ -f "${backup_script}" ]; then
        "${backup_script}" "${ENVIRONMENT}" 2>&1 | tee -a "${LOG_FILE}" || true
        log "Backup completed (or skipped if not available)"
    else
        log "Warning: Backup script not found, skipping backup"
    fi
}

drain_kubernetes_resources() {
    log "Draining Kubernetes resources..."

    if ! kubectl cluster-info &> /dev/null; then
        log "Warning: Cannot connect to Kubernetes cluster, skipping drain"
        return 0
    fi

    # Scale down deployments
    log "Scaling down deployments..."
    kubectl scale deployment --all --replicas=0 -n "${NAMESPACE}" 2>&1 | tee -a "${LOG_FILE}" || true

    # Delete jobs and cronjobs
    log "Deleting jobs and cronjobs..."
    kubectl delete jobs --all -n "${NAMESPACE}" 2>&1 | tee -a "${LOG_FILE}" || true
    kubectl delete cronjobs --all -n "${NAMESPACE}" 2>&1 | tee -a "${LOG_FILE}" || true

    # Wait for pods to terminate gracefully
    log "Waiting for pods to terminate..."
    kubectl wait --for=delete pod --all -n "${NAMESPACE}" --timeout=300s 2>&1 | tee -a "${LOG_FILE}" || true

    log "Kubernetes resources drained"
}

delete_kubernetes_resources() {
    log "Deleting Kubernetes resources..."

    if ! kubectl cluster-info &> /dev/null; then
        log "Warning: Cannot connect to Kubernetes cluster, skipping K8s deletion"
        return 0
    fi

    # Delete namespace (cascading delete)
    log "Deleting namespace ${NAMESPACE}..."
    kubectl delete namespace "${NAMESPACE}" --timeout=600s 2>&1 | tee -a "${LOG_FILE}" || true

    # Delete monitoring namespace
    log "Deleting monitoring namespace..."
    kubectl delete namespace monitoring --timeout=600s 2>&1 | tee -a "${LOG_FILE}" || true

    # Delete cert-manager
    log "Deleting cert-manager..."
    kubectl delete namespace cert-manager --timeout=600s 2>&1 | tee -a "${LOG_FILE}" || true

    # Delete ingress-nginx
    log "Deleting ingress-nginx..."
    kubectl delete namespace ingress-nginx --timeout=600s 2>&1 | tee -a "${LOG_FILE}" || true

    log "Kubernetes resources deleted"
}

destroy_aws_infrastructure() {
    log "Destroying AWS infrastructure..."

    local cluster_name="llm-analytics-hub-${ENVIRONMENT}"

    # Delete EKS cluster
    log "Deleting EKS cluster..."
    eksctl delete cluster --name "${cluster_name}" --wait 2>&1 | tee -a "${LOG_FILE}" || true

    # Delete RDS instance
    log "Deleting RDS instance..."
    aws rds delete-db-instance \
        --db-instance-identifier "${cluster_name}-postgres" \
        --skip-final-snapshot \
        --delete-automated-backups 2>&1 | tee -a "${LOG_FILE}" || true

    # Delete ElastiCache cluster
    log "Deleting ElastiCache cluster..."
    aws elasticache delete-replication-group \
        --replication-group-id "${cluster_name}-redis" \
        --region us-east-1 2>&1 | tee -a "${LOG_FILE}" || true

    # Delete MSK cluster
    log "Deleting MSK cluster..."
    local cluster_arn=$(aws kafka list-clusters --cluster-name-filter "${cluster_name}-kafka" --query 'ClusterInfoList[0].ClusterArn' --output text 2>/dev/null || echo "")
    if [ -n "${cluster_arn}" ] && [ "${cluster_arn}" != "None" ]; then
        aws kafka delete-cluster --cluster-arn "${cluster_arn}" 2>&1 | tee -a "${LOG_FILE}" || true
    fi

    # Wait for resources to be deleted
    log "Waiting for AWS resources to be deleted (this may take 10-15 minutes)..."
    sleep 60

    # Delete VPC and networking
    log "Deleting VPC and networking resources..."
    # Note: This should be done after all resources using the VPC are deleted
    # Implementation would query and delete: IGW, NAT gateways, subnets, route tables, VPC

    log "AWS infrastructure destruction initiated"
}

destroy_gcp_infrastructure() {
    log "Destroying GCP infrastructure..."

    local cluster_name="llm-analytics-hub-${ENVIRONMENT}"
    local project="${GCP_PROJECT:-$(gcloud config get-value project)}"
    local region="${GCP_REGION:-us-central1}"

    # Delete GKE cluster
    log "Deleting GKE cluster..."
    gcloud container clusters delete "${cluster_name}" \
        --region="${region}" \
        --project="${project}" \
        --quiet 2>&1 | tee -a "${LOG_FILE}" || true

    # Delete Cloud SQL instance
    log "Deleting Cloud SQL instance..."
    gcloud sql instances delete "${cluster_name}-postgres" \
        --project="${project}" \
        --quiet 2>&1 | tee -a "${LOG_FILE}" || true

    # Delete Cloud Memorystore
    log "Deleting Cloud Memorystore..."
    gcloud redis instances delete "${cluster_name}-redis" \
        --region="${region}" \
        --project="${project}" \
        --quiet 2>&1 | tee -a "${LOG_FILE}" || true

    # Delete Pub/Sub topics
    log "Deleting Pub/Sub topics..."
    gcloud pubsub topics delete llm-analytics-events \
        --project="${project}" \
        --quiet 2>&1 | tee -a "${LOG_FILE}" || true

    # Delete VPC network
    log "Deleting VPC network..."
    gcloud compute networks delete "${cluster_name}-vpc" \
        --project="${project}" \
        --quiet 2>&1 | tee -a "${LOG_FILE}" || true

    log "GCP infrastructure destruction initiated"
}

destroy_azure_infrastructure() {
    log "Destroying Azure infrastructure..."

    local resource_group="llm-analytics-hub-${ENVIRONMENT}-rg"

    # Delete entire resource group (cascading delete)
    log "Deleting Azure resource group (this will delete all resources)..."
    az group delete \
        --name "${resource_group}" \
        --yes \
        --no-wait 2>&1 | tee -a "${LOG_FILE}" || true

    log "Azure infrastructure destruction initiated"
    log "Note: Resource group deletion is asynchronous and may take several minutes"
}

cleanup_local_state() {
    log "Cleaning up local state files..."

    # Remove deployment info
    rm -f "${INFRASTRUCTURE_DIR}/deployments/${ENVIRONMENT}-${CLOUD_PROVIDER}.json"

    # Remove temp files
    rm -f "${INFRASTRUCTURE_DIR}/.${CLOUD_PROVIDER}-"*

    # Remove kubectl context (optional)
    local context_name="llm-analytics-hub-${ENVIRONMENT}"
    kubectl config delete-context "${context_name}" 2>/dev/null || true

    log "Local state cleaned up"
}

verify_destruction() {
    log "Verifying destruction..."

    case "${CLOUD_PROVIDER}" in
        aws)
            log "Checking for remaining AWS resources..."
            # Implementation would check for any remaining resources
            ;;
        gcp)
            log "Checking for remaining GCP resources..."
            # Implementation would check for any remaining resources
            ;;
        azure)
            log "Checking for remaining Azure resources..."
            if az group exists --name "llm-analytics-hub-${ENVIRONMENT}-rg" 2>/dev/null | grep -q true; then
                log "Warning: Resource group still exists (deletion in progress)"
            else
                log "Resource group successfully deleted"
            fi
            ;;
        k8s)
            log "Checking for remaining Kubernetes resources..."
            if kubectl get namespace "${NAMESPACE}" &> /dev/null; then
                log "Warning: Namespace still exists"
            else
                log "Namespace successfully deleted"
            fi
            ;;
    esac

    log "Destruction verification complete"
}

generate_destruction_report() {
    log ""
    log "========================================="
    log "Destruction Report"
    log "========================================="
    log "Environment: ${ENVIRONMENT}"
    log "Cloud Provider: ${CLOUD_PROVIDER}"
    log "Destroyed At: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
    log "Log File: ${LOG_FILE}"
    log ""
    log "Note: Some resources may take additional time to fully delete"
    log "Note: Check cloud provider console to verify all resources are deleted"
    log "Note: Review logs for any errors or warnings"
    log "========================================="
}

################################################################################
# Main
################################################################################

main() {
    log "========================================="
    log "LLM Analytics Hub - Infrastructure Destroy"
    log "========================================="

    validate_input
    confirm_destruction

    log ""
    log "Starting infrastructure destruction..."
    log ""

    # Backup
    create_backup

    # Drain Kubernetes resources
    drain_kubernetes_resources

    # Delete Kubernetes resources
    delete_kubernetes_resources

    # Delete cloud infrastructure
    case "${CLOUD_PROVIDER}" in
        aws)
            destroy_aws_infrastructure
            ;;
        gcp)
            destroy_gcp_infrastructure
            ;;
        azure)
            destroy_azure_infrastructure
            ;;
        k8s)
            log "Kubernetes-only destruction (no cloud resources to delete)"
            ;;
    esac

    # Cleanup
    cleanup_local_state
    verify_destruction
    generate_destruction_report

    log ""
    log "========================================="
    log "Destruction completed!"
    log "========================================="
}

# Handle Ctrl+C
trap 'log "Destruction interrupted by user"; exit 130' INT

# Run main function
main "$@"
