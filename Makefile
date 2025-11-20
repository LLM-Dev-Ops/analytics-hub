# Makefile for LLM Analytics Hub
# Provides convenient commands for building, testing, and deploying

.PHONY: help build test clean docker k8s ci deploy

# Default target
help:
	@echo "LLM Analytics Hub - Build System"
	@echo ""
	@echo "Available targets:"
	@echo "  make build          - Build all Rust services and API/Frontend"
	@echo "  make test           - Run all tests"
	@echo "  make lint           - Run linters"
	@echo "  make docker         - Build all Docker images"
	@echo "  make docker-push    - Build and push Docker images"
	@echo "  make k8s-deploy     - Deploy to Kubernetes"
	@echo "  make clean          - Clean build artifacts"
	@echo "  make dev            - Start local development environment"
	@echo "  make perf-test      - Run performance tests"
	@echo ""

#===============================
# Build Targets
#===============================

build: build-rust build-api build-frontend
	@echo "✓ All services built successfully"

build-rust:
	@echo "Building Rust services..."
	cargo build --release --bin event-ingestion
	cargo build --release --bin metrics-aggregation
	cargo build --release --bin correlation-engine
	cargo build --release --bin anomaly-detection
	cargo build --release --bin forecasting
	@echo "✓ Rust services built"

build-api:
	@echo "Building API service..."
	cd api && npm ci && npm run build
	@echo "✓ API service built"

build-frontend:
	@echo "Building frontend..."
	cd frontend && npm ci && npm run build
	@echo "✓ Frontend built"

#===============================
# Test Targets
#===============================

test: test-rust test-api test-frontend
	@echo "✓ All tests passed"

test-rust:
	@echo "Running Rust tests..."
	cargo test --all-features --verbose

test-api:
	@echo "Running API tests..."
	cd api && npm test

test-frontend:
	@echo "Running frontend tests..."
	cd frontend && npm test || true

#===============================
# Lint Targets
#===============================

lint: lint-rust lint-api lint-frontend
	@echo "✓ All linting passed"

lint-rust:
	@echo "Linting Rust code..."
	cargo fmt -- --check
	cargo clippy --all-targets --all-features -- -D warnings

lint-api:
	@echo "Linting API code..."
	cd api && npm run lint

lint-frontend:
	@echo "Linting frontend code..."
	cd frontend && npm run lint || true

#===============================
# Docker Targets
#===============================

docker:
	@echo "Building all Docker images..."
	cd docker && ./build-all.sh
	@echo "✓ All Docker images built"

docker-push:
	@echo "Building and pushing Docker images..."
	cd docker && ./build-all.sh --push --registry ghcr.io/llm-analytics
	@echo "✓ All Docker images built and pushed"

#===============================
# Kubernetes Targets
#===============================

k8s-deploy:
	@echo "Deploying to Kubernetes..."
	kubectl apply -f k8s/applications/namespace.yaml
	kubectl apply -f k8s/applications/event-ingestion/
	kubectl apply -f k8s/applications/api/
	kubectl apply -f k8s/applications/frontend/
	kubectl apply -f k8s/applications/ingress.yaml
	@echo "✓ Deployed to Kubernetes"

k8s-status:
	@echo "Checking Kubernetes status..."
	kubectl get pods -n llm-analytics
	kubectl get svc -n llm-analytics
	kubectl get ingress -n llm-analytics

#===============================
# Development Targets
#===============================

dev:
	@echo "Starting local development environment..."
	cd docker && docker-compose up -d
	@echo "✓ Development environment started"
	@echo ""
	@echo "Services:"
	@echo "  Frontend:  http://localhost"
	@echo "  API:       http://localhost:3000"
	@echo "  Grafana:   http://localhost:3001 (admin/admin)"
	@echo "  Prometheus: http://localhost:9091"

dev-stop:
	@echo "Stopping development environment..."
	cd docker && docker-compose down
	@echo "✓ Development environment stopped"

dev-logs:
	cd docker && docker-compose logs -f

#===============================
# Performance Testing
#===============================

perf-test:
	@echo "Running performance tests with k6..."
	k6 run tests/performance/load-test.js

perf-stress:
	@echo "Running stress tests with k6..."
	k6 run tests/performance/stress-test.js

#===============================
# Cleanup Targets
#===============================

clean:
	@echo "Cleaning build artifacts..."
	cargo clean
	cd api && rm -rf dist node_modules
	cd frontend && rm -rf dist node_modules
	@echo "✓ Cleaned"

#===============================
# CI/CD Targets
#===============================

ci: lint test build
	@echo "✓ CI checks passed"

#===============================
# Database Migrations
#===============================

db-migrate:
	@echo "Running database migrations..."
	kubectl exec -it -n llm-analytics statefulset/timescaledb -- \
		psql -U admin -d llm_analytics -f /migrations/schema.sql

#===============================
# Monitoring
#===============================

logs-event-ingestion:
	kubectl logs -f -l app=event-ingestion -n llm-analytics

logs-api:
	kubectl logs -f -l app=api -n llm-analytics

logs-all:
	kubectl logs -f -l app.kubernetes.io/part-of=llm-analytics-hub -n llm-analytics --tail=100

#===============================
# Security Scanning
#===============================

security-scan:
	@echo "Running security scans..."
	cargo audit
	cd api && npm audit
	cd frontend && npm audit
	@echo "✓ Security scans complete"
