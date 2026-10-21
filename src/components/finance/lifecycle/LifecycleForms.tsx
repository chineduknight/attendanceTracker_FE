import { useState } from "react";
import { Badge, Box, Button, Field, Flex, Stack, Text, Textarea } from "@chakra-ui/react";
import { DateField } from "components/ui/date-field";
import { useConfirm } from "components/ui/confirm-dialog";
import { LedgerStatus } from "components/finance/ledgerTypes";
import { LifecycleWriteResult } from "components/finance/lifecycleTypes";
import { formatBusinessDate } from "helpers/financeCompliance";
import {
  MAX_LIFECYCLE_REASON,
  gapWindow,
  gapWindowProblem,
  lifecycleReasonIssue,
  periodLockChange,
  periodLockIssue,
  periodLockReasonIssue,
  periodLockNeedsReason,
} from "helpers/ledgerLifecycle";
import { formatLagosTimestamp } from "helpers/openingBalances";
import { LifecycleCallbacks, useLedgerLifecycleWrites } from "hooks/useLedgerLifecycle";
import { classifyIntentWriteFailure, useLedgerWriteIntent } from "hooks/useLedgerWriteIntent";

type Writes = ReturnType<typeof useLedgerLifecycleWrites>;
type Intent = ReturnType<typeof useLedgerWriteIntent>;

/**
 * How a sent lifecycle write ended for the screen. `unconfirmed` is an
 * unknown outcome: `result` is what a 2xx reported (unreadable or
 * contradicting the request), or null when no usable answer arrived.
 */
export type LifecycleDone =
  | { kind: "confirmed"; result: LifecycleWriteResult; lockedThrough?: string | null }
  | { kind: "unconfirmed"; result: LifecycleWriteResult | null; lockedThrough?: string | null };

type Done = (outcome: LifecycleDone) => void;

/**
 * Screen handling shared by every lifecycle write. The write intent itself is
 * persisted, settled and reloaded by `sendDurableIntentWrite`, so it does not
 * depend on this form staying mounted.
 */
const useLifecycleSubmit = (onDone: Done) => {
  const [error, setError] = useState<string | null>(null);

  const submit = (
    send: (callbacks: Required<LifecycleCallbacks>) => void,
    lockedThrough?: string | null,
  ) => {
    send({
      // Only a status that shows the requested change arrives here.
      onSuccess: (result) => {
        setError(null);
        onDone({ kind: "confirmed", result, lockedThrough });
      },
      // A 2xx that doesn't prove the change: unknown, intent kept.
      onUnconfirmed: (result) => {
        setError(null);
        onDone({ kind: "unconfirmed", result, lockedThrough });
      },
      onError: (failure) => {
        const outcome = classifyIntentWriteFailure(failure);
        if (outcome.kind === "unknown") {
          // The request may have committed; the intent notice makes the
          // officer reconcile before any further ledger write.
          setError(null);
          onDone({ kind: "unconfirmed", result: null, lockedThrough });
          return;
        }
        setError(outcome.message ?? "The change wasn't saved. Try again.");
      },
    });
  };

  return { submit, error, setError };
};

const FormHeading = ({ children }: { children: string }) => (
  <Text as="h3" fontSize="md" fontWeight="semibold">
    {children}
  </Text>
);

const ErrorText = ({ error }: { error: string | null }) =>
  error ? (
    <Text role="alert" fontSize="sm" color="fg.error">
      {error}
    </Text>
  ) : null;

const ProblemText = ({ problem }: { problem: string | null }) =>
  problem ? (
    <Text fontSize="sm" color="fg.muted" aria-live="polite">
      {problem}
    </Text>
  ) : null;

/** The reason field shared by suspend, resume and period lock. */
const ReasonField = ({
  value,
  onChange,
  label,
  helper,
}: {
  value: string;
  onChange: (value: string) => void;
  label: string;
  helper: string;
}) => (
  <Field.Root>
    <Field.Label>{label}</Field.Label>
    <Textarea
      value={value}
      maxLength={MAX_LIFECYCLE_REASON}
      onChange={(event) => onChange(event.target.value)}
    />
    <Field.HelperText>{helper}</Field.HelperText>
  </Field.Root>
);

