import { renderHook } from "@testing-library/react";
import useGlobalStore, { EMPTY_ORG } from "zStore";
import { usePermissions } from "rbac/usePermissions";

const setOrg = (over: Partial<typeof EMPTY_ORG>) =>
  useGlobalStore.setState({ organisation: { ...EMPTY_ORG, ...over } });

describe("usePermissions", () => {
  it("owner has every permission regardless of the array", () => {
    setOrg({ isOwner: true, permissions: [] });
    const { result } = renderHook(() => usePermissions());
    expect(result.current.has("finance.manage")).toBe(true);
    expect(result.current.hasAll("officers.manage", "settings.manage")).toBe(true);
  });

  it("non-owner is gated by the permissions array", () => {
    setOrg({ isOwner: false, permissions: ["finance.view"] });
    const { result } = renderHook(() => usePermissions());
    expect(result.current.has("finance.view")).toBe(true);
    expect(result.current.has("finance.manage")).toBe(false);
    expect(result.current.hasAny("finance.manage", "finance.view")).toBe(true);
    expect(result.current.hasAll("finance.view", "members.view")).toBe(false);
  });
});
