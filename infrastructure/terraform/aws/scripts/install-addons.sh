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

echo -e "${GREEN}=== Installing EKS Add-ons ===${NC}\n"

# Check prerequisites
check_prerequisites() {
    echo -e "${YELLOW}Checking prerequisites...${NC}"

    if ! command -v kubectl &> /dev/null; then
        echo -e "${RED}✗ kubectl not found${NC}"
        exit 1
    fi

    if ! command -v helm &> /dev/null; then
        echo -e "${YELLOW}⚠ helm not found, skipping Helm-based installations${NC}"
    fi

    echo -e "${GREEN}✓ Prerequisites checked${NC}\n"
}

# Get cluster info
get_cluster_info() {
    echo -e "${YELLOW}Getting cluster information...${NC}"

    cd "$PROJECT_ROOT"

    CLUSTER_NAME=$(terraform output -raw cluster_name 2>/dev/null || echo "")
    REGION=$(terraform output -raw region 2>/dev/null || echo "us-east-1")
    CLUSTER_AUTOSCALER_ROLE=$(terraform output -raw cluster_autoscaler_role_arn 2>/dev/null || echo "")
    AWS_LB_CONTROLLER_ROLE=$(terraform output -raw aws_load_balancer_controller_role_arn 2>/dev/null || echo "")

    if [ -z "$CLUSTER_NAME" ]; then
        echo -e "${RED}✗ Could not retrieve cluster name${NC}"
        exit 1
    fi

    echo "  Cluster: $CLUSTER_NAME"
    echo "  Region: $REGION"
    echo -e "${GREEN}✓ Cluster info retrieved${NC}\n"
}

# Install Metrics Server
install_metrics_server() {
    echo -e "${BLUE}Installing Metrics Server...${NC}"

    kubectl apply -f https://github.com/kubernetes-sigs/metrics-server/releases/latest/download/components.yaml

    echo "Waiting for Metrics Server to be ready..."
    kubectl wait --for=condition=available --timeout=300s deployment/metrics-server -n kube-system

    echo -e "${GREEN}✓ Metrics Server installed${NC}\n"
}

# Install Cluster Autoscaler
install_cluster_autoscaler() {
    echo -e "${BLUE}Installing Cluster Autoscaler...${NC}"

    if [ -z "$CLUSTER_AUTOSCALER_ROLE" ]; then
        echo -e "${YELLOW}⚠ Cluster Autoscaler role not found, skipping${NC}\n"
        return
    fi

    # Create service account
    cat <<EOF | kubectl apply -f -
apiVersion: v1
kind: ServiceAccount
metadata:
  name: cluster-autoscaler
  namespace: kube-system
  annotations:
    eks.amazonaws.com/role-arn: $CLUSTER_AUTOSCALER_ROLE
EOF

    # Install Cluster Autoscaler
    kubectl apply -f https://raw.githubusercontent.com/kubernetes/autoscaler/master/cluster-autoscaler/cloudprovider/aws/examples/cluster-autoscaler-autodiscover.yaml

    # Patch deployment
    kubectl patch deployment cluster-autoscaler \
      -n kube-system \
      -p '{"spec":{"template":{"metadata":{"annotations":{"cluster-autoscaler.kubernetes.io/safe-to-evict":"false"}}}}}'

    kubectl set image deployment cluster-autoscaler \
      -n kube-system \
      cluster-autoscaler=registry.k8s.io/autoscaling/cluster-autoscaler:v1.28.2

    kubectl patch deployment cluster-autoscaler \
      -n kube-system \
      --type='json' \
      -p='[{"op":"add","path":"/spec/template/spec/containers/0/command/-","value":"--balance-similar-node-groups"},{"op":"add","path":"/spec/template/spec/containers/0/command/-","value":"--skip-nodes-with-system-pods=false"}]'

    # Add cluster name to deployment
    kubectl set env deployment/cluster-autoscaler \
      -n kube-system \
      AWS_REGION="$REGION"

    kubectl patch deployment cluster-autoscaler \
      -n kube-system \
      --type='json' \
      -p="[{\"op\":\"add\",\"path\":\"/spec/template/spec/containers/0/command/-\",\"value\":\"--node-group-auto-discovery=asg:tag=k8s.io/cluster-autoscaler/enabled,k8s.io/cluster-autoscaler/$CLUSTER_NAME\"}]"

    echo -e "${GREEN}✓ Cluster Autoscaler installed${NC}\n"
}

