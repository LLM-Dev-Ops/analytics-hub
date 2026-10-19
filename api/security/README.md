# JWT and tenant boundary regression gates

Baseline: `0021e2d7504db3046128bc2e6144983194f802fa` (existing PR #2).
Frozen criteria are in `contract.json`; they were executed before implementation.

The JWT verifier previously trusted a TypeScript cast after checking a signature.
It accepted missing identity/expiry claims and non-boolean MFA values. Resource
authorization also allowed scoped resources when the caller lacked tenant context.
The fix validates claim shapes and requires matching tenant identity before
ordinary admin/owner access. Explicit super-admin behavior and unprivileged empty
role/permission arrays remain supported.

| Check | Baseline | Candidate |
| --- | ---: | ---: |
| Malformed-claim/tenant rejection holdout | 0/20 | 20/20 |
| Compatibility anchors | 10/10 | 10/10 |
| API assertions | 189 | 219 |
| Five-trial rejection checks | 0/100 | 100/100 |
| Five-trial compatibility checks | 50/50 | 50/50 |
| Production npm audit findings | 42 | 42 |

API build and all assertions pass on Node 20.20.2 and Node 24.19.0. The original
189 assertion names are retained without skips. No dependency lockfile, Rust,
database, cache, deployment or migration changes are included. This is a component
authorization check, not proof that every production route installs auth hooks.

## Reproduction

Create isolated baseline and candidate checkouts. In each `api` directory run
`npm ci --ignore-scripts` and `npm run build`. In candidate `api` run:

```sh
npm test -- --runInBand --silent
node security/probe-auth.cjs /absolute/candidate/api
node security/evaluate-auth.mjs /absolute/baseline/api /absolute/candidate/api /absolute/pinned-tools /tmp/auth-flywheel.json
node security/benchmark-auth.cjs /absolute/baseline/api /absolute/candidate/api /tmp/auth-benchmark.json
```

The probe uses real jsonwebtoken signing/verification, exported RBAC functions and
a real Fastify loopback listener with native fetch. Signing keys and identities
are explicitly synthetic fixtures. No authentication, HTTP or persistence mocks
are used by this probe. Existing Jest mocks remain regression coverage only.
Every benchmark sample is retained; cold-load/warm-cache timing is synthetic and
does not establish a production latency or cost improvement.

## Tool invocation evidence

Pinned upstream documentation: `e0dfd44da72b7adfb7c57fdd42d124be58ed7086`.
MetaHarness 0.4.17 `score ROOT --json` stayed 71/100. Compile-confidence and cost
estimates are static, not build or spending measurements.

Darwin 0.10.3 was executed in `api` using:

```sh
node /absolute/tools/node_modules/@metaharness/darwin/dist/cli.js evolve . --generations 1 --children 2 --concurrency 1 --seed 2026101914 --sandbox real --selection pareto
```

Nine actual npm-test processes exited zero, each running 219 assertions. Both
retry-policy mutations tied baseline at 0.985 and were rejected: NO_IMPROVEMENT.
The real sandbox cannot discriminate harness-surface behavior here; no harness
optimization gain is claimed.

Flywheel 0.1.12 `runFlywheelGenerations` uses the unchanged `meetsPromotionRule`,
one generation, a signed lineage and `verifyReplayBundle`. Component promotion
passed with all eight Ed25519 replay checks. Gate fingerprint:
`c5942e7c9bf8f28fe7af47a6ec3887d11eeb3f8c8e8601cc6a7a54969ea0b981`.
The proposal retains baseline source bytes and their composite hash for rollback.
`costPerWin=0` is a neutral gate input, not a cost measurement.

Ruflo 3.56.3 initialized a hierarchical swarm with max-agents 1 and auto-scale
disabled, then invoked `hooks pre-task --task-id analytics-auth-boundary-20261019b`.
The post-task learning path uses the reviewed research-lab `offline-exec.py` and
`ruflo-local-model.mjs` launcher, Transformers 4.3.1 and checksum-pinned local
MiniLM revision `751bff37182d3f1213fa05d7196b954e230abad9`. No default network hook
or hash-embedding fallback is permitted. Completion requires the actual outcome
and all four learning persistence/feedback/trajectory indicators, not exit alone.

## Independent blockers and rollback

Merge remains blocked: production npm audit has 42 findings (3 critical, 13 high,
26 moderate); the frontend cannot install `@llm-dev-ops/infra@^0.1.0`; API ESLint
configuration is absent; full TypeScript formatting is red. Locked Rust test,
build and strict Clippy exit 101 because the git cost-ops dependency has no
matching `cost-ops` package. Rust formatting exits 1; committed-lockfile audit
finds 26 vulnerabilities and 16 warnings. These are not passing results.

Bootstrap was run on the existing development desktop and OpenSSL 3.0.13 verified.
No Rust source or audit baseline was rewritten. Main-push workflows publish
images and trigger deployment, so merge is also prohibited without resolving
that deployment boundary; this work runs PR validation only.

Revert the implementation commit to restore the prior verifier, resource policy
and validation workflow. Flywheel's inverse contains the original source bytes.
No production data/schema operation occurred and no data rollback is needed.
Malformed or indefinitely-lived tokens that previously passed will intentionally
be rejected by the hardened verifier.
