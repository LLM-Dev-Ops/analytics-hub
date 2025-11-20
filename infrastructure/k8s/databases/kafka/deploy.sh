#!/bin/bash
set -e

# Kafka Deployment Script
# Automates the deployment of the entire Kafka stack

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
NAMESPACE="kafka"

# Color codes
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Print functions
print_header() {
  echo ""
  echo "========================================="
  echo "$1"
  echo "========================================="
}

print_step() {
  echo -e "${GREEN}▶${NC} $1"
}

print_warning() {
  echo -e "${YELLOW}⚠${NC} $1"
}

print_error() {
  echo -e "${RED}✗${NC} $1"
}

print_success() {
  echo -e "${GREEN}✓${NC} $1"
}

# Check prerequisites
check_prerequisites() {
  print_header "Checking Prerequisites"

  # Check kubectl
  if ! command -v kubectl &> /dev/null; then
    print_error "kubectl not found. Please install kubectl."
    exit 1
  fi
  print_success "kubectl found: $(kubectl version --client --short 2>/dev/null | head -1)"

  # Check Kubernetes connection
  if ! kubectl cluster-info &> /dev/null; then
    print_error "Cannot connect to Kubernetes cluster"
    exit 1
  fi
  print_success "Connected to Kubernetes cluster"

  # Check cert-manager (optional)
  if kubectl get crd certificates.cert-manager.io &> /dev/null; then
    print_success "cert-manager detected"
    CERT_MANAGER_AVAILABLE=true
  else
    print_warning "cert-manager not found. TLS certificates must be created manually."
    CERT_MANAGER_AVAILABLE=false
  fi

  # Check storage class
  if kubectl get storageclass fast-ssd &> /dev/null; then
    print_success "StorageClass 'fast-ssd' found"
  else
    print_warning "StorageClass 'fast-ssd' not found. Update volumeClaimTemplates or create the storage class."
  fi
}

# Create namespace
create_namespace() {
  print_header "Creating Namespace"

  if kubectl get namespace "$NAMESPACE" &> /dev/null; then
    print_warning "Namespace '$NAMESPACE' already exists"
  else
    kubectl apply -f "$SCRIPT_DIR/namespace.yaml"
    print_success "Namespace '$NAMESPACE' created"
  fi
}

# Setup secrets
setup_secrets() {
  print_header "Setting Up Secrets"

  print_warning "You need to configure secrets with actual passwords"
  echo ""
  echo "Run the following command with your own passwords:"
  echo ""
  cat <<'EOF'
kubectl create secret generic kafka-secrets \
  -n kafka \
  --from-literal=admin-password='YOUR_ADMIN_PASSWORD' \
  --from-literal=user-password='YOUR_USER_PASSWORD' \
  --from-literal=zk-kafka-password='YOUR_ZK_PASSWORD' \
  --from-literal=ssl-keystore-password='YOUR_KEYSTORE_PASSWORD' \
  --from-literal=ssl-key-password='YOUR_KEY_PASSWORD' \
  --from-literal=ssl-truststore-password='YOUR_TRUSTSTORE_PASSWORD' \
  --dry-run=client -o yaml | kubectl apply -f -
EOF
  echo ""

  read -p "Have you created the secrets? (y/n): " -n 1 -r
  echo
  if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    print_error "Secrets are required. Please create them and run this script again."
    exit 1
  fi
}

# Deploy TLS certificates
deploy_certificates() {
  print_header "Deploying TLS Certificates"

  if [ "$CERT_MANAGER_AVAILABLE" = true ]; then
    kubectl apply -f "$SCRIPT_DIR/security/tls-certificates.yaml"
    print_step "Waiting for certificates to be ready..."
    kubectl wait --for=condition=Ready certificate/kafka-broker-cert -n "$NAMESPACE" --timeout=300s || true
    print_success "TLS certificates deployed"
  else
    print_warning "Skipping TLS certificate deployment (cert-manager not available)"
  fi
}

