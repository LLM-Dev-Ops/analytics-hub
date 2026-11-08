# Analytics-hub: scoped resource-owner validation — November 7, 2026

EXECUTED and component VALIDATED; full merge BLOCKED. Resumed existing non-draft PR2; no duplicate PR or merge. No deployment, package/image publication, new paid provisioning, force-push or protection bypass. Scheduling is not execution proof.

## Source and substantive implementation

Baseline `4b4e48f056ef7f886573063e56f57e8b3db7d166`; frozen contract/probe `27f4d2bcca49341e20f6549751ed4ee517295e20`; exact final candidate `8b6efa96baa151f823322254663c4abe3a5dab67`; unchanged main `88f4ffa94afd4a14ec94c9b4b3dc723badc7fac1`. Every branch update used an expected-head lease and fast-forward. Shell write credentials were not assumed. One isolated writer per worktree. Native merge-tree check returned `2b5d50093c4459275e118c4a941cfddeb27a11df`; GitHub mergeable=true. No conflicts required resolution; no resulting merged-main SHA.

RBACManager.canAccessResource previously used a truthiness check for resource.userId. Empty/falsy owners could erase scoping, while malformed truthy owners reached the same-tenant admin allowance. It now detects a present owner and requires a nonblank string before owner/admin access logic. Existing base permission, tenant boundaries, own-resource access and explicit super-admin bypass remain unchanged. This is runtime validation of resource metadata, not proof every route installs an auth hook.

Eight malformed values (empty/blank strings, null, false, zero, arrays and object) plus eight compatibility anchors were frozen and committed before production edits. Native child processes load compiled production RBACManager, with no auth/evaluator mocks or fake clocks. Five alternating baseline/candidate trials measured **0/8→8/8**, anchors **8/8→8/8**. This is correctness lift, not measured latency/cost/energy improvement.

Initial API CI passed220 tests but its older evaluator rejected the added test because it hard-coded exactly219 assertions. The correction freezes all219 original assertion names, requires every one to remain and pass, retains the old189-name check, and requires the new compiled owner regression. No original assertion, security contract case, skip check or scoring rule was relaxed. Direct source tests were then added for the eight repairs/eight anchors so TypeScript coverage also exercises the production method; final API count236.

## Measurements and actual gates

