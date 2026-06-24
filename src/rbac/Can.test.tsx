import { render, screen } from "@testing-library/react";
import useGlobalStore, { EMPTY_ORG } from "zStore";
import { Can } from "rbac/Can";

const setOrg = (over: Partial<typeof EMPTY_ORG>) =>
  useGlobalStore.setState({ organisation: { ...EMPTY_ORG, ...over } });

describe("<Can>", () => {
  it("renders children when the single perm is held", () => {
    setOrg({ permissions: ["finance.view"] });
    render(<Can perm="finance.view">ok</Can>);
    expect(screen.getByText("ok")).toBeInTheDocument();
  });

  it("renders fallback when perm is missing", () => {
    setOrg({ permissions: [] });
    render(<Can perm="finance.manage" fallback={<span>nope</span>}>ok</Can>);
    expect(screen.queryByText("ok")).not.toBeInTheDocument();
    expect(screen.getByText("nope")).toBeInTheDocument();
  });

  it("owner gate renders only for owners", () => {
    setOrg({ isOwner: false });
    const { rerender } = render(<Can owner>del</Can>);
    expect(screen.queryByText("del")).not.toBeInTheDocument();
    setOrg({ isOwner: true });
    rerender(<Can owner>del</Can>);
    expect(screen.getByText("del")).toBeInTheDocument();
  });
});
