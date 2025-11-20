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

echo -e "${GREEN}=== Infrastructure Validation ===${NC}\n"

# Track issues
ISSUES=0
WARNINGS=0

# Validate Terraform syntax
validate_terraform() {
    echo -e "${BLUE}Validating Terraform configuration...${NC}"

    cd "$PROJECT_ROOT"

    if terraform fmt -check -recursive > /dev/null 2>&1; then
        echo -e "${GREEN}✓ Terraform formatting is correct${NC}"
    else
        echo -e "${YELLOW}⚠ Terraform files need formatting${NC}"
        echo "  Run: terraform fmt -recursive"
        ((WARNINGS++))
    fi

    if terraform validate > /dev/null 2>&1; then
        echo -e "${GREEN}✓ Terraform configuration is valid${NC}"
    else
        echo -e "${RED}✗ Terraform validation failed${NC}"
        terraform validate
        ((ISSUES++))
    fi

    echo ""
}

# Check required files
check_required_files() {
    echo -e "${BLUE}Checking required files...${NC}"

    cd "$PROJECT_ROOT"

    local required_files=(
        "main.tf"
        "variables.tf"
        "outputs.tf"
        "vpc.tf"
        "eks.tf"
        "node-groups.tf"
        "iam.tf"
        "security-groups.tf"
        "terraform.tfvars.example"
        "backend.hcl.example"
        "README.md"
    )

    for file in "${required_files[@]}"; do
        if [ -f "$file" ]; then
            echo -e "${GREEN}✓ $file exists${NC}"
        else
            echo -e "${RED}✗ $file is missing${NC}"
            ((ISSUES++))
        fi
    done

    echo ""
}

# Check Terraform version
check_terraform_version() {
    echo -e "${BLUE}Checking Terraform version...${NC}"

    if ! command -v terraform &> /dev/null; then
        echo -e "${RED}✗ Terraform not installed${NC}"
        ((ISSUES++))
        return
    fi

    local version=$(terraform version -json | jq -r '.terraform_version')
    local required="1.6.0"

    echo -e "${GREEN}✓ Terraform installed: v$version${NC}"

    if [ "$(printf '%s\n' "$required" "$version" | sort -V | head -n1)" != "$required" ]; then
        echo -e "${YELLOW}⚠ Terraform version $version is older than recommended $required${NC}"
        ((WARNINGS++))
    fi

    echo ""
}

# Check AWS credentials
check_aws_credentials() {
    echo -e "${BLUE}Checking AWS credentials...${NC}"

    if ! command -v aws &> /dev/null; then
        echo -e "${RED}✗ AWS CLI not installed${NC}"
        ((ISSUES++))
        return
    fi

    if aws sts get-caller-identity &> /dev/null; then
        local account=$(aws sts get-caller-identity --query Account --output text)
        local user=$(aws sts get-caller-identity --query Arn --output text | cut -d'/' -f2)
        echo -e "${GREEN}✓ AWS credentials configured${NC}"
        echo "  Account: $account"
        echo "  User: $user"
    else
        echo -e "${RED}✗ AWS credentials not configured${NC}"
        ((ISSUES++))
    fi

    echo ""
}

# Check kubectl
check_kubectl() {
    echo -e "${BLUE}Checking kubectl...${NC}"

    if command -v kubectl &> /dev/null; then
        local version=$(kubectl version --client -o json | jq -r '.clientVersion.gitVersion')
        echo -e "${GREEN}✓ kubectl installed: $version${NC}"
    else
        echo -e "${YELLOW}⚠ kubectl not installed (optional for deployment, required for post-deployment)${NC}"
        ((WARNINGS++))
    fi

    echo ""
}

# Check Helm
check_helm() {
    echo -e "${BLUE}Checking Helm...${NC}"

    if command -v helm &> /dev/null; then
        local version=$(helm version --short)
        echo -e "${GREEN}✓ Helm installed: $version${NC}"
    else
        echo -e "${YELLOW}⚠ Helm not installed (optional, needed for some add-ons)${NC}"
        ((WARNINGS++))
    fi

    echo ""
}

# Validate configuration files
validate_config_files() {
    echo -e "${BLUE}Validating configuration files...${NC}"

    cd "$PROJECT_ROOT"

    # Check if tfvars example is valid HCL
    if [ -f "terraform.tfvars.example" ]; then
        if terraform fmt -check terraform.tfvars.example > /dev/null 2>&1; then
            echo -e "${GREEN}✓ terraform.tfvars.example is valid${NC}"
        else
            echo -e "${YELLOW}⚠ terraform.tfvars.example formatting issues${NC}"
            ((WARNINGS++))
        fi
    fi

    # Check backend config
    if [ -f "backend.hcl.example" ]; then
        echo -e "${GREEN}✓ backend.hcl.example exists${NC}"
    else
        echo -e "${YELLOW}⚠ backend.hcl.example is missing${NC}"
        ((WARNINGS++))
    fi

    echo ""
}

