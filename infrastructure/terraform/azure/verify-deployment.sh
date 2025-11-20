#!/bin/bash

# LLM Analytics Hub - Azure Infrastructure Verification Script
# This script validates the deployment and checks cluster health

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Emoji for better visualization
CHECK="✓"
CROSS="✗"
INFO="ℹ"

echo -e "${BLUE}================================${NC}"
echo -e "${BLUE}LLM Analytics Hub - Deployment Verification${NC}"
echo -e "${BLUE}================================${NC}\n"

# Function to print status
print_status() {
    local status=$1
    local message=$2
    if [ "$status" == "ok" ]; then
        echo -e "${GREEN}${CHECK} ${message}${NC}"
    elif [ "$status" == "error" ]; then
        echo -e "${RED}${CROSS} ${message}${NC}"
    elif [ "$status" == "info" ]; then
        echo -e "${BLUE}${INFO} ${message}${NC}"
    else
        echo -e "${YELLOW}${message}${NC}"
    fi
}

# Function to check command exists
check_command() {
    if command -v $1 &> /dev/null; then
        print_status "ok" "$1 is installed"
        return 0
    else
        print_status "error" "$1 is not installed"
        return 1
    fi
}

# Check prerequisites
echo -e "${YELLOW}Checking Prerequisites...${NC}"
check_command terraform || exit 1
check_command az || exit 1
check_command kubectl || exit 1
echo ""

# Check if terraform is initialized
echo -e "${YELLOW}Checking Terraform State...${NC}"
if [ -d ".terraform" ]; then
    print_status "ok" "Terraform is initialized"
else
    print_status "error" "Terraform not initialized. Run 'terraform init' first."
    exit 1
fi

# Get Terraform outputs
echo -e "\n${YELLOW}Fetching Terraform Outputs...${NC}"
if terraform output resource_group_name &> /dev/null; then
    RG_NAME=$(terraform output -raw resource_group_name)
    CLUSTER_NAME=$(terraform output -raw aks_cluster_name)
    ACR_NAME=$(terraform output -raw acr_name)
    KV_NAME=$(terraform output -raw key_vault_name)
    LOCATION=$(terraform output -raw location)

    print_status "ok" "Terraform outputs retrieved successfully"
    print_status "info" "Resource Group: ${RG_NAME}"
    print_status "info" "AKS Cluster: ${CLUSTER_NAME}"
    print_status "info" "Location: ${LOCATION}"
else
    print_status "error" "Failed to retrieve Terraform outputs. Infrastructure may not be deployed."
    exit 1
fi

# Check Azure login
echo -e "\n${YELLOW}Checking Azure Authentication...${NC}"
if az account show &> /dev/null; then
    SUBSCRIPTION=$(az account show --query name -o tsv)
    print_status "ok" "Logged into Azure subscription: ${SUBSCRIPTION}"
else
    print_status "error" "Not logged into Azure. Run 'az login' first."
    exit 1
fi

# Check resource group
echo -e "\n${YELLOW}Checking Azure Resources...${NC}"
if az group show --name "${RG_NAME}" &> /dev/null; then
    print_status "ok" "Resource group exists: ${RG_NAME}"
else
    print_status "error" "Resource group not found: ${RG_NAME}"
    exit 1
fi

# Check AKS cluster
if az aks show --resource-group "${RG_NAME}" --name "${CLUSTER_NAME}" &> /dev/null; then
    print_status "ok" "AKS cluster exists: ${CLUSTER_NAME}"

    # Check cluster state
    POWER_STATE=$(az aks show --resource-group "${RG_NAME}" --name "${CLUSTER_NAME}" --query powerState.code -o tsv)
    if [ "$POWER_STATE" == "Running" ]; then
        print_status "ok" "AKS cluster is running"
    else
        print_status "error" "AKS cluster is not running. State: ${POWER_STATE}"
    fi

    # Get Kubernetes version
    K8S_VERSION=$(az aks show --resource-group "${RG_NAME}" --name "${CLUSTER_NAME}" --query kubernetesVersion -o tsv)
    print_status "info" "Kubernetes version: ${K8S_VERSION}"
else
    print_status "error" "AKS cluster not found: ${CLUSTER_NAME}"
    exit 1
fi

# Get kubeconfig
echo -e "\n${YELLOW}Configuring kubectl...${NC}"
if az aks get-credentials --resource-group "${RG_NAME}" --name "${CLUSTER_NAME}" --overwrite-existing &> /dev/null; then
    print_status "ok" "kubectl configured successfully"
else
    print_status "error" "Failed to configure kubectl"
    exit 1
fi

# Check cluster connectivity
echo -e "\n${YELLOW}Checking Cluster Connectivity...${NC}"
if kubectl cluster-info &> /dev/null; then
    print_status "ok" "Successfully connected to cluster"
else
    print_status "error" "Cannot connect to cluster"
    exit 1
fi

# Check nodes
echo -e "\n${YELLOW}Checking Nodes...${NC}"
NODE_COUNT=$(kubectl get nodes --no-headers | wc -l)
READY_COUNT=$(kubectl get nodes --no-headers | grep -c " Ready ")

print_status "info" "Total nodes: ${NODE_COUNT}"
print_status "info" "Ready nodes: ${READY_COUNT}"

if [ "$NODE_COUNT" -eq "$READY_COUNT" ]; then
    print_status "ok" "All nodes are ready"
else
    print_status "error" "Some nodes are not ready"
fi

# Display node details
echo ""
kubectl get nodes -o wide

# Check node pools
echo -e "\n${YELLOW}Checking Node Pools...${NC}"
az aks nodepool list --resource-group "${RG_NAME}" --cluster-name "${CLUSTER_NAME}" -o table

