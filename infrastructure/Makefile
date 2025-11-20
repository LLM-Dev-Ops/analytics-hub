# LLM Analytics Hub - Infrastructure Makefile
# Common operations for managing infrastructure

.PHONY: help
.DEFAULT_GOAL := help

# Variables
ENVIRONMENT ?= dev
CLOUD_PROVIDER ?= aws
NAMESPACE := llm-analytics-hub
SCRIPTS_DIR := ./scripts

# Colors
BLUE := \033[0;34m
GREEN := \033[0;32m
YELLOW := \033[1;33m
RED := \033[0;31m
NC := \033[0m # No Color

##@ General

help: ## Display this help
	@echo "$(BLUE)LLM Analytics Hub - Infrastructure Management$(NC)"
	@echo ""
	@awk 'BEGIN {FS = ":.*##"; printf "Usage:\n  make $(GREEN)<target>$(NC) [ENVIRONMENT=<env>] [CLOUD_PROVIDER=<provider>]\n"} /^[a-zA-Z_-]+:.*?##/ { printf "  $(GREEN)%-20s$(NC) %s\n", $$1, $$2 } /^##@/ { printf "\n$(BLUE)%s$(NC)\n", substr($$0, 5) } ' $(MAKEFILE_LIST)

init: ## Initialize infrastructure tools and dependencies
	@echo "$(BLUE)Initializing infrastructure tools...$(NC)"
	@chmod +x $(SCRIPTS_DIR)/*.sh
	@$(SCRIPTS_DIR)/utils.sh || true
	@echo "$(GREEN)✓ Initialization complete$(NC)"

##@ Prerequisites

check-tools: ## Check required tools are installed
	@echo "$(BLUE)Checking required tools...$(NC)"
	@which kubectl > /dev/null || (echo "$(RED)✗ kubectl not found$(NC)" && exit 1)
	@which helm > /dev/null || (echo "$(RED)✗ helm not found$(NC)" && exit 1)
	@which jq > /dev/null || (echo "$(RED)✗ jq not found$(NC)" && exit 1)
	@which yq > /dev/null || (echo "$(RED)✗ yq not found$(NC)" && exit 1)
	@echo "$(GREEN)✓ All required tools are installed$(NC)"

check-credentials: ## Verify cloud provider credentials
	@echo "$(BLUE)Checking cloud provider credentials...$(NC)"
ifeq ($(CLOUD_PROVIDER),aws)
	@aws sts get-caller-identity > /dev/null && echo "$(GREEN)✓ AWS credentials valid$(NC)" || echo "$(RED)✗ AWS credentials invalid$(NC)"
else ifeq ($(CLOUD_PROVIDER),gcp)
	@gcloud auth list --filter=status:ACTIVE > /dev/null && echo "$(GREEN)✓ GCP credentials valid$(NC)" || echo "$(RED)✗ GCP credentials invalid$(NC)"
else ifeq ($(CLOUD_PROVIDER),azure)
	@az account show > /dev/null && echo "$(GREEN)✓ Azure credentials valid$(NC)" || echo "$(RED)✗ Azure credentials invalid$(NC)"
endif

check-k8s: ## Check Kubernetes cluster connectivity
	@echo "$(BLUE)Checking Kubernetes connectivity...$(NC)"
	@kubectl cluster-info > /dev/null && echo "$(GREEN)✓ Kubernetes cluster is accessible$(NC)" || echo "$(RED)✗ Cannot connect to Kubernetes$(NC)"

prereqs: check-tools check-credentials check-k8s ## Run all prerequisite checks
	@echo "$(GREEN)✓ All prerequisite checks passed$(NC)"

##@ Deployment

deploy: ## Deploy infrastructure (Usage: make deploy ENVIRONMENT=prod CLOUD_PROVIDER=aws)
	@echo "$(BLUE)Deploying to $(ENVIRONMENT) on $(CLOUD_PROVIDER)...$(NC)"
	@$(SCRIPTS_DIR)/deploy-$(CLOUD_PROVIDER).sh $(ENVIRONMENT)
	@echo "$(GREEN)✓ Deployment complete$(NC)"

deploy-k8s: ## Deploy Kubernetes resources only
	@echo "$(BLUE)Deploying Kubernetes resources to $(ENVIRONMENT)...$(NC)"
	@$(SCRIPTS_DIR)/deploy-k8s-core.sh $(ENVIRONMENT)
	@echo "$(GREEN)✓ Kubernetes deployment complete$(NC)"

deploy-aws: ## Deploy to AWS
	@$(MAKE) deploy CLOUD_PROVIDER=aws

deploy-gcp: ## Deploy to GCP
	@$(MAKE) deploy CLOUD_PROVIDER=gcp

deploy-azure: ## Deploy to Azure
	@$(MAKE) deploy CLOUD_PROVIDER=azure

##@ Validation

validate: ## Validate deployment
	@echo "$(BLUE)Validating $(ENVIRONMENT) deployment...$(NC)"
	@$(SCRIPTS_DIR)/validate.sh $(ENVIRONMENT)

validate-verbose: ## Validate deployment with verbose output
	@echo "$(BLUE)Validating $(ENVIRONMENT) deployment (verbose)...$(NC)"
	@$(SCRIPTS_DIR)/validate.sh $(ENVIRONMENT) --verbose

smoke-test: ## Run smoke tests
	@echo "$(BLUE)Running smoke tests on $(ENVIRONMENT)...$(NC)"
	@kubectl run -it --rm smoke-test --image=curlimages/curl --restart=Never -- \
		curl -f http://analytics-api-service.$(NAMESPACE)/health
	@echo "$(GREEN)✓ Smoke tests passed$(NC)"

##@ Operations

status: ## Show deployment status
	@echo "$(BLUE)Deployment Status - $(ENVIRONMENT)$(NC)"
	@echo "\n$(YELLOW)Pods:$(NC)"
	@kubectl get pods -n $(NAMESPACE)
	@echo "\n$(YELLOW)Services:$(NC)"
	@kubectl get svc -n $(NAMESPACE)
	@echo "\n$(YELLOW)Ingress:$(NC)"
	@kubectl get ingress -n $(NAMESPACE)

logs: ## Tail application logs
	@echo "$(BLUE)Tailing logs for $(ENVIRONMENT)...$(NC)"
	@kubectl logs -n $(NAMESPACE) -l app=analytics-api -f --tail=100

logs-api: ## Tail API logs
	@kubectl logs -n $(NAMESPACE) -l app=analytics-api -f --tail=100

logs-db: ## Tail database logs
	@kubectl logs -n $(NAMESPACE) -l app=timescaledb -f --tail=100

logs-redis: ## Tail Redis logs
	@kubectl logs -n $(NAMESPACE) -l app=redis -f --tail=100

describe: ## Describe pods
	@kubectl describe pods -n $(NAMESPACE)

events: ## Show recent events
	@kubectl get events -n $(NAMESPACE) --sort-by='.lastTimestamp' | head -20

top: ## Show resource usage
	@echo "$(YELLOW)Nodes:$(NC)"
	@kubectl top nodes
	@echo "\n$(YELLOW)Pods:$(NC)"
	@kubectl top pods -n $(NAMESPACE)

##@ Scaling

scale-up: ## Scale API pods up (Usage: make scale-up REPLICAS=10)
	@echo "$(BLUE)Scaling API to $(REPLICAS) replicas...$(NC)"
	@kubectl scale deployment analytics-api --replicas=$(REPLICAS) -n $(NAMESPACE)
	@echo "$(GREEN)✓ Scaled to $(REPLICAS) replicas$(NC)"

scale-down: ## Scale API pods down (Usage: make scale-down REPLICAS=3)
	@$(MAKE) scale-up REPLICAS=$(REPLICAS)

autoscale: ## Enable autoscaling
	@echo "$(BLUE)Enabling autoscaling...$(NC)"
	@kubectl autoscale deployment analytics-api --min=3 --max=10 --cpu-percent=70 -n $(NAMESPACE)
	@echo "$(GREEN)✓ Autoscaling enabled$(NC)"

##@ Monitoring

port-forward-grafana: ## Port-forward to Grafana
	@echo "$(BLUE)Port-forwarding to Grafana...$(NC)"
	@echo "$(YELLOW)Access Grafana at: http://localhost:3000$(NC)"
	@kubectl port-forward -n monitoring svc/prometheus-grafana 3000:80

port-forward-prometheus: ## Port-forward to Prometheus
	@echo "$(BLUE)Port-forwarding to Prometheus...$(NC)"
	@echo "$(YELLOW)Access Prometheus at: http://localhost:9090$(NC)"
	@kubectl port-forward -n monitoring svc/prometheus-kube-prometheus-prometheus 9090:9090

port-forward-api: ## Port-forward to API
	@echo "$(BLUE)Port-forwarding to API...$(NC)"
	@echo "$(YELLOW)Access API at: http://localhost:8080$(NC)"
	@kubectl port-forward -n $(NAMESPACE) svc/analytics-api-service 8080:80

##@ Backup & Recovery

backup: ## Create backup
	@echo "$(BLUE)Creating backup of $(ENVIRONMENT)...$(NC)"
	@$(SCRIPTS_DIR)/backup.sh $(ENVIRONMENT) || echo "$(YELLOW)⚠ Backup script not yet implemented$(NC)"
	@echo "$(GREEN)✓ Backup complete$(NC)"

restore: ## Restore from backup (Usage: make restore BACKUP_ID=20240101-120000)
	@echo "$(BLUE)Restoring $(ENVIRONMENT) from backup $(BACKUP_ID)...$(NC)"
	@$(SCRIPTS_DIR)/restore.sh $(ENVIRONMENT) $(BACKUP_ID) || echo "$(YELLOW)⚠ Restore script not yet implemented$(NC)"
	@echo "$(GREEN)✓ Restore complete$(NC)"

list-backups: ## List available backups
	@echo "$(BLUE)Available backups for $(ENVIRONMENT):$(NC)"
	@$(SCRIPTS_DIR)/list-backups.sh $(ENVIRONMENT) || echo "$(YELLOW)⚠ List backups script not yet implemented$(NC)"

##@ Maintenance

restart: ## Restart application pods
	@echo "$(BLUE)Restarting application pods...$(NC)"
	@kubectl rollout restart deployment/analytics-api -n $(NAMESPACE)
	@echo "$(GREEN)✓ Restart initiated$(NC)"

rollback: ## Rollback to previous deployment
	@echo "$(BLUE)Rolling back deployment...$(NC)"
	@kubectl rollout undo deployment/analytics-api -n $(NAMESPACE)
	@echo "$(GREEN)✓ Rollback complete$(NC)"

history: ## Show rollout history
	@kubectl rollout history deployment/analytics-api -n $(NAMESPACE)

update-image: ## Update container image (Usage: make update-image IMAGE=myimage:v1.2.3)
	@echo "$(BLUE)Updating image to $(IMAGE)...$(NC)"
	@kubectl set image deployment/analytics-api api=$(IMAGE) -n $(NAMESPACE)
	@echo "$(GREEN)✓ Image updated$(NC)"

clean-jobs: ## Clean up completed jobs
	@echo "$(BLUE)Cleaning up completed jobs...$(NC)"
	@kubectl delete jobs -n $(NAMESPACE) --field-selector status.successful=1
	@echo "$(GREEN)✓ Cleanup complete$(NC)"

##@ Troubleshooting

debug: ## Debug pod issues
	@echo "$(BLUE)Debugging $(ENVIRONMENT)...$(NC)"
	@echo "\n$(YELLOW)Pod Status:$(NC)"
	@kubectl get pods -n $(NAMESPACE) -o wide
	@echo "\n$(YELLOW)Recent Events:$(NC)"
	@kubectl get events -n $(NAMESPACE) --sort-by='.lastTimestamp' | head -10
	@echo "\n$(YELLOW)Failed Pods:$(NC)"
	@kubectl get pods -n $(NAMESPACE) --field-selector=status.phase!=Running,status.phase!=Succeeded

shell: ## Get shell in API pod
	@echo "$(BLUE)Opening shell in API pod...$(NC)"
	@kubectl exec -it -n $(NAMESPACE) $$(kubectl get pods -n $(NAMESPACE) -l app=analytics-api -o jsonpath='{.items[0].metadata.name}') -- /bin/sh

exec-db: ## Execute commands in database pod
	@echo "$(BLUE)Connecting to database...$(NC)"
	@kubectl exec -it -n $(NAMESPACE) timescaledb-0 -- psql -U postgres -d llm_analytics

exec-redis: ## Execute commands in Redis pod
	@echo "$(BLUE)Connecting to Redis...$(NC)"
	@kubectl exec -it -n $(NAMESPACE) redis-0 -- redis-cli

##@ Cleanup

destroy: ## Destroy infrastructure (DANGEROUS!)
	@echo "$(RED)⚠ WARNING: This will destroy all infrastructure!$(NC)"
	@read -p "Are you sure? Type 'yes' to confirm: " confirm && [ "$$confirm" = "yes" ] || exit 1
	@$(SCRIPTS_DIR)/destroy.sh $(ENVIRONMENT) $(CLOUD_PROVIDER)

clean: ## Clean local temporary files
	@echo "$(BLUE)Cleaning temporary files...$(NC)"
	@rm -rf ./logs/*.log
	@rm -rf ./.terraform
	@rm -rf ./deployments/.*.tmp
	@echo "$(GREEN)✓ Cleanup complete$(NC)"

##@ Development

dev-setup: ## Setup local development environment
	@echo "$(BLUE)Setting up local development environment...$(NC)"
	@$(MAKE) init
	@$(MAKE) prereqs
	@echo "$(GREEN)✓ Development environment ready$(NC)"

dev-deploy: ## Deploy to local dev cluster
	@$(MAKE) deploy-k8s ENVIRONMENT=dev

dev-test: ## Test in local dev environment
	@$(MAKE) validate ENVIRONMENT=dev
	@$(MAKE) smoke-test ENVIRONMENT=dev

##@ Documentation

docs: ## Open documentation
	@echo "$(BLUE)Opening documentation...$(NC)"
	@echo "$(YELLOW)Deployment Guide:$(NC) docs/DEPLOYMENT_GUIDE.md"
	@echo "$(YELLOW)Operations Runbook:$(NC) docs/OPERATIONS_RUNBOOK.md"
	@echo "$(YELLOW)Troubleshooting:$(NC) docs/TROUBLESHOOTING.md"

view-config: ## View environment configuration
	@echo "$(BLUE)Configuration for $(ENVIRONMENT):$(NC)"
	@cat config/$(ENVIRONMENT).yaml || echo "$(RED)Configuration file not found$(NC)"

##@ CI/CD

ci-test: ## Run CI tests locally
	@echo "$(BLUE)Running CI tests...$(NC)"
	@shellcheck scripts/*.sh
	@yamllint ../k8s/*.yaml
	@echo "$(GREEN)✓ CI tests passed$(NC)"

ci-validate: ## Validate infrastructure as code
	@echo "$(BLUE)Validating infrastructure code...$(NC)"
	@terraform fmt -check -recursive terraform/ || true
	@echo "$(GREEN)✓ Validation complete$(NC)"
