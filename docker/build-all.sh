#!/bin/bash
# Build all Docker images for LLM Analytics Hub
# Usage: ./build-all.sh [--push] [--registry REGISTRY]

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

REGISTRY="${REGISTRY:-ghcr.io/llm-analytics}"
VERSION="${VERSION:-0.1.0}"
PUSH=false

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --push)
            PUSH=true
            shift
            ;;
        --registry)
            REGISTRY="$2"
            shift 2
            ;;
        --version)
            VERSION="$2"
            shift 2
            ;;
        *)
            echo "Unknown option: $1"
            exit 1
            ;;
    esac
done

echo "========================================="
echo "Building LLM Analytics Hub Docker Images"
echo "========================================="
echo "Registry: $REGISTRY"
echo "Version: $VERSION"
echo "Push: $PUSH"
echo "========================================="

# Function to build and optionally push image
build_image() {
    local name=$1
    local dockerfile=$2
    local build_arg=$3

    echo ""
    echo "Building $name..."

    if [ -n "$build_arg" ]; then
        docker build \
            -f "$PROJECT_ROOT/docker/$dockerfile" \
            --build-arg BUILD_TARGET="$build_arg" \
            -t "$REGISTRY/$name:$VERSION" \
            -t "$REGISTRY/$name:latest" \
            "$PROJECT_ROOT"
    else
        docker build \
            -f "$PROJECT_ROOT/docker/$dockerfile" \
            -t "$REGISTRY/$name:$VERSION" \
            -t "$REGISTRY/$name:latest" \
            "$PROJECT_ROOT"
    fi

    echo "✓ Built $name"

    if [ "$PUSH" = true ]; then
        echo "Pushing $name to registry..."
        docker push "$REGISTRY/$name:$VERSION"
        docker push "$REGISTRY/$name:latest"
        echo "✓ Pushed $name"
    fi
}

# Build Rust services
build_image "event-ingestion" "Dockerfile.rust" "event-ingestion"
build_image "metrics-aggregation" "Dockerfile.rust" "metrics-aggregation"
build_image "correlation-engine" "Dockerfile.rust" "correlation-engine"
build_image "anomaly-detection" "Dockerfile.rust" "anomaly-detection"
build_image "forecasting" "Dockerfile.rust" "forecasting"

# Build TypeScript API
build_image "api" "Dockerfile.api"

# Build React Frontend
build_image "frontend" "Dockerfile.frontend"

echo ""
echo "========================================="
echo "✓ All images built successfully!"
echo "========================================="
echo ""
echo "Images built:"
echo "  - $REGISTRY/event-ingestion:$VERSION"
echo "  - $REGISTRY/metrics-aggregation:$VERSION"
echo "  - $REGISTRY/correlation-engine:$VERSION"
echo "  - $REGISTRY/anomaly-detection:$VERSION"
echo "  - $REGISTRY/forecasting:$VERSION"
echo "  - $REGISTRY/api:$VERSION"
echo "  - $REGISTRY/frontend:$VERSION"
echo ""

if [ "$PUSH" = true ]; then
    echo "All images pushed to $REGISTRY"
fi
