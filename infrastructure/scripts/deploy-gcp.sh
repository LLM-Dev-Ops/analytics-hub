#!/bin/bash

################################################################################
# LLM Analytics Hub - GCP Deployment Script
#
# Deploys complete infrastructure to GCP including:
# - GKE cluster with auto-scaling node pools
# - Cloud SQL PostgreSQL with TimescaleDB
# - Cloud Memorystore for Redis
# - Cloud Pub/Sub (alternative to Kafka)
# - VPC, subnets, firewall rules
# - IAM service accounts and bindings
# - Cloud DNS
# - Cloud Monitoring & Logging
#
# Usage: ./deploy-gcp.sh [environment] [project-id] [region]
# Example: ./deploy-gcp.sh production my-project-123 us-central1
################################################################################

set -euo pipefail

# Script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
INFRASTRUCTURE_DIR="${PROJECT_ROOT}/infrastructure"

# Configuration
ENVIRONMENT="${1:-dev}"
GCP_PROJECT="${2:-$(gcloud config get-value project)}"
GCP_REGION="${3:-us-central1}"
GCP_ZONE="${GCP_REGION}-a"
CLUSTER_NAME="llm-analytics-hub-${ENVIRONMENT}"
CONFIG_FILE="${INFRASTRUCTURE_DIR}/config/${ENVIRONMENT}.yaml"

# Logging
LOG_FILE="${INFRASTRUCTURE_DIR}/logs/deploy-gcp-${ENVIRONMENT}-$(date +%Y%m%d-%H%M%S).log"
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

