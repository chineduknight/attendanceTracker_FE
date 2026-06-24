import { buildOverridePayload, buildRolePayload } from "rbac/rbacPayloads";

describe("rbac payload builders", () => {
  it("grants what's selected-but-not-in-role and revokes what's in-role-but-unselected", () => {
    const role = ["finance.view", "finance.manage"] as const;
    const selected = ["finance.view", "members.view"] as const;
    expect(buildOverridePayload([...role], [...selected])).toEqual({
      grantedPermissions: ["members.view"],
      revokedPermissions: ["finance.manage"],
    });
  });

  it("returns empty arrays when selection equals the role", () => {
    const role = ["officers.view"] as const;
    expect(buildOverridePayload([...role], [...role])).toEqual({
      grantedPermissions: [],
      revokedPermissions: [],
    });
  });

  it("builds a role payload passing name and permissions through", () => {
    expect(
      buildRolePayload({ name: "Treasurer", permissions: ["finance.view"] })
    ).toEqual({ name: "Treasurer", permissions: ["finance.view"] });
  });
});
