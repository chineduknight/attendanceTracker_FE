import { useState } from "react";
import { Badge, Box, Checkbox, Flex, Stack, Text } from "@chakra-ui/react";
import { useConfirm } from "components/ui/confirm-dialog";
import {
  AllocationDraft,
  HintMismatch,
  MEMBER_MONEY_PURPOSE_LABELS,
  PostingDraft,
  PostingSummary,
} from "components/finance/ledgerPostingTypes";
import { PostingDateContext } from "helpers/ledgerPostings";
import {
  Actions,
  DateAndAmount,
  Feedback,
  FormHeading,
  LockableFields,
  SelectField,
  TextField,
} from "components/finance/postings/PostingForms";
import { formatBusinessDate } from "helpers/financeCompliance";
import { formatKobo } from "helpers/financeConstants";
import { hintMismatches } from "helpers/allocationHints";
import {
  ALLOCATION_NOT_PAYMENT_NOTE,
  allocationCapIssue,
  positionGate,
} from "helpers/ledgerAllocations";
import {
  POSTING_TEXT_LIMITS,
  allocationDraftIssue,
  nairaToKobo,
  postingAmountIssue,
} from "helpers/ledgerPostings";
import {
  OBLIGATION_KIND_LABELS,
  UNLINKED_EXPLAINER,
  flagLabel,
  koboOrUnknown,
} from "helpers/ledgerReconciliation";
import { MEMBER_MONEY_SOURCE_KIND_LABELS, MemberMoneySource } from "helpers/memberMoney";
import { useCompliance, useObligations } from "hooks/useFinance";
import { useLedgerNames } from "hooks/useLedgerNames";
import { usePositions } from "hooks/useLedgerReconciliation";
import { FigureRow } from "components/finance/reports/ReportParts";

const MISMATCH_QUESTIONS: Record<HintMismatch, (hint: string, target: string) => string> = {
  member: (hint, target) =>
    `This money was recorded for ${hint}. I confirm it should count for ${target} (for example, someone paid on their behalf).`,
  obligation: (hint, target) =>
    `This money was recorded for ${hint}. I confirm it should go to ${target} instead.`,
  purpose: (hint, target) =>
    `This money was recorded as ${hint}. I confirm it should be allocated to ${target}.`,
};

export interface AllocationFormProps {
  organisationId: string;
  /** The server's latest copy of the source; never a stale snapshot. */
  source: MemberMoneySource;
  context: PostingDateContext;
  /** Chosen by the officer from a suggestion; never from a hint alone. */
  initialMemberId?: string;
  initialObligationId?: string;
  isPosting: boolean;
  error: string | null;
  locked?: boolean;
  onCancel: () => void;
  onSubmit: (draft: PostingDraft, summary: PostingSummary) => void;
}

/**
 * One allocation (F3-3): one source, one member's dues or levy, one amount.
 *
 * The officer picks the obligation, then the member from that obligation's
 * Finance rows (needs only finance.view), and sees the server's current
 * position for it before entering an amount. Each hint on the money that
 * differs from the target needs its own confirmation, and a final
 * confirmation says that allocating records no payment. The server picks
 * both accounts and checks every rule again.
 */
