import { useId, useState } from "react";
import { Badge, Box, Button, Flex, Stack, Text } from "@chakra-ui/react";
import {
  LEDGER_LIFECYCLE_UI_ENABLED,
} from "config/ledgerLifecycle";
import { LedgerKnownState, LedgerStatus } from "components/finance/ledgerTypes";
import {
  LifecycleWriteResult,
} from "components/finance/lifecycleTypes";
import LedgerWriteIntentNotice from "components/finance/LedgerWriteIntentNotice";
import {
  GapWindowAttestationForm,
  PeriodLockForm,
  ResumeLedgerForm,
  SuspendLedgerForm,
} from "components/finance/lifecycle/LifecycleForms";
import { formatBusinessDate } from "helpers/financeCompliance";
import { LEDGER_STATE_LABELS, ledgerStateKey } from "helpers/ledger";
import {
  LifecycleAction,
  auditActionLabel,
  auditDetail,
  gapWindow,
  gapWindowProblem,
  latestAuditEntry,
  lifecycleOutcomeMessage,
  lifecyclePermission,
} from "helpers/ledgerLifecycle";
import { formatLagosTimestamp, todayInLagos } from "helpers/openingBalances";
import { useLedgerAudit, useLedgerLifecycleWrites } from "hooks/useLedgerLifecycle";
import { useLedgerWriteIntent } from "hooks/useLedgerWriteIntent";
import { usePermissions } from "rbac/usePermissions";

/**
 * F2A-3B ledger lifecycle: suspend, resume, the period lock and the once-only
 * gap-window attestation (RFC v0.3 §4.2, §4.6, §4.7, D9, D12, D28).
 *
 * Every control is gated twice: this component's own switch (off in this
 * release) and the officer's permissions mirrored from the backend. The
 * backend remains authoritative: a revision CAS protects every write, and
 * nothing here reports a state the returned status does not actually show.
 */

const STATE_SCHEMES: Record<
  LedgerKnownState | "unknown",
  "green" | "gray" | "blue" | "orange" | "red" | "yellow"
> = {
  active: "green",
  not_active: "gray",
  setup: "blue",
  pending_verification: "orange",
  suspended: "red",
  unknown: "yellow",
};

type View =
  | { kind: "overview" }
  | { kind: "suspend" }
  | { kind: "resume" }
  | { kind: "period-lock" }
  | { kind: "attest" };

interface Outcome {
  action: LifecycleAction;
  result: LifecycleWriteResult;
  lockedThrough?: string | null;
}

const SectionHeading = ({ id, children }: { id: string; children: string }) => (
  <Text as="h3" id={id} fontSize="md" fontWeight="semibold" mb={2}>
    {children}
  </Text>
);

const Fact = ({ children }: { children: string }) => (
  <Text fontSize="sm" color="fg.muted">
    {children}
  </Text>
);

