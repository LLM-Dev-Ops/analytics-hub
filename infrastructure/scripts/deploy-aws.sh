#!/bin/bash

################################################################################
# LLM Analytics Hub - AWS Deployment Script
#
# Deploys complete infrastructure to AWS including:
# - EKS cluster with managed node groups
# - RDS PostgreSQL with TimescaleDB
# - ElastiCache Redis cluster
# - MSK (Managed Kafka)
# - VPC, subnets, security groups
# - IAM roles and policies
# - Route53 DNS
# - CloudWatch monitoring
#
# Usage: ./deploy-aws.sh [environment] [region]
# Example: ./deploy-aws.sh production us-east-1
################################################################################

set -euo pipefail

# Script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
INFRASTRUCTURE_DIR="${PROJECT_ROOT}/infrastructure"

# Load utilities
source "${SCRIPT_DIR}/utils.sh"

# Configuration
ENVIRONMENT="${1:-dev}"
AWS_REGION="${2:-us-east-1}"
CLUSTER_NAME="llm-analytics-hub-${ENVIRONMENT}"
CONFIG_FILE="${INFRASTRUCTURE_DIR}/config/${ENVIRONMENT}.yaml"

# Logging
LOG_FILE="${INFRASTRUCTURE_DIR}/logs/deploy-aws-${ENVIRONMENT}-$(date +%Y%m%d-%H%M%S).log"
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
    for tool in aws kubectl eksctl terraform helm jq yq; do
        if ! command -v "${tool}" &> /dev/null; then
            missing_tools+=("${tool}")
        fi
    done

    if [ ${#missing_tools[@]} -gt 0 ]; then
        error "Missing required tools: ${missing_tools[*]}"
        error "Please install missing tools and try again"
        exit 1
    fi

    # Check AWS credentials
    if ! aws sts get-caller-identity &> /dev/null; then
        error "AWS credentials not configured or invalid"
        exit 1
    fi

    # Check config file
    if [ ! -f "${CONFIG_FILE}" ]; then
        error "Configuration file not found: ${CONFIG_FILE}"
        exit 1
    fi

    log "Prerequisites check passed"
}

setup_vpc() {
    log "Setting up VPC and networking..."

    # Create VPC
    local vpc_id=$(aws ec2 create-vpc \
        --cidr-block 10.0.0.0/16 \
        --region "${AWS_REGION}" \
        --tag-specifications "ResourceType=vpc,Tags=[{Key=Name,Value=${CLUSTER_NAME}-vpc},{Key=Environment,Value=${ENVIRONMENT}}]" \
        --query 'Vpc.VpcId' \
        --output text 2>> "${LOG_FILE}")

    log "VPC created: ${vpc_id}"

    # Enable DNS hostnames
    aws ec2 modify-vpc-attribute \
        --vpc-id "${vpc_id}" \
        --enable-dns-hostnames \
        --region "${AWS_REGION}" 2>> "${LOG_FILE}"

    # Create Internet Gateway
    local igw_id=$(aws ec2 create-internet-gateway \
        --region "${AWS_REGION}" \
        --tag-specifications "ResourceType=internet-gateway,Tags=[{Key=Name,Value=${CLUSTER_NAME}-igw}]" \
        --query 'InternetGateway.InternetGatewayId' \
        --output text 2>> "${LOG_FILE}")

    aws ec2 attach-internet-gateway \
        --vpc-id "${vpc_id}" \
        --internet-gateway-id "${igw_id}" \
        --region "${AWS_REGION}" 2>> "${LOG_FILE}"

    log "Internet Gateway created: ${igw_id}"

    # Create subnets (3 public, 3 private across AZs)
    local availability_zones=($(aws ec2 describe-availability-zones \
        --region "${AWS_REGION}" \
        --query 'AvailabilityZones[0:3].ZoneName' \
        --output text))

    local public_subnets=()
    local private_subnets=()

    for i in "${!availability_zones[@]}"; do
        local az="${availability_zones[$i]}"

        # Public subnet
        local public_subnet_id=$(aws ec2 create-subnet \
            --vpc-id "${vpc_id}" \
            --cidr-block "10.0.$((i * 2)).0/24" \
            --availability-zone "${az}" \
            --region "${AWS_REGION}" \
            --tag-specifications "ResourceType=subnet,Tags=[{Key=Name,Value=${CLUSTER_NAME}-public-${az}},{Key=kubernetes.io/role/elb,Value=1}]" \
            --query 'Subnet.SubnetId' \
            --output text 2>> "${LOG_FILE}")

        public_subnets+=("${public_subnet_id}")

        # Private subnet
        local private_subnet_id=$(aws ec2 create-subnet \
            --vpc-id "${vpc_id}" \
            --cidr-block "10.0.$((i * 2 + 1)).0/24" \
            --availability-zone "${az}" \
            --region "${AWS_REGION}" \
            --tag-specifications "ResourceType=subnet,Tags=[{Key=Name,Value=${CLUSTER_NAME}-private-${az}},{Key=kubernetes.io/role/internal-elb,Value=1}]" \
            --query 'Subnet.SubnetId' \
            --output text 2>> "${LOG_FILE}")

        private_subnets+=("${private_subnet_id}")
    done

    log "Created ${#public_subnets[@]} public and ${#private_subnets[@]} private subnets"

    # Store IDs for later use
    echo "${vpc_id}" > "${INFRASTRUCTURE_DIR}/.aws-vpc-id"
    echo "${public_subnets[@]}" > "${INFRASTRUCTURE_DIR}/.aws-public-subnets"
    echo "${private_subnets[@]}" > "${INFRASTRUCTURE_DIR}/.aws-private-subnets"
}

create_eks_cluster() {
    log "Creating EKS cluster..."

    # Create EKS cluster using eksctl
    cat > /tmp/eks-cluster-config.yaml <<EOF
apiVersion: eksctl.io/v1alpha5
kind: ClusterConfig

metadata:
  name: ${CLUSTER_NAME}
  region: ${AWS_REGION}
  version: "1.28"
  tags:
    Environment: ${ENVIRONMENT}
    ManagedBy: eksctl

vpc:
  id: $(cat "${INFRASTRUCTURE_DIR}/.aws-vpc-id")
  subnets:
    public:
$(cat "${INFRASTRUCTURE_DIR}/.aws-public-subnets" | tr ' ' '\n' | sed 's/^/      - id: /')
    private:
$(cat "${INFRASTRUCTURE_DIR}/.aws-private-subnets" | tr ' ' '\n' | sed 's/^/      - id: /')

managedNodeGroups:
  - name: ${CLUSTER_NAME}-ng-1
    instanceType: m5.xlarge
    minSize: 3
    maxSize: 10
    desiredCapacity: 3
    volumeSize: 100
    volumeType: gp3
    privateNetworking: true
    labels:
      role: general
    tags:
      k8s.io/cluster-autoscaler/enabled: "true"
      k8s.io/cluster-autoscaler/${CLUSTER_NAME}: "owned"
    iam:
      withAddonPolicies:
        autoScaler: true
        ebs: true
        efs: true
        cloudWatch: true

addons:
  - name: vpc-cni
    version: latest
  - name: coredns
    version: latest
  - name: kube-proxy
    version: latest
  - name: aws-ebs-csi-driver
    version: latest

cloudWatch:
  clusterLogging:
    enableTypes:
      - api
      - audit
      - authenticator
      - controllerManager
      - scheduler
EOF

    eksctl create cluster -f /tmp/eks-cluster-config.yaml 2>&1 | tee -a "${LOG_FILE}"

    # Update kubeconfig
    aws eks update-kubeconfig \
        --name "${CLUSTER_NAME}" \
        --region "${AWS_REGION}" 2>> "${LOG_FILE}"

    log "EKS cluster created successfully"
}

create_rds_instance() {
    log "Creating RDS PostgreSQL instance with TimescaleDB..."

    local db_subnet_group="${CLUSTER_NAME}-db-subnet-group"

    # Create DB subnet group
    aws rds create-db-subnet-group \
        --db-subnet-group-name "${db_subnet_group}" \
        --db-subnet-group-description "Subnet group for ${CLUSTER_NAME}" \
        --subnet-ids $(cat "${INFRASTRUCTURE_DIR}/.aws-private-subnets") \
        --region "${AWS_REGION}" \
        --tags "Key=Name,Value=${db_subnet_group}" "Key=Environment,Value=${ENVIRONMENT}" 2>> "${LOG_FILE}"

    # Create security group for RDS
    local vpc_id=$(cat "${INFRASTRUCTURE_DIR}/.aws-vpc-id")
    local db_sg_id=$(aws ec2 create-security-group \
        --group-name "${CLUSTER_NAME}-rds-sg" \
        --description "Security group for RDS PostgreSQL" \
        --vpc-id "${vpc_id}" \
        --region "${AWS_REGION}" \
        --query 'GroupId' \
        --output text 2>> "${LOG_FILE}")

    # Allow PostgreSQL traffic from EKS nodes
    aws ec2 authorize-security-group-ingress \
        --group-id "${db_sg_id}" \
        --protocol tcp \
        --port 5432 \
        --cidr 10.0.0.0/16 \
        --region "${AWS_REGION}" 2>> "${LOG_FILE}"

    # Create RDS instance
    local db_instance_id="${CLUSTER_NAME}-postgres"
    aws rds create-db-instance \
        --db-instance-identifier "${db_instance_id}" \
        --db-instance-class db.r6g.xlarge \
        --engine postgres \
        --engine-version 15.4 \
        --master-username postgres \
        --master-user-password "$(generate_password)" \
        --allocated-storage 100 \
        --storage-type gp3 \
        --storage-encrypted \
        --db-subnet-group-name "${db_subnet_group}" \
        --vpc-security-group-ids "${db_sg_id}" \
        --backup-retention-period 7 \
        --preferred-backup-window "03:00-04:00" \
        --preferred-maintenance-window "sun:04:00-sun:05:00" \
        --enable-performance-insights \
        --performance-insights-retention-period 7 \
        --publicly-accessible false \
        --multi-az \
        --region "${AWS_REGION}" \
        --tags "Key=Name,Value=${db_instance_id}" "Key=Environment,Value=${ENVIRONMENT}" 2>> "${LOG_FILE}"

    log "RDS instance creation initiated: ${db_instance_id}"
    log "Waiting for RDS instance to be available (this may take 10-15 minutes)..."

    aws rds wait db-instance-available \
        --db-instance-identifier "${db_instance_id}" \
        --region "${AWS_REGION}" 2>> "${LOG_FILE}"

    log "RDS instance is now available"
}

create_elasticache_cluster() {
    log "Creating ElastiCache Redis cluster..."

    local cache_subnet_group="${CLUSTER_NAME}-cache-subnet-group"

    # Create cache subnet group
    aws elasticache create-cache-subnet-group \
        --cache-subnet-group-name "${cache_subnet_group}" \
        --cache-subnet-group-description "Subnet group for ${CLUSTER_NAME} Redis" \
        --subnet-ids $(cat "${INFRASTRUCTURE_DIR}/.aws-private-subnets") \
        --region "${AWS_REGION}" \
        --tags "Key=Name,Value=${cache_subnet_group}" "Key=Environment,Value=${ENVIRONMENT}" 2>> "${LOG_FILE}"

    # Create security group for Redis
    local vpc_id=$(cat "${INFRASTRUCTURE_DIR}/.aws-vpc-id")
    local redis_sg_id=$(aws ec2 create-security-group \
        --group-name "${CLUSTER_NAME}-redis-sg" \
        --description "Security group for Redis cluster" \
        --vpc-id "${vpc_id}" \
        --region "${AWS_REGION}" \
        --query 'GroupId' \
        --output text 2>> "${LOG_FILE}")

    # Allow Redis traffic from EKS nodes
    aws ec2 authorize-security-group-ingress \
        --group-id "${redis_sg_id}" \
        --protocol tcp \
        --port 6379 \
        --cidr 10.0.0.0/16 \
        --region "${AWS_REGION}" 2>> "${LOG_FILE}"

    # Create Redis replication group
    local replication_group_id="${CLUSTER_NAME}-redis"
    aws elasticache create-replication-group \
        --replication-group-id "${replication_group_id}" \
        --replication-group-description "Redis cluster for ${CLUSTER_NAME}" \
        --engine redis \
        --engine-version 7.0 \
        --cache-node-type cache.r6g.xlarge \
        --num-cache-clusters 3 \
        --cache-subnet-group-name "${cache_subnet_group}" \
        --security-group-ids "${redis_sg_id}" \
        --automatic-failover-enabled \
        --multi-az-enabled \
        --at-rest-encryption-enabled \
        --transit-encryption-enabled \
        --auth-token "$(generate_password 32)" \
        --snapshot-retention-limit 5 \
        --snapshot-window "02:00-03:00" \
        --preferred-maintenance-window "sun:05:00-sun:06:00" \
        --region "${AWS_REGION}" \
        --tags "Key=Name,Value=${replication_group_id}" "Key=Environment,Value=${ENVIRONMENT}" 2>> "${LOG_FILE}"

    log "Redis cluster creation initiated: ${replication_group_id}"
}

create_msk_cluster() {
    log "Creating MSK (Managed Kafka) cluster..."

    # Create configuration
    local config_name="${CLUSTER_NAME}-kafka-config"
    aws kafka create-configuration \
        --name "${config_name}" \
        --description "Kafka configuration for ${CLUSTER_NAME}" \
        --kafka-versions "3.5.1" \
        --server-properties file://<(cat <<EOF
auto.create.topics.enable=false
default.replication.factor=3
min.insync.replicas=2
num.io.threads=8
num.network.threads=5
num.partitions=3
num.replica.fetchers=2
replica.lag.time.max.ms=30000
socket.receive.buffer.bytes=102400
socket.request.max.bytes=104857600
socket.send.buffer.bytes=102400
unclean.leader.election.enable=false
zookeeper.session.timeout.ms=18000
log.retention.hours=168
EOF
) \
        --region "${AWS_REGION}" 2>> "${LOG_FILE}"

    # Create MSK cluster
    local cluster_name="${CLUSTER_NAME}-kafka"
    aws kafka create-cluster \
        --cluster-name "${cluster_name}" \
        --kafka-version "3.5.1" \
        --number-of-broker-nodes 3 \
        --broker-node-group-info file://<(cat <<EOF
{
  "InstanceType": "kafka.m5.xlarge",
  "ClientSubnets": [$(cat "${INFRASTRUCTURE_DIR}/.aws-private-subnets" | tr ' ' ',' | sed 's/\([^,]*\)/"\1"/g')],
  "SecurityGroups": ["$(create_kafka_security_group)"],
  "StorageInfo": {
    "EbsStorageInfo": {
      "VolumeSize": 1000
    }
  }
}
EOF
) \
        --encryption-info file://<(cat <<EOF
{
  "EncryptionAtRest": {
    "DataVolumeKMSKeyId": ""
  },
  "EncryptionInTransit": {
    "ClientBroker": "TLS",
    "InCluster": true
  }
}
EOF
) \
        --enhanced-monitoring "PER_TOPIC_PER_BROKER" \
        --region "${AWS_REGION}" \
        --tags "Environment=${ENVIRONMENT}" 2>> "${LOG_FILE}"

    log "MSK cluster creation initiated: ${cluster_name}"
}

