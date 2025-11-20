#!/bin/bash

################################################################################
# LLM Analytics Hub - Azure Deployment Script
#
# Deploys complete infrastructure to Azure including:
# - AKS cluster with auto-scaling node pools
# - Azure Database for PostgreSQL Flexible Server
# - Azure Cache for Redis
# - Azure Event Hubs (Kafka-compatible)
# - VNet, subnets, NSGs
# - Azure AD service principals and RBAC
# - Azure DNS
# - Azure Monitor & Log Analytics
#
# Usage: ./deploy-azure.sh [environment] [subscription-id] [location]
# Example: ./deploy-azure.sh production 00000000-0000-0000-0000-000000000000 eastus
################################################################################

set -euo pipefail

# Script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
INFRASTRUCTURE_DIR="${PROJECT_ROOT}/infrastructure"

# Configuration
ENVIRONMENT="${1:-dev}"
AZURE_SUBSCRIPTION="${2:-$(az account show --query id -o tsv)}"
AZURE_LOCATION="${3:-eastus}"
RESOURCE_GROUP="llm-analytics-hub-${ENVIRONMENT}-rg"
CLUSTER_NAME="llm-analytics-hub-${ENVIRONMENT}"
CONFIG_FILE="${INFRASTRUCTURE_DIR}/config/${ENVIRONMENT}.yaml"

