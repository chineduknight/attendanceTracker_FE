import { capitalize } from "helpers/stringManipulations";
import {
  AttendanceBehavior,
  AttendanceStatusConfig,
  BEHAVIOR_META,
} from "helpers/attendanceStatuses";

/*
 * WhatsApp summary for one attendance session.
 *
 * Grouping is by behavior (present / excused / absent) so custom statuses such
 * as "Late" land in the right section, and every status mention uses the
 * organisation's own label. The voice-part grouping, Bro/Sis prefixes and the
 * choir closing lines are still choir-specific — a later terminology /
 * share-template phase will make those configurable.
 */

export interface ShareMember {
  attendanceStatus: string;
  member: {
    name: string;
    status: string;
    gender?: string;
    part?: string;
  };
}

export interface ShareMessageInput {
  orgName: string;
  sessionName: string;
  formattedDate: string;
  members: ShareMember[];
  statuses: AttendanceStatusConfig;
  /** Injectable for deterministic tests. */
  random?: () => number;
}

// Voice parts are always listed in this order; anything else is appended after.
const VOICE_PART_ORDER = ["soprano", "alto", "tenor", "bass"];

const BEHAVIOR_EMOJI: Record<AttendanceBehavior, string> = {
  present: "✅",
  excused: "🟡",
  absent: "🔴",
};

const partKeyOf = (item: ShareMember): string =>
  item.member.part ? item.member.part.toLowerCase() : "others";

const partLabelOf = (partKey: string): string =>
  partKey === "others" ? "Other" : capitalize(partKey);

// Rank used to sort a mixed list (e.g. excused) by voice part; unknown parts last.
const partRankOf = (item: ShareMember): number => {
  const index = VOICE_PART_ORDER.indexOf(partKeyOf(item));
  return index === -1 ? VOICE_PART_ORDER.length : index;
};

const memberDisplayName = (item: ShareMember): string => {
  const isMale = item.member.gender?.toLowerCase() === "male";
  return `${isMale ? "Bro" : "Sis"} ${item.member.name}`;
};

const byMemberName = (a: ShareMember, b: ShareMember): number =>
  a.member.name.toLowerCase().localeCompare(b.member.name.toLowerCase());

const orderedPartKeys = (keys: string[]): string[] => {
  const known = VOICE_PART_ORDER.filter((part) => keys.includes(part));
  const extra = keys.filter((part) => !VOICE_PART_ORDER.includes(part)).sort();
  return [...known, ...extra];
};

// Closing paragraph pools, grouped by tone. One is chosen based on the session
// figures so the message feels human without repeating the same line every time.
const CLOSING_MESSAGES: Record<string, string[]> = {
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
};

const pickClosingMessage = (
  present: number,
  excused: number,
  absent: number,
  random: () => number,
): string => {
  const total = present + excused + absent;
  const presentRate = total > 0 ? present / total : 0;

  let tone: keyof typeof CLOSING_MESSAGES = "general";
  if (total > 0 && presentRate < 0.4) tone = "low";
  else if (presentRate >= 0.7) tone = "strong";
  else if (excused > 0 && excused / total >= 0.2) tone = "excused";

  const pool = CLOSING_MESSAGES[tone];
  return pool[Math.floor(random() * pool.length)];
};

export const buildAttendanceShareMessage = ({
  orgName,
  sessionName,
  formattedDate,
  members,
  statuses,
  random = Math.random,
}: ShareMessageInput): string => {
  const behaviorOf = (item: ShareMember) =>
    statuses.resolve(item.attendanceStatus).behavior;
  const presentMembers = members.filter((item) => behaviorOf(item) === "present");
  const excusedMembers = members.filter((item) => behaviorOf(item) === "excused");
  // Absent count only reflects active members, matching the on-screen figures.
  const absentCount = members.filter(
    (item) => behaviorOf(item) === "absent" && item.member.status === "active",
  ).length;

  // Header: org name, session name, date, and a compact non-absent summary
  // using the organisation's own status labels.
  const headerBlock = `🎶 *${(orgName || "Choir").toUpperCase()} ATTENDANCE*`;
  const sessionBlock = [`*${sessionName}*`, `📅 ${formattedDate}`].join("\n");
  const summaryBlock = statuses
    .countStatuses(members.map((item) => item.attendanceStatus))
    .filter(({ status, count }) => status.behavior !== "absent" && count > 0)
    .map(
      ({ status, count }) =>
        `${BEHAVIOR_EMOJI[status.behavior]} ${status.label}: ${count}`,
    )
    .join("  |  ");

  // Present-behavior members grouped by voice part, each heading with its count.
  const presentByPart = presentMembers.reduce(
    (acc: Record<string, ShareMember[]>, item) => {
      const partKey = partKeyOf(item);
      if (!acc[partKey]) acc[partKey] = [];
      acc[partKey].push(item);
      return acc;
    },
    {},
  );
  const partKeys = orderedPartKeys(Object.keys(presentByPart));
  const presentBody = partKeys.length
    ? partKeys
        .map((partKey) => {
          const group = [...presentByPart[partKey]].sort(byMemberName);
          return [
            `*${partLabelOf(partKey)} — ${group.length}*`,
            ...group.map(memberDisplayName),
          ].join("\n");
        })
        .join("\n\n")
    : "No members recorded as present.";
  const presentSection = `*PRESENT MEMBERS*\n\n${presentBody}`;

  // Excused: one combined list ordered by part. A single excused status is
  // named by its own label; several are labelled per member.
  const excusedKeys = new Set(excusedMembers.map((item) => item.attendanceStatus));
  const excusedHeading =
    excusedKeys.size === 1
      ? statuses.resolve(Array.from(excusedKeys)[0]).label
      : BEHAVIOR_META.excused.label;
  const excusedSection = excusedMembers.length
    ? [
        `*${excusedHeading.toUpperCase()} — ${excusedMembers.length}*`,
        ...[...excusedMembers]
          .sort((a, b) => partRankOf(a) - partRankOf(b) || byMemberName(a, b))
          .map((item) => {
            const line = `${memberDisplayName(item)} — ${partLabelOf(partKeyOf(item))}`;
            return excusedKeys.size > 1
              ? `${line} (${statuses.resolve(item.attendanceStatus).label})`
              : line;
          }),
      ].join("\n")
    : "";

  const absentSection = `🔴 *${BEHAVIOR_META.absent.label} Members: ${absentCount}*`;
  const closingSection = `_${pickClosingMessage(
    presentMembers.length,
    excusedMembers.length,
    absentCount,
    random,
  )}_`;

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
