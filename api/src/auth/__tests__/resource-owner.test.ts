import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

describe("compiled RBAC resource-owner boundary", () => {
  it("denies malformed scoped owners and preserves valid role/tenant behavior", () => {
    const root = resolve(__dirname, "../../..");
    const run = spawnSync(
      process.execPath,
      [resolve(root, "security/probe-owner.cjs"), root],
      {
        encoding: "utf8",
        timeout: 5000,
        env: { PATH: process.env.PATH },
      },
    );
    expect(run.status).toBe(0);
    const result = JSON.parse(run.stdout);
    expect(result.holdout).toHaveLength(8);
    expect(result.anchors).toHaveLength(8);
    for (const check of [...result.holdout, ...result.anchors]) {
      expect(check).toEqual({ id: expect.any(String), passed: true });
    }
  });
});
