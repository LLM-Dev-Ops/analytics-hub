// k6 Load Testing Script for LLM Analytics Hub
// Tests event ingestion, API queries, and dashboard performance

import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Rate, Trend, Counter, Gauge } from 'k6/metrics';
import { randomIntBetween } from 'https://jslib.k6.io/k6-utils/1.2.0/index.js';

// Custom metrics
const errorRate = new Rate('errors');
const eventIngestionLatency = new Trend('event_ingestion_latency');
const apiQueryLatency = new Trend('api_query_latency');
const eventCounter = new Counter('events_sent');
const activeVUs = new Gauge('active_vus');

// Test configuration
export const options = {
  stages: [
    // Warm-up phase
    { duration: '2m', target: 100 },      // Ramp up to 100 VUs

    // Load test - Normal traffic
    { duration: '5m', target: 1000 },     // Ramp up to 1k VUs
    { duration: '10m', target: 1000 },    // Sustain 1k VUs

    // Stress test - Peak traffic
    { duration: '3m', target: 5000 },     // Ramp up to 5k VUs
    { duration: '5m', target: 5000 },     // Sustain 5k VUs

    // Spike test - Sudden surge
    { duration: '1m', target: 10000 },    // Sudden spike to 10k VUs
    { duration: '3m', target: 10000 },    // Sustain spike

    // Recovery test
    { duration: '2m', target: 1000 },     // Back to normal

    // Cool-down
    { duration: '2m', target: 0 }         // Ramp down to 0
  ],

  thresholds: {
    // HTTP request duration thresholds
    'http_req_duration': [
      'p(95)<500',    // 95% of requests should be below 500ms
      'p(99)<1000'    // 99% of requests should be below 1000ms
    ],

    // Error rate threshold
    'http_req_failed': ['rate<0.01'],     // Error rate should be below 1%
    'errors': ['rate<0.01'],

    // Custom metric thresholds
    'event_ingestion_latency': [
      'p(95)<500',
      'p(99)<1000'
    ],
    'api_query_latency': [
      'p(95)<300',
      'p(99)<500'
    ]
  },

  // Extended execution configuration
  ext: {
    loadimpact: {
      projectID: 3596505,
      name: 'LLM Analytics Hub - Full Load Test'
    }
  }
};

const BASE_URL = __ENV.BASE_URL || 'https://staging.llm-analytics.com';
const API_URL = __ENV.API_URL || 'https://staging-api.llm-analytics.com';
const INGEST_URL = __ENV.INGEST_URL || 'https://staging-ingest.llm-analytics.com';

// Generate realistic test data
function generateEvent() {
  const eventTypes = ['telemetry', 'security', 'cost', 'governance'];
  const sources = ['llm_observatory', 'cost_tracker', 'security_monitor', 'governance_engine'];
  const severities = ['debug', 'info', 'warn', 'error', 'critical'];

  return {
    common: {
      event_id: `${Date.now()}-${randomIntBetween(1000, 9999)}`,
      timestamp: new Date().toISOString(),
      source_module: sources[randomIntBetween(0, sources.length - 1)],
      event_type: eventTypes[randomIntBetween(0, eventTypes.length - 1)],
      correlation_id: null,
      parent_event_id: null,
      schema_version: '1.0.0',
      severity: severities[randomIntBetween(0, severities.length - 1)],
      environment: 'production',
      tags: {
        test: 'load-test',
        k6: 'true'
      }
    },
    payload: {
      custom_type: 'load_test',
      data: {
        test_value: randomIntBetween(1, 1000),
        test_string: 'load-test-data',
        timestamp: Date.now()
      }
    }
  };
}

export default function () {
  activeVUs.add(1);

  group('Event Ingestion', function () {
    const event = generateEvent();
    const startTime = Date.now();

    const response = http.post(
      `${INGEST_URL}/api/v1/events`,
      JSON.stringify(event),
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${__ENV.API_KEY || 'test-key'}`
        },
        tags: { name: 'IngestEvent' }
      }
    );

    const duration = Date.now() - startTime;
    eventIngestionLatency.add(duration);
    eventCounter.add(1);

    const checkResult = check(response, {
      'event ingestion status is 200': (r) => r.status === 200,
      'event ingestion response time < 500ms': (r) => r.timings.duration < 500,
      'response has success field': (r) => JSON.parse(r.body).success === true
    });

    if (!checkResult) {
      errorRate.add(1);
    }
  });

  sleep(randomIntBetween(1, 3));

  group('API Queries', function () {
    // Query recent events
    const queryStart = Date.now();

    const queryResponse = http.get(
      `${API_URL}/api/v1/events?limit=100&offset=0`,
      {
        headers: {
          'Authorization': `Bearer ${__ENV.API_KEY || 'test-key'}`
        },
        tags: { name: 'QueryEvents' }
      }
    );

    const queryDuration = Date.now() - queryStart;
    apiQueryLatency.add(queryDuration);

    check(queryResponse, {
      'query status is 200': (r) => r.status === 200,
      'query response time < 300ms': (r) => r.timings.duration < 300,
      'query returns data': (r) => JSON.parse(r.body).data !== undefined
    });
  });

  sleep(randomIntBetween(2, 5));

  group('Dashboard Metrics', function () {
    // Get aggregated metrics
    const metricsResponse = http.get(
      `${API_URL}/api/v1/metrics/aggregated?window=1h`,
      {
        headers: {
          'Authorization': `Bearer ${__ENV.API_KEY || 'test-key'}`
        },
        tags: { name: 'GetMetrics' }
      }
    );

    check(metricsResponse, {
      'metrics status is 200': (r) => r.status === 200,
      'metrics response time < 500ms': (r) => r.timings.duration < 500
    });
  });

  sleep(randomIntBetween(1, 2));

  activeVUs.add(-1);
}

export function handleSummary(data) {
  return {
    'summary.json': JSON.stringify(data),
    stdout: textSummary(data, { indent: ' ', enableColors: true })
  };
}

function textSummary(data, options) {
  const indent = options.indent || '';
  const colors = options.enableColors || false;

  let summary = `
${indent}=====================================
${indent}Load Test Summary
${indent}=====================================

${indent}Duration: ${data.state.testRunDurationMs}ms

${indent}VUs: ${data.metrics.vus.values.max} (max)
${indent}Iterations: ${data.metrics.iterations.values.count}

${indent}HTTP Requests:
${indent}  Total: ${data.metrics.http_reqs.values.count}
${indent}  Failed: ${data.metrics.http_req_failed.values.rate * 100}%
${indent}  Duration (avg): ${data.metrics.http_req_duration.values.avg}ms
${indent}  Duration (p95): ${data.metrics.http_req_duration.values['p(95)']}ms
${indent}  Duration (p99): ${data.metrics.http_req_duration.values['p(99)']}ms

${indent}Custom Metrics:
${indent}  Events Sent: ${data.metrics.events_sent.values.count}
${indent}  Event Ingestion Latency (p95): ${data.metrics.event_ingestion_latency.values['p(95)']}ms
${indent}  API Query Latency (p95): ${data.metrics.api_query_latency.values['p(95)']}ms
${indent}  Error Rate: ${data.metrics.errors.values.rate * 100}%

${indent}Thresholds:
`;

  for (const [name, threshold] of Object.entries(data.thresholds)) {
    const passed = threshold.ok ? '✓ PASSED' : '✗ FAILED';
    summary += `${indent}  ${name}: ${passed}\n`;
  }

  return summary;
}