# Check system pods
echo -e "\n${YELLOW}Checking System Pods...${NC}"
SYSTEM_PODS_TOTAL=$(kubectl get pods -n kube-system --no-headers | wc -l)
SYSTEM_PODS_RUNNING=$(kubectl get pods -n kube-system --no-headers | grep -c "Running" || true)

print_status "info" "System pods total: ${SYSTEM_PODS_TOTAL}"
print_status "info" "System pods running: ${SYSTEM_PODS_RUNNING}"

if [ "$SYSTEM_PODS_RUNNING" -ge 1 ]; then
    print_status "ok" "System pods are running"
else
    print_status "error" "No system pods running"
fi

# Check storage classes
echo -e "\n${YELLOW}Checking Storage Classes...${NC}"
SC_COUNT=$(kubectl get storageclass --no-headers | wc -l)
print_status "info" "Storage classes available: ${SC_COUNT}"

if [ "$SC_COUNT" -ge 1 ]; then
    print_status "ok" "Storage classes configured"
    kubectl get storageclass
else
    print_status "warn" "No storage classes found. Apply storage-classes.yaml"
fi

# Check Container Registry
echo -e "\n${YELLOW}Checking Container Registry...${NC}"
if az acr show --name "${ACR_NAME}" &> /dev/null; then
    print_status "ok" "Container Registry exists: ${ACR_NAME}"

    ACR_LOGIN_SERVER=$(az acr show --name "${ACR_NAME}" --query loginServer -o tsv)
    print_status "info" "Login server: ${ACR_LOGIN_SERVER}"
else
    print_status "error" "Container Registry not found: ${ACR_NAME}"
fi

# Check Key Vault
echo -e "\n${YELLOW}Checking Key Vault...${NC}"
if az keyvault show --name "${KV_NAME}" &> /dev/null; then
    print_status "ok" "Key Vault exists: ${KV_NAME}"
else
    print_status "error" "Key Vault not found: ${KV_NAME}"
fi

# Check monitoring
echo -e "\n${YELLOW}Checking Monitoring...${NC}"
OMS_AGENT=$(kubectl get pods -n kube-system -l component=oms-agent --no-headers | wc -l)
if [ "$OMS_AGENT" -ge 1 ]; then
    print_status "ok" "Container Insights is enabled (oms-agent running)"
else
    print_status "warn" "Container Insights may not be enabled"
fi

# Check ingress controller (optional)
echo -e "\n${YELLOW}Checking Ingress Controller...${NC}"
INGRESS_PODS=$(kubectl get pods -n ingress-nginx --no-headers 2>/dev/null | wc -l || echo "0")
if [ "$INGRESS_PODS" -ge 1 ]; then
    print_status "ok" "Ingress controller is installed"
else
    print_status "info" "No ingress controller found (optional)"
fi

# Check cert-manager (optional)
echo -e "\n${YELLOW}Checking Cert-Manager...${NC}"
CERTMGR_PODS=$(kubectl get pods -n cert-manager --no-headers 2>/dev/null | wc -l || echo "0")
if [ "$CERTMGR_PODS" -ge 1 ]; then
    print_status "ok" "Cert-manager is installed"
else
    print_status "info" "Cert-manager not found (optional)"
fi

# Resource utilization
echo -e "\n${YELLOW}Checking Resource Utilization...${NC}"
if kubectl top nodes &> /dev/null; then
    echo ""
    kubectl top nodes
    echo ""
    print_status "ok" "Metrics server is working"
else
    print_status "warn" "Metrics server not available or not ready yet"
fi

# Check namespaces
echo -e "\n${YELLOW}Available Namespaces...${NC}"
kubectl get namespaces

# Security checks
echo -e "\n${YELLOW}Security Checks...${NC}"

# Check if RBAC is enabled
RBAC_ENABLED=$(kubectl api-versions | grep -c "rbac.authorization.k8s.io" || true)
if [ "$RBAC_ENABLED" -ge 1 ]; then
    print_status "ok" "RBAC is enabled"
else
    print_status "error" "RBAC is not enabled"
fi

# Check for default service account token automount
DEFAULT_SA=$(kubectl get serviceaccount default -n default -o jsonpath='{.automountServiceAccountToken}')
if [ "$DEFAULT_SA" == "false" ]; then
    print_status "ok" "Default service account token automount is disabled"
else
    print_status "warn" "Default service account token automount is enabled"
fi

# Summary
echo -e "\n${BLUE}================================${NC}"
echo -e "${BLUE}Verification Summary${NC}"
echo -e "${BLUE}================================${NC}"
echo -e "${GREEN}Cluster Name:${NC} ${CLUSTER_NAME}"
echo -e "${GREEN}Resource Group:${NC} ${RG_NAME}"
echo -e "${GREEN}Location:${NC} ${LOCATION}"
echo -e "${GREEN}Kubernetes Version:${NC} ${K8S_VERSION}"
echo -e "${GREEN}Total Nodes:${NC} ${NODE_COUNT}"
echo -e "${GREEN}Ready Nodes:${NC} ${READY_COUNT}"
echo -e "${GREEN}System Pods:${NC} ${SYSTEM_PODS_RUNNING}/${SYSTEM_PODS_TOTAL}"

echo -e "\n${YELLOW}Next Steps:${NC}"
echo "1. Apply storage classes: kubectl apply -f storage-classes.yaml"
echo "2. Install ingress controller (if not done): kubectl apply -f <ingress-manifest>"
echo "3. Configure monitoring and alerting in Azure Portal"
echo "4. Deploy your applications"
echo "5. Configure backup with Velero (optional)"

echo -e "\n${GREEN}Verification complete!${NC}"
