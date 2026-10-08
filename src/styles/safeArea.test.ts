import { SAFE_TOP, withSafeInset } from "styles/safeArea";

describe("safe-area helpers", () => {
  it("adds the device inset to the normal spacing (0 inset = same spacing)", () => {
    expect(withSafeInset("top", "1rem")).toBe("calc(1rem + env(safe-area-inset-top))");
    expect(withSafeInset("left")).toBe("calc(0px + env(safe-area-inset-left))");
    expect(SAFE_TOP).toBe("env(safe-area-inset-top)");
  });
});
