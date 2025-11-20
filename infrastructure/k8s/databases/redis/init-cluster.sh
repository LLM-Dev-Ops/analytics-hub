#!/bin/bash
set -e

#####################################################
# Redis Cluster Initialization Script
# LLM Analytics Hub - Production Redis Cluster Setup
#####################################################

NAMESPACE="${NAMESPACE:-redis-system}"
REPLICAS="${REPLICAS:-6}"
CLUSTER_REPLICAS="${CLUSTER_REPLICAS:-1}"
SERVICE_NAME="${SERVICE_NAME:-redis-cluster}"

echo "========================================="
echo "Redis Cluster Initialization"
echo "========================================="
echo "Namespace: $NAMESPACE"
echo "Replicas: $REPLICAS"
echo "Cluster Replicas per Master: $CLUSTER_REPLICAS"
echo "========================================="

# Function to wait for pods to be ready
wait_for_pods() {
    echo "Waiting for Redis pods to be ready..."

    local max_attempts=60
    local attempt=0

    while [ $attempt -lt $max_attempts ]; do
        local ready_pods=$(kubectl get pods -n $NAMESPACE -l app.kubernetes.io/name=redis,app.kubernetes.io/component=cluster --field-selector=status.phase=Running 2>/dev/null | grep -c "Running" || echo "0")

        if [ "$ready_pods" -eq "$REPLICAS" ]; then
            echo "All $REPLICAS Redis pods are running"

            # Additional check: ensure pods are ready (not just running)
            local ready_count=$(kubectl get pods -n $NAMESPACE -l app.kubernetes.io/name=redis,app.kubernetes.io/component=cluster -o jsonpath='{range .items[*]}{.status.conditions[?(@.type=="Ready")].status}{"\n"}{end}' | grep -c "True" || echo "0")

            if [ "$ready_count" -eq "$REPLICAS" ]; then
                echo "All $REPLICAS Redis pods are ready"
                return 0
            fi
        fi

        echo "Waiting for pods... ($ready_pods/$REPLICAS ready)"
        sleep 5
        attempt=$((attempt + 1))
    done

    echo "ERROR: Timeout waiting for Redis pods to be ready"
    kubectl get pods -n $NAMESPACE -l app.kubernetes.io/name=redis,app.kubernetes.io/component=cluster
    return 1
}

# Function to get Redis password
get_redis_password() {
    kubectl get secret redis-auth -n $NAMESPACE -o jsonpath='{.data.password}' | base64 -d
}

# Function to check if cluster is already initialized
is_cluster_initialized() {
    local pod_name="${SERVICE_NAME}-0"
    local password=$(get_redis_password)

    local cluster_info=$(kubectl exec -n $NAMESPACE $pod_name -- redis-cli -a "$password" cluster info 2>/dev/null || echo "")

    if echo "$cluster_info" | grep -q "cluster_state:ok"; then
        return 0
    fi

    return 1
}

# Function to get pod IP addresses
get_pod_ips() {
    kubectl get pods -n $NAMESPACE -l app.kubernetes.io/name=redis,app.kubernetes.io/component=cluster \
        -o jsonpath='{range .items[*]}{.status.podIP}{"\n"}{end}' | sort
}

# Function to create cluster
create_cluster() {
    echo "Creating Redis cluster..."

    local password=$(get_redis_password)
    local pod_ips=$(get_pod_ips)
    local cluster_nodes=""

    # Build cluster nodes list
    for ip in $pod_ips; do
        cluster_nodes="$cluster_nodes $ip:6379"
    done

    echo "Cluster nodes: $cluster_nodes"

    # Create cluster using redis-cli
    kubectl exec -n $NAMESPACE ${SERVICE_NAME}-0 -- redis-cli \
        --cluster create $cluster_nodes \
        --cluster-replicas $CLUSTER_REPLICAS \
        --cluster-yes \
        -a "$password"

    if [ $? -eq 0 ]; then
        echo "Redis cluster created successfully"
        return 0
    else
        echo "ERROR: Failed to create Redis cluster"
        return 1
    fi
}

# Function to verify cluster
verify_cluster() {
    echo "Verifying Redis cluster..."

    local password=$(get_redis_password)

    # Check cluster info
    echo "Cluster info:"
    kubectl exec -n $NAMESPACE ${SERVICE_NAME}-0 -- redis-cli -a "$password" cluster info

    # Check cluster nodes
    echo ""
    echo "Cluster nodes:"
    kubectl exec -n $NAMESPACE ${SERVICE_NAME}-0 -- redis-cli -a "$password" cluster nodes

    # Verify cluster state
    local cluster_state=$(kubectl exec -n $NAMESPACE ${SERVICE_NAME}-0 -- redis-cli -a "$password" cluster info 2>/dev/null | grep "cluster_state" | cut -d: -f2 | tr -d '\r\n')

    if [ "$cluster_state" == "ok" ]; then
        echo ""
        echo "Cluster state: OK ✓"
        return 0
    else
        echo ""
        echo "ERROR: Cluster state is not OK: $cluster_state"
        return 1
    fi
}

