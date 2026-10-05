import {
  AttendanceBehavior,
  AttendanceStatusDefinition,
} from "helpers/attendanceStatuses";

export interface MemberVerdict {
  date: string;
  /** Configured status key; may be inactive or unknown on historical records. */
  status: string;
  behavior: AttendanceBehavior;
}

export interface MemberRecord {
  attendanceId: string;
  date: string;
  /** Configured status key; may be inactive or unknown on historical records. */
  status: string;
  behavior: AttendanceBehavior;
  sessionName: string;
  hasBeenUpdated: boolean;
  editCount?: number;
}

export type BehaviorCounts = Record<AttendanceBehavior, number>;

export interface MemberAnalyticsSummary {
  totalSessions: number;
  behaviorCounts: BehaviorCounts;
  attendanceRate: number;
  currentStreak: number;
  longestStreak: number;
}

export interface MemberAnalytics {
  member: { memberId: string; name: string; fields: Record<string, unknown> };
  range: { fromDate: string | null; toDate: string | null };
  summary: MemberAnalyticsSummary;
  verdicts: MemberVerdict[];
  records: MemberRecord[];
  /** The organisation's effective status config at query time. */
  attendanceStatuses?: AttendanceStatusDefinition[];
}
