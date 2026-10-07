/**
 * Phase 7A Welfare overview payload — mirrors the backend response exactly.
 * The backend classifies every signal; the frontend renders these arrays
 * as-is and never recalculates membership of a section.
 */

export interface WelfarePeriodSummary {
  expected: number;
  present: number;
  excused: number;
  absent: number;
  /** Physical presence: Present / Expected (0–100). The trend metric. */
  presenceRate: number;
  /** (Present + Excused) / Expected (0–100), shown only as context. */
  attendanceRate: number;
}

export interface WelfareInsight {
  memberId: string;
  name: string | null;
  /** Backend signal keys, e.g. `presence_drop_with_absence`. */
  signals: string[];
  recent: WelfarePeriodSummary;
  previous: WelfarePeriodSummary;
  presenceChangePoints: number | null;
  consecutiveAbsent: number;
  lastPresentDate: string | null;
}

export interface WelfareAwayInsight {
  memberId: string;
  name: string | null;
  startDate: string;
  endDate: string;
  reason: string | null;
  returnDate: string;
}

export interface WelfareOverview {
  asOf: string;
  settings: {
    reviewWindowDays: number;
    presenceChangeThresholdPoints: number;
    consecutiveAbsenceThreshold: number;
    returningSoonDays: number;
  };
  periods: {
    recent: { fromDate: string; toDate: string };
    previous: { fromDate: string; toDate: string };
  };
  summary: {
    attention: number;
    communicated: number;
    encouragement: number;
    currentlyAway: number;
    returningSoon: number;
  };
  attention: WelfareInsight[];
  communicated: WelfareInsight[];
  encouragement: WelfareInsight[];
  currentlyAway: WelfareAwayInsight[];
  returningSoon: WelfareAwayInsight[];
}

/** One future birthday from the existing Birthday API, as Welfare needs it. */
export interface WelfareBirthdayMember {
  name?: string | null;
  dob?: string | null;
}
