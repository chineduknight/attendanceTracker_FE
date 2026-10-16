import { hasFormChanges, snapshotOf } from "helpers/formChanges";

describe("hasFormChanges", () => {
  it("is false for equal values, nested ones included", () => {
    expect(hasFormChanges({ a: "x", t: { m: "Member" } }, { a: "x", t: { m: "Member" } })).toBe(false);
  });

  it("is true for a changed value, at any depth or position", () => {
    expect(hasFormChanges({ a: "x" }, { a: "y" })).toBe(true);
    expect(hasFormChanges({ t: { m: "Member" } }, { t: { m: "Student" } })).toBe(true);
    expect(hasFormChanges([{ k: "a" }, { k: "b" }], [{ k: "b" }, { k: "a" }])).toBe(true);
    expect(hasFormChanges([{ k: "a" }], [{ k: "a" }, { k: "" }])).toBe(true);
  });

  it("treats missing, null, empty and false as nothing entered", () => {
    expect(hasFormChanges({ a: "x" }, { a: "x", phone: "", ok: false, dob: null, b: undefined })).toBe(false);
    expect(hasFormChanges({ ok: true }, { ok: false })).toBe(true);
  });
});

describe("snapshotOf", () => {
  it("does not follow later in-place edits of nested values", () => {
    const form = { terminology: { memberSingular: "Member" } };
    const baseline = snapshotOf(form);
    form.terminology.memberSingular = "Student";
    expect(hasFormChanges(baseline, form)).toBe(true);
  });
});
