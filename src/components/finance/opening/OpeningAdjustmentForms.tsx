import { useState } from "react";
import { Badge, Box, Button, Field, Flex, Input, Stack, Text, Textarea } from "@chakra-ui/react";
import { DateField } from "components/ui/date-field";
import { useConfirm } from "components/ui/confirm-dialog";
import { OptionSelect } from "components/ui/themed-select";
import OpeningAccountAmountList from "components/finance/opening/OpeningAccountAmountList";
import OpeningMemberMoneyEditor from "components/finance/opening/OpeningMemberMoneyEditor";
import OpeningPreviewCard from "components/finance/opening/OpeningPreview";
import { LedgerAccount, LedgerStatus } from "components/finance/ledgerTypes";
import {
  EffectiveOpeningsView,
  SubmitOpeningInput,
} from "components/finance/openingBalanceTypes";
import { formatBusinessDate } from "helpers/financeCompliance";
import { formatKobo } from "helpers/financeConstants";
import {
  activeMoneyAccounts,
  amountsToLines,
  buildCorrectionOpeningInput,
  buildSupplementaryOpeningInput,
  correctionDelta,
  correctionItemChangesFromDrafts,
  correctionLinesFromDrafts,
  memberMoneyDraftsToInputs,
  moneyAccountsAwaitingOpening,
  openingDateGroups,
  openingPreview,
  parseNairaToKobo,
  supplementaryDateIssue,
  todayInLagos,
  MemberMoneyDraft,
} from "helpers/openingBalances";
import { isMoneyRole, toAccountRole } from "helpers/ledgerSetup";
import { ledgerStateKey } from "helpers/ledger";
import { ledgerApiFailure, ledgerWriteOutcomeUnknown } from "helpers/ledgerSetup";
import { useOpeningBalanceWrites } from "hooks/useOpeningBalances";
import { useLedgerWriteIntent } from "hooks/useLedgerWriteIntent";

type Writes = ReturnType<typeof useOpeningBalanceWrites>;
type Intent = ReturnType<typeof useLedgerWriteIntent>;

const useGuardedSubmit = ({
  writes,
  intent,
  onSubmitted,
}: {
  writes: Writes;
  intent: Intent;
  onSubmitted: () => void;
}) => {
  const [error, setError] = useState<string | null>(null);

  const submit = (payload: SubmitOpeningInput) => {
    const record = intent.begin("submit-opening", { kind: payload.kind });
    if (!record) {
      setError(
        "This browser can't store the safety record required before submitting. Allow site storage and try again.",
      );
      return;
    }
    writes.submitOpening(payload, {
      onSuccess: () => {
        intent.clear(record);
        setError(null);
        onSubmitted();
      },
      onError: (failure) => {
        const parsed = ledgerApiFailure(failure);
        if (ledgerWriteOutcomeUnknown(parsed)) {
          intent.markUnresolved(record);
          setError(null);
          return;
        }
        intent.clear(record);
        setError(parsed.message ?? "The proposal wasn't submitted. Try again.");
      },
    });
  };

  return { submit, error, setError };
};

/**
 * Supplementary opening for money accounts added after activation
 * (RFC §4.4.2). Only accounts the server explicitly marks
 * `openingVerified: false` are offered; an unknown flag blocks the form
 * rather than guessing.
 */