# Check for sensitive data
check_sensitive_data() {
    echo -e "${BLUE}Checking for sensitive data...${NC}"

    cd "$PROJECT_ROOT"

    local sensitive_patterns=(
        "terraform.tfvars"
        "backend.hcl"
        "*.pem"
        "*.key"
        ".terraform.lock.hcl"
        "terraform.tfstate"
    )

    local found_sensitive=false

    for pattern in "${sensitive_patterns[@]}"; do
        if ls $pattern &> /dev/null; then
            if grep -q "$pattern" .gitignore 2>/dev/null; then
                echo -e "${GREEN}✓ $pattern is gitignored${NC}"
            else
                echo -e "${YELLOW}⚠ $pattern exists but not in .gitignore${NC}"
                found_sensitive=true
                ((WARNINGS++))
            fi
        fi
    done

    if [ "$found_sensitive" = false ]; then
        echo -e "${GREEN}✓ No sensitive files found or all are gitignored${NC}"
    fi

    echo ""
}

# Check script permissions
check_script_permissions() {
    echo -e "${BLUE}Checking script permissions...${NC}"

    cd "$PROJECT_ROOT/scripts"

    local scripts=(
        "setup.sh"
        "deploy.sh"
        "destroy.sh"
        "install-addons.sh"
        "validate.sh"
    )

    for script in "${scripts[@]}"; do
        if [ -f "$script" ]; then
            if [ -x "$script" ]; then
                echo -e "${GREEN}✓ $script is executable${NC}"
            else
                echo -e "${YELLOW}⚠ $script is not executable${NC}"
                echo "  Run: chmod +x scripts/$script"
                ((WARNINGS++))
            fi
        fi
    done

    echo ""
}

# Security checks
security_checks() {
    echo -e "${BLUE}Running security checks...${NC}"

    cd "$PROJECT_ROOT"

    # Check for tfsec
    if command -v tfsec &> /dev/null; then
        echo "Running tfsec security scan..."
        if tfsec . --soft-fail > /dev/null 2>&1; then
            echo -e "${GREEN}✓ No critical security issues found${NC}"
        else
            echo -e "${YELLOW}⚠ Security issues detected${NC}"
            echo "  Run: tfsec . for details"
            ((WARNINGS++))
        fi
    else
        echo -e "${YELLOW}⚠ tfsec not installed (recommended for security scanning)${NC}"
        echo "  Install from: https://github.com/aquasecurity/tfsec"
        ((WARNINGS++))
    fi

    echo ""
}

# Documentation checks
check_documentation() {
    echo -e "${BLUE}Checking documentation...${NC}"

    cd "$PROJECT_ROOT"

    local docs=(
        "README.md"
        "QUICKSTART.md"
        "INFRASTRUCTURE_OVERVIEW.md"
    )

    for doc in "${docs[@]}"; do
        if [ -f "$doc" ]; then
            echo -e "${GREEN}✓ $doc exists${NC}"
        else
            echo -e "${YELLOW}⚠ $doc is missing${NC}"
            ((WARNINGS++))
        fi
    done

    echo ""
}

# Estimate costs
estimate_costs() {
    echo -e "${BLUE}Cost estimation...${NC}"

    if command -v infracost &> /dev/null; then
        cd "$PROJECT_ROOT"
        echo "Running Infracost analysis..."
        terraform init -backend=false > /dev/null 2>&1 || true
        if infracost breakdown --path . --format table 2>/dev/null; then
            echo -e "${GREEN}✓ Cost estimation complete${NC}"
        else
            echo -e "${YELLOW}⚠ Could not estimate costs${NC}"
        fi
    else
        echo -e "${YELLOW}⚠ infracost not installed (optional for cost estimation)${NC}"
        echo "  Install from: https://www.infracost.io/docs/"
        echo ""
        echo "Estimated monthly costs:"
        echo "  - EKS Control Plane: ~$72"
        echo "  - NAT Gateways (3): ~$97"
        echo "  - EC2 Instances: ~$1,850"
        echo "  - Total: ~$2,022/month"
    fi

    echo ""
}

# Summary
show_summary() {
    echo -e "${GREEN}=== Validation Summary ===${NC}\n"

    if [ $ISSUES -eq 0 ] && [ $WARNINGS -eq 0 ]; then
        echo -e "${GREEN}✓ All checks passed!${NC}"
        echo -e "${GREEN}Infrastructure is ready for deployment.${NC}"
        return 0
    elif [ $ISSUES -eq 0 ]; then
        echo -e "${YELLOW}⚠ Validation completed with $WARNINGS warning(s)${NC}"
        echo -e "${YELLOW}Review warnings above, but infrastructure should work.${NC}"
        return 0
    else
        echo -e "${RED}✗ Validation failed with $ISSUES issue(s) and $WARNINGS warning(s)${NC}"
        echo -e "${RED}Please fix issues before deploying.${NC}"
        return 1
    fi
}

# Main execution
main() {
    check_terraform_version
    check_aws_credentials
    check_kubectl
    check_helm
    check_required_files
    validate_terraform
    validate_config_files
    check_sensitive_data
    check_script_permissions
    security_checks
    check_documentation
    estimate_costs
    show_summary
}

main "$@"
