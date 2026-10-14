import { capitalize } from "helpers/stringManipulations";
import {
  AttendanceBehavior,
  AttendanceStatusConfig,
  BEHAVIOR_META,
} from "helpers/attendanceStatuses";
import {
  DEFAULT_TERMINOLOGY,
  lowerTerm,
  OrganisationTerminology,
} from "helpers/organisationPresentation";
import {
  AttendanceShareTemplate,
  LEGACY_ATTENDANCE_SHARE_TEMPLATE,
} from "helpers/attendanceShareTemplate";
import { unresolvedMemberLabel } from "helpers/storedRoster";

/*
 * WhatsApp summary for one attendance session.
 *
 * Grouping is by behavior (present / excused / absent) so custom statuses such
 * as "Late" land in the right section, and every status mention uses the
 * organisation's own label. Figures always come from the complete saved
 * roster — resolved and unresolved entries, manual additions included — never
 * from today's membership list or a member's current membership status.
 *
 * The organisation's share template only changes presentation: the Choir
 * template adds Bro/Sis titles, voice-part grouping and music-themed closing
 * lines; the Generic template lists plain names. Both count identically.
 */

export interface ShareMember {
  attendanceStatus: string;
  /**
   * The stored member profile; null when it can no longer be resolved. A null
   * profile is still part of the saved roster and is counted and listed
   * exactly like a resolved one — under a neutral placeholder.
   */
  member: {
    name: string;
    /**
     * Membership status ("active", "associate", …). Never consulted when
     * classifying the recorded attendance: the stored attendance status
     * decides the behavior, so every recorded absence counts.
     */
    status: string;
    gender?: string;
    part?: string;
  } | null;
}

export interface ShareMessageInput {
  orgName: string;
  sessionName: string;
  formattedDate: string;
  members: ShareMember[];
  statuses: AttendanceStatusConfig;
  /** Organisation terminology for the generic nouns in the message. */
  terminology?: OrganisationTerminology;
  /** The organisation's share layout; choir when not given. */
  template?: AttendanceShareTemplate;
  /** Injectable for deterministic tests. */
  random?: () => number;
}

type Tone = "strong" | "excused" | "low" | "general";

interface PresentGroup {
  label: string;
  members: ShareMember[];
}

/** Everything a template changes; counting and section order are shared. */
interface TemplateStyle {
  headerEmoji: string;
  /** Header name when the organisation has none. */
  fallbackOrgName: string;
  /** How a resolved member is named, including any title the template adds. */
  displayName: (member: NonNullable<ShareMember["member"]>) => string;
  /** Present members split into headed groups, or null for one plain list. */
  groupPresent: (members: ShareMember[]) => PresentGroup[] | null;
  excusedOrder: (a: ShareMember, b: ShareMember) => number;
  /**
   * One excused line. `statusLabel` is the member's own status label, given
   * only when several excused statuses share the section.
   */
  excusedLine: (item: ShareMember, name: string, statusLabel?: string) => string;
  closingMessages: Record<Tone, readonly string[]>;
}

const BEHAVIOR_EMOJI: Record<AttendanceBehavior, string> = {
  present: "✅",
  excused: "🟡",
  absent: "🔴",
};

// Names sort alphabetically; entries whose profile no longer resolves have no
// stored name and keep their stored order at the end of a group.
const byMemberName = (a: ShareMember, b: ShareMember): number => {
  if (!a.member) return b.member ? 1 : 0;
  if (!b.member) return -1;
  return a.member.name.toLowerCase().localeCompare(b.member.name.toLowerCase());
};

// ---- Choir ----------------------------------------------------------------

// Voice parts are always listed in this order; any other part follows.
const VOICE_PART_ORDER = ["soprano", "alto", "tenor", "bass"];

/** The member's voice part (lowercased), or null when none is recorded. */
const voicePartOf = (item: ShareMember): string | null => {
  const part = item.member?.part;
  return typeof part === "string" && part.trim()
    ? part.trim().toLowerCase()
    : null;
};

// Rank used to sort a mixed list (e.g. excused) by voice part; parts outside
// the standard four come next and members without a part come last.
const voicePartRank = (item: ShareMember): number => {
  const part = voicePartOf(item);
  if (part === null) return VOICE_PART_ORDER.length + 1;
  const index = VOICE_PART_ORDER.indexOf(part);
  return index === -1 ? VOICE_PART_ORDER.length : index;
};