const LedgerLifecyclePanel = ({
  organisationId,
  status,
  onRecheckLedger,
  enabled = LEDGER_LIFECYCLE_UI_ENABLED,
}: {
  organisationId: string;
  status: LedgerStatus;
  /** Refetches the ledger status (and the rest of Books) after a write. */
  onRecheckLedger?: () => void;
  enabled?: boolean;
}) => {
  const headingId = useId();
  const auditHeadingId = useId();
  const { has, isOwner } = usePermissions();
  const canManage = has("finance.manage");
  const state = ledgerStateKey(status);
  const [view, setView] = useState<View>({ kind: "overview" });
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const intent = useLedgerWriteIntent(organisationId);
  const writes = useLedgerLifecycleWrites(organisationId);
  const audit = useLedgerAudit(organisationId, enabled);
  const today = todayInLagos();

  if (!enabled) return null;
  // An unrecognised state gets no lifecycle controls: this build cannot say
  // what a suspension or a lock would mean for it.
  if (state === "unknown") return null;

  const recheck = () => {
    onRecheckLedger?.();
    audit.refetch();
  };

  const done =
    (action: LifecycleAction) =>
    (result: LifecycleWriteResult | null, lockedThrough?: string | null) => {
      setView({ kind: "overview" });
      // A null result means the outcome is unknown: the intent notice already
      // says so, and claiming anything else would be false.
      setOutcome(result ? { action, result, lockedThrough } : null);
      recheck();
    };

  const suspend = lifecyclePermission({ action: "suspend", status, canManage, isOwner });
  const resume = lifecyclePermission({ action: "resume", status, canManage, isOwner });
  const lock = lifecyclePermission({ action: "period-lock", status, canManage, isOwner });
  const attest = lifecyclePermission({
    action: "attest-gap-window",
    status,
    canManage,
    isOwner,
  });

  const intentNotice = (
    <LedgerWriteIntentNotice
      read={intent.read}
      canManage={canManage}
      isRechecking={audit.isFetching}
      onRecheck={recheck}
      onAcknowledge={intent.acknowledge}
      onRetryStorage={intent.refresh}
    />
  );

  if (view.kind !== "overview") {
    const form = (() => {
      switch (view.kind) {
        case "suspend":
          return (
            <SuspendLedgerForm
              status={status}
              writes={writes}
              intent={intent}
              onCancel={() => setView({ kind: "overview" })}
              onDone={done("suspend")}
            />
          );
        case "resume":
          return (
            <ResumeLedgerForm
              status={status}
              writes={writes}
              intent={intent}
              onCancel={() => setView({ kind: "overview" })}
              onDone={done("resume")}
            />
          );
        case "period-lock":
          return (
            <PeriodLockForm
              status={status}
              today={today}
              writes={writes}
              intent={intent}
              onCancel={() => setView({ kind: "overview" })}
              onDone={done("period-lock")}
            />
          );
        case "attest":
          return (
            <GapWindowAttestationForm
              status={status}
              writes={writes}
              intent={intent}
              onCancel={() => setView({ kind: "overview" })}
              onDone={done("attest-gap-window")}
            />
          );
      }
    })();
    return (
      <Box as="section" aria-labelledby={headingId}>
        <SectionHeading id={headingId}>Lifecycle</SectionHeading>
        <Stack gap={4}>
          {intentNotice}
          {form}
        </Stack>
      </Box>
    );
  }

  const entries = audit.entries;
  const suspendEntry = entries ? latestAuditEntry(entries, "ledger_suspended") : null;
  const window = gapWindow(status);
  const windowProblem = gapWindowProblem(status);
  const canRunLifecycle = state === "active" || state === "suspended";
  const permissionNotes = Array.from(
    new Set(
      [suspend, resume, lock, attest]
        .map((permission) => permission.reason)
        .filter((reason): reason is string => Boolean(reason)),
    ),
  );

  const outcomeMessage = outcome
    ? lifecycleOutcomeMessage({
        action: outcome.action,
        result: outcome.result,
        lockedThrough: outcome.lockedThrough,
      })
    : null;

  return (
    <Box as="section" aria-labelledby={headingId}>
      <Flex justify="space-between" align="center" gap={3} wrap="wrap" mb={2}>
        <Text as="h2" id={headingId} fontSize="lg" fontWeight="semibold">
          Lifecycle
        </Text>
        <Badge colorPalette={STATE_SCHEMES[state]} variant="subtle">
          {LEDGER_STATE_LABELS[state]}
        </Badge>
      </Flex>

      <Stack gap={4}>
        {intentNotice}

        <Box borderWidth="1px" borderColor="border" borderRadius="md" p={3}>
          <Text fontSize="sm" fontWeight="semibold" mb={2}>
            Current lifecycle
          </Text>
          <Stack gap={1}>
            {status.openingDate && <Fact>{`Opening date: ${formatBusinessDate(status.openingDate)}`}</Fact>}
            {status.activatedAt && (
              <Fact>{`Activated: ${formatLagosTimestamp(status.activatedAt) ?? "time unavailable"}`}</Fact>
            )}
            {status.revision !== null && <Fact>{`Ledger revision: ${status.revision}`}</Fact>}
            {status.revision !== null &&
              (status.lockedThrough ? (
                <Fact>{`Period locked through: ${formatBusinessDate(status.lockedThrough)}`}</Fact>
              ) : (
                <Fact>The period is not locked.</Fact>
              ))}
            {status.gapWindowAttestation === "attested" && (
              <Fact>
                {status.gapWindowAttestedAt
                  ? `Gap window attested: ${formatLagosTimestamp(status.gapWindowAttestedAt) ?? "time unavailable"}`
                  : "Gap window attested."}
              </Fact>
            )}
            {status.gapWindowAttestation === "not_attested" && (
              <Fact>The gap window is not attested yet.</Fact>
            )}
            {status.gapWindowAttestation === "unknown" && (
              <Fact>
                The server didn't say whether the gap window is attested, so this app neither
                offers nor claims an attestation.
              </Fact>
            )}
            <Fact>
              {status.postingEnabled
                ? "The server reports posting as enabled."
                : "The server does not report posting as enabled."}
            </Fact>
          </Stack>
        </Box>

        {state === "suspended" && (
          <Box borderWidth="1px" borderColor="border" borderRadius="md" p={3}>
            <Text fontSize="sm" fontWeight="semibold" mb={2}>
              Suspension
            </Text>
            <Stack gap={1}>
              {suspendEntry ? (
                <>
                  <Fact>{`Reason: ${suspendEntry.reason ?? "no reason recorded on this audit row"}`}</Fact>
                  {suspendEntry.actorId && <Fact>{`Recorded by: ${suspendEntry.actorId}`}</Fact>}
                  {suspendEntry.at && (
                    <Fact>{`Recorded at: ${formatLagosTimestamp(suspendEntry.at) ?? "time unavailable"}`}</Fact>
                  )}
                </>
              ) : entries === null ? (
                <Fact>
                  The audit trail isn't available from this server yet, so the suspension reason
                  can't be shown here.
                </Fact>
              ) : (
                <Fact>
                  The most recent audit records don't include the suspension, so its reason isn't
                  shown here. Older records aren't assumed.
                </Fact>
              )}
            </Stack>
          </Box>
        )}

        <Box borderWidth="1px" borderColor="border" borderRadius="md" p={3}>
          <Text fontSize="sm" fontWeight="semibold" mb={2}>
            Readiness blockers
          </Text>
          {status.blockers === null ? (
            <Fact>The server didn't report readiness blockers.</Fact>
          ) : status.blockers.length === 0 ? (
            <Fact>The server reported no readiness blockers.</Fact>
          ) : (
            <Box as="ul" listStylePosition="inside" m={0} pl={0}>
              {status.blockers.map((blocker) => (
                <Text as="li" key={blocker} fontSize="sm" color="fg.muted">
                  {blocker}
                </Text>
              ))}
            </Box>
          )}
        </Box>

        {outcomeMessage && (
          <Text role="status" fontSize="sm" color="fg.muted">
            {outcomeMessage}
          </Text>
        )}

        <Box borderWidth="1px" borderColor="border" borderRadius="md" p={3}>
          <Text fontSize="sm" fontWeight="semibold" mb={2}>
            Lifecycle actions
          </Text>
          <Stack gap={3}>
            {!canRunLifecycle ? (
              <Fact>
                Lifecycle actions become available after the ledger is activated. Nothing is
                offered against the current state.
              </Fact>
            ) : (
              <Flex gap={2} wrap="wrap">
                {state === "active" && (
                  <Button
                    colorPalette="red"
                    disabled={!suspend.allowed || intent.blocked}
                    onClick={() => setView({ kind: "suspend" })}
                  >
                    Suspend ledger
                  </Button>
                )}
                {state === "suspended" && (
                  <Button
                    colorPalette="teal"
                    disabled={!resume.allowed || intent.blocked}
                    onClick={() => setView({ kind: "resume" })}
                  >
                    Resume ledger
                  </Button>
                )}
                <Button
                  variant="outline"
                  disabled={!lock.allowed || intent.blocked}
                  onClick={() => setView({ kind: "period-lock" })}
                >
                  {status.lockedThrough ? "Move period lock" : "Set period lock"}
                </Button>
                {status.gapWindowAttestation === "not_attested" && (
                  <Button
                    variant="outline"
                    disabled={!attest.allowed || intent.blocked}
                    onClick={() => setView({ kind: "attest" })}
                  >
                    Record gap-window attestation
                  </Button>
                )}
              </Flex>
            )}

            {status.gapWindowAttestation === "not_attested" && window && (
              <Fact>
                {`Gap window: opening date ${formatBusinessDate(window.openingDate)} up to activation at ${
                  formatLagosTimestamp(window.activatedAt) ?? "an unreadable time"
                }.`}
              </Fact>
            )}
            {windowProblem && (
              <Fact>{`The gap-window attestation can't be offered: ${windowProblem}`}</Fact>
            )}

            {canRunLifecycle &&
              permissionNotes.map((note) => <Fact key={note}>{note}</Fact>)}

            {canRunLifecycle && (
              <Fact>
                {isOwner
                  ? "As the organisation owner you can suspend, resume and move the period lock. The gap-window attestation needs finance manage."
                  : "Suspending, resuming and moving the period lock are owner-only. The gap-window attestation needs finance manage."}
              </Fact>
            )}
          </Stack>
        </Box>

        <Box aria-labelledby={auditHeadingId}>
          <SectionHeading id={auditHeadingId}>Recent ledger audit</SectionHeading>
          {audit.isError && entries === null ? (
            <Fact>The audit trail isn't available from this server yet.</Fact>
          ) : entries === null ? (
            <Fact>The audit trail is loading.</Fact>
          ) : entries.length === 0 ? (
            <Fact>No ledger audit records yet.</Fact>
          ) : (
            <Stack gap={2}>
              <Box as="ul" listStyleType="none" m={0} p={0}>
                {entries.map((entry) => {
                  const detail = auditDetail(entry);
                  return (
                    <Box
                      as="li"
                      key={entry.id}
                      borderTopWidth="1px"
                      borderColor="border.muted"
                      py={2}
                    >
                      <Text fontSize="sm" fontWeight="medium">
                        {auditActionLabel(entry.action)}
                      </Text>
                      <Text fontSize="xs" color="fg.muted">
                        {[
                          entry.at ? formatLagosTimestamp(entry.at) : "Time unavailable",
                          entry.actorId ? `by ${entry.actorId}` : "actor unavailable",
                          entry.ledgerRevision !== null
                            ? `revision ${entry.ledgerRevision}`
                            : null,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </Text>
                      {detail && (
                        <Text fontSize="xs" color="fg.muted">
                          {detail}
                        </Text>
                      )}
                      {entry.reason && (
                        <Text fontSize="xs" color="fg.muted">
                          {`Reason: ${entry.reason}`}
                        </Text>
                      )}
                    </Box>
                  );
                })}
              </Box>
              <Fact>
                {audit.nextCursor
                  ? "Showing the most recent audit records; older records aren't shown here."
                  : "Showing every ledger audit record the server sent."}
              </Fact>
            </Stack>
          )}
        </Box>
      </Stack>
    </Box>
  );
};

export default LedgerLifecyclePanel;