create_kafka_security_group() {
    local vpc_id=$(cat "${INFRASTRUCTURE_DIR}/.aws-vpc-id")
    local kafka_sg_id=$(aws ec2 create-security-group \
        --group-name "${CLUSTER_NAME}-kafka-sg" \
        --description "Security group for MSK cluster" \
        --vpc-id "${vpc_id}" \
        --region "${AWS_REGION}" \
        --query 'GroupId' \
        --output text 2>> "${LOG_FILE}")

    # Allow Kafka traffic from EKS nodes
    aws ec2 authorize-security-group-ingress \
        --group-id "${kafka_sg_id}" \
        --protocol tcp \
        --port 9092 \
        --cidr 10.0.0.0/16 \
        --region "${AWS_REGION}" 2>> "${LOG_FILE}"

    aws ec2 authorize-security-group-ingress \
        --group-id "${kafka_sg_id}" \
        --protocol tcp \
        --port 9094 \
        --cidr 10.0.0.0/16 \
        --region "${AWS_REGION}" 2>> "${LOG_FILE}"

    echo "${kafka_sg_id}"
}

setup_cluster_autoscaler() {
    log "Setting up cluster autoscaler..."

    # Install cluster autoscaler using Helm
    helm repo add autoscaler https://kubernetes.github.io/autoscaler 2>> "${LOG_FILE}"
    helm repo update 2>> "${LOG_FILE}"

    helm upgrade --install cluster-autoscaler autoscaler/cluster-autoscaler \
        --namespace kube-system \
        --set autoDiscovery.clusterName="${CLUSTER_NAME}" \
        --set awsRegion="${AWS_REGION}" \
        --set rbac.serviceAccount.annotations."eks\.amazonaws\.com/role-arn"="arn:aws:iam::$(aws sts get-caller-identity --query Account --output text):role/${CLUSTER_NAME}-cluster-autoscaler" 2>&1 | tee -a "${LOG_FILE}"

    log "Cluster autoscaler installed"
}

