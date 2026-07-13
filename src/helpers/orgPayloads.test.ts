import { buildOrgUpdatePayload } from "helpers/orgPayloads";

describe("buildOrgUpdatePayload", () => {
  const base = {
    name: "VOB Choir",
    image: "https://cdn.example.com/logo.png",
    collapseAttendanceByDay: true,
  };

  it("maps a numeric string to an integer", () => {
    expect(buildOrgUpdatePayload({ ...base, maxAttendanceEdits: "3" })).toEqual({
      ...base,
      maxAttendanceEdits: 3,
    });
  });

  it("keeps 0 (editing disabled) rather than treating it as blank", () => {
    expect(
      buildOrgUpdatePayload({ ...base, maxAttendanceEdits: "0" }).maxAttendanceEdits,
    ).toBe(0);
  });

  it("maps a blank maxAttendanceEdits to null (use default)", () => {
    expect(
      buildOrgUpdatePayload({ ...base, maxAttendanceEdits: "  " }).maxAttendanceEdits,
    ).toBeNull();
  });

  it("trims name and image (both always present)", () => {
    const result = buildOrgUpdatePayload({
      name: "  VOB Choir  ",
      image: "  https://x/y.png ",
      collapseAttendanceByDay: false,
      maxAttendanceEdits: "",
    });
    expect(result.name).toBe("VOB Choir");
    expect(result.image).toBe("https://x/y.png");
  });
});
