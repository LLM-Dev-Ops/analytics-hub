#!/bin/bash
set -e

#####################################################
# Redis Cluster Verification Script
# Comprehensive health and performance checks
#####################################################

NAMESPACE="${NAMESPACE:-redis-system}"
SERVICE_NAME="${SERVICE_NAME:-redis-cluster}"
REPLICAS=6

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Get Redis password
get_password() {
    kubectl get secret redis-auth -n $NAMESPACE -o jsonpath='{.data.password}' | base64 -d
}

PASSWORD=$(get_password)

echo "========================================="
echo "Redis Cluster Verification"
echo "========================================="
echo ""

# 1. Check Pods
echo -e "${BLUE}[1/10]${NC} Checking Pod Status..."
kubectl get pods -n $NAMESPACE -l app.kubernetes.io/name=redis,app.kubernetes.io/component=cluster

RUNNING_PODS=$(kubectl get pods -n $NAMESPACE -l app.kubernetes.io/name=redis,app.kubernetes.io/component=cluster --field-selector=status.phase=Running --no-headers 2>/dev/null | wc -l)

if [ "$RUNNING_PODS" -eq "$REPLICAS" ]; then
    echo -e "${GREEN}✓${NC} All $REPLICAS pods are running"
else
    echo -e "${RED}✗${NC} Only $RUNNING_PODS/$REPLICAS pods are running"
fi
echo ""

# 2. Check Services
echo -e "${BLUE}[2/10]${NC} Checking Services..."
kubectl get svc -n $NAMESPACE
echo ""

# 3. Check PVCs
echo -e "${BLUE}[3/10]${NC} Checking Storage..."
kubectl get pvc -n $NAMESPACE
echo ""

# 4. Check Cluster State
echo -e "${BLUE}[4/10]${NC} Checking Cluster State..."
CLUSTER_STATE=$(kubectl exec -n $NAMESPACE ${SERVICE_NAME}-0 -- redis-cli -a "$PASSWORD" cluster info 2>/dev/null | grep "cluster_state" | cut -d: -f2 | tr -d '\r\n')

if [ "$CLUSTER_STATE" == "ok" ]; then
    echo -e "${GREEN}✓${NC} Cluster state: OK"
else
    echo -e "${RED}✗${NC} Cluster state: $CLUSTER_STATE"
fi
echo ""

# 5. Check Cluster Nodes
echo -e "${BLUE}[5/10]${NC} Checking Cluster Nodes..."
kubectl exec -n $NAMESPACE ${SERVICE_NAME}-0 -- redis-cli -a "$PASSWORD" cluster nodes 2>/dev/null

MASTER_COUNT=$(kubectl exec -n $NAMESPACE ${SERVICE_NAME}-0 -- redis-cli -a "$PASSWORD" cluster nodes 2>/dev/null | grep -c "master")
SLAVE_COUNT=$(kubectl exec -n $NAMESPACE ${SERVICE_NAME}-0 -- redis-cli -a "$PASSWORD" cluster nodes 2>/dev/null | grep -c "slave")

echo ""
echo -e "${GREEN}✓${NC} Masters: $MASTER_COUNT, Replicas: $SLAVE_COUNT"
echo ""

# 6. Check Slot Distribution
echo -e "${BLUE}[6/10]${NC} Checking Hash Slot Distribution..."
kubectl exec -n $NAMESPACE ${SERVICE_NAME}-0 -- redis-cli -a "$PASSWORD" cluster slots 2>/dev/null | head -20
echo ""

# 7. Check Memory Usage
echo -e "${BLUE}[7/10]${NC} Checking Memory Usage..."
for i in $(seq 0 $((REPLICAS - 1))); do
    POD_NAME="${SERVICE_NAME}-${i}"
    USED_MEM=$(kubectl exec -n $NAMESPACE $POD_NAME -- redis-cli -a "$PASSWORD" INFO memory 2>/dev/null | grep "used_memory_human" | cut -d: -f2 | tr -d '\r\n')
    MAX_MEM=$(kubectl exec -n $NAMESPACE $POD_NAME -- redis-cli -a "$PASSWORD" INFO memory 2>/dev/null | grep "maxmemory_human" | cut -d: -f2 | tr -d '\r\n')
    echo "  $POD_NAME: $USED_MEM / $MAX_MEM"
