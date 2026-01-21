# LLM-Analytics-Hub Production Deployment Guide

## Architecture Context (Non-Negotiable)

**LLM-Analytics-Hub** is the **AUTHORITATIVE ANALYTICAL SYNTHESIS & INSIGHT LAYER** for the Agentics Dev platform.

### What LLM-Analytics-Hub DOES:
- Aggregates DecisionEvents across telemetry, cost, governance, and outcomes
- Performs cross-layer correlation and trend analysis
- Produces consensus views and analytical summaries
- Generates strategic and executive-level insights
- Emits read-only analytical artifacts and recommendations

### What LLM-Analytics-Hub does NOT DO:
- ❌ Intercept runtime execution
- ❌ Execute workflows (that is LLM-Orchestrator)
- ❌ Enforce policies (that is LLM-Policy-Engine / Shield)
- ❌ Apply optimizations directly (that is LLM-Auto-Optimizer)
- ❌ Perform anomaly detection (that is LLM-Sentinel)
- ❌ Own a database or execute SQL directly

---

## 1. SERVICE TOPOLOGY

### Unified Service Name
```
Service Name: llm-analytics-hub
Region: us-central1
Platform: Google Cloud Run
```

### Agent Endpoints

| Agent | Base Path | Description |
|-------|-----------|-------------|
| **Consensus Agent** | `/api/v1/agents/consensus` | Cross-signal consensus computation |
| **Strategic Recommendation Agent** | `/api/v1/analytics/strategic-recommendations` | Strategic insight generation |

### Endpoint Details

#### Consensus Agent Endpoints
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/v1/agents/consensus/analyze` | Compute consensus across signals |
| GET | `/api/v1/agents/consensus/health` | Agent health check |
| GET | `/api/v1/agents/consensus/metadata` | Agent capabilities and constraints |

#### Strategic Recommendation Agent Endpoints
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/v1/analytics/strategic-recommendations/analyze` | Generate strategic recommendations |
| GET | `/api/v1/analytics/strategic-recommendations` | List recommendations |
| GET | `/api/v1/analytics/strategic-recommendations/:id` | Get specific recommendation |
| GET | `/api/v1/analytics/strategic-recommendations/summary` | Executive summary |

### Service Health Endpoints
| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Overall service health |
| GET | `/ready` | Readiness probe |
| GET | `/metrics` | Prometheus metrics |

### Deployment Confirmations
- ✅ **No agent deployed as standalone service** - All agents run within unified `llm-analytics-hub` service
- ✅ **Shared runtime** - Single Node.js process serving all endpoints
- ✅ **Shared configuration** - Environment-based configuration applies to all agents
- ✅ **Shared telemetry stack** - Common OpenTelemetry instrumentation

---

## 2. ENVIRONMENT CONFIGURATION

### Required Environment Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `RUVECTOR_ENDPOINT` | ruvector-service URL (persistence) | `https://ruvector-service-xxx.run.app` |
| `RUVECTOR_API_KEY` | API key for ruvector-service auth | Secret Manager reference |
| `PLATFORM_ENV` | Environment identifier | `dev` \| `staging` \| `prod` |
| `TELEMETRY_ENDPOINT` | LLM-Observatory endpoint | `https://llm-observatory-xxx.run.app` |
| `SERVICE_NAME` | Service identifier | `llm-analytics-hub` |
| `SERVICE_VERSION` | Semantic version | `1.0.0` |

### Secret Manager Configuration

```bash
# Create secrets in Google Secret Manager
gcloud secrets create ruvector-api-key --replication-policy="automatic"
echo -n "YOUR_API_KEY" | gcloud secrets versions add ruvector-api-key --data-file=-

gcloud secrets create telemetry-endpoint --replication-policy="automatic"
echo -n "https://llm-observatory-PROJECT_ID.REGION.run.app" | gcloud secrets versions add telemetry-endpoint --data-file=-
```

