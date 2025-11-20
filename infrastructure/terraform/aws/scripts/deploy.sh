#!/bin/bash
set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
PLAN_FILE="tfplan"
AUTO_APPROVE="${AUTO_APPROVE:-false}"

echo -e "${GREEN}=== LLM Analytics Hub - EKS Deployment ===${NC}\n"

# Confirm deployment
confirm_deployment() {
    if [ "$AUTO_APPROVE" != "true" ]; then
        echo -e "${YELLOW}This will deploy/update the EKS cluster.${NC}"
        echo -e "${YELLOW}This operation may take 15-20 minutes.${NC}\n"

        read -p "Do you want to continue? (yes/no): " response
        if [ "$response" != "yes" ]; then
            echo "Deployment cancelled."
            exit 0
        fi
        echo ""
    fi
}

# Run terraform plan
run_plan() {
    echo -e "${BLUE}Running Terraform plan...${NC}\n"

    cd "$PROJECT_ROOT"

    if ! terraform plan -out="$PLAN_FILE"; then
        echo -e "\n${RED}✗ Terraform plan failed${NC}"
        exit 1
    fi

    echo -e "\n${GREEN}✓ Plan created successfully${NC}\n"
}

# Show plan summary
show_plan_summary() {
    echo -e "${BLUE}Plan Summary:${NC}"

    cd "$PROJECT_ROOT"

    # Extract resource counts
    local add=$(terraform show -json "$PLAN_FILE" | jq -r '[.resource_changes[] | select(.change.actions[] | contains("create"))] | length')
    local change=$(terraform show -json "$PLAN_FILE" | jq -r '[.resource_changes[] | select(.change.actions[] | contains("update"))] | length')
    local destroy=$(terraform show -json "$PLAN_FILE" | jq -r '[.resource_changes[] | select(.change.actions[] | contains("delete"))] | length')

    echo "  Resources to add: $add"
    echo "  Resources to change: $change"
    echo "  Resources to destroy: $destroy"
    echo ""
}

# Confirm plan
confirm_plan() {
    if [ "$AUTO_APPROVE" != "true" ]; then
        echo -e "${YELLOW}Review the plan above carefully.${NC}\n"

        read -p "Do you want to apply this plan? (yes/no): " response
        if [ "$response" != "yes" ]; then
            echo "Deployment cancelled."
            rm -f "$PLAN_FILE"
            exit 0
        fi
        echo ""
    fi
}

# Apply terraform plan
apply_plan() {
    echo -e "${BLUE}Applying Terraform plan...${NC}\n"

    cd "$PROJECT_ROOT"

    local start_time=$(date +%s)

    if terraform apply "$PLAN_FILE"; then
        local end_time=$(date +%s)
        local duration=$((end_time - start_time))

        echo -e "\n${GREEN}✓ Deployment completed successfully in $duration seconds${NC}\n"
        rm -f "$PLAN_FILE"
        return 0
    else
        echo -e "\n${RED}✗ Deployment failed${NC}"
        rm -f "$PLAN_FILE"
        exit 1
    fi
}

# Configure kubectl
configure_kubectl() {
    echo -e "${BLUE}Configuring kubectl...${NC}\n"

    cd "$PROJECT_ROOT"

    local cluster_name=$(terraform output -raw cluster_name 2>/dev/null || echo "")
    local region=$(terraform output -raw region 2>/dev/null || echo "us-east-1")

    if [ -z "$cluster_name" ]; then
        echo -e "${YELLOW}⚠ Could not retrieve cluster name${NC}"
        return
    fi

    if command -v kubectl &> /dev/null; then
        aws eks update-kubeconfig --region "$region" --name "$cluster_name"
        echo -e "${GREEN}✓ kubectl configured${NC}\n"
    else
        echo -e "${YELLOW}⚠ kubectl not installed, skipping configuration${NC}\n"
    fi
}

# Verify cluster
verify_cluster() {
    echo -e "${BLUE}Verifying cluster...${NC}\n"

    if ! command -v kubectl &> /dev/null; then
        echo -e "${YELLOW}⚠ kubectl not installed, skipping verification${NC}\n"
        return
    fi

    echo "Waiting for nodes to be ready..."
    local timeout=300
    local elapsed=0

    while [ $elapsed -lt $timeout ]; do
        if kubectl get nodes &> /dev/null; then
            local ready_nodes=$(kubectl get nodes --no-headers 2>/dev/null | grep -c " Ready " || echo "0")
            if [ "$ready_nodes" -gt 0 ]; then
                echo -e "${GREEN}✓ Cluster is ready${NC}\n"
                kubectl get nodes
                echo ""
                return
            fi
        fi
        sleep 10
        elapsed=$((elapsed + 10))
    done

    echo -e "${YELLOW}⚠ Timeout waiting for nodes to be ready${NC}"
    echo "Run 'kubectl get nodes' to check status manually"
    echo ""
}

# Display outputs
display_outputs() {
    echo -e "${BLUE}Cluster Information:${NC}\n"

    cd "$PROJECT_ROOT"

    terraform output -json | jq -r '
        to_entries |
        map(select(.value.sensitive == false)) |
        .[] |
        "  \(.key): \(.value.value)"
    '

    echo ""
}

# Display next steps
display_next_steps() {
    echo -e "${GREEN}=== Deployment Complete ===${NC}\n"

    cd "$PROJECT_ROOT"

    local cluster_name=$(terraform output -raw cluster_name 2>/dev/null || echo "")

    echo "Next steps:"
    echo ""
    echo "1. Verify cluster access:"
    echo "   kubectl get nodes"
    echo "   kubectl get pods --all-namespaces"
    echo ""
    echo "2. Install cluster add-ons:"
    echo "   cd $PROJECT_ROOT/scripts"
    echo "   ./install-addons.sh"
    echo ""
    echo "3. Deploy your applications:"
    echo "   kubectl apply -f ../../../k8s/"
    echo ""
    echo "4. Access cluster:"
    echo "   aws eks update-kubeconfig --name $cluster_name"
    echo ""

    if [ -f "$PROJECT_ROOT/README.md" ]; then
        echo "See README.md for more information"
    fi
    echo ""
}

# Main execution
main() {
    confirm_deployment
    run_plan

    if command -v jq &> /dev/null; then
        show_plan_summary
    fi

    confirm_plan
    apply_plan
    configure_kubectl
    verify_cluster
    display_outputs
    display_next_steps
}

main "$@"