done
echo ""

# 8. Check Replication
echo -e "${BLUE}[8/10]${NC} Checking Replication Status..."
for i in $(seq 0 $((REPLICAS - 1))); do
    POD_NAME="${SERVICE_NAME}-${i}"
    ROLE=$(kubectl exec -n $NAMESPACE $POD_NAME -- redis-cli -a "$PASSWORD" INFO replication 2>/dev/null | grep "role" | cut -d: -f2 | tr -d '\r\n')

    if [ "$ROLE" == "master" ]; then
        SLAVES=$(kubectl exec -n $NAMESPACE $POD_NAME -- redis-cli -a "$PASSWORD" INFO replication 2>/dev/null | grep "connected_slaves" | cut -d: -f2 | tr -d '\r\n')
        echo "  $POD_NAME: master (${SLAVES} replicas)"
    else
        MASTER_LINK=$(kubectl exec -n $NAMESPACE $POD_NAME -- redis-cli -a "$PASSWORD" INFO replication 2>/dev/null | grep "master_link_status" | cut -d: -f2 | tr -d '\r\n')
        echo "  $POD_NAME: replica (link: ${MASTER_LINK})"
    fi
done
echo ""

# 9. Performance Test
echo -e "${BLUE}[9/10]${NC} Running Performance Test..."
echo "Writing test keys..."
for i in {1..100}; do
    kubectl exec -n $NAMESPACE ${SERVICE_NAME}-0 -- redis-cli -a "$PASSWORD" -c SET "test:key:$i" "value$i" > /dev/null 2>&1
done

echo "Reading test keys from different node..."
SUCCESS=0
for i in {1..100}; do
    VALUE=$(kubectl exec -n $NAMESPACE ${SERVICE_NAME}-1 -- redis-cli -a "$PASSWORD" -c GET "test:key:$i" 2>/dev/null)
    if [ "$VALUE" == "value$i" ]; then
        SUCCESS=$((SUCCESS + 1))
    fi
done

echo -e "${GREEN}✓${NC} Read test: $SUCCESS/100 successful"

# Cleanup test keys
kubectl exec -n $NAMESPACE ${SERVICE_NAME}-0 -- redis-cli -a "$PASSWORD" --cluster call $(kubectl get pods -n $NAMESPACE -l app.kubernetes.io/name=redis -o jsonpath='{range.items[*]}{.status.podIP}:6379 {end}') DEL test:key:{1..100} > /dev/null 2>&1

echo ""

# 10. Check Metrics Exporters
echo -e "${BLUE}[10/10]${NC} Checking Metrics Exporters..."
for i in $(seq 0 $((REPLICAS - 1))); do
    POD_NAME="${SERVICE_NAME}-${i}"
    if kubectl exec -n $NAMESPACE $POD_NAME -c metrics -- wget -q -O- http://localhost:9121/metrics > /dev/null 2>&1; then
        echo -e "  $POD_NAME: ${GREEN}✓${NC} Metrics available"
    else
        echo -e "  $POD_NAME: ${RED}✗${NC} Metrics unavailable"
    fi
done
echo ""

# Summary
echo "========================================="
echo "Verification Summary"
echo "========================================="
echo ""
echo "Cluster Information:"
kubectl exec -n $NAMESPACE ${SERVICE_NAME}-0 -- redis-cli -a "$PASSWORD" cluster info 2>/dev/null
echo ""
echo "Key Metrics:"
kubectl exec -n $NAMESPACE ${SERVICE_NAME}-0 -- redis-cli -a "$PASSWORD" INFO stats 2>/dev/null | grep -E "total_commands_processed|total_connections_received|keyspace_hits|keyspace_misses"
echo ""

if [ "$CLUSTER_STATE" == "ok" ] && [ "$RUNNING_PODS" -eq "$REPLICAS" ] && [ $SUCCESS -gt 95 ]; then
    echo -e "${GREEN}=========================================${NC}"
    echo -e "${GREEN}All checks passed! Cluster is healthy ✓${NC}"
    echo -e "${GREEN}=========================================${NC}"
    exit 0
else
    echo -e "${YELLOW}=========================================${NC}"
    echo -e "${YELLOW}Some checks failed. Review above output${NC}"
    echo -e "${YELLOW}=========================================${NC}"
    exit 1
fi
