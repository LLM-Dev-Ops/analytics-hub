#!/bin/bash
# LLM-Analytics-Hub Deployment Script
# Deploys to Google Cloud Run
#
# Usage: ./deploy.sh [dev|staging|prod]

set -euo pipefail

# Configuration
PROJECT_ID="${PROJECT_ID:-agentics-dev}"
REGION="${REGION:-us-central1}"
SERVICE_NAME="llm-analytics-hub"
ARTIFACT_REGISTRY="us-central1-docker.pkg.dev"
REPOSITORY="llm-dev-ops"

# Environment (default: dev)
PLATFORM_ENV="${1:-dev}"

# Validate environment
if [[ ! "$PLATFORM_ENV" =~ ^(dev|staging|prod)$ ]]; then
  echo "Error: Environment must be dev, staging, or prod"
  exit 1
fi

echo "=================================================="
echo "LLM-Analytics-Hub Deployment"
echo "=================================================="
echo "Project: $PROJECT_ID"
echo "Region: $REGION"
echo "Environment: $PLATFORM_ENV"
echo "=================================================="

# Get current git SHA for versioning
GIT_SHA=$(git rev-parse --short HEAD 2>/dev/null || echo "unknown")
IMAGE_TAG="${ARTIFACT_REGISTRY}/${PROJECT_ID}/${REPOSITORY}/${SERVICE_NAME}:${GIT_SHA}"
IMAGE_LATEST="${ARTIFACT_REGISTRY}/${PROJECT_ID}/${REPOSITORY}/${SERVICE_NAME}:latest"

echo ""
echo "Step 1: Building Docker image..."
echo "Image: $IMAGE_TAG"

cd "$(dirname "$0")/.."
docker build -t "$IMAGE_TAG" -t "$IMAGE_LATEST" -f Dockerfile .

echo ""
echo "Step 2: Pushing to Artifact Registry..."
docker push "$IMAGE_TAG"
docker push "$IMAGE_LATEST"

echo ""
echo "Step 3: Deploying to Cloud Run..."

# Environment-specific settings
case "$PLATFORM_ENV" in
  dev)
    MIN_INSTANCES=1
    MAX_INSTANCES=10
    MEMORY="1Gi"
    CPU=1
    ;;
  staging)
    MIN_INSTANCES=2
    MAX_INSTANCES=20
    MEMORY="2Gi"
    CPU=2
    ;;
  prod)
    MIN_INSTANCES=3
    MAX_INSTANCES=50
    MEMORY="2Gi"
    CPU=2
    ;;
esac

gcloud run deploy "$SERVICE_NAME" \
  --project="$PROJECT_ID" \
  --image="$IMAGE_TAG" \
  --region="$REGION" \
  --platform=managed \
  --allow-unauthenticated=false \
  --ingress=internal \
  --min-instances="$MIN_INSTANCES" \
  --max-instances="$MAX_INSTANCES" \
  --memory="$MEMORY" \
  --cpu="$CPU" \
  --timeout=300s \
  --concurrency=80 \
  --set-env-vars="PLATFORM_ENV=${PLATFORM_ENV},SERVICE_NAME=${SERVICE_NAME},SERVICE_VERSION=${GIT_SHA},NODE_ENV=production,PORT=8080,HOST=0.0.0.0,RUVECTOR_ENDPOINT=https://ruvector-service-${PROJECT_ID}.${REGION}.run.app" \
  --set-secrets="RUVECTOR_API_KEY=ruvector-api-key:latest" \
  --service-account="llm-analytics-hub@${PROJECT_ID}.iam.gserviceaccount.com" \
  --labels="app=llm-analytics-hub,layer=analytics,env=${PLATFORM_ENV}"

echo ""
echo "Step 4: Verifying deployment..."

SERVICE_URL=$(gcloud run services describe "$SERVICE_NAME" \
  --project="$PROJECT_ID" \
  --region="$REGION" \
  --format='value(status.url)')

echo "Service URL: $SERVICE_URL"

# Health check (with auth token for internal service)
TOKEN=$(gcloud auth print-identity-token)

echo ""
echo "Checking health endpoint..."
HEALTH_RESPONSE=$(curl -sf -H "Authorization: Bearer $TOKEN" "$SERVICE_URL/health" || echo "FAILED")

if [[ "$HEALTH_RESPONSE" == "FAILED" ]]; then
  echo "Warning: Health check failed. Service may still be starting."
else
  echo "Health: $HEALTH_RESPONSE"
fi

echo ""
echo "Checking agent endpoints..."
CONSENSUS_HEALTH=$(curl -sf -H "Authorization: Bearer $TOKEN" "$SERVICE_URL/api/v1/agents/consensus/health" || echo "FAILED")
echo "Consensus Agent: $CONSENSUS_HEALTH"

echo ""
echo "=================================================="
echo "Deployment Complete!"
echo "=================================================="
echo "Service: $SERVICE_NAME"
echo "URL: $SERVICE_URL"
echo "Image: $IMAGE_TAG"
echo "Environment: $PLATFORM_ENV"
echo "=================================================="
