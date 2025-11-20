.PHONY: help init plan apply deploy destroy clean validate fmt check setup addons

# Colors
GREEN  := $(shell tput -Txterm setaf 2)
YELLOW := $(shell tput -Txterm setaf 3)
RESET  := $(shell tput -Txterm sgr0)

# Variables
TERRAFORM := terraform
REGION    := us-east-1

help: ## Show this help
	@echo ''
	@echo 'Usage:'
	@echo '  ${YELLOW}make${RESET} ${GREEN}<target>${RESET}'
	@echo ''
	@echo 'Targets:'
	@awk 'BEGIN {FS = ":.*?## "} { \
		if (/^[a-zA-Z_-]+:.*?##.*$$/) {printf "  ${YELLOW}%-20s${GREEN}%s${RESET}\n", $$1, $$2} \
		else if (/^## .*$$/) {printf "  ${GREEN}%s${RESET}\n", substr($$1,4)} \
		}' $(MAKEFILE_LIST)

## Setup and Initialization

setup: ## Run initial setup (creates backend, configures terraform)
	@echo "${GREEN}Running setup...${RESET}"
	./scripts/setup.sh

init: ## Initialize Terraform
	@echo "${GREEN}Initializing Terraform...${RESET}"
	@if [ -f backend.hcl ]; then \
		$(TERRAFORM) init -backend-config=backend.hcl; \
	else \
		$(TERRAFORM) init; \
	fi

init-upgrade: ## Initialize Terraform with upgrade
	@echo "${GREEN}Initializing Terraform with upgrade...${RESET}"
	@if [ -f backend.hcl ]; then \
		$(TERRAFORM) init -upgrade -backend-config=backend.hcl; \
	else \
		$(TERRAFORM) init -upgrade; \
	fi

## Planning and Deployment

validate: ## Validate Terraform configuration
	@echo "${GREEN}Validating configuration...${RESET}"
	$(TERRAFORM) validate

fmt: ## Format Terraform files
	@echo "${GREEN}Formatting Terraform files...${RESET}"
	$(TERRAFORM) fmt -recursive

check: validate fmt ## Run validation and formatting

plan: ## Create Terraform plan
	@echo "${GREEN}Creating plan...${RESET}"
	$(TERRAFORM) plan -out=tfplan

plan-destroy: ## Create destroy plan
	@echo "${GREEN}Creating destroy plan...${RESET}"
	$(TERRAFORM) plan -destroy -out=tfplan-destroy

apply: ## Apply Terraform plan (requires plan file)
	@echo "${GREEN}Applying plan...${RESET}"
	@if [ ! -f tfplan ]; then \
		echo "${YELLOW}No plan file found. Run 'make plan' first.${RESET}"; \
		exit 1; \
	fi
	$(TERRAFORM) apply tfplan
	@rm -f tfplan

deploy: ## Full deployment (plan + apply)
	@echo "${GREEN}Running full deployment...${RESET}"
	./scripts/deploy.sh

destroy: ## Destroy infrastructure
	@echo "${GREEN}Destroying infrastructure...${RESET}"
	./scripts/destroy.sh

## Post-deployment

addons: ## Install cluster add-ons
	@echo "${GREEN}Installing add-ons...${RESET}"
	./scripts/install-addons.sh

kubeconfig: ## Update kubeconfig
	@echo "${GREEN}Updating kubeconfig...${RESET}"
	@CLUSTER_NAME=$$($(TERRAFORM) output -raw cluster_name 2>/dev/null); \
	if [ -n "$$CLUSTER_NAME" ]; then \
		aws eks update-kubeconfig --region $(REGION) --name $$CLUSTER_NAME; \
		echo "${GREEN}✓ kubeconfig updated${RESET}"; \
	else \
		echo "${YELLOW}Could not retrieve cluster name${RESET}"; \
	fi

## Information

output: ## Show Terraform outputs
	@$(TERRAFORM) output

output-json: ## Show Terraform outputs in JSON
	@$(TERRAFORM) output -json

show: ## Show current state
	@$(TERRAFORM) show

graph: ## Generate dependency graph
	@$(TERRAFORM) graph | dot -Tpng > graph.png
	@echo "${GREEN}Graph saved to graph.png${RESET}"

state-list: ## List resources in state
	@$(TERRAFORM) state list