const AllocationForm = ({
  organisationId,
  source,
  context,
  initialMemberId = "",
  initialObligationId = "",
  isPosting,
  error,
  locked = false,
  onCancel,
  onSubmit,
}: AllocationFormProps) => {
  const { confirm, confirmDialog } = useConfirm();
  const [obligationId, setObligationId] = useState(initialObligationId);
  const [memberId, setMemberId] = useState(initialMemberId);
  const [businessDate, setBusinessDate] = useState(context.today);
  const [amountRaw, setAmountRaw] = useState("");
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const [confirmed, setConfirmed] = useState<HintMismatch[]>([]);
  const [attempted, setAttempted] = useState(false);

  const obligationsQuery = useObligations(organisationId);
  const compliance = useCompliance(organisationId, obligationId);
  const names = useLedgerNames(organisationId, {
    enabled: true,
    complianceObligationId: obligationId || source.obligationId || "",
  });
  const obligation = obligationsQuery.obligations.find((entry) => entry.id === obligationId) ?? null;
  const obligationType = obligation?.type === "dues" || obligation?.type === "levy" ? obligation.type : null;
  const positionQuery = usePositions(
    organisationId,
    { obligationId, memberId, flag: "", cursor: "" },
    Boolean(obligationId && memberId),
  );
  const gate =
    obligationId && memberId
      ? positionGate({
          report: positionQuery.report,
          isLoading: positionQuery.isLoading,
          isError: positionQuery.isError && !positionQuery.report,
          memberId,
          obligationId,
        })
      : null;

  const mismatches =
    obligationType && memberId
      ? hintMismatches(source, { memberId, obligationId, obligationType })
      : [];
  // A confirmation only counts for a mismatch that still exists.
  const confirmedNow = confirmed.filter((hint) => mismatches.includes(hint));

  const amountKobo = nairaToKobo(amountRaw);
  const draft: AllocationDraft | null = obligationType
    ? {
        source: {
          kind: source.kind,
          id: source.id,
          number: source.number,
          businessDate: source.businessDate,
          remainingKobo: source.remainingKobo,
          memberId: source.memberId,
          obligationId: source.obligationId,
          purpose: source.purpose,
        },
        memberId,
        obligationId,
        obligationType,
        businessDate,
        amountKobo: amountKobo ?? 0,
        confirmedMismatches: confirmedNow,
        reference,
        note,
      }
    : null;

  const memberOptions = (compliance.compliance?.rows ?? [])
    .map((row) => ({ value: row.memberId, label: row.name }))
    .sort((left, right) => left.label.localeCompare(right.label));
  const obligationOptions = obligationsQuery.obligations
    .filter((entry) => entry.type === "dues" || entry.type === "levy")
    .map((entry) => ({ value: entry.id, label: entry.year ? `${entry.name} (${entry.year})` : entry.name }));

  const issue = (() => {
    if (!obligationId) return "Choose the obligation.";
    if (!memberId) return "Choose the member.";
    if (!draft) return "This obligation's type isn't one money can be allocated to.";
    if (!gate || gate.kind !== "open") return "This member's position doesn't allow an allocation now.";
    if (positionQuery.isFetching) return "Wait for the latest position to load.";
    return (
      postingAmountIssue(amountRaw) ??
      allocationDraftIssue(draft, context) ??
      allocationCapIssue(draft.amountKobo, gate)
    );
  })();

  const memberLabel = memberId ? names.memberName(memberId) : "";
  const obligationLabel = obligationId ? names.obligationName(obligationId) : "";
  const hintText = (hint: HintMismatch) => {
    switch (hint) {
      case "member":
        return names.memberName(source.memberId as string);
      case "obligation":
        return names.obligationName(source.obligationId as string);
      case "purpose":
        return source.purpose ? MEMBER_MONEY_PURPOSE_LABELS[source.purpose].toLowerCase() : "";
    }
  };
  const targetText = (hint: HintMismatch) =>
    hint === "member" ? memberLabel : hint === "obligation" ? obligationLabel : obligationType ?? "";

  const submit = async () => {
    setAttempted(true);
    if (issue || !draft || amountKobo === null || !obligationType) return;
    const ok = await confirm({
      title: "Allocate member money",
      body: (
        <Stack gap={2}>
          <Text>
            {`Allocate ${formatKobo(amountKobo)} from ${source.number} to ${memberLabel}, ${obligationLabel}, as ${OBLIGATION_KIND_LABELS[
              obligationType
            ].toLowerCase()} income dated ${formatBusinessDate(businessDate)}?`}
          </Text>
          <Text>{ALLOCATION_NOT_PAYMENT_NOTE}</Text>
          {confirmedNow.length > 0 && (
            <Text>{`You confirmed a different ${confirmedNow.join(", ")} from the hints on this money.`}</Text>
          )}
        </Stack>
      ),
      confirmLabel: "Allocate",
    });
    if (!ok) return;
    onSubmit(
      { operation: "allocation", allocation: { ...draft, amountKobo } },
      {
        operation: "allocation",
        amountKobo,
        businessDate,
        method: null,
        fromAccountName: null,
        toAccountName: null,
        categoryName: null,
        counterpartyName: null,
        purpose: null,
        sourceNumber: source.number,
        memberName: memberLabel,
        obligationName: obligationLabel,
        obligationType,
      },
    );
  };

  return (
    <Stack gap={4}>
      <FormHeading>Allocate member money</FormHeading>
      <Text fontSize="sm" color="fg.muted">
        {ALLOCATION_NOT_PAYMENT_NOTE}
      </Text>

      <Box borderWidth="1px" borderColor="border" borderRadius="md" p={3}>
        <Flex gap={2} align="center" wrap="wrap">
          <Text fontWeight="semibold">{source.number}</Text>
          <Badge variant="subtle">{MEMBER_MONEY_SOURCE_KIND_LABELS[source.kind]}</Badge>
        </Flex>
        <Text fontSize="sm">{source.payerName ?? "Payer not recorded"}</Text>
        <Text fontSize="sm" color="fg.muted">{`Received ${formatBusinessDate(source.businessDate)}`}</Text>
        <Text fontSize="sm" color="fg.muted">
          {`Hints: ${
            [
              source.memberId ? `member ${names.memberName(source.memberId)}` : null,
              source.obligationId ? `obligation ${names.obligationName(source.obligationId)}` : null,
              source.purpose ? `purpose ${MEMBER_MONEY_PURPOSE_LABELS[source.purpose].toLowerCase()}` : null,
            ]
              .filter(Boolean)
              .join(", ") || "none"
          }`}
        </Text>
        <FigureRow strong label="Available to allocate" value={formatKobo(source.remainingKobo)} />
      </Box>

      <Feedback attempted={attempted} issue={issue} error={error} />

      <LockableFields locked={locked}>
        <SelectField
          label="Obligation"
          value={obligationId}
          options={obligationOptions}
          onChange={(value) => {
            setObligationId(value);
            setMemberId("");
            setConfirmed([]);
          }}
          placeholder={obligationsQuery.isLoading ? "Loading obligations…" : "Choose a dues or levy obligation"}
          helper="Archived obligations can't be allocated to."
        />
        {obligationId && (
          <SelectField
            label="Member"
            value={memberId}
            options={memberOptions}
            onChange={(value) => {
              setMemberId(value);
              setConfirmed([]);
            }}
            placeholder={compliance.isLoading ? "Loading members…" : "Choose the member"}
            helper="Members listed on this obligation in Finance. Archived members can't be allocated to."
            searchable
          />
        )}
        {compliance.isError && obligationId && (
          <Text role="alert" fontSize="sm" color="fg.error">
            The members on this obligation couldn't be loaded, so no member can be chosen.
          </Text>
        )}

        {gate && (
          <Box borderWidth="1px" borderColor="border" borderRadius="md" p={3} aria-label="Current position">
            <Text fontSize="sm" fontWeight="semibold" mb={1}>
              Current position (Finance now, and allocations in the ledger)
            </Text>
            {gate.kind === "loading" && (
              <Text fontSize="sm" color="fg.muted">
                Loading the current position…
              </Text>
            )}
            {(gate.kind === "unavailable" || gate.kind === "none") && (
              <Text role="alert" fontSize="sm" color="fg.muted">
                {gate.reason}
              </Text>
            )}
            {(gate.kind === "blocked" || gate.kind === "open") && (
              <>
                <FigureRow label="Recorded in Finance" value={koboOrUnknown(gate.position.recordedKobo)} />
                <FigureRow label="Already allocated" value={formatKobo(gate.position.allocatedKobo)} />
                <FigureRow
                  label="Recorded, not linked to an allocation"
                  value={koboOrUnknown(gate.position.unlinkedKobo)}
                  strong
                />
                {gate.position.flags.length > 0 && (
                  <Flex gap={1} wrap="wrap" mt={1}>
                    {gate.position.flags.map((flag) => (
                      <Badge key={flag} colorPalette="orange" variant="subtle">
                        {flagLabel(flag)}
                      </Badge>
                    ))}
                  </Flex>
                )}
                <Text fontSize="xs" color="fg.muted" mt={1}>
                  {UNLINKED_EXPLAINER}
                </Text>
                {gate.kind === "blocked" && (
                  <Text role="alert" fontSize="sm" mt={1}>
                    {gate.reason}
                  </Text>
                )}
                {gate.kind === "open" && (
                  <Text fontSize="sm" mt={1}>
                    {`At most ${formatKobo(Math.min(gate.capKobo, source.remainingKobo))} can be allocated here: what ${source.number} holds and what Finance records but isn't yet linked.`}
                  </Text>
                )}
              </>
            )}
          </Box>
        )}

        {gate?.kind === "open" && (
          <>
            <DateAndAmount
              context={context}
              date={businessDate}
              onDate={setBusinessDate}
              amountRaw={amountRaw}
              onAmount={setAmountRaw}
            />
            <Text fontSize="xs" color="fg.muted">
              {`The business date is when the income is recognised. It can't be before ${formatBusinessDate(
                source.businessDate,
              )}, when this money was received.`}
            </Text>
            {mismatches.length > 0 && (
              <Box borderWidth="1px" borderColor="border.warning" borderRadius="md" p={3}>
                <Text fontSize="sm" fontWeight="semibold" mb={2}>
                  Hints on this money that differ
                </Text>
                <Stack gap={3}>
                  {mismatches.map((hint) => (
                    <Checkbox.Root
                      key={hint}
                      checked={confirmed.includes(hint)}
                      onCheckedChange={({ checked }) =>
                        setConfirmed((current) =>
                          checked === true
                            ? [...current.filter((entry) => entry !== hint), hint]
                            : current.filter((entry) => entry !== hint),
                        )
                      }
                      alignItems="flex-start"
                    >
                      <Checkbox.HiddenInput />
                      <Checkbox.Control mt={0.5} />
                      <Checkbox.Label fontSize="sm">{MISMATCH_QUESTIONS[hint](hintText(hint), targetText(hint))}</Checkbox.Label>
                    </Checkbox.Root>
                  ))}
                </Stack>
              </Box>
            )}
            <TextField
              label="Reference"
              value={reference}
              onChange={setReference}
              maxLength={POSTING_TEXT_LIMITS.reference}
              helper="Optional. A short label shown in the journal list."
            />
            <TextField
              label="Note"
              value={note}
              onChange={setNote}
              maxLength={POSTING_TEXT_LIMITS.note}
              helper="Optional. Anything the next officer should know."
              multiline
            />
          </>
        )}
      </LockableFields>
      <Actions
        isPosting={isPosting}
        locked={locked || gate?.kind !== "open"}
        onCancel={onCancel}
        onSubmit={() => void submit()}
        label="Review and allocate"
        colorPalette="teal"
      />
      {confirmDialog}
    </Stack>
  );
};

export default AllocationForm;
