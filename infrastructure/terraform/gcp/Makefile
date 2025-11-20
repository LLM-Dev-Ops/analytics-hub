# Makefile for GCP GKE Terraform Infrastructure
# LLM Analytics Hub

.PHONY: help init plan apply destroy validate format lint clean install-tools

# Variables
TERRAFORM := terraform
GCLOUD := gcloud
KUBECTL := kubectl
REGION := us-central1
ENV := prod

help: ## Show this help message
	@echo 'Usage: make [target]'
	@echo ''
	@echo 'Available targets:'
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-20s\033[0m %s\n", $$1, $$2}'

install-tools: ## Install required tools (macOS)
	@echo "Installing required tools..."
	@command -v brew >/dev/null 2>&1 || { echo "Homebrew not found. Install from https://brew.sh"; exit 1; }
	brew install terraform
	brew install --cask google-cloud-sdk
	brew install kubectl
	brew install helm
	@echo "Tools installed successfully!"

init: ## Initialize Terraform
	@echo "Initializing Terraform..."
	$(TERRAFORM) init -upgrade

validate: ## Validate Terraform configuration
	@echo "Validating Terraform configuration..."
	$(TERRAFORM) validate

format: ## Format Terraform files
	@echo "Formatting Terraform files..."
	$(TERRAFORM) fmt -recursive

lint: ## Run tfsec security scanner
	@echo "Running security scan with tfsec..."
	@command -v tfsec >/dev/null 2>&1 || { echo "tfsec not found. Install: brew install tfsec"; exit 1; }
	tfsec .

plan: validate ## Create Terraform execution plan
	@echo "Creating Terraform plan..."
	$(TERRAFORM) plan -out=tfplan

apply: ## Apply Terraform changes
	@echo "Applying Terraform changes..."
	$(TERRAFORM) apply tfplan

apply-auto: validate ## Apply Terraform changes without confirmation
	@echo "Applying Terraform changes (auto-approve)..."
	$(TERRAFORM) apply -auto-approve

destroy: ## Destroy all Terraform resources
	@echo "WARNING: This will destroy all resources!"
	@echo "Press Ctrl+C to cancel, or Enter to continue..."
	@read
	$(TERRAFORM) destroy

destroy-auto: ## Destroy all resources without confirmation
	@echo "Destroying all resources (auto-approve)..."
	$(TERRAFORM) destroy -auto-approve

output: ## Show Terraform outputs
	@echo "Terraform outputs:"
	$(TERRAFORM) output

output-json: ## Show Terraform outputs in JSON
	$(TERRAFORM) output -json

get-credentials: ## Get GKE cluster credentials
	@echo "Getting GKE cluster credentials..."
	$(GCLOUD) container clusters get-credentials $$($(TERRAFORM) output -raw cluster_name) \
		--region $$($(TERRAFORM) output -raw region) \
		--project $$($(TERRAFORM) output -raw project_id)

verify-cluster: get-credentials ## Verify cluster is accessible
	@echo "Verifying cluster access..."
	$(KUBECTL) cluster-info
	$(KUBECTL) get nodes
	$(KUBECTL) get namespaces

deploy-essentials: get-credentials ## Deploy essential Kubernetes components
	@echo "Deploying essential components..."
	@bash scripts/deploy-essentials.sh

setup-workload-identity: get-credentials ## Setup Workload Identity
	@echo "Setting up Workload Identity..."
	@bash scripts/setup-workload-identity.sh

setup-storage-classes: get-credentials ## Setup storage classes
	@echo "Setting up storage classes..."
	$(KUBECTL) apply -f manifests/storage-classes.yaml

setup-network-policies: get-credentials ## Setup network policies
	@echo "Setting up network policies..."
	$(KUBECTL) apply -f manifests/network-policies.yaml

cost-estimate: ## Estimate infrastructure costs
	@echo "Generating cost estimate..."
	@command -v infracost >/dev/null 2>&1 || { echo "infracost not found. Install: brew install infracost"; exit 1; }
	infracost breakdown --path .

graph: ## Generate Terraform dependency graph
	@echo "Generating dependency graph..."
	$(TERRAFORM) graph | dot -Tpng > graph.png
	@echo "Graph saved to graph.png"

clean: ## Clean Terraform files
	@echo "Cleaning Terraform files..."
	rm -rf .terraform
	rm -f tfplan
	rm -f terraform.tfstate.backup
	rm -f graph.png

backup-state: ## Backup Terraform state
	@echo "Backing up Terraform state..."
	@mkdir -p backups
	cp terraform.tfstate backups/terraform.tfstate.$$(date +%Y%m%d-%H%M%S)
	@echo "State backed up to backups/"

login-gcp: ## Login to GCP
	@echo "Logging in to GCP..."
	$(GCLOUD) auth login
	$(GCLOUD) auth application-default login

set-project: ## Set GCP project
	@read -p "Enter GCP Project ID: " project_id; \
	$(GCLOUD) config set project $$project_id

enable-apis: ## Enable required GCP APIs
	@echo "Enabling required APIs..."
	$(GCLOUD) services enable \
		compute.googleapis.com \
		container.googleapis.com \
		cloudresourcemanager.googleapis.com \
		iam.googleapis.com \
		logging.googleapis.com \
		monitoring.googleapis.com \
		cloudtrace.googleapis.com \
		binaryauthorization.googleapis.com \
		secretmanager.googleapis.com \
		artifactregistry.googleapis.com

create-state-bucket: ## Create Terraform state bucket
	@read -p "Enter GCP Project ID: " project_id; \
	read -p "Enter bucket name (default: llm-analytics-hub-terraform-state): " bucket_name; \
	bucket_name=$${bucket_name:-llm-analytics-hub-terraform-state}; \
	$(GCLOUD) storage buckets create gs://$$bucket_name \
		--project=$$project_id \
		--location=$(REGION) \
		--uniform-bucket-level-access; \
	$(GCLOUD) storage buckets update gs://$$bucket_name --versioning

full-setup: login-gcp set-project enable-apis create-state-bucket init ## Complete initial setup
	@echo "Full setup complete! You can now run 'make plan' and 'make apply'"

test: validate lint ## Run all tests
	@echo "Running tests..."
	$(TERRAFORM) validate
	@echo "All tests passed!"

docs: ## Generate documentation
	@echo "Generating documentation..."
	@command -v terraform-docs >/dev/null 2>&1 || { echo "terraform-docs not found. Install: brew install terraform-docs"; exit 1; }
	terraform-docs markdown table . > TERRAFORM.md
	@echo "Documentation generated in TERRAFORM.md"

upgrade-providers: ## Upgrade Terraform providers
	@echo "Upgrading Terraform providers..."
	$(TERRAFORM) init -upgrade

refresh: ## Refresh Terraform state
	@echo "Refreshing Terraform state..."
	$(TERRAFORM) refresh

import: ## Import existing resource (usage: make import RESOURCE=resource.name ID=resource-id)
	@echo "Importing resource..."
	$(TERRAFORM) import $(RESOURCE) $(ID)

taint: ## Taint a resource for recreation (usage: make taint RESOURCE=resource.name)
	@echo "Tainting resource..."
	$(TERRAFORM) taint $(RESOURCE)

untaint: ## Untaint a resource (usage: make untaint RESOURCE=resource.name)
	@echo "Untainting resource..."
	$(TERRAFORM) untaint $(RESOURCE)

show: ## Show current state
	@echo "Showing current state..."
	$(TERRAFORM) show

state-list: ## List all resources in state
	@echo "Listing all resources..."
	$(TERRAFORM) state list

workspace-list: ## List all workspaces
	@echo "Listing workspaces..."
	$(TERRAFORM) workspace list

workspace-new: ## Create new workspace (usage: make workspace-new NAME=workspace-name)
	@echo "Creating new workspace..."
	$(TERRAFORM) workspace new $(NAME)

workspace-select: ## Select workspace (usage: make workspace-select NAME=workspace-name)
	@echo "Selecting workspace..."
	$(TERRAFORM) workspace select $(NAME)

monitoring-dashboard: ## Open GCP monitoring dashboard
	@echo "Opening monitoring dashboard..."
	@PROJECT_ID=$$($(TERRAFORM) output -raw project_id); \
	open "https://console.cloud.google.com/monitoring/dashboards?project=$$PROJECT_ID"

logs-viewer: ## Open GCP logs viewer
	@echo "Opening logs viewer..."
	@PROJECT_ID=$$($(TERRAFORM) output -raw project_id); \
	open "https://console.cloud.google.com/logs/query?project=$$PROJECT_ID"

gke-console: ## Open GKE cluster in console
	@echo "Opening GKE console..."
	@PROJECT_ID=$$($(TERRAFORM) output -raw project_id); \
	@CLUSTER_NAME=$$($(TERRAFORM) output -raw cluster_name); \
	@REGION=$$($(TERRAFORM) output -raw region); \
	open "https://console.cloud.google.com/kubernetes/clusters/details/$$REGION/$$CLUSTER_NAME/details?project=$$PROJECT_ID"

.DEFAULT_GOAL := help
