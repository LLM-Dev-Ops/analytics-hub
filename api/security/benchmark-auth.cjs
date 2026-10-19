const assert = require('node:assert/strict');
const { writeFileSync } = require('node:fs');
const { resolve } = require('node:path');
const { performance } = require('node:perf_hooks');
const { contract, probeAuth } = require('./probe-auth.cjs');

(async () => {
  const [baseline, candidate, output] = process.argv.slice(2).map(x => resolve(x));
  const measurements = [];
  for (let trial = 0; trial < 5; trial++) {
    for (const [revision, root] of trial % 2 ? [['candidate', candidate], ['baseline', baseline]] : [['baseline', baseline], ['candidate', candidate]]) {
      const started = performance.now();
      const results = await probeAuth(root);
      measurements.push({ trial, revision, elapsed_ms: performance.now() - started, results });
    }
  }
  const summary = ['baseline', 'candidate'].map(revision => {
    const runs = measurements.filter(x => x.revision === revision);
    const holdout = runs.flatMap(x => x.results.filter(y => contract.holdout.includes(y.name)));
    const anchor = runs.flatMap(x => x.results.filter(y => contract.anchor.includes(y.name)));
    const times = runs.map(x => x.elapsed_ms).sort((a, b) => a - b);
    return { revision, holdoutPassed: holdout.filter(x => x.pass).length, holdoutTotal: 100,
      anchorPassed: anchor.filter(x => x.pass).length, anchorTotal: 50, medianSuiteMs: times[2] };
  });
  assert.equal(summary[1].holdoutPassed, 100); assert(summary.every(x => x.anchorPassed === 50));
  const evidence = { contract: contract.id, measurements, summary,
    scope: 'Five alternating-order in-process cryptographic/RBAC/loopback HTTP trials; every sample retained. Cold-load and warm-cache timing differ; synthetic reliability benchmark, no production speedup/cost claim.' };
  writeFileSync(output, JSON.stringify(evidence, null, 2) + '\n');
  console.log(JSON.stringify(summary));
})().catch(e => { console.error(e); process.exitCode = 1; });