### Configuration Guarantees
- ✅ **No hardcoded service names or URLs** - All resolved via environment variables
- ✅ **No embedded credentials** - All secrets via Secret Manager
- ✅ **No mutable analytical state** - Stateless service design
- ✅ **Dynamic dependency resolution** - Environment-based configuration

---

## 3. GOOGLE SQL / ANALYTICS MEMORY WIRING

### Persistence Architecture

```
┌─────────────────────┐     HTTP/REST      ┌─────────────────────┐
│  LLM-Analytics-Hub  │ ──────────────────▶│  ruvector-service   │
│  (Cloud Run)        │    DecisionEvents  │  (Cloud Run)        │
│                     │                    │                     │
│  ❌ NO Direct SQL   │                    │  ✅ Google SQL      │
│  ❌ NO Database     │                    │  (PostgreSQL)       │
└─────────────────────┘                    └─────────────────────┘
```

### Validation Confirmations

- ✅ **LLM-Analytics-Hub does NOT connect directly to Google SQL**
  - No `pg` Pool connections in agent handlers
  - RuVectorClient handles all persistence operations
  - See: `api/src/services/ruvector-client.ts`

- ✅ **ALL analytical outputs written via ruvector-service**
  - DecisionEvents persisted via `ruvector.persistDecisionEvent()`
  - Query operations via `ruvector.queryDecisionEvents()`

- ✅ **Schema compatibility with agentics-contracts**
  - `DecisionEventSchema` in `api/src/contracts/decision-event.ts`
  - Zod validation ensures contract compliance

- ✅ **Append-only persistence behavior**
  - DecisionEvents are write-once, never updated
  - Historical audit trail preserved

- ✅ **Idempotent writes and retry safety**
  - RuVectorClient implements retry logic with exponential backoff
  - `retryAttempts: 3`, `retryDelayMs: 1000`
  - Failure logged but computation still returns success

### RuVectorClient Configuration
```typescript
const DEFAULT_CONFIG: RuVectorConfig = {
  endpoint: process.env.RUVECTOR_ENDPOINT || 'http://localhost:8080',
  apiKey: process.env.RUVECTOR_API_KEY,
  timeoutMs: 5000,
  retryAttempts: 3,
  retryDelayMs: 1000,
};
```

---

## 4. CLOUD BUILD & DEPLOYMENT

### Prerequisites

```bash
# Enable required APIs
gcloud services enable \
  cloudbuild.googleapis.com \
  run.googleapis.com \
  secretmanager.googleapis.com \
  artifactregistry.googleapis.com

# Create Artifact Registry repository
gcloud artifacts repositories create llm-dev-ops \
  --repository-format=docker \
  --location=us-central1 \
  --description="LLM Dev Ops container images"
```

### IAM Service Account Requirements (Least Privilege)

```bash
# Create service account
gcloud iam service-accounts create llm-analytics-hub \
  --display-name="LLM Analytics Hub Service Account"

# Grant required roles
PROJECT_ID=$(gcloud config get-value project)

# Cloud Run Invoker (for internal service calls)
gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:llm-analytics-hub@${PROJECT_ID}.iam.gserviceaccount.com" \
  --role="roles/run.invoker"

# Secret Manager accessor
gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:llm-analytics-hub@${PROJECT_ID}.iam.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"

# Cloud Trace agent (for telemetry)
gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:llm-analytics-hub@${PROJECT_ID}.iam.gserviceaccount.com" \
  --role="roles/cloudtrace.agent"
```

### Networking Requirements
- **Ingress**: `internal` (only accessible from within VPC/other Cloud Run services)
- **Egress**: Allowed to ruvector-service and LLM-Observatory
- **No public internet access required**

### Deployment Commands

#### Option A: gcloud CLI Direct Deploy