# Function to test cluster
test_cluster() {
    echo ""
    echo "Testing Redis cluster..."

    local password=$(get_redis_password)

    # Test write
    echo "Testing write operation..."
    kubectl exec -n $NAMESPACE ${SERVICE_NAME}-0 -- redis-cli -a "$password" -c set test_key "Hello Redis Cluster" > /dev/null 2>&1

    # Test read from different node
    echo "Testing read operation from different node..."
    local value=$(kubectl exec -n $NAMESPACE ${SERVICE_NAME}-1 -- redis-cli -a "$password" -c get test_key 2>/dev/null)

    if [ "$value" == "Hello Redis Cluster" ]; then
        echo "Cluster test: PASSED ✓"

        # Cleanup
        kubectl exec -n $NAMESPACE ${SERVICE_NAME}-0 -- redis-cli -a "$password" -c del test_key > /dev/null 2>&1

        return 0
    else
        echo "ERROR: Cluster test failed"
        return 1
    fi
}

# Function to check cluster health
check_cluster_health() {
    echo ""
    echo "Checking cluster health..."

    local password=$(get_redis_password)

    # Check each node
    for i in $(seq 0 $((REPLICAS - 1))); do
        local pod_name="${SERVICE_NAME}-${i}"
        echo -n "Checking $pod_name: "

        local ping_result=$(kubectl exec -n $NAMESPACE $pod_name -- redis-cli -a "$password" ping 2>/dev/null || echo "FAILED")

        if [ "$ping_result" == "PONG" ]; then
            echo "OK ✓"
        else
            echo "FAILED ✗"
            return 1
        fi
    done

    echo "All nodes are healthy ✓"
    return 0
}

# Function to display cluster slot distribution
show_slot_distribution() {
    echo ""
    echo "Cluster slot distribution:"
    echo "========================================="

    local password=$(get_redis_password)
    kubectl exec -n $NAMESPACE ${SERVICE_NAME}-0 -- redis-cli -a "$password" cluster nodes 2>/dev/null | \
        awk '{
            if ($3 ~ /master/) {
                split($9, slots, "-")
                if (slots[2] != "") {
                    range = slots[2] - slots[1] + 1
                    printf "Master %s: slots %s (%d slots)\n", $1, $9, range
                }
            }
        }'

    echo "========================================="
}

# Main execution
main() {
    echo "Starting Redis cluster initialization..."
    echo ""

    # Wait for pods
    if ! wait_for_pods; then
        echo "ERROR: Failed to wait for pods"
        exit 1
    fi

    echo ""

    # Check if cluster is already initialized
    if is_cluster_initialized; then
        echo "Redis cluster is already initialized"
        verify_cluster
        check_cluster_health
        show_slot_distribution
        echo ""
        echo "Cluster initialization check complete ✓"
        exit 0
    fi

    echo "Redis cluster is not initialized, creating..."
    echo ""

    # Create cluster
    if ! create_cluster; then
        echo "ERROR: Failed to create cluster"
        exit 1
    fi

    echo ""

    # Wait a bit for cluster to stabilize
    echo "Waiting for cluster to stabilize..."
    sleep 10

    # Verify cluster
    if ! verify_cluster; then
        echo "ERROR: Cluster verification failed"
        exit 1
    fi

    # Check health
    if ! check_cluster_health; then
        echo "ERROR: Cluster health check failed"
        exit 1
    fi

    # Show slot distribution
    show_slot_distribution

    # Test cluster
    if ! test_cluster; then
        echo "ERROR: Cluster test failed"
        exit 1
    fi

    echo ""
    echo "========================================="
    echo "Redis cluster initialization complete! ✓"
    echo "========================================="
    echo ""
    echo "Cluster Details:"
    echo "  - Namespace: $NAMESPACE"
    echo "  - Total Nodes: $REPLICAS"
    echo "  - Masters: $((REPLICAS / (CLUSTER_REPLICAS + 1)))"
    echo "  - Replicas per Master: $CLUSTER_REPLICAS"
    echo "  - Total Hash Slots: 16384"
    echo ""
    echo "Connection String:"
    echo "  redis://:PASSWORD@redis.$NAMESPACE.svc.cluster.local:6379"
    echo ""
    echo "Next Steps:"
    echo "  1. Update your application configuration with the connection string"
    echo "  2. Monitor cluster health: kubectl logs -n $NAMESPACE -l app.kubernetes.io/name=redis"
    echo "  3. Check Prometheus metrics for cluster performance"
    echo "  4. Verify backup jobs are running: kubectl get cronjobs -n $NAMESPACE"
    echo ""
}

# Run main function
main "$@"