export const SuspendLedgerForm = ({
  status,
  writes,
  intent,
  onCancel,
  onDone,
}: {
  status: LedgerStatus;
  writes: Writes;
  intent: Intent;
  onCancel: () => void;
  onDone: Done;
}) => {
  const { confirm, confirmDialog } = useConfirm();
  const { submit, error, setError } = useLifecycleSubmit(onDone);
  const [reason, setReason] = useState("");

  const problem =
    lifecycleReasonIssue(reason) ??
    (status.revision === null
      ? "This server doesn't send the ledger revision yet."
      : null) ??
    (intent.blocked ? "An earlier ledger change is unresolved." : null);

  const handleSubmit = async () => {
    if (problem) {
      setError(problem);
      return;
    }
    const confirmed = await confirm({
      title: "Suspend bookkeeping",
      body: "No postings, supplementary openings or corrections can be made while the ledger is suspended. The reason is recorded in the ledger audit trail.",
      confirmLabel: "Suspend bookkeeping",
    });
    if (!confirmed) return;
    submit((callbacks) =>
      writes.suspendLedger(
        { expectedLedgerRevision: status.revision as number, reason: reason.trim() },
        callbacks,
      ),
    );
  };

  return (
    <Stack gap={4}>
      <Flex justify="space-between" align="center" gap={3} wrap="wrap">
        <FormHeading>Suspend bookkeeping</FormHeading>
        <Badge colorPalette="red" variant="subtle">
          Owner only
        </Badge>
      </Flex>
      <Text fontSize="sm" color="fg.muted">
        Suspending stops all postings and opening proposals. The ledger can be resumed by an
        owner at any time; nothing is deleted.
      </Text>
      <ErrorText error={error} />
      <ReasonField
        value={reason}
        onChange={setReason}
        label="Reason for suspending"
        helper={`Required. Recorded in the audit trail. At most ${MAX_LIFECYCLE_REASON} characters.`}
      />
      <ProblemText problem={problem} />
      <Flex gap={2} wrap="wrap">
        <Button variant="outline" onClick={onCancel}>
          Back
        </Button>
        <Button
          colorPalette="red"
          loading={writes.isSuspending}
          disabled={Boolean(problem) || intent.blocked}
          onClick={() => void handleSubmit()}
        >
          Suspend ledger
        </Button>
      </Flex>
      {confirmDialog}
    </Stack>
  );
};

export const ResumeLedgerForm = ({
  status,
  writes,
  intent,
  onCancel,
  onDone,
}: {
  status: LedgerStatus;
  writes: Writes;
  intent: Intent;
  onCancel: () => void;
  onDone: Done;
}) => {
  const { confirm, confirmDialog } = useConfirm();
  const { submit, error, setError } = useLifecycleSubmit(onDone);
  const [reason, setReason] = useState("");

  const problem =
    lifecycleReasonIssue(reason) ??
    (status.revision === null
      ? "This server doesn't send the ledger revision yet."
      : null) ??
    (intent.blocked ? "An earlier ledger change is unresolved." : null);

  const handleSubmit = async () => {
    if (problem) {
      setError(problem);
      return;
    }
    const confirmed = await confirm({
      title: "Resume bookkeeping",
      body: "Resuming makes the ledger active again. The reason is recorded in the ledger audit trail.",
      confirmLabel: "Resume bookkeeping",
    });
    if (!confirmed) return;
    submit((callbacks) =>
      writes.resumeLedger(
        { expectedLedgerRevision: status.revision as number, reason: reason.trim() },
        callbacks,
      ),
    );
  };

  return (
    <Stack gap={4}>
      <Flex justify="space-between" align="center" gap={3} wrap="wrap">
        <FormHeading>Resume bookkeeping</FormHeading>
        <Badge colorPalette="green" variant="subtle">
          Owner only
        </Badge>
      </Flex>
      <Text fontSize="sm" color="fg.muted">
        The ledger is currently suspended. Resuming restores the active ledger; no amounts or
        records change.
      </Text>
      <ErrorText error={error} />
      <ReasonField
        value={reason}
        onChange={setReason}
        label="Reason for resuming"
        helper={`Required. Recorded in the audit trail. At most ${MAX_LIFECYCLE_REASON} characters.`}
      />
      <ProblemText problem={problem} />
      <Flex gap={2} wrap="wrap">
        <Button variant="outline" onClick={onCancel}>
          Back
        </Button>
        <Button
          colorPalette="teal"
          loading={writes.isResuming}
          disabled={Boolean(problem) || intent.blocked}
          onClick={() => void handleSubmit()}
        >
          Resume ledger
        </Button>
      </Flex>
      {confirmDialog}
    </Stack>
  );
};