```bash
# Build and push image
cd api
docker build -t us-central1-docker.pkg.dev/${PROJECT_ID}/llm-dev-ops/llm-analytics-hub:latest .
docker push us-central1-docker.pkg.dev/${PROJECT_ID}/llm-dev-ops/llm-analytics-hub:latest

# Deploy to Cloud Run
gcloud run deploy llm-analytics-hub \
  --image=us-central1-docker.pkg.dev/${PROJECT_ID}/llm-dev-ops/llm-analytics-hub:latest \
  --region=us-central1 \
  --platform=managed \
  --allow-unauthenticated=false \
  --ingress=internal \
  --min-instances=1 \
  --max-instances=10 \
  --memory=1Gi \
  --cpu=1 \
  --timeout=300s \
  --concurrency=80 \
  --set-env-vars="PLATFORM_ENV=dev,SERVICE_NAME=llm-analytics-hub,SERVICE_VERSION=1.0.0" \
  --set-secrets="RUVECTOR_API_KEY=ruvector-api-key:latest" \
  --set-secrets="TELEMETRY_ENDPOINT=telemetry-endpoint:latest" \
  --service-account=llm-analytics-hub@${PROJECT_ID}.iam.gserviceaccount.com
```

#### Option B: Cloud Build Trigger

```bash
# Submit build
gcloud builds submit --config=api/cloudbuild.yaml .

# Or create trigger for automated deployments
gcloud builds triggers create github \
  --repo-name=analytics-hub \
  --repo-owner=globalbusinessadvisors \
  --branch-pattern="^main$" \
  --build-config=api/cloudbuild.yaml \
  --name=llm-analytics-hub-deploy
```

### Environment-Specific Deployment

```bash
# Development
gcloud run deploy llm-analytics-hub \
  --set-env-vars="PLATFORM_ENV=dev" \
  --tag=dev

# Staging
gcloud run deploy llm-analytics-hub \
  --set-env-vars="PLATFORM_ENV=staging" \
  --tag=staging

# Production
gcloud run deploy llm-analytics-hub \
  --set-env-vars="PLATFORM_ENV=prod" \
  --tag=prod \
  --min-instances=3 \
  --max-instances=50
```

---

## 5. CLI ACTIVATION VERIFICATION

### CLI Commands Per Agent

#### Strategic Recommendation Agent

| Command | Subcommand | Description |
|---------|------------|-------------|
| `strategic-recommendation` | `analyze` | Run strategic analysis |
| `strategic-recommendation` | `summarize` | Get executive summary |
| `strategic-recommendation` | `inspect` | View specific recommendation |
| `strategic-recommendation` | `list` | List recent recommendations |

#### Consensus Agent

| Command | Subcommand | Description |
|---------|------------|-------------|
| `consensus-agent` | `analyze` | Compute consensus |
| `consensus-agent` | `health` | Check agent health |

### CLI Configuration

The CLI resolves service URL dynamically via environment:

```bash
export ANALYTICS_HUB_URL=https://llm-analytics-hub-xxx.run.app
```

### Example Invocations

```bash
# Strategic Recommendation - Analyze
npx @analytics-hub/cli strategic-recommendation analyze \
  --start-time 2024-01-01T00:00:00Z \
  --end-time 2024-01-31T23:59:59Z \
  --domains observatory,cost-ops,governance \
  --output-format json

# Expected output:
{
  "recommendations": [...],
  "totalSignalsAnalyzed": 1247,
  "trendsIdentified": 12,
  "correlationsFound": 8,
  "overallConfidence": 0.87
}

# Strategic Recommendation - Summarize
npx @analytics-hub/cli sr summarize --limit 5 --format text

# Expected output:
Executive Summary (Last 7 Days)
═══════════════════════════════
Total Recommendations: 23
Priority Breakdown:
  - Critical: 2
  - High: 8
  - Medium: 10
  - Low: 3

Top Recommendations:
1. [CRITICAL] Optimize model inference costs - Confidence: 94%
2. [HIGH] Implement token caching strategy - Confidence: 89%
...

# Strategic Recommendation - Inspect
npx @analytics-hub/cli sr inspect <recommendation-id> --format json

# Strategic Recommendation - List
npx @analytics-hub/cli sr list --limit 10 --start-time 2024-01-01T00:00:00Z

# Consensus Agent - Analyze (via API)
curl -X POST https://llm-analytics-hub-xxx.run.app/api/v1/agents/consensus/analyze \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "signals": [...],
    "timeRange": {"start": "...", "end": "..."},
    "options": {"minAgreementThreshold": 0.6}
  }'
```