/** Bro/Sis only for an explicit male/female; anything else gets no title. */
const choirTitle = (gender: unknown): string | null => {
  const value = typeof gender === "string" ? gender.trim().toLowerCase() : "";
  if (value === "male") return "Bro";
  if (value === "female") return "Sis";
  return null;
};

// A name already saved with its title ("Bro John") is used as entered.
const LEADING_TITLE = /^(bro|sis)\b/i;

const CHOIR_STYLE: TemplateStyle = {
  headerEmoji: "🎶 ",
  fallbackOrgName: "Choir",
  displayName: ({ name, gender }) => {
    const title = choirTitle(gender);
    return title && !LEADING_TITLE.test(name.trim()) ? `${title} ${name}` : name;
  },
  groupPresent: (members) => {
    // With no voice parts recorded at all, a lone "Other" group says nothing.
    if (!members.some((item) => voicePartOf(item) !== null)) return null;
    const byPart = new Map<string | null, ShareMember[]>();
    members.forEach((item) => {
      const part = voicePartOf(item);
      byPart.set(part, [...(byPart.get(part) ?? []), item]);
    });
    const parts = Array.from(byPart.keys()).filter(
      (part): part is string => part !== null,
    );
    const ordered = [
      ...VOICE_PART_ORDER.filter((part) => parts.includes(part)),
      ...parts.filter((part) => !VOICE_PART_ORDER.includes(part)).sort(),
    ];
    const groups = ordered.map((part) => ({
      label: capitalize(part),
      members: byPart.get(part) ?? [],
    }));
    // Members without a part (unresolved profiles included) close the list.
    const withoutPart = byPart.get(null);
    return withoutPart ? [...groups, { label: "Other", members: withoutPart }] : groups;
  },
  excusedOrder: (a, b) => voicePartRank(a) - voicePartRank(b) || byMemberName(a, b),
  excusedLine: (item, name, statusLabel) => {
    const part = voicePartOf(item);
    return `${name}${part ? ` — ${capitalize(part)}` : ""}${
      statusLabel ? ` (${statusLabel})` : ""
    }`;
  },
  closingMessages: {
    strong: [
      "Great music is built long before the performance, one rehearsal and one committed member at a time. Thank you for contributing your part.",
      "Each time we gather, we become stronger as one choir. Thank you for showing up and helping us move the music forward.",
    ],
    excused: [
      "Thank you to everyone who was present and to those who communicated responsibly. Let us keep growing in consistency and readiness.",
    ],
    low: [
      "Our strength depends on every voice taking its place. Let us make a renewed effort to be present and prepared at the next gathering.",
    ],
    general: [
      "Thank you to everyone who attended or communicated their absence. Let us continue to build a choir marked by commitment, consistency, and love for the music.",
      "Every rehearsal strengthens the sound we create together. Thank you for showing up, and let us return even stronger at the next gathering.",
      "Your presence matters, your voice matters, and your commitment strengthens the entire choir. Thank you for being part of the work.",
    ],
  },
};

// ---- Generic --------------------------------------------------------------

const GENERIC_STYLE: TemplateStyle = {
  headerEmoji: "",
  fallbackOrgName: "Organisation",
  displayName: ({ name }) => name,
  groupPresent: () => null,
  excusedOrder: byMemberName,
  excusedLine: (_item, name, statusLabel) =>
    statusLabel ? `${name} — ${statusLabel}` : name,
  closingMessages: {
    strong: [
      "Thank you for showing up and contributing to today's session. Your consistency strengthens the group.",
      "A strong turnout today. Thank you for making the time and being present.",
    ],
    excused: [
      "Thank you to everyone who was present and to those who let us know they could not attend. Let us keep growing in consistency and commitment.",
    ],
    low: [
      "Every person's presence makes a difference. Let us make a renewed effort to be present at the next session.",
    ],
    general: [
      "Thank you to everyone who attended or communicated their absence. Let us keep building a group marked by commitment and consistency.",
      "Your presence matters and strengthens the whole group. Thank you for showing up, and we look forward to seeing everyone next time.",
    ],
  },
};

const TEMPLATE_STYLES: Record<AttendanceShareTemplate, TemplateStyle> = {
  generic: GENERIC_STYLE,
  choir: CHOIR_STYLE,
};

// ---- Shared ---------------------------------------------------------------

