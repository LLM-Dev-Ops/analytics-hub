#!/bin/bash
###############################################################################
# TimescaleDB Connection Script
###############################################################################

set -euo pipefail

NAMESPACE="${NAMESPACE:-llm-analytics-hub}"
POD="${POD:-timescaledb-0}"
DATABASE="${DATABASE:-llm_analytics}"
USER="${USER:-postgres}"

echo "Connecting to TimescaleDB..."
echo "Pod: $POD"
echo "Database: $DATABASE"
echo "User: $USER"
echo ""

kubectl exec -it -n "$NAMESPACE" "$POD" -- psql -U "$USER" -d "$DATABASE"