check_prerequisites() {
    log "Checking prerequisites..."

    local missing_tools=()

    # Check required tools
    for tool in gcloud kubectl terraform helm jq yq; do
        if ! command -v "${tool}" &> /dev/null; then
            missing_tools+=("${tool}")
        fi
    done

    if [ ${#missing_tools[@]} -gt 0 ]; then
        error "Missing required tools: ${missing_tools[*]}"
        exit 1
    fi

    # Check GCP authentication
    if ! gcloud auth list --filter=status:ACTIVE --format="value(account)" &> /dev/null; then
        error "Not authenticated to GCP. Run: gcloud auth login"
        exit 1
    fi

    # Set project
    gcloud config set project "${GCP_PROJECT}" 2>> "${LOG_FILE}"

    log "Prerequisites check passed"
}

enable_apis() {
    log "Enabling required GCP APIs..."

    local apis=(
        "compute.googleapis.com"
        "container.googleapis.com"
        "sqladmin.googleapis.com"
        "redis.googleapis.com"
        "pubsub.googleapis.com"
        "cloudresourcemanager.googleapis.com"
        "iam.googleapis.com"
        "dns.googleapis.com"
        "monitoring.googleapis.com"
        "logging.googleapis.com"
        "cloudkms.googleapis.com"
    )

    for api in "${apis[@]}"; do
        log "Enabling ${api}..."
        gcloud services enable "${api}" \
            --project="${GCP_PROJECT}" 2>> "${LOG_FILE}"
    done

    log "All required APIs enabled"
}

setup_network() {
    log "Setting up VPC network..."

    # Create VPC
    gcloud compute networks create "${CLUSTER_NAME}-vpc" \
        --subnet-mode=custom \
        --project="${GCP_PROJECT}" 2>> "${LOG_FILE}" || true

    # Create subnet
    gcloud compute networks subnets create "${CLUSTER_NAME}-subnet" \
        --network="${CLUSTER_NAME}-vpc" \
        --region="${GCP_REGION}" \
        --range=10.0.0.0/20 \
        --secondary-range pods=10.4.0.0/14 \
        --secondary-range services=10.8.0.0/20 \
        --enable-private-ip-google-access \
        --project="${GCP_PROJECT}" 2>> "${LOG_FILE}" || true

    # Create firewall rules
    gcloud compute firewall-rules create "${CLUSTER_NAME}-allow-internal" \
        --network="${CLUSTER_NAME}-vpc" \
        --allow=tcp,udp,icmp \
        --source-ranges=10.0.0.0/8 \
        --project="${GCP_PROJECT}" 2>> "${LOG_FILE}" || true

    gcloud compute firewall-rules create "${CLUSTER_NAME}-allow-ssh" \
        --network="${CLUSTER_NAME}-vpc" \
        --allow=tcp:22 \
        --source-ranges=0.0.0.0/0 \
        --project="${GCP_PROJECT}" 2>> "${LOG_FILE}" || true

    log "VPC network configured"
}

create_gke_cluster() {
    log "Creating GKE cluster..."

    gcloud container clusters create "${CLUSTER_NAME}" \
        --region="${GCP_REGION}" \
        --network="${CLUSTER_NAME}-vpc" \
        --subnetwork="${CLUSTER_NAME}-subnet" \
        --cluster-secondary-range-name=pods \
        --services-secondary-range-name=services \
        --enable-ip-alias \
        --enable-private-nodes \
        --enable-private-endpoint \
        --master-ipv4-cidr=172.16.0.0/28 \
        --enable-master-authorized-networks \
        --master-authorized-networks=0.0.0.0/0 \
        --enable-autoscaling \
        --min-nodes=3 \
        --max-nodes=10 \
        --num-nodes=3 \
        --machine-type=n2-standard-4 \
        --disk-type=pd-ssd \
        --disk-size=100 \
        --enable-autorepair \
        --enable-autoupgrade \
        --enable-stackdriver-kubernetes \
        --addons=HorizontalPodAutoscaling,HttpLoadBalancing,GcePersistentDiskCsiDriver \
        --workload-pool="${GCP_PROJECT}.svc.id.goog" \
        --enable-shielded-nodes \
        --shielded-secure-boot \
        --shielded-integrity-monitoring \
        --release-channel=regular \
        --labels="environment=${ENVIRONMENT},managed-by=gcloud" \
        --project="${GCP_PROJECT}" 2>&1 | tee -a "${LOG_FILE}"

    # Get cluster credentials
    gcloud container clusters get-credentials "${CLUSTER_NAME}" \
        --region="${GCP_REGION}" \
        --project="${GCP_PROJECT}" 2>> "${LOG_FILE}"

    log "GKE cluster created successfully"
}

create_cloud_sql() {
    log "Creating Cloud SQL PostgreSQL instance..."

    local instance_name="${CLUSTER_NAME}-postgres"

    gcloud sql instances create "${instance_name}" \
        --database-version=POSTGRES_15 \
        --tier=db-custom-4-16384 \
        --region="${GCP_REGION}" \
        --network="projects/${GCP_PROJECT}/global/networks/${CLUSTER_NAME}-vpc" \
        --no-assign-ip \
        --storage-type=SSD \
        --storage-size=100GB \
        --storage-auto-increase \
        --storage-auto-increase-limit=500 \
        --backup \
        --backup-start-time=03:00 \
        --retained-backups-count=7 \
        --retained-transaction-log-days=7 \
        --maintenance-window-day=SUN \
        --maintenance-window-hour=4 \
        --maintenance-release-channel=production \
        --availability-type=REGIONAL \
        --enable-point-in-time-recovery \
        --database-flags=cloudsql.iam_authentication=on \
        --labels="environment=${ENVIRONMENT}" \
        --project="${GCP_PROJECT}" 2>&1 | tee -a "${LOG_FILE}"

    # Set root password
    gcloud sql users set-password postgres \
        --instance="${instance_name}" \
        --password="$(generate_password)" \
        --project="${GCP_PROJECT}" 2>> "${LOG_FILE}"

    # Create database
    gcloud sql databases create llm_analytics \
        --instance="${instance_name}" \
        --project="${GCP_PROJECT}" 2>> "${LOG_FILE}"

    log "Cloud SQL instance created: ${instance_name}"
}

create_memorystore() {
    log "Creating Cloud Memorystore for Redis..."

    local instance_name="${CLUSTER_NAME}-redis"

    gcloud redis instances create "${instance_name}" \
        --region="${GCP_REGION}" \
        --tier=standard \
        --size=5 \
        --redis-version=redis_7_0 \
        --network="projects/${GCP_PROJECT}/global/networks/${CLUSTER_NAME}-vpc" \
        --enable-auth \
        --redis-config maxmemory-policy=allkeys-lru \
        --labels="environment=${ENVIRONMENT}" \
        --project="${GCP_PROJECT}" 2>&1 | tee -a "${LOG_FILE}"

    log "Cloud Memorystore instance created: ${instance_name}"
}

create_pubsub_topics() {
    log "Creating Cloud Pub/Sub topics..."

    # Create topic for analytics events
    gcloud pubsub topics create llm-analytics-events \
        --labels="environment=${ENVIRONMENT}" \
        --project="${GCP_PROJECT}" 2>> "${LOG_FILE}" || true

    # Create subscriptions
    gcloud pubsub subscriptions create llm-analytics-events-sub \
        --topic=llm-analytics-events \
        --ack-deadline=60 \
        --message-retention-duration=7d \
        --labels="environment=${ENVIRONMENT}" \
        --project="${GCP_PROJECT}" 2>> "${LOG_FILE}" || true

    log "Pub/Sub topics and subscriptions created"
}

setup_workload_identity() {
    log "Setting up Workload Identity..."

    local k8s_namespace="llm-analytics-hub"
    local k8s_sa="analytics-hub-sa"
    local gcp_sa="analytics-hub-${ENVIRONMENT}@${GCP_PROJECT}.iam.gserviceaccount.com"

    # Create GCP service account
    gcloud iam service-accounts create "analytics-hub-${ENVIRONMENT}" \
        --display-name="LLM Analytics Hub ${ENVIRONMENT}" \
        --project="${GCP_PROJECT}" 2>> "${LOG_FILE}" || true

    # Grant necessary permissions
    local roles=(
        "roles/cloudsql.client"
        "roles/pubsub.publisher"
        "roles/pubsub.subscriber"
        "roles/monitoring.metricWriter"
        "roles/logging.logWriter"
    )

    for role in "${roles[@]}"; do
        gcloud projects add-iam-policy-binding "${GCP_PROJECT}" \
            --member="serviceAccount:${gcp_sa}" \
            --role="${role}" \
            --project="${GCP_PROJECT}" 2>> "${LOG_FILE}" || true
    done

    # Bind Kubernetes SA to GCP SA
    gcloud iam service-accounts add-iam-policy-binding "${gcp_sa}" \
        --role roles/iam.workloadIdentityUser \
        --member "serviceAccount:${GCP_PROJECT}.svc.id.goog[${k8s_namespace}/${k8s_sa}]" \
        --project="${GCP_PROJECT}" 2>> "${LOG_FILE}" || true

    log "Workload Identity configured"
}

setup_monitoring() {
    log "Setting up Cloud Monitoring..."

    # Create notification channel (email)
    local notification_channel=$(gcloud alpha monitoring channels create \
        --display-name="LLM Analytics Hub Alerts" \
        --type=email \
        --channel-labels=email_address="ops@example.com" \
        --project="${GCP_PROJECT}" \
        --format="value(name)" 2>> "${LOG_FILE}")

    # Create alerting policies
    cat > /tmp/alert-policy.yaml <<EOF
displayName: "High Error Rate"
conditions:
  - displayName: "Error rate > 5%"
    conditionThreshold:
      filter: 'resource.type="k8s_container" AND metric.type="logging.googleapis.com/log_entry_count" AND metric.labels.severity="ERROR"'
      comparison: COMPARISON_GT
      thresholdValue: 100
      duration: 300s
      aggregations:
        - alignmentPeriod: 60s
          perSeriesAligner: ALIGN_RATE
notificationChannels:
  - ${notification_channel}
EOF

    gcloud alpha monitoring policies create --policy-from-file=/tmp/alert-policy.yaml \
        --project="${GCP_PROJECT}" 2>> "${LOG_FILE}" || true

    log "Cloud Monitoring configured"
}

setup_ingress_controller() {
    log "Setting up NGINX Ingress Controller..."

    helm repo add ingress-nginx https://kubernetes.github.io/ingress-nginx 2>> "${LOG_FILE}"
    helm repo update 2>> "${LOG_FILE}"

    helm upgrade --install ingress-nginx ingress-nginx/ingress-nginx \
        --namespace ingress-nginx \
        --create-namespace \
        --set controller.service.type=LoadBalancer \
        --set controller.metrics.enabled=true \
        --set controller.podAnnotations."prometheus\.io/scrape"="true" \
        --set controller.podAnnotations."prometheus\.io/port"="10254" 2>&1 | tee -a "${LOG_FILE}"

    log "NGINX Ingress Controller installed"
}

deploy_application() {
    log "Deploying LLM Analytics Hub application..."

    # Deploy core services
    "${SCRIPT_DIR}/deploy-k8s-core.sh" "${ENVIRONMENT}" 2>&1 | tee -a "${LOG_FILE}"

    log "Application deployed successfully"
}

generate_password() {
    local length="${1:-16}"
    openssl rand -base64 32 | tr -d "=+/" | cut -c1-${length}
}

save_deployment_info() {
    log "Saving deployment information..."

    local info_file="${INFRASTRUCTURE_DIR}/deployments/${ENVIRONMENT}-gcp.json"
    mkdir -p "${INFRASTRUCTURE_DIR}/deployments"

    cat > "${info_file}" <<EOF
{
  "environment": "${ENVIRONMENT}",
  "project": "${GCP_PROJECT}",
  "region": "${GCP_REGION}",
  "cluster_name": "${CLUSTER_NAME}",
  "deployed_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "deployed_by": "$(gcloud config get-value account)"
}
EOF

    log "Deployment information saved to: ${info_file}"
}

cleanup_temp_files() {
    log "Cleaning up temporary files..."
    rm -f /tmp/alert-policy.yaml
}

################################################################################
# Main
################################################################################

main() {
    log "========================================="
    log "LLM Analytics Hub - GCP Deployment"
    log "Environment: ${ENVIRONMENT}"
    log "Project: ${GCP_PROJECT}"
    log "Region: ${GCP_REGION}"
    log "========================================="

    check_prerequisites
    enable_apis

    log "Starting GCP infrastructure deployment..."

    # Network layer
    setup_network

    # Compute layer
    create_gke_cluster

    # Data layer
    create_cloud_sql
    create_memorystore
    create_pubsub_topics

    # Security & Identity
    setup_workload_identity

    # Monitoring
    setup_monitoring

    # Kubernetes addons
    setup_ingress_controller

    # Application
    deploy_application

    # Finalize
    save_deployment_info
    cleanup_temp_files

    log "========================================="
    log "GCP deployment completed successfully!"
    log "========================================="
    log ""
    log "Next steps:"
    log "1. Run validation: ./validate.sh ${ENVIRONMENT}"
    log "2. Access cluster: kubectl get pods -n llm-analytics-hub"
    log "3. View logs: cat ${LOG_FILE}"
    log ""
    log "For detailed information, see: ${INFRASTRUCTURE_DIR}/deployments/${ENVIRONMENT}-gcp.json"
}

# Run main function
main "$@"