/**
 * Set, move or remove the period lock (RFC §4.6, D12). A forward move needs
 * no reason; moving it back or removing it is the audited unlock and needs
 * one. The backend owns the final check and the revision CAS.
 */
export const PeriodLockForm = ({
  status,
  today,
  writes,
  intent,
  onCancel,
  onDone,
}: {
  status: LedgerStatus;
  today: string;
  writes: Writes;
  intent: Intent;
  onCancel: () => void;
  onDone: Done;
}) => {
  const { confirm, confirmDialog } = useConfirm();
  const { submit, error, setError } = useLifecycleSubmit(onDone);
  const liveStateKnown = status.lockedThroughState !== "unknown";
  const current = status.lockedThroughState === "set" ? status.lockedThrough : null;
  const [date, setDate] = useState(current ?? "");
  const [reason, setReason] = useState("");

  const revisionProblem = !liveStateKnown
    ? "The server didn't report the current period lock, so it can't be changed safely."
    : status.revision === null
      ? "This server doesn't send the ledger revision yet."
      : null;
  const change = date ? periodLockChange(current, date) : "unchanged";
  const moveProblem =
    revisionProblem ??
    (date ? periodLockIssue({ next: date, current, openingDate: status.openingDate, today }) : "Choose a lock date.") ??
    periodLockReasonIssue(reason, change) ??
    (intent.blocked ? "An earlier ledger change is unresolved." : null);
  const removeProblem =
    revisionProblem ??
    periodLockIssue({ next: null, current, openingDate: status.openingDate, today }) ??
    periodLockReasonIssue(reason, "unlock") ??
    (intent.blocked ? "An earlier ledger change is unresolved." : null);

  const confirmAndSend = async (lockedThrough: string | null) => {
    const problem = lockedThrough === null ? removeProblem : moveProblem;
    if (problem) {
      setError(problem);
      return;
    }
    const confirmed = await confirm({
      title: lockedThrough === null ? "Remove the period lock" : "Move the period lock",
      body:
        lockedThrough === null
          ? "Removing the lock is an audited unlock: postings and corrections dated on or before the old lock become allowed. The reason is recorded in the ledger audit trail."
          : periodLockNeedsReason(change)
            ? "Moving the lock back is an audited unlock. The reason is recorded in the ledger audit trail."
            : "The new lock refuses postings and corrections dated on or before it. The change is recorded in the ledger audit trail.",
      confirmLabel:
        lockedThrough === null ? "Remove the period lock" : "Move the period lock",
    });
    if (!confirmed) return;
    submit(
      (callbacks) =>
        writes.setPeriodLock(
          {
            expectedLedgerRevision: status.revision as number,
            lockedThrough,
            ...(reason.trim() ? { reason: reason.trim() } : {}),
          },
          callbacks,
        ),
      lockedThrough,
    );
  };

  return (
    <Stack gap={4}>
      <Flex justify="space-between" align="center" gap={3} wrap="wrap">
        <FormHeading>Period lock</FormHeading>
        <Badge colorPalette="blue" variant="subtle">
          Owner only
        </Badge>
      </Flex>
      <Text fontSize="sm" color="fg.muted">
        Postings and corrections dated on or before the lock are refused. Moving the lock
        back or removing it is an audited unlock.
      </Text>
      <Text fontSize="sm">
        Current lock:{" "}
        {current ? formatBusinessDate(current) : "none"}
      </Text>
      <ErrorText error={error} />
      <Field.Root>
        <Field.Label>New lock date</Field.Label>
        <DateField
          value={date}
          onChange={setDate}
          min={status.openingDate ?? undefined}
          max={today}
        />
        <Field.HelperText>
          On or after the ledger's opening date and not later than today in Lagos.
        </Field.HelperText>
      </Field.Root>
      <ReasonField
        value={reason}
        onChange={setReason}
        label="Reason (required when moving back or removing)"
        helper={`Recorded in the audit trail. At most ${MAX_LIFECYCLE_REASON} characters.`}
      />
      <ProblemText problem={moveProblem} />
      {current !== null && removeProblem !== moveProblem && (
        <ProblemText problem={removeProblem} />
      )}
      <Flex gap={2} wrap="wrap">
        <Button variant="outline" onClick={onCancel}>
          Back
        </Button>
        <Button
          colorPalette="teal"
          loading={writes.isSettingLock}
          disabled={Boolean(moveProblem) || intent.blocked}
          onClick={() => void confirmAndSend(date)}
        >
          {current ? "Move period lock" : "Set period lock"}
        </Button>
        {current !== null && (
          <Button
            variant="outline"
            colorPalette="red"
            loading={writes.isSettingLock}
            disabled={Boolean(removeProblem) || intent.blocked}
            onClick={() => void confirmAndSend(null)}
          >
            Remove period lock
          </Button>
        )}
      </Flex>
      {confirmDialog}
    </Stack>
  );
};

