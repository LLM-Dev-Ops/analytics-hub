// k6 Stress Testing Script for LLM Analytics Hub
// Find breaking points and system limits

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

const errorRate = new Rate('errors');
const latency = new Trend('latency');

export const options = {
  stages: [
    // Gradual ramp up to find breaking point
    { duration: '2m', target: 1000 },
    { duration: '2m', target: 2000 },
    { duration: '2m', target: 5000 },
    { duration: '2m', target: 10000 },
    { duration: '2m', target: 15000 },
    { duration: '2m', target: 20000 },

    // Sustain max load
    { duration: '5m', target: 20000 },

    // Gradual ramp down
    { duration: '2m', target: 0 }
  ],

  thresholds: {
    'http_req_duration': ['p(99)<2000'],
    'errors': ['rate<0.05']  // Allow 5% error rate during stress test
  }
};

const INGEST_URL = __ENV.INGEST_URL || 'https://staging-ingest.llm-analytics.com';

export default function () {
  const event = {
    common: {
      event_id: `stress-${Date.now()}-${__VU}-${__ITER}`,
      timestamp: new Date().toISOString(),
      source_module: 'stress_test',
      event_type: 'telemetry',
      schema_version: '1.0.0',
      severity: 'info',
      environment: 'test',
      tags: { stress: 'true' }
    },
    payload: {
      custom_type: 'stress_test',
      data: { vu: __VU, iter: __ITER }
    }
  };

  const startTime = Date.now();
  const response = http.post(
    `${INGEST_URL}/api/v1/events`,
    JSON.stringify(event),
    { headers: { 'Content-Type': 'application/json' } }
  );

  latency.add(Date.now() - startTime);

  const success = check(response, {
    'status is 200 or 429': (r) => r.status === 200 || r.status === 429,
    'no 500 errors': (r) => r.status !== 500
  });

  if (!success) {
    errorRate.add(1);
  }

  sleep(0.5);
}