# Deploy Zookeeper
deploy_zookeeper() {
  print_header "Deploying Zookeeper Ensemble"

  print_step "Applying Zookeeper ConfigMap..."
  kubectl apply -f "$SCRIPT_DIR/zookeeper/configmap.yaml"

  print_step "Applying Zookeeper Services..."
  kubectl apply -f "$SCRIPT_DIR/zookeeper/service.yaml"

  print_step "Applying Zookeeper StatefulSet..."
  kubectl apply -f "$SCRIPT_DIR/zookeeper/statefulset.yaml"

  print_step "Waiting for Zookeeper pods to be ready..."
  for i in {0..2}; do
    kubectl wait --for=condition=Ready pod/zookeeper-$i -n "$NAMESPACE" --timeout=300s || true
  done

  print_success "Zookeeper ensemble deployed"
}

# Verify Zookeeper
verify_zookeeper() {
  print_header "Verifying Zookeeper"

  for i in {0..2}; do
    print_step "Checking zookeeper-$i..."
    if kubectl exec -n "$NAMESPACE" zookeeper-$i -- zkServer.sh status &> /dev/null; then
      print_success "zookeeper-$i is running"
    else
      print_error "zookeeper-$i is not responding"
    fi
  done
}

# Deploy Kafka
deploy_kafka() {
  print_header "Deploying Kafka Cluster"

  print_step "Applying Kafka ConfigMap..."
  kubectl apply -f "$SCRIPT_DIR/kafka/configmap.yaml"

  print_step "Applying Kafka Secrets..."
  kubectl apply -f "$SCRIPT_DIR/kafka/secrets.yaml"

  print_step "Applying Kafka Services..."
  kubectl apply -f "$SCRIPT_DIR/kafka/services.yaml"

  print_step "Applying Kafka StatefulSet..."
  kubectl apply -f "$SCRIPT_DIR/kafka/statefulset.yaml"

  print_step "Waiting for Kafka pods to be ready (this may take several minutes)..."
  for i in {0..2}; do
    kubectl wait --for=condition=Ready pod/kafka-$i -n "$NAMESPACE" --timeout=600s || true
  done

  print_success "Kafka cluster deployed"
}

# Verify Kafka
verify_kafka() {
  print_header "Verifying Kafka Cluster"

  for i in {0..2}; do
    print_step "Checking kafka-$i..."
    if kubectl exec -n "$NAMESPACE" kafka-$i -- kafka-broker-api-versions.sh --bootstrap-server localhost:9092 &> /dev/null; then
      print_success "kafka-$i is running"
    else
      print_error "kafka-$i is not responding"
    fi
  done
}

# Deploy topics
deploy_topics() {
  print_header "Deploying Topics"

  print_step "Would you like to deploy topics using:"
  echo "1) Strimzi Topic Operator (declarative)"
  echo "2) Init scripts (imperative)"
  echo "3) Skip for now"
  read -p "Enter choice (1-3): " -n 1 -r
  echo

  case $REPLY in
    1)
      kubectl apply -f "$SCRIPT_DIR/topics/topic-operator.yaml"
      kubectl apply -f "$SCRIPT_DIR/topics/topics.yaml"
      print_success "Topic operator and topics deployed"
      ;;
    2)
      print_step "Running topic creation script..."
      kubectl exec -n "$NAMESPACE" kafka-0 -- bash -c "$(cat $SCRIPT_DIR/init-scripts/create-topics.sh)"
      print_success "Topics created"
      ;;
    3)
      print_warning "Skipping topic creation"
      ;;
    *)
      print_warning "Invalid choice. Skipping topic creation"
      ;;
  esac
}

