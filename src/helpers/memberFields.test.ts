import {
  displayMemberFieldLabel,
  fallbackFieldLabel,
  memberFieldLabeler,
} from "helpers/memberFields";

describe("member field labels", () => {
  it("falls back to a readable label from the key when no label is saved", () => {
    expect(fallbackFieldLabel("part")).toBe("Part");
    expect(fallbackFieldLabel("date_of_birth")).toBe("Date of birth");
    expect(displayMemberFieldLabel({ name: "part" })).toBe("Part");
    expect(displayMemberFieldLabel({ name: "part", label: "  " })).toBe("Part");
    expect(displayMemberFieldLabel({ name: "part", label: null })).toBe("Part");
  });

  it("prefers the saved label", () => {
    expect(displayMemberFieldLabel({ name: "part", label: "Voice Part" })).toBe("Voice Part");
  });

  it("labels storage keys from the model, case-insensitively, with a fallback", () => {
    const labelFor = memberFieldLabeler([{ name: "part", label: "Voice Part" }]);
    expect(labelFor("part")).toBe("Voice Part");
    expect(labelFor("PART")).toBe("Voice Part");
    expect(labelFor("gender")).toBe("Gender");
  });
});
