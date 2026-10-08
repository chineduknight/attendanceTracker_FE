import { MemberModelField } from "helpers/attendanceEligibility";

/** The Phase 5 reference member model: four option fields and two text fields. */
export const MEMBER_MODEL: MemberModelField[] = [
  { name: "name", type: "text", required: true },
  { name: "part", type: "option", options: ["soprano", "alto", "tenor", "bass"], required: false },
  { name: "gender", type: "option", options: ["female", "male"], required: false },
  { name: "status", type: "option", options: ["active", "associate", "inactive"], required: false },
  { name: "probationstatus", type: "option", options: ["probation", "graduated"], required: false },
  { name: "profession", type: "text", required: false },
];

/** Eight members, alphabetical; Hana has no part recorded. */
export const ROSTER = [
  { id: "m1", name: "Ada", part: "soprano", gender: "female", status: "active", profession: "Engineer" },
  { id: "m2", name: "Bisi", part: "soprano", gender: "female", status: "inactive" },
  { id: "m3", name: "Chioma", part: "alto", gender: "female", status: "active" },
  { id: "m4", name: "Dayo", part: "alto", gender: "female", status: "associate" },
  { id: "m5", name: "Emeka", part: "tenor", gender: "male", status: "active" },
  { id: "m6", name: "Femi", part: "tenor", gender: "male", status: "inactive" },
  { id: "m7", name: "Gbenga", part: "bass", gender: "male", status: "active" },
  { id: "m8", name: "Hana", gender: "female", status: "active" },
];