# Deploy monitoring
deploy_monitoring() {
  print_header "Deploying Monitoring"

  print_step "Applying JMX Exporter configuration..."
  kubectl apply -f "$SCRIPT_DIR/monitoring/jmx-exporter.yaml"

  # Check if Prometheus operator is available
  if kubectl get crd servicemonitors.monitoring.coreos.com &> /dev/null; then
    print_step "Applying ServiceMonitors..."
    kubectl apply -f "$SCRIPT_DIR/monitoring/servicemonitor.yaml"
    print_success "ServiceMonitors deployed"
  else
    print_warning "Prometheus operator not found. Skipping ServiceMonitor deployment."
  fi

  print_step "Applying AlertManager rules..."
  kubectl apply -f "$SCRIPT_DIR/monitoring/alerts.yaml" || print_warning "Failed to apply alerts (Prometheus operator may not be installed)"

  print_success "Monitoring deployed"
}

# Deploy security
deploy_security() {
  print_header "Deploying Security Policies"

  print_step "Applying Network Policies..."
  kubectl apply -f "$SCRIPT_DIR/security/network-policy.yaml"

  print_success "Security policies deployed"
}

# Deploy backup
deploy_backup() {
  print_header "Deploying Backup Components"

  read -p "Deploy MirrorMaker for replication? (y/n): " -n 1 -r
  echo
  if [[ $REPLY =~ ^[Yy]$ ]]; then
    kubectl apply -f "$SCRIPT_DIR/backup/mirror-maker.yaml"
    print_success "MirrorMaker deployed"
  fi

  read -p "Deploy backup CronJob? (y/n): " -n 1 -r
  echo
  if [[ $REPLY =~ ^[Yy]$ ]]; then
    kubectl apply -f "$SCRIPT_DIR/backup/backup-cronjob.yaml"
    print_success "Backup CronJob deployed"
  fi
}

# Setup ACLs
setup_acls() {
  print_header "Setting Up ACLs"

  read -p "Setup ACLs for LLM Analytics? (y/n): " -n 1 -r
  echo
  if [[ $REPLY =~ ^[Yy]$ ]]; then
    kubectl exec -n "$NAMESPACE" kafka-0 -- bash -c "$(cat $SCRIPT_DIR/init-scripts/setup-acls.sh)"
    print_success "ACLs configured"
  else
    print_warning "Skipping ACL setup"
  fi
}

# Final verification
final_verification() {
  print_header "Final Verification"

  print_step "Running cluster verification..."
  kubectl exec -n "$NAMESPACE" kafka-0 -- bash -c "$(cat $SCRIPT_DIR/init-scripts/verify-cluster.sh)" || true

  print_header "Deployment Summary"
  echo ""
  echo "Namespace: $NAMESPACE"
  echo ""
  echo "Zookeeper Pods:"
  kubectl get pods -n "$NAMESPACE" -l app=zookeeper
  echo ""
  echo "Kafka Pods:"
  kubectl get pods -n "$NAMESPACE" -l app=kafka
  echo ""
  echo "Services:"
  kubectl get svc -n "$NAMESPACE"
  echo ""
  echo "PVCs:"
  kubectl get pvc -n "$NAMESPACE"
  echo ""
}

# Main deployment flow
main() {
  print_header "Kafka Cluster Deployment for LLM Analytics Hub"
  echo "This script will deploy a production-ready Kafka cluster"
  echo ""

  check_prerequisites
  create_namespace
  setup_secrets
  deploy_certificates
  deploy_zookeeper
  verify_zookeeper
  deploy_kafka
  verify_kafka
  deploy_topics
  deploy_monitoring
  deploy_security
  deploy_backup
  setup_acls
  final_verification

  print_header "Deployment Complete!"
  echo ""
  print_success "Kafka cluster is ready for use"
  echo ""
  echo "Next steps:"
  echo "1. Verify cluster health: kubectl get pods -n kafka"
  echo "2. Check logs: kubectl logs -n kafka kafka-0"
  echo "3. Access metrics: kubectl port-forward -n kafka svc/kafka-metrics 7071:7071"
  echo "4. List topics: kubectl exec -n kafka kafka-0 -- kafka-topics.sh --list --bootstrap-server localhost:9092"
  echo ""
  echo "For more information, see: $SCRIPT_DIR/README.md"
}

# Run main function
main "$@"