# Install AWS Load Balancer Controller
install_aws_lb_controller() {
    echo -e "${BLUE}Installing AWS Load Balancer Controller...${NC}"

    if ! command -v helm &> /dev/null; then
        echo -e "${YELLOW}⚠ helm not found, skipping${NC}\n"
        return
    fi

    if [ -z "$AWS_LB_CONTROLLER_ROLE" ]; then
        echo -e "${YELLOW}⚠ AWS Load Balancer Controller role not found, skipping${NC}\n"
        return
    fi

    # Add EKS Helm repository
    helm repo add eks https://aws.github.io/eks-charts
    helm repo update

    # Install AWS Load Balancer Controller
    helm upgrade --install aws-load-balancer-controller eks/aws-load-balancer-controller \
      -n kube-system \
      --set clusterName="$CLUSTER_NAME" \
      --set serviceAccount.create=true \
      --set serviceAccount.name=aws-load-balancer-controller \
      --set serviceAccount.annotations."eks\.amazonaws\.com/role-arn"="$AWS_LB_CONTROLLER_ROLE" \
      --set region="$REGION" \
      --set vpcId=$(terraform output -raw vpc_id 2>/dev/null || echo "") \
      --wait

    echo -e "${GREEN}✓ AWS Load Balancer Controller installed${NC}\n"
}

# Create storage classes
create_storage_classes() {
    echo -e "${BLUE}Creating Storage Classes...${NC}"

    cat <<EOF | kubectl apply -f -
apiVersion: storage.k8s.io/v1
kind: StorageClass
metadata:
  name: gp3
  annotations:
    storageclass.kubernetes.io/is-default-class: "true"
provisioner: ebs.csi.aws.com
parameters:
  type: gp3
  iops: "3000"
  throughput: "125"
  encrypted: "true"
volumeBindingMode: WaitForFirstConsumer
allowVolumeExpansion: true
---
apiVersion: storage.k8s.io/v1
kind: StorageClass
metadata:
  name: io2
provisioner: ebs.csi.aws.com
parameters:
  type: io2
  iops: "10000"
  encrypted: "true"
volumeBindingMode: WaitForFirstConsumer
allowVolumeExpansion: true
---
apiVersion: storage.k8s.io/v1
kind: StorageClass
metadata:
  name: gp3-retain
provisioner: ebs.csi.aws.com
parameters:
  type: gp3
  iops: "3000"
  throughput: "125"
  encrypted: "true"
reclaimPolicy: Retain
volumeBindingMode: WaitForFirstConsumer
allowVolumeExpansion: true
EOF

    echo -e "${GREEN}✓ Storage Classes created${NC}\n"
}

# Install Kubernetes Dashboard (optional)
install_kubernetes_dashboard() {
    echo -e "${BLUE}Do you want to install Kubernetes Dashboard? (yes/no)${NC}"
    read -r response

    if [ "$response" != "yes" ]; then
        echo "Skipping Kubernetes Dashboard"
        echo ""
        return
    fi

    kubectl apply -f https://raw.githubusercontent.com/kubernetes/dashboard/v2.7.0/aio/deploy/recommended.yaml

    # Create admin service account
    cat <<EOF | kubectl apply -f -
apiVersion: v1
kind: ServiceAccount
metadata:
  name: admin-user
  namespace: kubernetes-dashboard
---
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRoleBinding
metadata:
  name: admin-user
roleRef:
  apiGroup: rbac.authorization.k8s.io
  kind: ClusterRole
  name: cluster-admin
subjects:
- kind: ServiceAccount
  name: admin-user
  namespace: kubernetes-dashboard
EOF

    echo -e "${GREEN}✓ Kubernetes Dashboard installed${NC}"
    echo "To access the dashboard:"
    echo "1. Get token: kubectl -n kubernetes-dashboard create token admin-user"
    echo "2. Run proxy: kubectl proxy"
    echo "3. Open: http://localhost:8001/api/v1/namespaces/kubernetes-dashboard/services/https:kubernetes-dashboard:/proxy/"
    echo ""
}

# Verify installations
verify_installations() {
    echo -e "${BLUE}Verifying installations...${NC}\n"

    echo "Checking deployments in kube-system:"
    kubectl get deployments -n kube-system

    echo ""
    echo "Checking storage classes:"
    kubectl get sc

    echo ""
    echo -e "${GREEN}✓ Verification complete${NC}\n"
}

# Display summary
display_summary() {
    echo -e "${GREEN}=== Add-ons Installation Complete ===${NC}\n"

    echo "Installed add-ons:"
    echo "  ✓ Metrics Server"
    echo "  ✓ Cluster Autoscaler (if role available)"
    echo "  ✓ AWS Load Balancer Controller (if Helm and role available)"
    echo "  ✓ Storage Classes (gp3, io2, gp3-retain)"
    echo ""

    echo "Useful commands:"
    echo "  kubectl top nodes                    # View node metrics"
    echo "  kubectl top pods -A                  # View pod metrics"
    echo "  kubectl get sc                       # List storage classes"
    echo "  kubectl logs -n kube-system -l app=cluster-autoscaler  # View autoscaler logs"
    echo ""
}

# Main execution
main() {
    check_prerequisites
    get_cluster_info
    install_metrics_server
    install_cluster_autoscaler
    install_aws_lb_controller
    create_storage_classes
    install_kubernetes_dashboard
    verify_installations
    display_summary
}

main "$@"