// The tone reads the session figures so the closing line feels human without
// repeating the same words every time; only the word pools differ by template.
const closingTone = (present: number, excused: number, absent: number): Tone => {
  const total = present + excused + absent;
  const presentRate = total > 0 ? present / total : 0;
  if (total > 0 && presentRate < 0.4) return "low";
  if (presentRate >= 0.7) return "strong";
  if (excused > 0 && excused / total >= 0.2) return "excused";
  return "general";
};

export const buildAttendanceShareMessage = ({
  orgName,
  sessionName,
  formattedDate,
  members,
  statuses,
  terminology = DEFAULT_TERMINOLOGY,
  template = LEGACY_ATTENDANCE_SHARE_TEMPLATE,
  random = Math.random,
}: ShareMessageInput): string => {
  const style = TEMPLATE_STYLES[template];
  const behaviorOf = (item: ShareMember) =>
    statuses.resolve(item.attendanceStatus).behavior;
  const presentMembers = members.filter((item) => behaviorOf(item) === "present");
  const excusedMembers = members.filter((item) => behaviorOf(item) === "excused");
  // Every stored entry whose status resolves to absent behavior counts — the
  // member's membership status never decides whether they were absent. Each
  // entry resolves to exactly one behavior (unknown keys fail closed), so
  // present + excused + absent always equals the saved roster count.
  const absentCount = members.filter(
    (item) => behaviorOf(item) === "absent",
  ).length;
  const unresolvedLabel = unresolvedMemberLabel(terminology.memberSingular);
  // An unresolved profile is never given an invented name — or a title,
  // whose gender cannot be known.
  const nameOf = (item: ShareMember) =>
    item.member ? style.displayName(item.member) : unresolvedLabel;
  const memberPlural = terminology.memberPlural.toUpperCase();

  // Header: org name, session name, date, and a compact non-absent summary
  // using the organisation's own status labels.
  const headerBlock = `${style.headerEmoji}*${(
    orgName || style.fallbackOrgName
  ).toUpperCase()} ${terminology.attendanceSingular.toUpperCase()}*`;
  const sessionBlock = [`*${sessionName}*`, `📅 ${formattedDate}`].join("\n");
  const summaryBlock = statuses
    .countStatuses(members.map((item) => item.attendanceStatus))
    .filter(({ status, count }) => status.behavior !== "absent" && count > 0)
    .map(
      ({ status, count }) =>
        `${BEHAVIOR_EMOJI[status.behavior]} ${status.label}: ${count}`,
    )
    .join("  |  ");

  // Present-behavior members: headed groups when the template groups them,
  // otherwise one alphabetical list under a heading with the total.
  const presentGroups = style.groupPresent(presentMembers);
  const presentSection = presentGroups
    ? [
        `*PRESENT ${memberPlural}*`,
        ...presentGroups.map(({ label, members: group }) =>
          [
            `*${label} — ${group.length}*`,
            ...[...group].sort(byMemberName).map(nameOf),
          ].join("\n"),
        ),
      ].join("\n\n")
    : [
        `*PRESENT ${memberPlural} — ${presentMembers.length}*`,
        presentMembers.length
          ? [...presentMembers].sort(byMemberName).map(nameOf).join("\n")
          : `No ${lowerTerm(terminology.memberPlural)} recorded as present.`,
      ].join("\n\n");

  // Excused: one combined list. A single excused status is named by its own
  // label; several are labelled per member.
  const excusedKeys = new Set(excusedMembers.map((item) => item.attendanceStatus));
  const excusedHeading =
    excusedKeys.size === 1
      ? statuses.resolve(Array.from(excusedKeys)[0]).label
      : BEHAVIOR_META.excused.label;
  const excusedSection = excusedMembers.length
    ? [
        `*${excusedHeading.toUpperCase()} — ${excusedMembers.length}*`,
        ...[...excusedMembers]
          .sort(style.excusedOrder)
          .map((item) =>
            style.excusedLine(
              item,
              nameOf(item),
              excusedKeys.size > 1
                ? statuses.resolve(item.attendanceStatus).label
                : undefined,
            ),
          ),
      ].join("\n")
    : "";

  const absentSection = `🔴 *${BEHAVIOR_META.absent.label} ${terminology.memberPlural}: ${absentCount}*`;
  const pool =
    style.closingMessages[
      closingTone(presentMembers.length, excusedMembers.length, absentCount)
    ];
  const closingSection = `_${pool[Math.floor(random() * pool.length)]}_`;

  return [
    headerBlock,
    sessionBlock,
    summaryBlock,
    presentSection,
    excusedSection,
    absentSection,
    closingSection,
  ]
    .filter(Boolean)
    .join("\n\n");
};