## Maintenance

refresh: ## Refresh Terraform state
	@echo "${GREEN}Refreshing state...${RESET}"
	$(TERRAFORM) refresh

import: ## Import existing resource (usage: make import RESOURCE=aws_vpc.main ID=vpc-123)
	@if [ -z "$(RESOURCE)" ] || [ -z "$(ID)" ]; then \
		echo "${YELLOW}Usage: make import RESOURCE=<resource> ID=<id>${RESET}"; \
		exit 1; \
	fi
	$(TERRAFORM) import $(RESOURCE) $(ID)

## Cleanup

clean: ## Clean temporary files
	@echo "${GREEN}Cleaning temporary files...${RESET}"
	rm -f tfplan tfplan-destroy
	rm -f terraform.tfstate.backup
	rm -f graph.png
	@echo "${GREEN}✓ Cleanup complete${RESET}"

clean-all: clean ## Clean all Terraform files (including state)
	@echo "${YELLOW}WARNING: This will remove all Terraform state and cache${RESET}"
	@read -p "Are you sure? [y/N] " -n 1 -r; \
	echo; \
	if [[ $$REPLY =~ ^[Yy]$$ ]]; then \
		rm -rf .terraform .terraform.lock.hcl; \
		echo "${GREEN}✓ All cleaned${RESET}"; \
	fi

## Testing and Validation

cost: ## Estimate infrastructure cost (requires infracost)
	@if command -v infracost &> /dev/null; then \
		$(TERRAFORM) plan -out=tfplan; \
		infracost breakdown --path tfplan; \
		rm -f tfplan; \
	else \
		echo "${YELLOW}infracost not installed${RESET}"; \
		echo "Install from: https://www.infracost.io/docs/"; \
	fi

security: ## Run security scan (requires tfsec)
	@if command -v tfsec &> /dev/null; then \
		tfsec .; \
	else \
		echo "${YELLOW}tfsec not installed${RESET}"; \
		echo "Install from: https://github.com/aquasecurity/tfsec"; \
	fi

lint: ## Run Terraform linting (requires tflint)
	@if command -v tflint &> /dev/null; then \
		tflint; \
	else \
		echo "${YELLOW}tflint not installed${RESET}"; \
		echo "Install from: https://github.com/terraform-linters/tflint"; \
	fi

docs: ## Generate documentation (requires terraform-docs)
	@if command -v terraform-docs &> /dev/null; then \
		terraform-docs markdown table . > TERRAFORM.md; \
		echo "${GREEN}✓ Documentation generated in TERRAFORM.md${RESET}"; \
	else \
		echo "${YELLOW}terraform-docs not installed${RESET}"; \
		echo "Install from: https://terraform-docs.io/"; \
	fi

## Workflows

dev: ## Deploy to dev environment
	@echo "${GREEN}Deploying to dev environment...${RESET}"
	@$(TERRAFORM) workspace select dev || $(TERRAFORM) workspace new dev
	@$(MAKE) deploy

staging: ## Deploy to staging environment
	@echo "${GREEN}Deploying to staging environment...${RESET}"
	@$(TERRAFORM) workspace select staging || $(TERRAFORM) workspace new staging
	@$(MAKE) deploy

prod: ## Deploy to prod environment
	@echo "${GREEN}Deploying to prod environment...${RESET}"
	@$(TERRAFORM) workspace select prod || $(TERRAFORM) workspace new prod
	@$(MAKE) deploy

workspace-list: ## List workspaces
	@$(TERRAFORM) workspace list

workspace-show: ## Show current workspace
	@$(TERRAFORM) workspace show

## Kubernetes helpers

k8s-nodes: ## Show Kubernetes nodes
	@kubectl get nodes

k8s-pods: ## Show all pods
	@kubectl get pods -A

k8s-services: ## Show all services
	@kubectl get svc -A

k8s-test: kubeconfig k8s-nodes k8s-pods ## Test Kubernetes connectivity

## Complete workflows

all: setup plan apply addons ## Complete setup and deployment
	@echo "${GREEN}✓ Complete deployment finished${RESET}"

ci: init validate fmt plan ## CI/CD validation workflow
	@echo "${GREEN}✓ CI checks passed${RESET}"

.DEFAULT_GOAL := help
