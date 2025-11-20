#!/bin/bash
###############################################################################
# Kafka Connection Script
###############################################################################

set -euo pipefail

NAMESPACE="${NAMESPACE:-llm-analytics-hub}"
POD="${POD:-kafka-0}"

echo "Connecting to Kafka..."
echo "Pod: $POD"
echo ""

kubectl exec -it -n "$NAMESPACE" "$POD" -- /bin/bash