| Operation | Actual result |
|---|---|
| `npm ci --ignore-scripts` and `npm run build` in api | exit0 on primary and RuOS; clean final-SHA primary checkout rebuilt |
| `npm test -- --runInBand --json` |219→236 pass; all original names retained, zero skips; final RuOS236/236 |
| Exact-head [API Quality](https://github.com/LLM-Dev-Ops/analytics-hub/actions/runs/42433048092) | success: build/tests, legacy auth Flywheel evaluation/replay and benchmark |
| TypeScript coverage, same all-source collection both sides | lines17.16%→17.81%, branches17.89%→19.35%; still low repository assurance |
| API `npm run lint` | exit2, existing ESLint configuration missing |
| API whole-source Prettier check | exit1,74 files; new regression-test formatting passes |
| API full npm audit | exit1,63 findings:9low/28moderate/22high/4critical |
| API production npm audit | exit1,43 findings:27moderate/13high/3critical; dependency lock unchanged |
| Frontend locked install | exit1,E404 for @llm-dev-ops/infra@^0.1.0; frontend build/test not validated |
| Initial `cargo test --locked` | timeout124 after persistent Cargo packfile ENOSPC warnings |
| Temporary Cargo home/target retry | exit101: referenced Git repository has no matching package named cost-ops |
| Locked Rust build / strict Clippy with temporary Cargo storage | exit101, same missing package; no compilation or test success claimed |
| Rust formatting | exit1, existing diffs |
| Rust audit | exit1,36 vulnerabilities,10 unmaintained/17 unsound/1 yanked warnings;622 locked dependencies; advisory DB309392b18f6b17022f82c701f300433126901068, updated2026-11-06 |
| Branch-protection administration GET |403 Resource not accessible by integration; distinct from successful source writes |

Root/frontend dependency audits and full integration/production-route coverage remain unverified, not covered by API findings. Broader CI jobs were still in progress at snapshot; no unknown gate is treated as passed.

**Independent merge side-effect blocker:** cd-build-push.yml triggers on main pushes and publishes images; cd-deploy.yml follows successful image workflow runs and deploys Kubernetes environments. This request forbids publication/deployment. Those workflows were inspected, not invoked or silently disabled. Even green component tests do not authorize a merge with those side effects.

## Real pinned tools and invocations

Verified installed Ruflo3.56.3, Transformers4.3.1, MetaHarness0.4.2, Darwin0.10.3, Flywheel0.1.12. Primary Node24.22.1; RuOS Node20.20.2, Cargo/Rust1.99.1 and OpenSSL3.0.13. Harness upstream main verified with git ls-remote: `574ce3b881e902d23472a541f9f9e2fdccfa63db`. Installed pinned docs/interfaces were read and hashed; tool receipts retain these hashes. Historical PR versions/results are not current execution evidence.

From isolated RuOS API worktree:

```sh
node /home/ruv/.local/share/llm-dev-ops-tools/node_modules/ruflo/bin/ruflo.js swarm init --topology hierarchical --max-agents 1 --auto-scale false --with-permissions strict --format json
npm_config_cache=/tmp/an7-cache /home/ruv/.local/share/llm-dev-ops-tools/node_modules/.bin/metaharness score . --json
npm_config_cache=/tmp/an7-cache timeout --kill-after=3 25 /home/ruv/.local/share/llm-dev-ops-tools/node_modules/.bin/metaharness-darwin evolve . --generations 1 --children 1 --concurrency 1 --seed 2026110720 --risk-budget 0 --sandbox real --mutator deterministic
```

Ruflo initialization exit0. Actual agent_spawn/agent_execute/agent_terminate handlers in pinned @claude-flow/cli/dist/src/mcp-tools/agent-tools.js ran for an7eve-review, read-only task, model inherit, maxTokens64/temperature0. Registration/termination succeeded; execution success=false: **No LLM provider configured**. No credential extraction/repurposing or completed autonomous-worker claim.

MetaHarness exit0, heuristic fit64; compileConfidence90 is not execution proof. First Darwin attempt timeout124 before scoring, retained as failed attempt. One bounded retry in fresh `/tmp/an7-darwin/api` used the same command with75-second timeout; exit0, both variants0.985/pass1.00, baseline retained: **NO_IMPROVEMENT**. It evaluated revision060a589 (production RBAC bytes identical to final); later assertion-accounting/source-test additions were revalidated on exact final head. No generated optimizer surface was adopted. Fresh state avoids the independently verified repeated-run collision, rather than clearing another active run.

Cycle evaluator:

```sh
node api/security/evaluate-owner.mjs /tmp/an7-base/api /tmp/an7-exact/api /tmp/inc7-tools /tmp/an7-flywheel-final2.json
```

The retained evaluator actually imports pinned Flywheel0.1.12 and runs runFlywheelGenerations, a real production-source proposal, native evaluation, signer, gate fingerprint and replay verification. Explicit regressed=true is a fail-closed full-repository veto, not a new component regression. Zero noop/cost inputs are neutral, not measured savings. **Cycle full-gate promotions0**, root-only Ed25519 replay8/8; root replay is not candidate-promotion proof. Original RBAC source bytes/hash inverse matched git parent independently. Legacy API CI's separate older20-case auth component evaluator can promote its scoped component; that is explicitly not repository merge eligibility and does not override this cycle's full-gate rejection.

## Runtime recovery, learning and memory

Recovery checkout HEAD6454d374a939f2b5f94709b6909f4251b7204252 and current upstream83c4850c04d6243c1f700ec4a6a0e406a7d7198a inspected without modifying that checkout. Bootstrap SHA256e85f54517c94899ec98f169ea7dd1f97341a7cc58eeabdbd76f3e1fa6fc09150 equals current upstream. Initial wake-up command timed out; retry bootstrap exit0 and pkg-config OpenSSL3.0.13 verified before real locked Rust attempts. Persistent volume100% used with39MB available at preflight; temporary storage permitted independent npm/Rust diagnosis. No broad home cleanup or paid provisioning.

```sh
RUFLO_MODEL_DIR=/home/ruv/.cache/llm-dev-ops-models timeout --kill-after=3 40 python3 /home/ruv/work/research-lab-runtime-recovery-20261016/scripts/offline-exec.py node --import /home/ruv/work/research-lab-runtime-recovery-20261016/scripts/ruflo-local-model.mjs /home/ruv/.local/share/llm-dev-ops-tools/node_modules/ruflo/bin/ruflo.js hooks post-task --task-id analytics-20261107-owner-final --success false --quality 0.8 --agent codex --task 'Final source-owner regression checks added; 236 API tests pass, originals retained; full Rust, frontend, security and deployment-boundary gates blocked; no merge' --store-results --format json
```

Exit0, real384-dimensional MiniLM verified; remote loading disabled, checksum-pinned model revision751bff37182d3f1213fa05d7196b954e230abad9. learningUpdates.available/outcomePersisted, feedback.recorded and trajectory.recorded all true;2 feedback updates. No anchor-mirror error on this run; persistent disk is not thereby repaired. Separate IPv4/IPv6 parent and inherited-child socket creation denied PermissionError errno1. No hash fallback or project-data model download. No active pheromone swarm claimed. Tool-local scratch state is uncommitted; no service-owned database introduced.

Paired Core Memory recall used identical real situation/maxima10/10: dream-machine0 playbooks/0 anti-patterns; nicholas-ruest/ruvnet-dream-machine9/6,8 deduplicated by source+lesson. Both unscreened=true; that is distinct from empty retrieval. IDs/citations in recall.json. Historical source evidence at a507f788fc606aa61dc2125106cfa44f4ea8fff8, docs/dream-cycle/2026-09-02-evaluation-adapters-report.md independently verified; applied as fresh isolated Darwin retry, not policy promotion. Outcome append accepted in existing dream-machine for final candidate. No records moved, deleted or promoted. Other-repository historical approval guidance does not override Nick's explicit project authorization or full gates.

## Coverage, remaining work and rollback

58 nonarchived repositories fully paginated (100-size page then empty next page), fresh main/root inventory/latest CI and all open-PR pages:160 PRs. coverage.json lists every inspected/worked/deferred repository. Only analytics-hub received deep instruction/manifest/source/CI review and implementation;57 deferred fairly. Root inventories elsewhere are not claimed as complete implementation reviews.

Rust core/TypeScript integration and existing architecture are preserved. No new service persistence, Cloud SQL schema, IAM, deployment or environment configuration mutation. Pinning/data-boundary review does not certify inherited infrastructure as compliant.

Remaining: resolve missing Rust package and full Rust checks;36 Rust and63 API npm findings; frontend dependency availability; ESLint config/74-file formatting; low coverage and production-route/integration gates; configured authorized Ruflo provider; required approvals/protections/latest-main checks; and explicit resolution of forbidden main-push publish/deploy side effects before any merge.

Rollback this cycle newest first:8b6efa9 (source tests),5fa1608 (assertion retention accounting),060a589 (production owner validation), optionally27f4d2b (frozen additive contract/probe). Inverse original RBAC bytes/hash retained. No production data/schema rollback; never erase append-only memory. Claims released, owned daemon stopped, original desktop stopped after work. Evidence lives on a separate immutable branch; tested PR head unchanged.

Artifacts: flywheel.json, evaluator.mjs, runtime.json (explicitly truncated logs with original byte counts/hashes plus Rust advisory metadata), local-checks.json, tool-receipts.json, recall.json, coverage.json and ci.json. Tests use actual production code; existing suite mocks are regression evidence, not production integration proof.
