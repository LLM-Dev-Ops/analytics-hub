#!/bin/bash
###############################################################################
# Redis Connection Script
###############################################################################

set -euo pipefail

NAMESPACE="${NAMESPACE:-llm-analytics-hub}"
POD="${POD:-redis-cluster-0}"

echo "Connecting to Redis..."
echo "Pod: $POD"
echo ""

REDIS_PASSWORD=$(kubectl get secret analytics-hub-secrets -n "$NAMESPACE" -o jsonpath='{.data.REDIS_PASSWORD}' | base64 -d)

kubectl exec -it -n "$NAMESPACE" "$POD" -- redis-cli --pass "$REDIS_PASSWORD"