### CLI Configuration Guarantees
- ✅ **Service URL resolved dynamically** - Via `ANALYTICS_HUB_URL` environment variable
- ✅ **No CLI change requires agent redeployment** - CLI is decoupled from service

---

## 6. PLATFORM & CORE INTEGRATION

### Input Sources (READ)

| Source | Data Provided | Integration |
|--------|---------------|-------------|
| **LLM-Observatory** | Telemetry, traces, metrics | HTTP polling / event subscription |
| **LLM-CostOps** | Cost data, ROI metrics | HTTP API |
| **LLM-Governance-Dashboard** | Governance artifacts, compliance | HTTP API |

### Output Consumers (READ-ONLY)

| Consumer | Data Consumed | Access Pattern |
|----------|---------------|----------------|
| **LLM-Auto-Optimizer** | Analytical insights | Read-only subscription |
| **Governance Dashboard** | DecisionEvents, summaries | Read-only query |
| **Executive Views** | Strategic recommendations | Read-only API |
| **Core Bundles** | Analytical artifacts | Read-only consumption |

### Integration Boundaries

```
                    ┌──────────────────────────────────────┐
                    │         LLM-Analytics-Hub            │
                    │                                      │
   ┌────────────────┼──────────────────────────────────────┼────────────────┐
   │                │                                      │                │
   │  INPUTS        │                                      │  OUTPUTS       │
   │  (Read)        │                                      │  (Read-Only)   │
   │                │                                      │                │
   │  ┌───────────┐ │                                      │ ┌────────────┐ │
   │  │Observatory├─┼─▶                                  ──┼─┤Auto-Optimizer│
   │  └───────────┘ │                                      │ └────────────┘ │
   │  ┌───────────┐ │      ┌─────────────────────┐         │ ┌────────────┐ │
   │  │ CostOps   ├─┼─────▶│  Consensus Agent    │────────┼─┤Governance  │ │
   │  └───────────┘ │      │  Strategic Agent    │         │ │Dashboard   │ │
   │  ┌───────────┐ │      └─────────────────────┘         │ └────────────┘ │
   │  │Governance ├─┼─▶                                  ──┼─┤Executive   │ │
   │  │Dashboard  │ │                                      │ │Views       │ │
   │  └───────────┘ │                                      │ └────────────┘ │
   │                │                                      │                │
   └────────────────┼──────────────────────────────────────┼────────────────┘
                    │                                      │
                    └──────────────────────────────────────┘

   ─────────────────────────────── FORBIDDEN ───────────────────────────────

   ❌ Analytics-Hub ──X──▶ Runtime Execution Paths
   ❌ Analytics-Hub ──X──▶ Enforcement Layers (Policy Engine)
   ❌ Analytics-Hub ──X──▶ Optimization Agents (direct invoke)
   ❌ Analytics-Hub ──X──▶ Workflow Orchestration
   ❌ Analytics-Hub ──X──▶ Incident Workflows
```

### Integration Confirmations

- ✅ **LLM-Observatory provides telemetry inputs**
- ✅ **LLM-CostOps provides cost/ROI inputs**
- ✅ **LLM-Governance-Dashboard provides governance artifacts**
- ✅ **LLM-Auto-Optimizer MAY consume outputs (read-only)**
- ✅ **Governance/executive views consume DecisionEvents**
- ✅ **Core bundles consume outputs without rewiring**
- ✅ **No direct influence on execution pipelines**
- ✅ **No rewiring of Core bundles required**

---

## 7. POST-DEPLOY VERIFICATION CHECKLIST

### Service Verification

```bash
# 1. Verify service is live
SERVICE_URL=$(gcloud run services describe llm-analytics-hub \
  --region=us-central1 --format='value(status.url)')
echo "Service URL: $SERVICE_URL"

# 2. Health check
curl -f "$SERVICE_URL/health"
# Expected: {"status":"healthy","timestamp":"...","version":"1.0.0",...}

# 3. Readiness check
curl -f "$SERVICE_URL/ready"
# Expected: {"ready":true,"timestamp":"..."}
```

