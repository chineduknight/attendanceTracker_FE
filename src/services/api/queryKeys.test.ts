import { QueryClient } from "@tanstack/react-query";
import { queryKeys } from "services/api/queryKeys";

const matches = (prefix: readonly unknown[], key: readonly unknown[]) =>
  prefix.length <= key.length && prefix.every((part, i) => part === key[i]);

describe("queryKeys tenant scoping", () => {
  it("scopes finance obligations to the organisation", () => {
    expect(queryKeys.finance.obligations("orgA")).not.toEqual(
      queryKeys.finance.obligations("orgB")
    );
  });

  it("scopes finance compliance by organisation and obligation", () => {
    expect(queryKeys.finance.compliance("orgA", "ob1")).not.toEqual(
      queryKeys.finance.compliance("orgB", "ob1")
    );
    expect(queryKeys.finance.compliance("orgA", "ob1")).not.toEqual(
      queryKeys.finance.compliance("orgA", "ob2")
    );
  });

  it("scopes officers, roles and invites to the organisation", () => {
    expect(queryKeys.rbac.officers("orgA")).not.toEqual(
      queryKeys.rbac.officers("orgB")
    );
    expect(queryKeys.rbac.roles("orgA")).not.toEqual(
      queryKeys.rbac.roles("orgB")
    );
    expect(queryKeys.rbac.invites("orgA")).not.toEqual(
      queryKeys.rbac.invites("orgB")
    );
  });

  it("scopes attendance templates to the organisation", () => {
    expect(queryKeys.attendanceTemplates("orgA")).toEqual([
      "attendance-templates",
      "orgA",
    ]);
    expect(queryKeys.attendanceTemplates("orgA")).not.toEqual(
      queryKeys.attendanceTemplates("orgB")
    );
  });

  it("scopes attendance availability by organisation, member and date", () => {
    expect(queryKeys.attendanceAvailability.root("orgA")).not.toEqual(
      queryKeys.attendanceAvailability.root("orgB")
    );
    expect(
      queryKeys.attendanceAvailability.member("orgA", "member-1")
    ).not.toEqual(queryKeys.attendanceAvailability.member("orgA", "member-2"));
    expect(
      queryKeys.attendanceAvailability.date("orgA", "2026-10-10")
    ).not.toEqual(queryKeys.attendanceAvailability.date("orgA", "2026-10-11"));
    expect(
      matches(
        queryKeys.attendanceAvailability.root("orgA"),
        queryKeys.attendanceAvailability.member("orgA", "member-1")
      )
    ).toBe(true);
  });

  it("scopes organisation and member analytics under per-org roots", () => {
    const orgKey = queryKeys.analytics.organisation("orgA", "f", "t", "");
    const memberKey = queryKeys.analytics.member("orgA", "m1", "f", "t");
    expect(orgKey).not.toEqual(
      queryKeys.analytics.organisation("orgB", "f", "t", "")
    );
    expect(memberKey).not.toEqual(
      queryKeys.analytics.member("orgB", "m1", "f", "t")
    );
    expect(matches(queryKeys.analytics.root("orgA"), orgKey)).toBe(true);
    expect(matches(queryKeys.analytics.root("orgB"), orgKey)).toBe(false);
    expect(matches(queryKeys.analytics.memberRoot("orgA"), memberKey)).toBe(
      true
    );
    expect(matches(queryKeys.analytics.memberRoot("orgB"), memberKey)).toBe(
      false
    );
  });

  it("keeps the permissions catalog global", () => {
    expect(queryKeys.permissionsCatalog).toEqual(["permissions-catalog"]);
    expect(queryKeys.permissionsCatalog).not.toContain("orgA");
  });

  it("does not let one organisation's prefix invalidate another's cache", () => {
    const client = new QueryClient();
    client.setQueryData(queryKeys.finance.compliance("orgA", "ob1"), {
      org: "A",
    });
    client.setQueryData(queryKeys.finance.compliance("orgB", "ob1"), {
      org: "B",
    });
    client.setQueryData(queryKeys.rbac.officers("orgA"), []);
    client.setQueryData(queryKeys.rbac.officers("orgB"), []);

    const financeHits = client
      .getQueryCache()
      .findAll({ queryKey: queryKeys.finance.complianceRoot("orgA") });
    expect(financeHits).toHaveLength(1);
    expect(financeHits[0].state.data).toEqual({ org: "A" });

    const rbacHits = client
      .getQueryCache()
      .findAll({ queryKey: queryKeys.rbac.officers("orgA") });
    expect(rbacHits).toHaveLength(1);
  });

  it("scopes welfare to the organisation and nests the overview under its root", () => {
    expect(queryKeys.welfare.root("orgA")).toEqual(["welfare", "orgA"]);
    expect(queryKeys.welfare.root("orgA")).not.toEqual(
      queryKeys.welfare.root("orgB"),
    );
    const overviewA = queryKeys.welfare.overview("orgA", "2026-10-07");
    expect(overviewA).toEqual(["welfare", "orgA", "overview", "2026-10-07"]);
    expect(overviewA).not.toEqual(
      queryKeys.welfare.overview("orgB", "2026-10-07"),
    );
    expect(overviewA).not.toEqual(
      queryKeys.welfare.overview("orgA", "2026-10-08"),
    );
    expect(matches(queryKeys.welfare.root("orgA"), overviewA)).toBe(true);
    expect(matches(queryKeys.welfare.root("orgB"), overviewA)).toBe(false);
  });

  it("scopes birthday keys to the organisation and nests them under the root", () => {
    const root = queryKeys.birthday.root("orgA");
    expect(root).toEqual(["birthday", "orgA"]);
    expect(root).not.toEqual(queryKeys.birthday.root("orgB"));

    const list = queryKeys.birthday.list(
      "orgA",
      "2026-10-07",
      "2026-10-14",
      "active",
    );
    expect(list).toEqual([
      "birthday",
      "orgA",
      "list",
      "2026-10-07",
      "2026-10-14",
      "active",
    ]);
    expect(list).not.toEqual(
      queryKeys.birthday.list("orgB", "2026-10-07", "2026-10-14", "active"),
    );
    expect(list).not.toEqual(
      queryKeys.birthday.list("orgA", "2026-10-07", "2026-10-14", ""),
    );
    expect(matches(root, list)).toBe(true);

    const snapshot = queryKeys.birthday.snapshot(
      "orgA",
      "2026-10-07",
      "2026-10-14",
    );
    expect(snapshot).toEqual([
      "birthday",
      "orgA",
      "snapshot",
      "2026-10-07",
      "2026-10-14",
    ]);
    expect(snapshot).not.toEqual(
      queryKeys.birthday.snapshot("orgB", "2026-10-07", "2026-10-14"),
    );
    expect(matches(root, snapshot)).toBe(true);

    const exportPdf = queryKeys.birthday.export(
      "orgA",
      "pdf",
      "2026-10-07",
      "2026-10-14",
      "active",
    );
    expect(exportPdf).toEqual([
      "birthday",
      "orgA",
      "export",
      "pdf",
      "2026-10-07",
      "2026-10-14",
      "active",
    ]);
    expect(exportPdf).not.toEqual(
      queryKeys.birthday.export(
        "orgA",
        "excel",
        "2026-10-07",
        "2026-10-14",
        "active",
      ),
    );
    expect(matches(root, exportPdf)).toBe(true);
    expect(matches(queryKeys.birthday.root("orgB"), exportPdf)).toBe(false);
  });

  it("keeps the compliance export keys under the compliance prefix", () => {
    expect(
      matches(
        queryKeys.finance.complianceRoot("orgA"),
        queryKeys.finance.complianceExport("orgA", "ob1", "pdf")
      )
    ).toBe(true);
    expect(
      matches(
        queryKeys.finance.complianceRoot("orgA"),
        queryKeys.finance.complianceExport("orgB", "ob1", "pdf")
      )
    ).toBe(false);
  });
});
