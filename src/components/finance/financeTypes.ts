export type ObligationType = "dues" | "levy";
export type MonthStatus = "paid" | "partial" | "unpaid" | "not-due";

export interface Obligation {
  id: string;
  type: ObligationType;
  name: string;
  year?: number;
  amountPerMonth?: number;
  amount?: number;
  date?: string;
}

export interface ComplianceRow {
  memberId: string;
  name: string;
  accountable: boolean;
  // dues
  months?: Record<string, MonthStatus>;
  totalExpected?: number;
  totalPaid?: number;
  balance?: number;
  paidUpToMonth?: number;
  compliance?: number;
  creditMonths?: number[];
  // levy
  liable?: boolean;
  expected?: number;
  paid?: number;
  status?: MonthStatus;
}

export interface ComplianceSummary {
  totalMembers: number;
  accountableMembers: number;
  totalCollected: number;
  totalOutstanding: number;
}

export interface ComplianceResponse {
  obligation: Obligation;
  summary: ComplianceSummary;
  rows: ComplianceRow[];
}