### Agent Endpoint Verification

```bash
# 4. Consensus Agent health
curl -f "$SERVICE_URL/api/v1/agents/consensus/health"
# Expected: {"status":"healthy","agent_id":"consensus-agent",...}

# 5. Consensus Agent metadata
curl -f "$SERVICE_URL/api/v1/agents/consensus/metadata"
# Expected: {"agent_id":"consensus-agent","agent_version":"1.0.0",...}

# 6. Strategic Recommendations list
curl -f "$SERVICE_URL/api/v1/analytics/strategic-recommendations?limit=1"
# Expected: {"recommendations":[],"total":0,"limit":1,"offset":0}
```

### Analytical Output Verification

```bash
# 7. Test consensus computation (determinism check)
PAYLOAD='{
  "signals": [
    {"signalId":"s1","sourceLayer":"observatory","value":0.8,"confidence":0.9,"timestamp":"2024-01-01T00:00:00Z"},
    {"signalId":"s2","sourceLayer":"cost-ops","value":0.75,"confidence":0.85,"timestamp":"2024-01-01T00:00:00Z"}
  ],
  "timeRange": {"start":"2024-01-01T00:00:00Z","end":"2024-01-02T00:00:00Z"}
}'

# Run twice and compare outputs
RESULT1=$(curl -s -X POST "$SERVICE_URL/api/v1/agents/consensus/analyze" \
  -H "Content-Type: application/json" -d "$PAYLOAD")
RESULT2=$(curl -s -X POST "$SERVICE_URL/api/v1/agents/consensus/analyze" \
  -H "Content-Type: application/json" -d "$PAYLOAD")

# Verify deterministic (same inputs_hash)
echo "$RESULT1" | jq '.decisionEvent.inputs_hash'
echo "$RESULT2" | jq '.decisionEvent.inputs_hash'
# Should be identical
```

### Persistence Verification

```bash
# 8. Verify DecisionEvents appear in ruvector-service
# (Query ruvector-service directly)
curl "$RUVECTOR_ENDPOINT/api/v1/decision-events?agent_id=consensus-agent&limit=5"
```

### Telemetry Verification

```bash
# 9. Check telemetry in LLM-Observatory
# (Verify traces appear in Cloud Trace or Observatory dashboard)
gcloud trace traces list --filter="span.name:consensus-agent"
```

### Complete Checklist

| # | Check | Command/Action | Expected Result |
|---|-------|----------------|-----------------|
| 1 | Service is live | `gcloud run services describe` | Returns service URL |
| 2 | Health endpoint responds | `curl /health` | `{"status":"healthy",...}` |
| 3 | Readiness endpoint responds | `curl /ready` | `{"ready":true,...}` |
| 4 | Consensus agent health | `curl /api/v1/agents/consensus/health` | `{"status":"healthy",...}` |
| 5 | Strategic agent list | `curl /api/v1/analytics/strategic-recommendations` | Returns array |
| 6 | Consensus is deterministic | Run same input twice | Same `inputs_hash` |
| 7 | Consensus handles divergence | Test with divergent signals | `divergentSignals` array populated |
| 8 | DecisionEvents in ruvector | Query ruvector-service | Events present |
| 9 | Telemetry in Observatory | Check traces | Spans visible |
| 10 | No direct SQL access | Code review | Only RuVectorClient used |
| 11 | Contracts validated | Test with invalid input | 400 response with Zod errors |
| 12 | CLI commands work | Run CLI commands | Successful execution |

---

## 8. FAILURE MODES & ROLLBACK

### Common Deployment Failures

| Failure | Detection Signal | Resolution |
|---------|------------------|------------|
| **Image build failure** | Cloud Build fails | Check Dockerfile, dependencies |
| **Secret access denied** | 403 on startup | Grant Secret Manager access to SA |
| **ruvector-service unreachable** | Health check fails | Verify network, URL, API key |
| **Memory exhaustion** | OOM kills | Increase memory limit |
| **Cold start timeout** | 503 errors | Enable min-instances, startup boost |