export const SupplementaryOpeningForm = ({
  status,
  accounts,
  writes,
  intent,
  onCancel,
  onSubmitted,
}: {
  status: LedgerStatus;
  accounts: readonly LedgerAccount[];
  writes: Writes;
  intent: Intent;
  onCancel: () => void;
  onSubmitted: () => void;
}) => {
  const today = todayInLagos();
  const candidates = moneyAccountsAwaitingOpening(status, accounts).filter(
    (account) => account.openingVerified === false,
  );
  // Offer only accounts the server explicitly marks unverified; an unreadable
  // ledger state or account flag blocks the form instead of guessing.
  const unknownState =
    ledgerStateKey(status) === "unknown" ||
    activeMoneyAccounts(accounts).some((account) => account.openingVerified === null);
  const { confirm, confirmDialog } = useConfirm();
  const { submit, error, setError } = useGuardedSubmit({ writes, intent, onSubmitted });

  const [asOfDate, setAsOfDate] = useState(status.openingDate ?? today);
  const [evidence, setEvidence] = useState("");
  const [amounts, setAmounts] = useState<Record<string, string>>(() =>
    Object.fromEntries(candidates.map((account) => [account.id, ""])),
  );
  const lines = candidates.map((account) => ({
    accountId: account.id,
    amountKobo: parseNairaToKobo(amounts[account.id] ?? ""),
  }));
  const preview = openingPreview(lines, []);
  const openingDate = status.openingDate;

  const problem =
    candidates.length === 0
      ? "No money account is explicitly awaiting a supplementary opening. This server may not report the account opening state yet."
      : !openingDate
        ? "The ledger's opening date isn't available, so a supplementary date can't be checked."
        : status.revision === null
          ? "This server doesn't send the ledger revision yet."
          : supplementaryDateIssue({
              date: asOfDate,
              openingDate,
              lockedThrough: status.lockedThrough,
              today,
            }) ??
            (evidence.trim() ? null : "Record the supporting evidence for this count.") ??
            amountsToLines(candidates, amounts).problem ??
            (intent.blocked ? "An earlier opening change is unresolved." : null);

  const handleSubmit = async () => {
    const built = amountsToLines(candidates, amounts);
    if (!built.lines) {
      setError(built.problem);
      return;
    }
    const confirmed = await confirm({
      title: "Submit supplementary opening",
      body: "Submit this supplementary opening for independent verification? Only the accounts listed are included. The owner must verify it.",
      confirmLabel: "Submit proposal",
    });
    if (!confirmed) return;
    submit(
      buildSupplementaryOpeningInput({
        asOfDate,
        expectedLedgerRevision: status.revision as number,
        evidence,
        lines: built.lines,
      }),
    );
  };

  return (
    <Stack gap={4}>
      <Text as="h3" fontSize="md" fontWeight="semibold">
        Supplementary opening
      </Text>
      <Text fontSize="sm" color="fg.muted">
        Accounts added after activation need their own verified opening. Count them and
        record 0 if they start empty.
      </Text>

      {candidates.length === 0 ? (
        <Text role="alert" fontSize="sm" color="fg.muted">
          {unknownState
            ? "This server doesn't report which accounts still need an opening, so this form can't be used yet."
            : "No active cash or bank account is awaiting a supplementary opening."}
        </Text>
      ) : (
        <>
          {error && (
            <Text role="alert" fontSize="sm" color="fg.error">
              {error}
            </Text>
          )}
          <Field.Root>
            <Field.Label>Counting date</Field.Label>
            <DateField
              value={asOfDate}
              onChange={setAsOfDate}
              min={openingDate ?? undefined}
              max={today}
            />
            <Field.HelperText>
              On or after the ledger's opening date, outside any locked period, and not
              later than today in Lagos.
            </Field.HelperText>
          </Field.Root>
          <OpeningAccountAmountList
            accounts={candidates}
            amounts={amounts}
            onChange={(accountId, value) =>
              setAmounts((current) => ({ ...current, [accountId]: value }))
            }
          />
          <Field.Root>
            <Field.Label>Supporting evidence</Field.Label>
            <Textarea
              value={evidence}
              maxLength={500}
              onChange={(event) => setEvidence(event.target.value)}
            />
          </Field.Root>
          <OpeningPreviewCard preview={preview} title="Supplementary preview" />
        </>
      )}

      {candidates.length > 0 && problem && (
        <Text fontSize="sm" color="fg.muted">
          {problem}
        </Text>
      )}

      <Flex gap={2} wrap="wrap">
        <Button variant="outline" onClick={onCancel}>
          Back
        </Button>
        <Button
          colorPalette="teal"
          loading={writes.isSubmitting}
          disabled={Boolean(problem) || intent.blocked}
          onClick={() => void handleSubmit()}
        >
          Submit supplementary opening
        </Button>
      </Flex>
      {confirmDialog}
    </Stack>
  );
};

