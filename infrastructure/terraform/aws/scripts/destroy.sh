#!/bin/bash
set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
AUTO_APPROVE="${AUTO_APPROVE:-false}"

echo -e "${RED}=== LLM Analytics Hub - EKS Destruction ===${NC}\n"

# Warning
show_warning() {
    echo -e "${RED}WARNING: This will destroy all infrastructure!${NC}"
    echo -e "${RED}This includes:${NC}"
    echo "  - EKS Cluster"
    echo "  - All Node Groups"
    echo "  - VPC and Networking"
    echo "  - Security Groups"
    echo "  - IAM Roles"
    echo "  - CloudWatch Logs"
    echo "  - KMS Keys (after 7 day deletion window)"
    echo ""
    echo -e "${YELLOW}This operation is IRREVERSIBLE!${NC}\n"
}

# Confirm destruction
confirm_destruction() {
    if [ "$AUTO_APPROVE" != "true" ]; then
        read -p "Type 'destroy' to confirm: " response
        if [ "$response" != "destroy" ]; then
            echo "Destruction cancelled."
            exit 0
        fi

        echo ""
        read -p "Are you absolutely sure? (yes/no): " response
        if [ "$response" != "yes" ]; then
            echo "Destruction cancelled."
            exit 0
        fi
        echo ""
    fi
}

# Cleanup Kubernetes resources
cleanup_k8s_resources() {
    echo -e "${YELLOW}Cleaning up Kubernetes resources...${NC}\n"

    if ! command -v kubectl &> /dev/null; then
        echo "kubectl not found, skipping Kubernetes cleanup"
        return
    fi

    cd "$PROJECT_ROOT"

    local cluster_name=$(terraform output -raw cluster_name 2>/dev/null || echo "")
    local region=$(terraform output -raw region 2>/dev/null || echo "us-east-1")

    if [ -z "$cluster_name" ]; then
        echo "Could not retrieve cluster name, skipping Kubernetes cleanup"
        return
    fi

    # Configure kubectl
    aws eks update-kubeconfig --region "$region" --name "$cluster_name" 2>/dev/null || true

    # Delete all services with LoadBalancer type
    echo "Deleting LoadBalancer services..."
    kubectl delete svc --all-namespaces --all --field-selector spec.type=LoadBalancer --wait=true 2>/dev/null || true

    # Wait for load balancers to be deleted
    echo "Waiting for load balancers to be deleted..."
    sleep 30

    echo -e "${GREEN}✓ Kubernetes cleanup complete${NC}\n"
}

# Destroy infrastructure
destroy_infrastructure() {
    echo -e "${YELLOW}Destroying infrastructure...${NC}\n"

    cd "$PROJECT_ROOT"

    local start_time=$(date +%s)

    if terraform destroy -auto-approve; then
        local end_time=$(date +%s)
        local duration=$((end_time - start_time))

        echo -e "\n${GREEN}✓ Infrastructure destroyed in $duration seconds${NC}\n"
    else
        echo -e "\n${RED}✗ Destruction failed${NC}"
        echo "You may need to manually clean up some resources"
        exit 1
    fi
}

# Cleanup local files
cleanup_local_files() {
    echo -e "${YELLOW}Cleaning up local files...${NC}"

    cd "$PROJECT_ROOT"

    rm -f terraform.tfstate.backup
    rm -f .terraform.lock.hcl
    rm -rf .terraform/
    rm -f tfplan
    rm -f kubeconfig*

    echo -e "${GREEN}✓ Local files cleaned up${NC}\n"
}

# Final message
show_final_message() {
    echo -e "${GREEN}=== Destruction Complete ===${NC}\n"

    echo "All infrastructure has been destroyed."
    echo ""
    echo "Note: Some resources may have deletion protection:"
    echo "  - S3 state bucket (if created)"
    echo "  - DynamoDB state table (if created)"
    echo "  - KMS keys (7 day deletion window)"
    echo ""
    echo "To remove these manually:"
    echo "  aws s3 rb s3://your-state-bucket --force"
    echo "  aws dynamodb delete-table --table-name terraform-state-lock"
    echo ""
}

# Main execution
main() {
    show_warning
    confirm_destruction
    cleanup_k8s_resources
    destroy_infrastructure
    cleanup_local_files
    show_final_message
}

main "$@"