/**
 * The once-only gap-window attestation (RFC §5.6.6, D28). It records that the
 * officer entered every movement in `[openingDate, activatedAt)` from the
 * organisation's own records; the server makes no completeness claim.
 */
export const GapWindowAttestationForm = ({
  status,
  writes,
  intent,
  onCancel,
  onDone,
}: {
  status: LedgerStatus;
  writes: Writes;
  intent: Intent;
  onCancel: () => void;
  onDone: Done;
}) => {
  const { confirm, confirmDialog } = useConfirm();
  const { submit, error, setError } = useLifecycleSubmit(onDone);
  const window = gapWindow(status);

  const problem =
    gapWindowProblem(status) ??
    (status.gapWindowAttestation !== "not_attested"
      ? "The server doesn't report this gap window as unattested, so this app won't submit another attestation."
      : null) ??
    (status.revision === null
      ? "This server doesn't send the ledger revision yet."
      : null) ??
    (intent.blocked ? "An earlier ledger change is unresolved." : null);

  const handleSubmit = async () => {
    if (problem) {
      setError(problem);
      return;
    }
    const confirmed = await confirm({
      title: "Attest gap window",
      body: "This records that every receipt, expense and transfer dated in the gap window has been entered from the organisation's own records. It can be recorded only once.",
      confirmLabel: "Attest gap window",
    });
    if (!confirmed) return;
    submit((callbacks) =>
      writes.attestGapWindow(
        { expectedLedgerRevision: status.revision as number, attestation: true },
        callbacks,
      ),
    );
  };

  return (
    <Stack gap={4}>
      <Flex justify="space-between" align="center" gap={3} wrap="wrap">
        <FormHeading>Gap-window attestation</FormHeading>
        <Badge colorPalette="orange" variant="subtle">
          Once only
        </Badge>
      </Flex>
      {window && (
        <Box borderWidth="1px" borderColor="border" borderRadius="md" p={3}>
          <Stack gap={1}>
            <Text fontSize="sm" fontWeight="semibold">
              Gap window
            </Text>
            <Text fontSize="sm" color="fg.muted">
              Opening date {formatBusinessDate(window.openingDate)} up to activation at{" "}
              {formatLagosTimestamp(window.activatedAt) ?? "an unreadable time"}.
            </Text>
          </Stack>
        </Box>
      )}
      <Text fontSize="sm" color="fg.muted">
        Attest only after entering every receipt, expense and transfer dated in this window from
        receipt books or bank statements. The server records the attestation but makes no
        completeness claim.
      </Text>
      <ErrorText error={error} />
      <ProblemText problem={problem} />
      <Flex gap={2} wrap="wrap">
        <Button variant="outline" onClick={onCancel}>
          Back
        </Button>
        <Button
          colorPalette="teal"
          loading={writes.isAttesting}
          disabled={Boolean(problem) || intent.blocked}
          onClick={() => void handleSubmit()}
        >
          Record attestation
        </Button>
      </Flex>
      {confirmDialog}
    </Stack>
  );
};
