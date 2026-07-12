import { AttendanceStatus } from "components/analytics/statusMeta";

export interface MemberVerdict {
  date: string;
  status: AttendanceStatus;
}

export interface MemberRecord {
  attendanceId: string;
  date: string;
  status: AttendanceStatus;
  sessionName: string;
  hasBeenUpdated: boolean;
}

export interface MemberAnalyticsSummary {
  totalSessions: number;
  present: number;
  absent: number;
  apology: number;
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
