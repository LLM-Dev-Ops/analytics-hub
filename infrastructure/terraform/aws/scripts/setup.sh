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
REGION="${AWS_REGION:-us-east-1}"
STATE_BUCKET="${TF_STATE_BUCKET:-}"
STATE_TABLE="${TF_STATE_TABLE:-terraform-state-lock}"

echo -e "${GREEN}=== LLM Analytics Hub - EKS Setup Script ===${NC}\n"

# Check prerequisites
check_prerequisites() {
    echo -e "${YELLOW}Checking prerequisites...${NC}"

    local missing=0

    # Check AWS CLI
    if ! command -v aws &> /dev/null; then
        echo -e "${RED}✗ AWS CLI not found${NC}"
        missing=1
    else
        echo -e "${GREEN}✓ AWS CLI installed${NC}"
    fi

    # Check Terraform
    if ! command -v terraform &> /dev/null; then
        echo -e "${RED}✗ Terraform not found${NC}"
        missing=1
    else
        echo -e "${GREEN}✓ Terraform installed ($(terraform version -json | jq -r '.terraform_version'))${NC}"
    fi

    # Check kubectl
    if ! command -v kubectl &> /dev/null; then
        echo -e "${YELLOW}⚠ kubectl not found (optional for now)${NC}"
    else
        echo -e "${GREEN}✓ kubectl installed${NC}"
    fi

    # Check jq
    if ! command -v jq &> /dev/null; then
        echo -e "${YELLOW}⚠ jq not found (recommended)${NC}"
    else
        echo -e "${GREEN}✓ jq installed${NC}"
    fi

    if [ $missing -ne 0 ]; then
        echo -e "\n${RED}Please install missing prerequisites${NC}"
        exit 1
    fi

    echo ""
}

# Check AWS credentials
check_aws_credentials() {
    echo -e "${YELLOW}Checking AWS credentials...${NC}"

    if ! aws sts get-caller-identity &> /dev/null; then
        echo -e "${RED}✗ AWS credentials not configured${NC}"
        echo "Run: aws configure"
        exit 1
    fi

    local account_id=$(aws sts get-caller-identity --query Account --output text)
    local user_arn=$(aws sts get-caller-identity --query Arn --output text)

    echo -e "${GREEN}✓ AWS credentials configured${NC}"
    echo "  Account: $account_id"
    echo "  User: $user_arn"
    echo ""
}

# Setup Terraform backend
setup_backend() {
    echo -e "${YELLOW}Setting up Terraform backend...${NC}"

    if [ -z "$STATE_BUCKET" ]; then
        echo -e "${YELLOW}No state bucket specified. Skipping backend setup.${NC}"
        echo "Set TF_STATE_BUCKET environment variable to enable remote state."
        echo ""
        return
    fi

    # Check if bucket exists
    if aws s3 ls "s3://$STATE_BUCKET" 2>&1 | grep -q 'NoSuchBucket'; then
        echo "Creating S3 bucket: $STATE_BUCKET"

        if [ "$REGION" == "us-east-1" ]; then
            aws s3api create-bucket \
                --bucket "$STATE_BUCKET" \
                --region "$REGION"
        else
            aws s3api create-bucket \
                --bucket "$STATE_BUCKET" \
                --region "$REGION" \
                --create-bucket-configuration LocationConstraint="$REGION"
        fi

        # Enable versioning
        aws s3api put-bucket-versioning \
            --bucket "$STATE_BUCKET" \
            --versioning-configuration Status=Enabled

        # Enable encryption
        aws s3api put-bucket-encryption \
            --bucket "$STATE_BUCKET" \
            --server-side-encryption-configuration '{
                "Rules": [{
                    "ApplyServerSideEncryptionByDefault": {
                        "SSEAlgorithm": "AES256"
                    }
                }]
            }'

        # Block public access
        aws s3api put-public-access-block \
            --bucket "$STATE_BUCKET" \
            --public-access-block-configuration \
                BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true

        echo -e "${GREEN}✓ S3 bucket created and configured${NC}"
    else
        echo -e "${GREEN}✓ S3 bucket already exists${NC}"
    fi

    # Check if DynamoDB table exists
    if ! aws dynamodb describe-table --table-name "$STATE_TABLE" --region "$REGION" &> /dev/null; then
        echo "Creating DynamoDB table: $STATE_TABLE"

        aws dynamodb create-table \
            --table-name "$STATE_TABLE" \
            --attribute-definitions AttributeName=LockID,AttributeType=S \
            --key-schema AttributeName=LockID,KeyType=HASH \
            --billing-mode PAY_PER_REQUEST \
            --region "$REGION" \
            --tags Key=Project,Value=llm-analytics-hub Key=ManagedBy,Value=Terraform

        echo "Waiting for table to be active..."
        aws dynamodb wait table-exists --table-name "$STATE_TABLE" --region "$REGION"

        echo -e "${GREEN}✓ DynamoDB table created${NC}"
    else
        echo -e "${GREEN}✓ DynamoDB table already exists${NC}"
    fi

    # Create backend config file
    cat > "$PROJECT_ROOT/backend.hcl" <<EOF
bucket         = "$STATE_BUCKET"
key            = "llm-analytics-hub/eks/terraform.tfstate"
region         = "$REGION"
encrypt        = true
dynamodb_table = "$STATE_TABLE"
EOF

    echo -e "${GREEN}✓ Backend configuration created${NC}"
    echo ""
}

# Initialize Terraform
init_terraform() {
    echo -e "${YELLOW}Initializing Terraform...${NC}"

    cd "$PROJECT_ROOT"

    if [ -f "backend.hcl" ]; then
        terraform init -backend-config=backend.hcl
    else
        terraform init
    fi

    echo -e "${GREEN}✓ Terraform initialized${NC}"
    echo ""
}

# Validate configuration
validate_config() {
    echo -e "${YELLOW}Validating Terraform configuration...${NC}"

    cd "$PROJECT_ROOT"

    if ! terraform validate; then
        echo -e "${RED}✗ Terraform validation failed${NC}"
        exit 1
    fi

    echo -e "${GREEN}✓ Configuration is valid${NC}"
    echo ""
}

# Create tfvars if not exists
setup_tfvars() {
    echo -e "${YELLOW}Setting up terraform.tfvars...${NC}"

    cd "$PROJECT_ROOT"

    if [ ! -f "terraform.tfvars" ]; then
        cp terraform.tfvars.example terraform.tfvars
        echo -e "${GREEN}✓ terraform.tfvars created from example${NC}"
        echo -e "${YELLOW}⚠ Please edit terraform.tfvars with your settings${NC}"
    else
        echo -e "${GREEN}✓ terraform.tfvars already exists${NC}"
    fi

    echo ""
}

# Main execution
main() {
    check_prerequisites
    check_aws_credentials
    setup_backend
    setup_tfvars
    init_terraform
    validate_config

    echo -e "${GREEN}=== Setup Complete ===${NC}\n"
    echo "Next steps:"
    echo "1. Edit terraform.tfvars with your configuration"
    echo "2. Run: terraform plan -out=tfplan"
    echo "3. Review the plan carefully"
    echo "4. Run: terraform apply tfplan"
    echo ""
}

main "$@"