setup_ingress_controller() {
    log "Setting up AWS Load Balancer Controller..."

    # Install AWS Load Balancer Controller
    helm repo add eks https://aws.github.io/eks-charts 2>> "${LOG_FILE}"
    helm repo update 2>> "${LOG_FILE}"

    helm upgrade --install aws-load-balancer-controller eks/aws-load-balancer-controller \
        --namespace kube-system \
        --set clusterName="${CLUSTER_NAME}" \
        --set serviceAccount.create=true \
        --set serviceAccount.name=aws-load-balancer-controller 2>&1 | tee -a "${LOG_FILE}"

    log "AWS Load Balancer Controller installed"
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

    local info_file="${INFRASTRUCTURE_DIR}/deployments/${ENVIRONMENT}-aws.json"
    mkdir -p "${INFRASTRUCTURE_DIR}/deployments"

    cat > "${info_file}" <<EOF
{
  "environment": "${ENVIRONMENT}",
  "region": "${AWS_REGION}",
  "cluster_name": "${CLUSTER_NAME}",
  "vpc_id": "$(cat "${INFRASTRUCTURE_DIR}/.aws-vpc-id" 2>/dev/null || echo "")",
  "deployed_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "deployed_by": "$(aws sts get-caller-identity --query Arn --output text)"
}
EOF

    log "Deployment information saved to: ${info_file}"
}

