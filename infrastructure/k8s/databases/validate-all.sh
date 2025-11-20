#!/bin/bash
###############################################################################
# Validation Script for Database Operations Infrastructure
###############################################################################

set -euo pipefail

NAMESPACE="${NAMESPACE:-llm-analytics-hub}"
EXIT_CODE=0

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

pass() { echo -e "${GREEN}[PASS]${NC} $*"; }
fail() { echo -e "${RED}[FAIL]${NC} $*"; EXIT_CODE=1; }
warn() { echo -e "${YELLOW}[WARN]${NC} $*"; }

echo "=========================================="
echo "Validating Database Operations Infrastructure"
echo "Namespace: $NAMESPACE"
echo "=========================================="
echo ""

# Validate monitoring
echo "Monitoring Infrastructure:"
if kubectl get configmap prometheus-database-rules -n "$NAMESPACE" &>/dev/null; then
    pass "Prometheus alert rules deployed"
else
    fail "Prometheus alert rules not found"
fi

if kubectl get servicemonitor -n "$NAMESPACE" 2>/dev/null | grep -q timescaledb; then
    pass "TimescaleDB ServiceMonitor deployed"
else
    fail "TimescaleDB ServiceMonitor not found"
fi

if kubectl get pods -n "$NAMESPACE" -l app=postgres-exporter | grep -q Running; then
    pass "Postgres exporter running"
else
    warn "Postgres exporter not running"
fi

if kubectl get pods -n "$NAMESPACE" -l app=redis-exporter | grep -q Running; then
    pass "Redis exporter running"
else
    warn "Redis exporter not running"
fi

echo ""

# Validate backup system
echo "Backup System:"
if kubectl get cronjob timescaledb-backup -n "$NAMESPACE" &>/dev/null; then
    pass "TimescaleDB backup CronJob deployed"
else
    fail "TimescaleDB backup CronJob not found"
fi

if kubectl get cronjob redis-backup -n "$NAMESPACE" &>/dev/null; then
    pass "Redis backup CronJob deployed"
else
    fail "Redis backup CronJob not found"
fi

if kubectl get cronjob kafka-backup -n "$NAMESPACE" &>/dev/null; then
    pass "Kafka backup CronJob deployed"
else
    fail "Kafka backup CronJob not found"
fi

if kubectl get cronjob backup-verification -n "$NAMESPACE" &>/dev/null; then
    pass "Backup verification CronJob deployed"
else
    fail "Backup verification CronJob not found"
fi

if kubectl get cronjob retention-policy-enforcement -n "$NAMESPACE" &>/dev/null; then
    pass "Retention policy enforcement deployed"
else
    fail "Retention policy enforcement not found"
fi

echo ""

# Validate secrets
echo "Secrets:"
if kubectl get secret backup-s3-credentials -n "$NAMESPACE" &>/dev/null; then
    pass "S3 credentials secret exists"
else
    fail "S3 credentials secret not found"
fi

if kubectl get secret backup-encryption-key -n "$NAMESPACE" &>/dev/null; then
    pass "Backup encryption key exists"
else
    fail "Backup encryption key not found"
fi

if kubectl get secret postgres-exporter-secret -n "$NAMESPACE" &>/dev/null; then
    pass "Postgres exporter secret exists"
else
    fail "Postgres exporter secret not found"
fi

echo ""

# Validate ConfigMaps
echo "Configuration:"
if kubectl get configmap backup-s3-config -n "$NAMESPACE" &>/dev/null; then
    pass "S3 backup configuration exists"
else
    fail "S3 backup configuration not found"
fi

if kubectl get configmap backup-retention-policy -n "$NAMESPACE" &>/dev/null; then
    pass "Retention policy configuration exists"
else
    fail "Retention policy configuration not found"
fi

if kubectl get configmap backup-scripts -n "$NAMESPACE" &>/dev/null; then
    pass "Backup scripts ConfigMap exists"
else
    fail "Backup scripts ConfigMap not found"
fi

echo ""

# Validate RBAC
echo "RBAC:"
if kubectl get serviceaccount backup-orchestrator-sa -n "$NAMESPACE" &>/dev/null; then
    pass "Backup orchestrator service account exists"
else
    fail "Backup orchestrator service account not found"
fi

if kubectl get role backup-orchestrator-role -n "$NAMESPACE" &>/dev/null; then
    pass "Backup orchestrator role exists"
else
    fail "Backup orchestrator role not found"
fi

echo ""

# Summary
echo "=========================================="
if [ $EXIT_CODE -eq 0 ]; then
    echo -e "${GREEN}Validation PASSED${NC}"
    echo "All components deployed successfully"
else
    echo -e "${RED}Validation FAILED${NC}"
    echo "Some components are missing or not running"
fi
echo "=========================================="

exit $EXIT_CODE
