import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { RBACManager, Role, Permission } from "../rbac";

describe("compiled RBAC resource-owner boundary", () => {
  const rbac = new RBACManager();
  const user = { userId: "owner", organizationId: "tenant-a" };
  it.each([
    { name: "empty", owner: "" },
    { name: "spaces", owner: "   " },
    { name: "null", owner: null },
    { name: "false", owner: false },
    { name: "zero", owner: 0 },
    { name: "array", owner: [] },
    { name: "object", owner: {} },
    { name: "array-of-id", owner: ["owner"] },
  ])("denies malformed source owner: $name", ({ owner }) => {
    expect(
      rbac.canAccessResource(
        [Role.ADMIN],
        Permission.EVENT_READ,
        { organizationId: "tenant-a", userId: owner as unknown as string },
        user,
      ),
    ).toBe(false);
  });

  type Anchor = [
    string,
    Role[],
    { organizationId?: string; userId?: string },
    { userId: string; organizationId?: string },
    boolean,
  ];
  it.each<Anchor>([
    [
      "own resource",
      [Role.VIEWER],
      { organizationId: "tenant-a", userId: "owner" },
      user,
      true,
    ],
    [
      "same-tenant admin",
      [Role.ADMIN],
      { organizationId: "tenant-a", userId: "other" },
      user,
      true,
    ],
    [
      "other owner",
      [Role.VIEWER],
      { organizationId: "tenant-a", userId: "other" },
      user,
      false,
    ],
    [
      "cross-tenant admin",
      [Role.ADMIN],
      { organizationId: "tenant-b", userId: "other" },
      user,
      false,
    ],
    [
      "missing tenant",
      [Role.ADMIN],
      { organizationId: "tenant-a", userId: "other" },
      { userId: "owner" },
      false,
    ],
    ["unscoped", [Role.VIEWER], {}, user, true],
    [
      "no base permission",
      [],
      { organizationId: "tenant-a", userId: "owner" },
      user,
      false,
    ],
    [
      "explicit super-admin",
      [Role.SUPER_ADMIN],
      { organizationId: "tenant-a", userId: "" },
      user,
      true,
    ],
  ])(
    "retains source anchor: %s",
    (_name, roles, resource, identity, expected) => {
      expect(
        rbac.canAccessResource(
          roles,
          Permission.EVENT_READ,
          resource,
          identity,
        ),
      ).toBe(expected);
    },
  );

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