/**
 * Correction structure (RFC §4.5). The UI only previews corrected-minus-
 * effective; the backend validates every invariant and computes the delta
 * journal. Opening journals are never reversed or deleted.
 */
export const CorrectionOpeningForm = ({
  status,
  accounts,
  effective,
  writes,
  intent,
  onCancel,
  onSubmitted,
}: {
  status: LedgerStatus;
  accounts: readonly LedgerAccount[];
  effective: EffectiveOpeningsView | null;
  writes: Writes;
  intent: Intent;
  onCancel: () => void;
  onSubmitted: () => void;
}) => {
  const { confirm, confirmDialog } = useConfirm();
  const { submit, error, setError } = useGuardedSubmit({ writes, intent, onSubmitted });

  const moneyAccountIds = new Set(
    accounts
      .filter((account) => {
        const role = toAccountRole(account);
        return role !== null && isMoneyRole(role);
      })
      .map((account) => account.id),
  );
  const moneyOpenings =
    effective?.accounts.filter((opening) => moneyAccountIds.has(opening.accountId)) ?? [];

  const [corrected, setCorrected] = useState<Record<string, string>>({});
  const [itemCorrected, setItemCorrected] = useState<Record<string, string>>({});
  const [newItems, setNewItems] = useState<MemberMoneyDraft[]>([]);
  const [reason, setReason] = useState("");
  const [evidence, setEvidence] = useState("");
  const groupDates = openingDateGroups(moneyOpenings);
  const ledgerOpeningDate = effective?.openingDate ?? status.openingDate ?? null;
  const [selectedOpeningDate, setSelectedOpeningDate] = useState("");
  // A single verified date needs no choice; derive it so an async load still selects it.
  const activeOpeningDate =
    selectedOpeningDate || (groupDates.length === 1 ? groupDates[0] : "");
  const groupOpenings = moneyOpenings.filter(
    (opening) => opening.openingDate === activeOpeningDate,
  );
  // Member-money items exist only at the ledger's own opening date.
  const itemsAtSelectedDate =
    activeOpeningDate !== "" && activeOpeningDate === ledgerOpeningDate;
  const editableItems = itemsAtSelectedDate ? (effective?.memberMoneyItems ?? []) : [];

  const accountName = (accountId: string) =>
    accounts.find((account) => account.id === accountId)?.name ??
    `Unknown account (${accountId})`;

  const lineDrafts = correctionLinesFromDrafts(
    groupOpenings.map((opening) => ({
      accountId: opening.accountId,
      name: accountName(opening.accountId),
      effectiveKobo: opening.effectiveKobo,
    })),
    corrected,
  );
  const itemDrafts = correctionItemChangesFromDrafts(
    editableItems.map((item) => ({
      id: item.id,
      label: `${item.number} · ${item.payerName}`,
      effectiveKobo: item.effectiveKobo,
    })),
    itemCorrected,
  );
  const itemInputs = memberMoneyDraftsToInputs(newItems);

  const problem =
    effective === null
      ? "Verified openings aren't available from this server yet."
      : groupDates.length === 0
        ? "No verified account openings to correct."
        : !activeOpeningDate
          ? "Choose which opening date you are correcting."
          : status.revision === null
            ? "This server doesn't send the ledger revision yet."
            : !reason.trim()
              ? "Enter the reason for this correction."
              : !evidence.trim()
                ? "Record the supporting evidence for this correction."
                : lineDrafts.problem ??
                  itemDrafts.problem ??
                  itemInputs.problem ??
                  (lineDrafts.lines?.length === 0 &&
                  itemDrafts.itemChanges?.length === 0 &&
                  newItems.length === 0
                    ? "Change at least one opening amount or add a member-money item."
                    : null) ??
                  (intent.blocked ? "An earlier opening change is unresolved." : null);

  const deltas = groupOpenings.flatMap((opening) => {
    const typed = corrected[opening.accountId]?.trim();
    if (!typed) return [];
    const kobo = parseNairaToKobo(typed);
    if (kobo === null) return [];
    const delta = correctionDelta(kobo, opening.effectiveKobo);
    return delta === null ? [] : [{ ...opening, correctedKobo: kobo, delta }];
  });

  const handleSubmit = async () => {
    if (problem) {
      setError(problem);
      return;
    }
    if (!itemInputs.inputs) {
      setError(itemInputs.problem);
      return;
    }
    const confirmed = await confirm({
      title: "Submit opening correction",
      body: "Submit this correction for independent verification? It creates one delta entry dated at the original opening; the opening itself is never reversed. The owner must verify it.",
      confirmLabel: "Submit correction",
    });
    if (!confirmed) return;
    submit(
      buildCorrectionOpeningInput({
        asOfDate: activeOpeningDate,
        expectedLedgerRevision: status.revision as number,
        evidence,
        reason,
        lines: lineDrafts.lines ?? [],
        itemChanges: itemDrafts.itemChanges ?? [],
        memberMoneyItems: itemInputs.inputs,
      }),
    );
  };

  return (
    <Stack gap={4}>
      <Flex justify="space-between" align="center" gap={3} wrap="wrap">
        <Text as="h3" fontSize="md" fontWeight="semibold">
          Correct a verified opening
        </Text>
        <Badge colorPalette="orange" variant="subtle">
          Provisional
        </Badge>
      </Flex>
      <Text fontSize="sm" color="fg.muted">
        Corrections are additional verified deltas dated at the original opening. Opening
        entries are never reversed or deleted. The backend checks balances and computes
        the authoritative deltas.
      </Text>

      {error && (
        <Text role="alert" fontSize="sm" color="fg.error">
          {error}
        </Text>
      )}

      {effective === null ? (
        <Text role="alert" fontSize="sm" color="fg.muted">
          The verified opening figures aren't available from this server yet, so a
          correction can't be prepared.
        </Text>
      ) : (
        <>
          <Box borderWidth="1px" borderColor="border" borderRadius="md" p={3}>
            <Text fontSize="sm" fontWeight="semibold" mb={2}>
              Current effective openings
            </Text>
            {groupDates.length > 1 && (
              <Field.Root mb={3}>
                <Field.Label>Which opening date are you correcting?</Field.Label>
                <OptionSelect<string>
                  value={activeOpeningDate}
                  options={groupDates.map((date) => ({
                    value: date,
                    label: formatBusinessDate(date),
                  }))}
                  onChange={(value) => {
                    // Each correction is dated at one opening. Switching the
                    // group clears drafts from the other date.
                    setSelectedOpeningDate(value);
                    setCorrected({});
                    setItemCorrected({});
                    setNewItems([]);
                  }}
                />
                <Field.HelperText>
                  Accounts opened on different dates can't be corrected in one proposal.
                </Field.HelperText>
              </Field.Root>
            )}
            <Stack gap={3}>
              {activeOpeningDate === "" ? (
                <Text fontSize="sm" color="fg.muted">
                  Choose an opening date to see the accounts you can correct.
                </Text>
              ) : groupOpenings.length === 0 ? (
                <Text fontSize="sm" color="fg.muted">
                  No verified account openings to correct for this date.
                </Text>
              ) : (
                groupOpenings.map((opening) => (
                  <Field.Root key={opening.accountId}>
                    <Field.Label>
                      {accountName(opening.accountId)}
                      <Text as="span" fontSize="xs" color="fg.muted" ml={2}>
                        effective {formatKobo(opening.effectiveKobo)} · opened{" "}
                        {formatBusinessDate(opening.openingDate)}
                      </Text>
                    </Field.Label>
                    <Input
                      aria-label={`Corrected opening for ${accountName(opening.accountId)}`}
                      value={corrected[opening.accountId] ?? ""}
                      inputMode="decimal"
                      placeholder="Leave blank to keep unchanged"
                      onChange={(event) =>
                        setCorrected((current) => ({
                          ...current,
                          [opening.accountId]: event.target.value,
                        }))
                      }
                    />
                  </Field.Root>
                ))
              )}
            </Stack>
          </Box>

          {itemsAtSelectedDate && effective.memberMoneyItems.length > 0 && (
            <Box borderWidth="1px" borderColor="border" borderRadius="md" p={3}>
              <Text fontSize="sm" fontWeight="semibold" mb={2}>
                Opening member money
              </Text>
              <Stack gap={3}>
                {editableItems.map((item) => (
                  <Field.Root key={item.id}>
                    <Field.Label>
                      {item.number} · {item.payerName}
                      <Text as="span" fontSize="xs" color="fg.muted" ml={2}>
                        effective {formatKobo(item.effectiveKobo)}
                      </Text>
                    </Field.Label>
                    <Input
                      aria-label={`Corrected amount for ${item.payerName}`}
                      value={itemCorrected[item.id] ?? ""}
                      inputMode="decimal"
                      placeholder="Leave blank to keep unchanged"
                      onChange={(event) =>
                        setItemCorrected((current) => ({
                          ...current,
                          [item.id]: event.target.value,
                        }))
                      }
                    />
                  </Field.Root>
                ))}
              </Stack>
            </Box>
          )}

          {itemsAtSelectedDate ? (
            <OpeningMemberMoneyEditor drafts={newItems} onChange={setNewItems} />
          ) : (
            activeOpeningDate !== "" &&
            ledgerOpeningDate !== null && (
              <Text fontSize="sm" color="fg.muted">
                Member-money items can only be changed at the ledger's opening date (
                {formatBusinessDate(ledgerOpeningDate)}).
              </Text>
            )
          )}

          <Box borderWidth="1px" borderColor="border" borderRadius="md" p={3}>
            <Text fontSize="sm" fontWeight="semibold" mb={2}>
              Correction preview
            </Text>
            <Stack gap={1}>
              {deltas.map((delta) => (
                <Flex key={delta.accountId} justify="space-between" gap={3}>
                  <Text fontSize="sm" color="fg.muted">
                    {accountName(delta.accountId)}
                  </Text>
                  <Text fontSize="sm">
                    {formatKobo(delta.correctedKobo)} · delta {formatKobo(delta.delta)}
                  </Text>
                </Flex>
              ))}
              {deltas.length === 0 && (
                <Text fontSize="sm" color="fg.muted">
                  Enter a corrected amount to preview a delta.
                </Text>
              )}
              <Text fontSize="xs" color="fg.muted">
                Preview only. The backend validates the correction and computes the
                authoritative delta entry.
              </Text>
            </Stack>
          </Box>

          <Field.Root>
            <Field.Label>Reason for correction</Field.Label>
            <Textarea
              value={reason}
              maxLength={500}
              onChange={(event) => setReason(event.target.value)}
            />
            <Field.HelperText>Required. At most 500 characters.</Field.HelperText>
          </Field.Root>
          <Field.Root>
            <Field.Label>Supporting evidence</Field.Label>
            <Textarea
              value={evidence}
              maxLength={500}
              onChange={(event) => setEvidence(event.target.value)}
            />
          </Field.Root>
          <Text fontSize="xs" color="fg.muted">
            The correction is dated{" "}
            {activeOpeningDate ? formatBusinessDate(activeOpeningDate) : "—"}. If that
            period is locked, the owner must move the lock first.
          </Text>
        </>
      )}

      {problem && (
        <Text fontSize="sm" color="fg.muted" aria-live="polite">
          {problem}
        </Text>
      )}

      <Flex gap={2} wrap="wrap">
        <Button variant="outline" onClick={onCancel}>
          Back
        </Button>
        <Button
          colorPalette="teal"
          loading={writes.isSubmitting}
          disabled={Boolean(problem) || intent.blocked}
          onClick={() => void handleSubmit()}
        >
          Submit correction
        </Button>
      </Flex>
      {confirmDialog}
    </Stack>
  );
};
