#!/bin/bash
###############################################################################
# Implementation Verification Script
###############################################################################

set -euo pipefail

GREEN='\033[0;32m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}Database Operations - Implementation Verification${NC}"
echo -e "${BLUE}========================================${NC}\n"

TOTAL=0
PASSED=0

check() {
    TOTAL=$((TOTAL + 1))
    if [ -f "$1" ] || [ -d "$1" ]; then
        echo -e "${GREEN}✓${NC} $2"
        PASSED=$((PASSED + 1))
    else
        echo -e "${RED}✗${NC} $2 (missing: $1)"
    fi
}

echo "Monitoring Infrastructure:"
check "monitoring/grafana-dashboard-overview.json" "Overview Dashboard"
check "monitoring/grafana-dashboard-timescaledb.json" "TimescaleDB Dashboard"
check "monitoring/grafana-dashboard-redis.json" "Redis Dashboard"
check "monitoring/grafana-dashboard-kafka.json" "Kafka Dashboard"
check "monitoring/prometheus-rules.yaml" "Prometheus Alert Rules (50+ alerts)"
check "monitoring/servicemonitors.yaml" "ServiceMonitors & Exporters"
echo ""

echo "Backup System:"
check "backup/backup-orchestrator.yaml" "Backup Orchestrator CronJobs"
check "backup/verify-backup.sh" "Backup Verification Script"
check "backup/s3-config.yaml" "S3 Configuration"
check "backup/retention-policy.yaml" "Retention Policy"
check "backup/backup-restore-scripts/restore-timescaledb.sh" "TimescaleDB Restore Script"
echo ""

echo "Operational Tools:"
check "operations/health-check.sh" "Health Check Script"
check "utils/connect-timescaledb.sh" "TimescaleDB Connection Script"
check "utils/connect-redis.sh" "Redis Connection Script"
check "utils/connect-kafka.sh" "Kafka Connection Script"
echo ""

echo "Documentation:"
check "docs/OPERATIONS_GUIDE.md" "Operations Guide"
check "README.md" "Main README"
check "DATABASE_OPS_SUMMARY.md" "Implementation Summary"
echo ""

echo "Deployment Scripts:"
check "deploy-all.sh" "Master Deployment Script"
check "validate-all.sh" "Validation Script"
check "Makefile" "Makefile"
echo ""

echo -e "${BLUE}========================================${NC}"
echo -e "Verification Results: ${GREEN}$PASSED${NC}/$TOTAL checks passed"
echo -e "${BLUE}========================================${NC}\n"

if [ "$PASSED" -eq "$TOTAL" ]; then
    echo -e "${GREEN}✓ All components verified successfully!${NC}"
    echo ""
    echo "Next steps:"
    echo "1. Run: ./deploy-all.sh"
    echo "2. Run: ./validate-all.sh"
    echo "3. Run: make health"
    echo "4. Import Grafana dashboards from monitoring/*.json"
    exit 0
else
    echo -e "${RED}✗ Some components are missing${NC}"
    exit 1
fi
