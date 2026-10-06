import {
  EditorField,
  keyFromLabel,
  newDraftField,
  parseOptions,
  toEditorFields,
  toModelPayload,
  validateEditorFields,
} from "helpers/memberModelEditor";
import { MemberModelField } from "helpers/memberFields";

const SAVED: MemberModelField[] = [
  { _id: "f-name", name: "name", label: "Full Name", type: "text", required: true },
  { _id: "f-part", name: "part", type: "option", options: ["Soprano", "Alto"], required: false },
];

describe("toEditorFields", () => {
  it("keeps each saved field's _id and falls back to a key-based label", () => {
    const fields = toEditorFields(SAVED);
    expect(fields.map((f) => [f.savedId, f.persisted, f.label, f.optionsText])).toEqual([
      ["f-name", true, "Full Name", ""],
      ["f-part", true, "Part", "Soprano, Alto"],
    ]);
    expect(fields.map((f) => f.reactKey)).toEqual(["f-name", "f-part"]);
  });

  it("starts a new model with an unsaved, pinned name field", () => {
    const [name] = toEditorFields([]);
    expect(name).toMatchObject({ persisted: false, savedId: null, pinned: true, name: "name", label: "Name", required: true });
    expect(name.reactKey).toMatch(/^draft-/);
  });

  it("treats a loaded field without _id as saved but never invents one", () => {
    const [legacy] = toEditorFields([{ name: "part", type: "text" }]);
    expect(legacy.persisted).toBe(true);
    expect(toModelPayload([legacy])[0]).not.toHaveProperty("_id");
  });
});

describe("toModelPayload", () => {
  it("sends saved _ids unchanged, a label edit only changes the label, and new fields send no id", () => {
    const [name, part] = toEditorFields(SAVED);
    const relabelled: EditorField = { ...part, label: "Voice Part" };
    const draft = newDraftField({ name: "Section", label: "Section", type: "option", optionsText: "a, b, a, " });

    const payload = toModelPayload([name, relabelled, draft]);

    expect(payload).toEqual([
      { _id: "f-name", name: "name", label: "Full Name", type: "text", required: true },
      { _id: "f-part", name: "part", label: "Voice Part", type: "option", required: false, options: ["Soprano", "Alto"] },
      { name: "section", label: "Section", type: "option", required: false, options: ["a", "b"] },
    ]);
    expect(JSON.stringify(payload)).not.toMatch(/draft-/);
  });

  it("keeps option text while a new field's type is switched back and forth", () => {
    const draft = newDraftField({ label: "Shift", name: "shift", type: "option", optionsText: "Morning, Evening" });
    const asText = { ...draft, type: "text" };
    expect(toModelPayload([asText])[0]).not.toHaveProperty("options");
    expect(toModelPayload([{ ...asText, type: "option" }])[0].options).toEqual(["Morning", "Evening"]);
  });
});

describe("validateEditorFields", () => {
  const errorsOf = (fields: EditorField[]) => {
    const errors = validateEditorFields(fields);
    return fields.map((f) => errors.get(f.reactKey) ?? {});
  };

  it("accepts a valid model and grandfathers saved keys", () => {
    const fields = toEditorFields([...SAVED, { _id: "f-odd", name: "Odd-Key", type: "text" }]);
    expect(validateEditorFields(fields).size).toBe(0);
  });

  it("flags blank and over-long labels", () => {
    const [blank, long] = errorsOf([
      newDraftField({ name: "a", label: " " }),
      newDraftField({ name: "b", label: "x".repeat(81) }),
    ]);
    expect(blank.label).toMatch(/Enter a display label/);
    expect(long.label).toMatch(/at most 80/);
  });

  it("flags duplicate, reserved and unsafe new keys", () => {
    const [saved, dup, reserved, unsafe, empty] = errorsOf([
      ...toEditorFields(SAVED).slice(1),
      newDraftField({ name: "PART", label: "Part again" }),
      newDraftField({ name: "createdAt", label: "Created" }),
      newDraftField({ name: "a.b", label: "Dotted" }),
      newDraftField({ name: "", label: "No key" }),
    ]);
    expect(dup.name).toMatch(/already uses the key "part"/);
    // The saved field's key can't be edited, so it carries no key error.
    expect(saved.name).toBeUndefined();
    expect(reserved.name).toMatch(/reserved/);
    expect(unsafe.name).toMatch(/lowercase letters/);
    expect(empty.name).toMatch(/Enter an internal key/);
  });

  it("requires options for an option field", () => {
    const [field] = errorsOf([newDraftField({ name: "x", label: "X", type: "option", optionsText: " , " })]);
    expect(field.options).toMatch(/at least one option/);
  });
});

describe("saved options and the name field", () => {
  it("sends loaded options verbatim unless they were edited", () => {
    const [field] = toEditorFields([
      { _id: "f-x", name: "venue", type: "option", options: ["Hall, East", " Alto"] },
    ]);
    expect(toModelPayload([{ ...field, label: "Venue" }])[0].options).toEqual(["Hall, East", " Alto"]);
    expect(
      toModelPayload([{ ...field, optionsText: "Hall, West", optionsEdited: true }])[0].options
    ).toEqual(["Hall", "West"]);
  });

  it("pins the name field by key wherever it sits in a legacy model", () => {
    const fields = toEditorFields([
      { _id: "f-part", name: "part", type: "text" },
      { _id: "f-name", name: "Name", type: "text", required: true },
    ]);
    expect(fields.map((f) => f.pinned)).toEqual([false, true]);
  });
});

describe("helpers", () => {
  it("derives a safe key from a label", () => {
    expect(keyFromLabel("Voice Part")).toBe("voice_part");
    expect(keyFromLabel(" 2nd Choir! ")).toBe("_2nd_choir");
  });

  it("parses comma separated options without blanks or duplicates", () => {
    expect(parseOptions(" Soprano, ,Alto,Soprano ")).toEqual(["Soprano", "Alto"]);
  });
});
