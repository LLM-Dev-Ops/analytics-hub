.PHONY: help init plan apply destroy clean validate fmt lint

# Default environment
ENV ?= dev

# Colors for output
RED := \033[0;31m
GREEN := \033[0;32m
YELLOW := \033[0;33m
NC := \033[0m # No Color

help: ## Show this help message
	@echo "$(GREEN)LLM Analytics Hub - Azure Infrastructure$(NC)"
	@echo ""
	@echo "$(YELLOW)Usage:$(NC)"
	@echo "  make [target] ENV=[dev|staging|production]"
	@echo ""
	@echo "$(YELLOW)Targets:$(NC)"
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  $(GREEN)%-15s$(NC) %s\n", $$1, $$2}'

init: ## Initialize Terraform
	@echo "$(GREEN)Initializing Terraform for $(ENV) environment...$(NC)"
	@if [ -f "backend.hcl" ]; then \
		terraform init -backend-config="backend.hcl" -upgrade; \
	else \
		echo "$(RED)Error: backend.hcl not found$(NC)"; \
		echo "$(YELLOW)Create backend.hcl with your backend configuration$(NC)"; \
		exit 1; \
	fi

validate: ## Validate Terraform configuration
	@echo "$(GREEN)Validating Terraform configuration...$(NC)"
	@terraform validate

fmt: ## Format Terraform files
	@echo "$(GREEN)Formatting Terraform files...$(NC)"
	@terraform fmt -recursive

fmt-check: ## Check if Terraform files are formatted
	@echo "$(GREEN)Checking Terraform formatting...$(NC)"
	@terraform fmt -check -recursive

lint: validate fmt-check ## Run all linting checks
	@echo "$(GREEN)Running linting checks...$(NC)"

plan: ## Create Terraform plan
	@echo "$(GREEN)Creating Terraform plan for $(ENV) environment...$(NC)"
	@if [ ! -f "$(ENV).tfvars" ]; then \
		echo "$(RED)Error: $(ENV).tfvars not found$(NC)"; \
		echo "$(YELLOW)Create $(ENV).tfvars from terraform.tfvars.example$(NC)"; \
		exit 1; \
	fi
	@terraform plan -var-file="$(ENV).tfvars" -out="$(ENV).tfplan"

apply: ## Apply Terraform plan
	@echo "$(GREEN)Applying Terraform plan for $(ENV) environment...$(NC)"
	@if [ ! -f "$(ENV).tfplan" ]; then \
		echo "$(RED)Error: $(ENV).tfplan not found$(NC)"; \
		echo "$(YELLOW)Run 'make plan ENV=$(ENV)' first$(NC)"; \
		exit 1; \
	fi
	@terraform apply "$(ENV).tfplan"
	@rm -f "$(ENV).tfplan"

deploy: init lint plan apply ## Full deployment (init, lint, plan, apply)
	@echo "$(GREEN)Deployment complete for $(ENV) environment!$(NC)"

destroy-plan: ## Create destroy plan
	@echo "$(YELLOW)Creating destroy plan for $(ENV) environment...$(NC)"
	@terraform plan -destroy -var-file="$(ENV).tfvars" -out="$(ENV)-destroy.tfplan"

destroy: ## Destroy infrastructure (requires confirmation)
	@echo "$(RED)WARNING: This will destroy all infrastructure in $(ENV) environment!$(NC)"
	@echo "$(YELLOW)Press Ctrl+C to cancel, or Enter to continue...$(NC)"
	@read confirm
	@if [ -f "$(ENV)-destroy.tfplan" ]; then \
		terraform apply "$(ENV)-destroy.tfplan"; \
		rm -f "$(ENV)-destroy.tfplan"; \
	else \
		echo "$(RED)Error: $(ENV)-destroy.tfplan not found$(NC)"; \
		echo "$(YELLOW)Run 'make destroy-plan ENV=$(ENV)' first$(NC)"; \
		exit 1; \
	fi

clean: ## Clean Terraform files
	@echo "$(GREEN)Cleaning Terraform files...$(NC)"
	@rm -rf .terraform/
	@rm -f .terraform.lock.hcl
	@rm -f *.tfplan
	@rm -f *.backup

output: ## Show Terraform outputs
	@echo "$(GREEN)Terraform outputs for $(ENV) environment:$(NC)"
	@terraform output

output-json: ## Show Terraform outputs in JSON format
	@terraform output -json

kubeconfig: ## Get kubeconfig for AKS cluster
	@echo "$(GREEN)Fetching kubeconfig for $(ENV) environment...$(NC)"
	@az aks get-credentials \
		--resource-group $$(terraform output -raw resource_group_name) \
		--name $$(terraform output -raw aks_cluster_name) \
		--overwrite-existing
	@echo "$(GREEN)Kubeconfig updated successfully!$(NC)"
	@kubectl config current-context

verify: ## Verify AKS cluster
	@echo "$(GREEN)Verifying AKS cluster...$(NC)"
	@kubectl get nodes
	@kubectl get pods --all-namespaces

cost-estimate: ## Show cost estimate (requires infracost)
	@if command -v infracost &> /dev/null; then \
		echo "$(GREEN)Generating cost estimate for $(ENV) environment...$(NC)"; \
		infracost breakdown --path . --terraform-var-file=$(ENV).tfvars; \
	else \
		echo "$(YELLOW)infracost not installed. Install from: https://www.infracost.io/docs/$(NC)"; \
	fi

docs: ## Generate Terraform documentation
	@if command -v terraform-docs &> /dev/null; then \
		echo "$(GREEN)Generating Terraform documentation...$(NC)"; \
		terraform-docs markdown table . > TERRAFORM_DOCS.md; \
		echo "$(GREEN)Documentation generated in TERRAFORM_DOCS.md$(NC)"; \
	else \
		echo "$(YELLOW)terraform-docs not installed. Install from: https://github.com/terraform-docs/terraform-docs$(NC)"; \
	fi

graph: ## Generate dependency graph
	@echo "$(GREEN)Generating dependency graph...$(NC)"
	@terraform graph | dot -Tpng > graph.png
	@echo "$(GREEN)Graph saved to graph.png$(NC)"

security-scan: ## Run security scan with tfsec
	@if command -v tfsec &> /dev/null; then \
		echo "$(GREEN)Running security scan...$(NC)"; \
		tfsec .; \
	else \
		echo "$(YELLOW)tfsec not installed. Install from: https://github.com/aquasecurity/tfsec$(NC)"; \
	fi

checkov-scan: ## Run security scan with checkov
	@if command -v checkov &> /dev/null; then \
		echo "$(GREEN)Running Checkov security scan...$(NC)"; \
		checkov -d .; \
	else \
		echo "$(YELLOW)checkov not installed. Install with: pip install checkov$(NC)"; \
	fi

.DEFAULT_GOAL := help
