import { AttendanceBehavior } from "helpers/attendanceStatuses";

export interface MemberVerdict {
  date: string;
  /** Configured status key; may be inactive or unknown on historical records. */
  status: string;
}

export interface MemberRecord {
  attendanceId: string;
  date: string;
  /** Configured status key; may be inactive or unknown on historical records. */
  status: string;
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
}