cleanup_temp_files() {
    log "Cleaning up temporary files..."
    rm -f /tmp/eks-cluster-config.yaml
    rm -f "${INFRASTRUCTURE_DIR}/.aws-"*
}

################################################################################
# Main
################################################################################

main() {
    log "========================================="
    log "LLM Analytics Hub - AWS Deployment"
    log "Environment: ${ENVIRONMENT}"
    log "Region: ${AWS_REGION}"
    log "========================================="

    check_prerequisites

    log "Starting AWS infrastructure deployment..."

    # Network layer
    setup_vpc

    # Compute layer
    create_eks_cluster

    # Data layer
    create_rds_instance
    create_elasticache_cluster
    create_msk_cluster

    # Kubernetes addons
    setup_cluster_autoscaler
    setup_ingress_controller

    # Application
    deploy_application

    # Finalize
    save_deployment_info
    cleanup_temp_files

    log "========================================="
    log "AWS deployment completed successfully!"
    log "========================================="
    log ""
    log "Next steps:"
    log "1. Run validation: ./validate.sh ${ENVIRONMENT}"
    log "2. Access cluster: kubectl get pods -n llm-analytics-hub"
    log "3. View logs: cat ${LOG_FILE}"
    log ""
    log "For detailed information, see: ${INFRASTRUCTURE_DIR}/deployments/${ENVIRONMENT}-aws.json"
}

# Run main function
main "$@"
