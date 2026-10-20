import { useMemo } from "react";
import { Obligation } from "components/finance/financeTypes";
import { shortId } from "helpers/ledgerReconciliation";
import { useCompliance, useObligations } from "hooks/useFinance";
import { useMembers } from "hooks/useMembers";
import { usePermissions } from "rbac/usePermissions";

export interface LedgerNames {
  obligation: (id: string) => Obligation | null;
  obligationName: (id: string) => string;
  memberName: (id: string) => string;
  /** False when a member can only be shown by a short id. */
  hasMemberName: (id: string) => boolean;
  obligationsLoaded: boolean;
  /** Members that can be chosen by name (from either source), sorted. */
  memberOptions: Array<{ value: string; label: string }>;
  /** Active obligations, for filters. */
  obligationOptions: Array<{ value: string; label: string }>;
}

/**
 * Display names for the ids F3 reads return (they carry ids only).
 *
 * Obligations come from the obligation list (`finance.view`). Members come
 * from the members list when the officer has `members.view`, and otherwise
 * from the F0 compliance rows of one obligation (`finance.view`), which list
 * every non-archived member. A member neither source can name is shown by a
 * short id, never guessed. Names are display only: no id is ever chosen from
 * a name.
 */
export const useLedgerNames = (
  organisationId: string,
  {
    enabled,
    complianceObligationId = "",
  }: { enabled: boolean; complianceObligationId?: string },
): LedgerNames => {
  const canReadMembers = usePermissions().has("members.view");
  const obligationsQuery = useObligations(organisationId, { enabled });
  const membersQuery = useMembers(organisationId, { enabled: enabled && canReadMembers });
  const compliance = useCompliance(organisationId, enabled ? complianceObligationId : "");

  return useMemo(() => {
    const obligations = new Map(obligationsQuery.obligations.map((entry) => [entry.id.toLowerCase(), entry]));
    const members = new Map<string, string>();
    for (const row of compliance.compliance?.rows ?? []) {
      if (row.memberId && row.name) members.set(row.memberId.toLowerCase(), row.name);
    }
    if (canReadMembers) {
      for (const member of membersQuery.members) {
        if (member.id && member.name) members.set(String(member.id).toLowerCase(), String(member.name));
      }
    }
    const obligation = (id: string) => obligations.get(id.toLowerCase()) ?? null;
    return {
      obligation,
      obligationName: (id: string) => {
        const found = obligation(id);
        if (!found) return `Obligation ${shortId(id)}`;
        return found.year ? `${found.name} (${found.year})` : found.name;
      },
      memberName: (id: string) => members.get(id.toLowerCase()) ?? `Member ${shortId(id)}`,
      hasMemberName: (id: string) => members.has(id.toLowerCase()),
      obligationsLoaded: obligationsQuery.hasData,
      memberOptions: Array.from(members.entries())
        .map(([value, label]) => ({ value, label }))
        .sort((left, right) => left.label.localeCompare(right.label)),
      obligationOptions: obligationsQuery.obligations.map((entry) => ({
        value: entry.id,
        label: entry.year ? `${entry.name} (${entry.year})` : entry.name,
      })),
    };
  }, [
    obligationsQuery.obligations,
    obligationsQuery.hasData,
    membersQuery.members,
    compliance.compliance,
    canReadMembers,
  ]);
};
