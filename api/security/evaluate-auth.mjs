import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
const require = createRequire(import.meta.url);
const { contract, probeAuth } = require('./probe-auth.cjs');
const [baseline, candidate, tools, output] = process.argv.slice(2).map(x => resolve(x));
const fw = await import(pathToFileURL(join(tools, 'node_modules/@metaharness/flywheel/dist/index.js')));
assert.equal(JSON.parse(readFileSync(join(tools, 'node_modules/@metaharness/flywheel/package.json'))).version, '0.1.12');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const paths = ['src/auth/jwt.ts', 'src/auth/rbac.ts'];
const source = root => Object.fromEntries(paths.map(path => [path, readFileSync(join(root, path), 'utf8')]));
const digest = root => hash(JSON.stringify(source(root)));
const parentHash = digest(baseline), candidateHash = digest(candidate);
assert.notEqual(parentHash, candidateHash);
const measurements = [];
let oldNames;

function regression(root) {
  const temp = mkdtempSync(join(tmpdir(), 'analytics-auth-eval-'));
  const reportPath = join(temp, 'jest.json');
  const run = spawnSync(process.execPath, [join(root, 'node_modules/jest/bin/jest.js'), '--runInBand', '--silent', '--json', '--outputFile=' + reportPath], {
    cwd: root, encoding: 'utf8', timeout: 60000, maxBuffer: 8 * 1024 * 1024,
    env: { PATH: process.env.PATH, NODE_ENV: 'test' },
  });
  assert.equal(run.signal, null); assert.equal(run.status, 0, run.stderr.slice(-4000));
  const report = JSON.parse(readFileSync(reportPath));
  const assertions = report.testResults.flatMap(x => x.assertionResults);
  assert(assertions.every(x => x.status === 'passed'));
  const names = assertions.map(x => x.fullName).sort();
  if (root === baseline) { assert.equal(names.length, 189); oldNames = names; }
  else {
    // Retain the complete pre-cycle assertion set, not a brittle total that
    // rejects additive tests. No original assertion may disappear or skip.
    const frozenNames = JSON.parse(readFileSync(new URL('./original-assertions-20261107.json', import.meta.url)));
    assert.equal(frozenNames.length, 219);
    assert(frozenNames.every(x => names.includes(x)));
    assert(oldNames.every(x => names.includes(x)));
    assert(names.includes('compiled RBAC resource-owner boundary denies malformed scoped owners and preserves valid role/tenant behavior'));
  }
  return { exit: run.status, assertions: names.length, retainedNames: oldNames, skipped: 0, reportPath };
}

async function evaluator(policy, suite) {
  const root = policy.auth === parentHash ? baseline : candidate;
  assert.equal(digest(root), policy.auth);
  const report = await probeAuth(root, suite.id === 'holdout' ? contract.holdout : contract.anchor);
  const retained = suite.id === 'anchor' ? regression(root) : undefined;
  const wins = report.map(x => x.pass);
  if (retained) wins.push(true);
  const primary = wins.filter(Boolean).length / wins.length;
  const score = { primary, noopRate: 1 - primary, costPerWin: 0, regressed: suite.id === 'anchor' && wins.some(x => !x), itemWins: wins };
  measurements.push({ source: policy.auth, suite: suite.id, report, retained, score });
  assert.equal(digest(root), policy.auth);
  return score;
}

const fingerprint = fw.gateFingerprint(fw.meetsPromotionRule);
const result = await fw.runFlywheelGenerations({
  rootPolicy: { auth: parentHash },
  proposer: async () => ({ value: candidateHash, summary: 'Validate signed JWT claim shapes and fail closed on missing tenant context', inverse: { files: source(baseline), sha256: parentHash } }),
  evaluator, holdout: { id: 'holdout', items: contract.holdout },
  anchor: { id: 'anchor', items: [...contract.anchor, 'all 189 original assertion names retained'] },
  maxGenerations: 1, signer: fw.makeSigner(), promotionRule: fw.meetsPromotionRule,
  dataSource: 'LIVE_JWT_CRYPTOGRAPHY_RBAC_AND_FASTIFY_LOOPBACK_HTTP',
});
const replay = fw.verifyReplayBundle(result.replayBundle, { pinnedGateFingerprint: fingerprint });
assert.equal(replay.pass, true); assert.equal(result.promotions.length, 1);
const evidence = { contract, contractSha256: hash(readFileSync(new URL('./contract.json', import.meta.url))), probeSha256: hash(readFileSync(new URL('./probe-auth.cjs', import.meta.url))),
  parentHash, candidateHash, measurements, fingerprint, promotions: result.promotions.length, replay, replayBundle: result.replayBundle,
  scope: 'Component contract only, not repository merge approval. Uses actual exported JWT/RBAC/middleware and a native Fastify HTTP listener. Does not prove all production routes install authentication hooks. No auth, HTTP or persistence mocks in the probe. Existing test-suite mocks are regression coverage only. No production services/data. costPerWin=0 is a neutral gate input, not measured cost. Source inverse retained; no data rollback required.' };
writeFileSync(output, JSON.stringify(evidence, null, 2) + '\n');
console.log(JSON.stringify({ promotions: evidence.promotions, replay, measurements: measurements.map(x => ({ suite: x.suite, passes: x.report.filter(y => y.pass).length, total: x.report.length, retained: x.retained?.assertions })) }));