### Detection Signals

| Issue | Signal | Monitoring |
|-------|--------|------------|
| Missing insights | No new DecisionEvents | Query ruvector for recent events |
| Incorrect aggregation | Unexpected consensus values | Compare with manual calculation |
| Schema mismatches | Validation errors in logs | Check Cloud Logging for Zod errors |
| Persistence failures | `persistDecisionEvent` errors | Alert on log pattern |

### Rollback Procedure

```bash
# 1. List recent revisions
gcloud run revisions list --service=llm-analytics-hub --region=us-central1

# 2. Route traffic to previous stable revision
gcloud run services update-traffic llm-analytics-hub \
  --region=us-central1 \
  --to-revisions=llm-analytics-hub-00XXX-abc=100

# 3. Verify rollback
curl -f "$SERVICE_URL/health"
curl -f "$SERVICE_URL/api/v1/agents/consensus/health"

# 4. (Optional) Delete failed revision
gcloud run revisions delete llm-analytics-hub-00YYY-def --region=us-central1
```

### Safe Redeploy Strategy

```bash
# Deploy with traffic split (canary)
gcloud run deploy llm-analytics-hub \
  --image=NEW_IMAGE \
  --no-traffic

# Get new revision name
NEW_REVISION=$(gcloud run revisions list \
  --service=llm-analytics-hub \
  --region=us-central1 \
  --format='value(REVISION)' \
  --limit=1)

# Route 10% traffic to new revision
gcloud run services update-traffic llm-analytics-hub \
  --region=us-central1 \
  --to-revisions="${NEW_REVISION}=10"

# Monitor for 15 minutes, then increase
gcloud run services update-traffic llm-analytics-hub \
  --region=us-central1 \
  --to-revisions="${NEW_REVISION}=50"

# If healthy, route 100%
gcloud run services update-traffic llm-analytics-hub \
  --region=us-central1 \
  --to-latest
```

### Analytical Data Safety

- **DecisionEvents are append-only** - No data loss on service redeploy
- **ruvector-service maintains persistence** - Independent of Analytics-Hub lifecycle
- **Idempotent computation** - Same inputs produce same outputs (deterministic)
- **No mutable state in service** - Safe to restart/redeploy anytime

---

## Quick Reference

### Deployment Command (Full)

```bash
export PROJECT_ID=agentics-dev
export REGION=us-central1

# Build
cd api && docker build -t us-central1-docker.pkg.dev/${PROJECT_ID}/llm-dev-ops/llm-analytics-hub:latest .

# Push
docker push us-central1-docker.pkg.dev/${PROJECT_ID}/llm-dev-ops/llm-analytics-hub:latest

# Deploy
gcloud run deploy llm-analytics-hub \
  --image=us-central1-docker.pkg.dev/${PROJECT_ID}/llm-dev-ops/llm-analytics-hub:latest \
  --region=${REGION} \
  --platform=managed \
  --allow-unauthenticated=false \
  --ingress=internal \
  --min-instances=1 \
  --max-instances=10 \
  --memory=1Gi \
  --cpu=1 \
  --timeout=300s \
  --concurrency=80 \
  --set-env-vars="PLATFORM_ENV=dev,SERVICE_NAME=llm-analytics-hub,SERVICE_VERSION=1.0.0,RUVECTOR_ENDPOINT=https://ruvector-service-${PROJECT_ID}.${REGION}.run.app" \
  --set-secrets="RUVECTOR_API_KEY=ruvector-api-key:latest,TELEMETRY_ENDPOINT=telemetry-endpoint:latest" \
  --service-account=llm-analytics-hub@${PROJECT_ID}.iam.gserviceaccount.com

# Verify
SERVICE_URL=$(gcloud run services describe llm-analytics-hub --region=${REGION} --format='value(status.url)')
curl -f "$SERVICE_URL/health"
```