# Logging
LOG_FILE="${INFRASTRUCTURE_DIR}/logs/deploy-azure-${ENVIRONMENT}-$(date +%Y%m%d-%H%M%S).log"
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
    for tool in az kubectl terraform helm jq yq; do
        if ! command -v "${tool}" &> /dev/null; then
            missing_tools+=("${tool}")
        fi
    done

    if [ ${#missing_tools[@]} -gt 0 ]; then
        error "Missing required tools: ${missing_tools[*]}"
        exit 1
    fi

    # Check Azure authentication
    if ! az account show &> /dev/null; then
        error "Not authenticated to Azure. Run: az login"
        exit 1
    fi

    # Set subscription
    az account set --subscription "${AZURE_SUBSCRIPTION}" 2>> "${LOG_FILE}"

    log "Prerequisites check passed"
}

create_resource_group() {
    log "Creating resource group..."

    az group create \
        --name "${RESOURCE_GROUP}" \
        --location "${AZURE_LOCATION}" \
        --tags "Environment=${ENVIRONMENT}" "ManagedBy=az-cli" 2>> "${LOG_FILE}"

    log "Resource group created: ${RESOURCE_GROUP}"
}

setup_network() {
    log "Setting up virtual network..."

    local vnet_name="${CLUSTER_NAME}-vnet"
    local subnet_name="${CLUSTER_NAME}-subnet"

    # Create VNet
    az network vnet create \
        --resource-group "${RESOURCE_GROUP}" \
        --name "${vnet_name}" \
        --address-prefixes 10.0.0.0/16 \
        --subnet-name "${subnet_name}" \
        --subnet-prefixes 10.0.0.0/20 \
        --location "${AZURE_LOCATION}" \
        --tags "Environment=${ENVIRONMENT}" 2>> "${LOG_FILE}"

    # Create NSG
    az network nsg create \
        --resource-group "${RESOURCE_GROUP}" \
        --name "${CLUSTER_NAME}-nsg" \
        --location "${AZURE_LOCATION}" 2>> "${LOG_FILE}"

    # Associate NSG with subnet
    az network vnet subnet update \
        --resource-group "${RESOURCE_GROUP}" \
        --vnet-name "${vnet_name}" \
        --name "${subnet_name}" \
        --network-security-group "${CLUSTER_NAME}-nsg" 2>> "${LOG_FILE}"

    log "Virtual network configured"
}

create_aks_cluster() {
    log "Creating AKS cluster..."

    local vnet_name="${CLUSTER_NAME}-vnet"
    local subnet_name="${CLUSTER_NAME}-subnet"
    local subnet_id=$(az network vnet subnet show \
        --resource-group "${RESOURCE_GROUP}" \
        --vnet-name "${vnet_name}" \
        --name "${subnet_name}" \
        --query id -o tsv)

    az aks create \
        --resource-group "${RESOURCE_GROUP}" \
        --name "${CLUSTER_NAME}" \
        --location "${AZURE_LOCATION}" \
        --kubernetes-version 1.28 \
        --node-count 3 \
        --min-count 3 \
        --max-count 10 \
        --enable-cluster-autoscaler \
        --node-vm-size Standard_D4s_v3 \
        --node-osdisk-size 100 \
        --network-plugin azure \
        --network-policy azure \
        --vnet-subnet-id "${subnet_id}" \
        --service-cidr 10.1.0.0/16 \
        --dns-service-ip 10.1.0.10 \
        --docker-bridge-address 172.17.0.1/16 \
        --enable-managed-identity \
        --enable-addons monitoring \
        --workspace-resource-id "$(create_log_analytics_workspace)" \
        --enable-aad \
        --enable-azure-rbac \
        --zones 1 2 3 \
        --tags "Environment=${ENVIRONMENT}" 2>&1 | tee -a "${LOG_FILE}"

    # Get cluster credentials
    az aks get-credentials \
        --resource-group "${RESOURCE_GROUP}" \
        --name "${CLUSTER_NAME}" \
        --overwrite-existing 2>> "${LOG_FILE}"

    log "AKS cluster created successfully"
}

create_log_analytics_workspace() {
    local workspace_name="${CLUSTER_NAME}-workspace"

    az monitor log-analytics workspace create \
        --resource-group "${RESOURCE_GROUP}" \
        --workspace-name "${workspace_name}" \
        --location "${AZURE_LOCATION}" \
        --tags "Environment=${ENVIRONMENT}" 2>> "${LOG_FILE}"

    az monitor log-analytics workspace show \
        --resource-group "${RESOURCE_GROUP}" \
        --workspace-name "${workspace_name}" \
        --query id -o tsv
}

create_postgresql_server() {
    log "Creating Azure Database for PostgreSQL..."

    local server_name="${CLUSTER_NAME}-postgres"
    local admin_user="pgadmin"
    local admin_password="$(generate_password)"

    az postgres flexible-server create \
        --resource-group "${RESOURCE_GROUP}" \
        --name "${server_name}" \
        --location "${AZURE_LOCATION}" \
        --admin-user "${admin_user}" \
        --admin-password "${admin_password}" \
        --sku-name Standard_D4s_v3 \
        --tier GeneralPurpose \
        --storage-size 128 \
        --version 15 \
        --high-availability Enabled \
        --zone 1 \
        --standby-zone 2 \
        --backup-retention 7 \
        --tags "Environment=${ENVIRONMENT}" 2>&1 | tee -a "${LOG_FILE}"

    # Configure firewall to allow Azure services
    az postgres flexible-server firewall-rule create \
        --resource-group "${RESOURCE_GROUP}" \
        --name "${server_name}" \
        --rule-name AllowAzureServices \
        --start-ip-address 0.0.0.0 \
        --end-ip-address 0.0.0.0 2>> "${LOG_FILE}"

    # Create database
    az postgres flexible-server db create \
        --resource-group "${RESOURCE_GROUP}" \
        --server-name "${server_name}" \
        --database-name llm_analytics 2>> "${LOG_FILE}"

    log "PostgreSQL server created: ${server_name}"
}

create_redis_cache() {
    log "Creating Azure Cache for Redis..."

    local cache_name="${CLUSTER_NAME}-redis"

    az redis create \
        --resource-group "${RESOURCE_GROUP}" \
        --name "${cache_name}" \
        --location "${AZURE_LOCATION}" \
        --sku Premium \
        --vm-size P1 \
        --enable-non-ssl-port false \
        --minimum-tls-version 1.2 \
        --redis-version 6 \
        --zones 1 2 3 \
        --tags "Environment=${ENVIRONMENT}" 2>&1 | tee -a "${LOG_FILE}"

    log "Redis cache created: ${cache_name}"
}

create_event_hubs() {
    log "Creating Azure Event Hubs namespace..."

    local namespace_name="${CLUSTER_NAME}-eventhubs"

    # Create Event Hubs namespace
    az eventhubs namespace create \
        --resource-group "${RESOURCE_GROUP}" \
        --name "${namespace_name}" \
        --location "${AZURE_LOCATION}" \
        --sku Standard \
        --enable-kafka true \
        --enable-auto-inflate true \
        --maximum-throughput-units 10 \
        --tags "Environment=${ENVIRONMENT}" 2>> "${LOG_FILE}"

    # Create event hub
    az eventhubs eventhub create \
        --resource-group "${RESOURCE_GROUP}" \
        --namespace-name "${namespace_name}" \
        --name llm-analytics-events \
        --partition-count 8 \
        --message-retention 7 2>> "${LOG_FILE}"

    # Create consumer group
    az eventhubs eventhub consumer-group create \
        --resource-group "${RESOURCE_GROUP}" \
        --namespace-name "${namespace_name}" \
        --eventhub-name llm-analytics-events \
        --name analytics-consumers 2>> "${LOG_FILE}"

    log "Event Hubs created: ${namespace_name}"
}

setup_managed_identity() {
    log "Setting up managed identity..."

    local identity_name="${CLUSTER_NAME}-identity"

    # Create managed identity
    az identity create \
        --resource-group "${RESOURCE_GROUP}" \
        --name "${identity_name}" \
        --location "${AZURE_LOCATION}" \
        --tags "Environment=${ENVIRONMENT}" 2>> "${LOG_FILE}"

    local identity_id=$(az identity show \
        --resource-group "${RESOURCE_GROUP}" \
        --name "${identity_name}" \
        --query id -o tsv)

    local principal_id=$(az identity show \
        --resource-group "${RESOURCE_GROUP}" \
        --name "${identity_name}" \
        --query principalId -o tsv)

    # Assign roles
    local roles=(
        "Azure Event Hubs Data Sender"
        "Azure Event Hubs Data Receiver"
        "Monitoring Metrics Publisher"
    )

    for role in "${roles[@]}"; do
        az role assignment create \
            --assignee "${principal_id}" \
            --role "${role}" \
            --scope "/subscriptions/${AZURE_SUBSCRIPTION}/resourceGroups/${RESOURCE_GROUP}" 2>> "${LOG_FILE}" || true
    done

    log "Managed identity configured"
}

setup_azure_monitor() {
    log "Setting up Azure Monitor..."

    local workspace_id=$(az monitor log-analytics workspace show \
        --resource-group "${RESOURCE_GROUP}" \
        --workspace-name "${CLUSTER_NAME}-workspace" \
        --query id -o tsv)

    # Create action group
    az monitor action-group create \
        --resource-group "${RESOURCE_GROUP}" \
        --name "${CLUSTER_NAME}-alerts" \
        --short-name "LLMAnalytics" \
        --email-receiver "ops@example.com" ops 2>> "${LOG_FILE}"

    # Create metric alert for high CPU
    az monitor metrics alert create \
        --resource-group "${RESOURCE_GROUP}" \
        --name "High CPU Usage" \
        --description "Alert when CPU usage exceeds 80%" \
        --scopes "/subscriptions/${AZURE_SUBSCRIPTION}/resourceGroups/${RESOURCE_GROUP}/providers/Microsoft.ContainerService/managedClusters/${CLUSTER_NAME}" \
        --condition "avg node_cpu_usage_percentage > 80" \
        --window-size 5m \
        --evaluation-frequency 1m \
        --action "${CLUSTER_NAME}-alerts" 2>> "${LOG_FILE}" || true

    log "Azure Monitor configured"
}

setup_ingress_controller() {
    log "Setting up NGINX Ingress Controller..."

    helm repo add ingress-nginx https://kubernetes.github.io/ingress-nginx 2>> "${LOG_FILE}"
    helm repo update 2>> "${LOG_FILE}"

    helm upgrade --install ingress-nginx ingress-nginx/ingress-nginx \
        --namespace ingress-nginx \
        --create-namespace \
        --set controller.service.type=LoadBalancer \
        --set controller.service.annotations."service\.beta\.kubernetes\.io/azure-load-balancer-health-probe-request-path"=/healthz 2>&1 | tee -a "${LOG_FILE}"

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

    local info_file="${INFRASTRUCTURE_DIR}/deployments/${ENVIRONMENT}-azure.json"
    mkdir -p "${INFRASTRUCTURE_DIR}/deployments"

    cat > "${info_file}" <<EOF
{
  "environment": "${ENVIRONMENT}",
  "subscription": "${AZURE_SUBSCRIPTION}",
  "location": "${AZURE_LOCATION}",
  "resource_group": "${RESOURCE_GROUP}",
  "cluster_name": "${CLUSTER_NAME}",
  "deployed_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "deployed_by": "$(az account show --query user.name -o tsv)"
}
EOF

    log "Deployment information saved to: ${info_file}"
}

################################################################################
# Main
################################################################################

main() {
    log "========================================="
    log "LLM Analytics Hub - Azure Deployment"
    log "Environment: ${ENVIRONMENT}"
    log "Subscription: ${AZURE_SUBSCRIPTION}"
    log "Location: ${AZURE_LOCATION}"
    log "========================================="

    check_prerequisites
    create_resource_group

    log "Starting Azure infrastructure deployment..."

    # Network layer
    setup_network

    # Compute layer
    create_aks_cluster

    # Data layer
    create_postgresql_server
    create_redis_cache
    create_event_hubs

    # Security & Identity
    setup_managed_identity

    # Monitoring
    setup_azure_monitor

    # Kubernetes addons
    setup_ingress_controller

    # Application
    deploy_application

    # Finalize
    save_deployment_info

    log "========================================="
    log "Azure deployment completed successfully!"
    log "========================================="
    log ""
    log "Next steps:"
    log "1. Run validation: ./validate.sh ${ENVIRONMENT}"
    log "2. Access cluster: kubectl get pods -n llm-analytics-hub"
    log "3. View logs: cat ${LOG_FILE}"
    log ""
    log "For detailed information, see: ${INFRASTRUCTURE_DIR}/deployments/${ENVIRONMENT}-azure.json"
}

# Run main function
main "$@"
