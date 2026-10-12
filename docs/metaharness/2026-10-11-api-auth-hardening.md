# API authentication hardening evidence

## Scope and frozen acceptance criteria

This bounded MetaHarness cycle started from `main` commit
`88f4ffa94afd4a14ec94c9b4b3dc723badc7fac1`. It changes only the TypeScript API,
its deterministic Linux CI, tests, and this evidence record. It does not change
the Rust analytics core, deployment, or persistence architecture.

The candidate had to:

1. keep the API TypeScript build passing;
2. make production JWT configuration fail closed for missing, short, or reused
   secrets and restrict JWT signing and verification to HS256;
3. turn the existing TypeScript suites into executable tests without weakening
   their assertions;
4. preserve the production dependency-audit finding count (42 total: 3
   critical, 13 high, 26 moderate) and make no database, cache, or migration
   changes; and
5. pass a signed Flywheel holdout replay before promotion.

## Architecture guidance applied

| Guidance | Build decision | Verification |
| --- | --- | --- |
| Keep Rust as core logic and TypeScript at integration boundaries | Limited the change to API authentication, API tests, and CI; no Rust source changed | `git diff --name-only` and unchanged Rust tree |
| Prefer small focused modules and incremental changes | Hardened the existing JWT manager and test harness rather than introducing a new auth service | TypeScript build and all API suites pass |
| Use deterministic Linux-first CI | Added an Ubuntu 24.04 job with exact Node and action revisions | `.github/workflows/api-quality.yml` |
| Keep RuVector/PostgreSQL as the sole intelligence/persistence path | Added no persistence service or schema | Flywheel anchor checks no database, cache, or migration diff |
| Validate the exact candidate before promotion | Used fixed holdout and anchor checks plus an Ed25519-signed replay | Flywheel promotion and replay ledger below |

## Execution ledger

Pinned revisions and versions:

- MetaHarness repository: `e0dfd44da72b7adfb7c57fdd42d124be58ed7086`
- MetaHarness CLI: `metaharness@0.4.17`
- Darwin: `@metaharness/darwin@0.10.3`
- Flywheel: `@metaharness/flywheel@0.1.12`
- Ruflo: `3.56.3`

Commands executed from an isolated worktree included:

```text
npx metaharness@0.4.17 score . --json
npx ruflo@3.56.3 swarm init --v3-mode
npx ruflo@3.56.3 task create -t review -d "Evaluate analytics-hub authentication hardening against frozen security and regression gates"
node packages/darwin-mode/dist/cli.js evolve <api> --generations 1 --children 1 --concurrency 1 --seed 101120 --sandbox real
npm run build
npm test -- --runInBand --silent
npm audit --omit=dev --json
node run-flywheel.cjs
```

MetaHarness scored the repository at 71 harness-fit, 100 compile confidence,
100 task coverage, 95 tool safety, and 47 memory usefulness. Ruflo initialized
swarm `swarm-1791763899061-1smnp1` and queued review task
`task-1791763903395-8yd2pv`.

Darwin evaluated one bounded generation with seed `101120`. Its generated child
changed prompt-context construction but tied the baseline at `0.985`; the
baseline won and the generated change was discarded.

## Measurements and Flywheel decision

| Gate | Baseline | Candidate |
| --- | ---: | ---: |
| TypeScript build | pass | pass |
| API tests | 0 executed; 7 suites failed to parse | 189/189 pass; 8/8 suites pass |
| Production JWT missing-secret rejection | fail | pass |
| Legacy strategic-recommendation input | fail | pass |
| Telemetry-only process exits normally | fail (timeout) | pass |
| Production audit findings | 42 | 42 |

The real Flywheel evaluation produced holdout scores of `0.2` for baseline and
`1.0` for candidate, with both anchors at `1.0`. It promoted the candidate with
fingerprint
`c5942e7c9bf8f28fe7af47a6ec3887d11eeb3f8c8e8601cc6a7a54969ea0b981`,
recorded lineage `gen1(implementation) -> gen0(root)`, and passed every check in
an Ed25519-signed replay.

## Known blockers and rollback

The pre-existing dependency audit remains unresolved at 42 production findings;
this candidate neither adds nor hides findings. The frontend cannot currently
install because `@llm-dev-ops/infra@^0.1.0` is unavailable to this runtime. The
legacy combined CI also lacks a working ESLint configuration and its Rust jobs
were already failing on the base commit. These conditions remain visible and
must not be represented as green.

Rollback is a normal revert of the candidate commit. JWT deployments must keep
distinct `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET` values of at least 32
bytes; deployments that relied on generated production secrets must configure
them before upgrading.
