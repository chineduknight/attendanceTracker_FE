import { useId, useState } from "react";
import { Badge, Box, Button, Field, Flex, Input, Stack, Text } from "@chakra-ui/react";
import PageLoader from "components/PageLoader";
import { useConfirm } from "components/ui/confirm-dialog";
import { EmptyState, ErrorState, errorMessage } from "components/ui/states";
import { LEDGER_REVERSALS_UI_ENABLED } from "config/ledgerReversals";
import { formatBusinessDate } from "helpers/financeCompliance";
import { formatKobo } from "helpers/financeConstants";
import {
  ATTEMPT_SETTLE_WINDOW_MS,
  LedgerAttemptKey,
  attemptOutcomeLabel,
  attemptSettlesAt,
  attemptTypeLabel,
  latestAttempt,
} from "helpers/ledgerAttempts";
import { LedgerPostingIntentRecord, isPostingKey } from "helpers/ledgerPostingIntent";
import { postingSummaryText } from "helpers/ledgerPostings";
import { formatLagosTimestamp } from "helpers/openingBalances";
import {
  RESOLVE_INVALID_KEY_MESSAGE,
  ResolveResult,
  useResolveLedgerAttempt,
  useUnresolvedLedgerAttempts,
} from "hooks/useLedgerAttempts";
import { useSettleClock } from "hooks/useSettleClock";
import { usePermissions } from "rbac/usePermissions";
import useGlobalStore from "zStore";
import ResolutionResult from "components/finance/attempts/ResolutionResult";

const Muted = ({ children }: { children: string }) => (
  <Text fontSize="sm" color="fg.muted">
    {children}
  </Text>
);

const RESOLVE_EXPLANATION =
  "Resolving asks the server for this request's final outcome. If it was posted, you'll see its journal. If it wasn't, its request key is voided permanently: it can never post, and a genuine transaction must then be entered again as a new posting.";

const RESOLVE_BY_KEY_EXPLANATION =
  "Resolving this request key asks the server for its final outcome. It may already have been posted, and you'll see its journal. If it wasn't, the key is voided permanently: it can never post, and a genuine transaction must then be entered again as a new posting. Check the key with the officer who sent it before you continue.";

/**
 * Owner only: resolve a request key the list can't show, e.g. one an officer
 * sent from a lost device, or one that never reached the server (no attempt
 * row, which only the owner may void). The key is typed exactly as the
 * officer reports it; nothing is generated or guessed.
 */
const ResolveByKeyForm = ({
  resolvingKey,
  failureFor,
  onResolve,
}: {
  /** The key being resolved anywhere in this panel; one at a time. */
  resolvingKey: string | null;
  failureFor: (key: string) => string | null;
  onResolve: (key: string) => Promise<boolean>;
}) => {
  const [raw, setRaw] = useState("");
  const [attempted, setAttempted] = useState(false);
  // Surrounding whitespace from a paste is never part of a key.
  const key = raw.trim();
  const invalid = !isPostingKey(key);
  const failure = !invalid ? failureFor(key) : null;
  const disabled = resolvingKey !== null;

  const submit = async () => {
    setAttempted(true);
    if (invalid) return;
    if (await onResolve(key)) {
      setRaw("");
      setAttempted(false);
    }
  };

  return (
    <Box borderWidth="1px" borderColor="border" borderRadius="md" p={3} bg="bg.panel">
      <Stack gap={3}>
        <Text fontWeight="semibold">Resolve by request key</Text>
        <Muted>
          For a request this list can't show: for example one sent from a lost device, or one
          that never reached the server. Ask the officer for the request key shown on their
          unconfirmed posting.
        </Muted>
        <Field.Root invalid={attempted && invalid} disabled={disabled}>
          <Field.Label>Request key</Field.Label>
          <Input
            value={raw}
            autoComplete="off"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            fontFamily="mono"
            onChange={(event) => setRaw(event.target.value)}
          />
          {attempted && invalid ? (
            <Field.ErrorText>{RESOLVE_INVALID_KEY_MESSAGE}</Field.ErrorText>
          ) : (
            <Field.HelperText>Enter it exactly as the officer reports it.</Field.HelperText>
          )}
        </Field.Root>
        {failure && (
          <Text role="alert" fontSize="sm" color="fg.error">
            {failure}
          </Text>
        )}
        <Flex>
          <Button
            size="sm"
            variant="outline"
            colorPalette="orange"
            loading={resolvingKey !== null && resolvingKey === key}
            disabled={disabled}
            onClick={() => void submit()}
          >
            Resolve this key
          </Button>
        </Flex>
      </Stack>
    </Box>
  );
};

/** A server-listed key whose posting outcome was never confirmed. */
const AttemptCard = ({
  item,
  localRecord,
  officerId,
  now,
  resolving,
  disabled,
  failure,
  onResolve,
}: {
  item: LedgerAttemptKey;
  localRecord: LedgerPostingIntentRecord | null;
  officerId: string;
  now: number;
  resolving: boolean;
  disabled: boolean;
  failure: string | null;
  onResolve: () => void;
}) => {
  const [showHistory, setShowHistory] = useState(false);
  const historyId = useId();
  const latest = latestAttempt(item);
  // A later clean refusal never settles an earlier unknown attempt (§7.5).
  const refusalAfterUnknown =
    latest?.outcome?.outcome === "refused" &&
    item.attempts.some((attempt) => !attempt.outcome || attempt.outcome.outcome === "unknown");
  const settlesAt = attemptSettlesAt(item);
  const settled = settlesAt !== null && settlesAt.getTime() <= now;
  const actor = (actorId: string | null) =>
    actorId === null ? "Officer unknown" : actorId === officerId ? "You" : `Another officer (${actorId})`;

  return (
    <Box as="li" listStyleType="none" borderWidth="1px" borderColor="border.warning" borderRadius="md" p={3} bg="bg.panel">
      <Stack gap={2}>
        <Flex gap={2} align="center" wrap="wrap">
          <Text fontWeight="semibold">{attemptTypeLabel(latest?.sourceType ?? null)}</Text>
          <Badge colorPalette="orange" variant="subtle">
            Outcome unconfirmed
          </Badge>
          {localRecord && (
            <Badge colorPalette="blue" variant="subtle">
              Pending in this browser
            </Badge>
          )}
        </Flex>
        <Text fontSize="sm">
          {[
            latest?.amountKobo != null ? formatKobo(latest.amountKobo) : "Amount not recorded",
            latest?.businessDate ? `dated ${formatBusinessDate(latest.businessDate)}` : "date not recorded",
            latest?.counterpartyName,
          ]
            .filter(Boolean)
            .join(" · ")}
        </Text>
        <Muted>{`Officer: ${actor(latest?.actorId ?? null)}`}</Muted>
        <Muted>{`Latest known outcome: ${attemptOutcomeLabel(latest?.outcome ?? null)}`}</Muted>
        {refusalAfterUnknown && (
          <Muted>
            An earlier attempt's outcome is unknown, so this later refusal doesn't settle it.
          </Muted>
        )}
        {localRecord && <Muted>{postingSummaryText(localRecord.summary)}</Muted>}
        <Muted>
          This may or may not have been posted. It is not a failed transaction until resolving
          proves it.
        </Muted>
        <Text fontSize="xs" color="fg.muted" wordBreak="break-all">
          {`Request key: ${item.idempotencyKey}`}
        </Text>

        <Box>
          <Button
            size="sm"
            variant="ghost"
            aria-expanded={showHistory}
            aria-controls={historyId}
            onClick={() => setShowHistory((open) => !open)}
          >
            {showHistory
              ? "Hide attempt history"
              : `Show attempt history (${item.attempts.length})`}
          </Button>
          {showHistory && (
            <Box as="ol" id={historyId} m={0} mt={2} pl={5}>
              {item.attempts.map((attempt) => (
                <Text as="li" key={attempt.id} fontSize="sm" color="fg.muted">
                  {[
                    formatLagosTimestamp(attempt.startedAt) ?? "Time not recorded",
                    attemptTypeLabel(attempt.sourceType),
                    actor(attempt.actorId),
                    attemptOutcomeLabel(attempt.outcome),
                    attempt.outcome?.code,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </Text>
              ))}
            </Box>
          )}
        </Box>

        {failure && (
          <Text role="alert" fontSize="sm" color="fg.error">
            {failure}
          </Text>
        )}

        {settlesAt === null ? (
          <Muted>The server didn't say when this attempt settles, so it can't be resolved here.</Muted>
        ) : settled ? (
          <Flex>
            <Button
              size="sm"
              variant="outline"
              colorPalette="orange"
              loading={resolving}
              disabled={disabled}
              onClick={onResolve}
            >
              Resolve this request
            </Button>
          </Flex>
        ) : (
          <Muted>
            {`It may still be running. It can be resolved from ${
              formatLagosTimestamp(settlesAt.toISOString()) ?? "two minutes after its latest attempt"
            }.`}
          </Muted>
        )}
      </Stack>
    </Box>
  );
};

/**
 * This browser's pending posting that the server doesn't list (yet): it may
 * still be inside the two-minute window, never have reached the server, or
 * have been settled already. Resolve finds out; it is offered only after the
 * window measured from this browser's own latest attempt.
 */
const LocalPendingCard = ({
  record,
  now,
  resolving,
  disabled,
  failure,
  onResolve,
}: {
  record: LedgerPostingIntentRecord;
  now: number;
  resolving: boolean;
  disabled: boolean;
  failure: string | null;
  onResolve: () => void;
}) => {
  const settlesAt = localSettlesAt(record);
  const settled = settlesAt <= now;
  return (
    <Box as="li" listStyleType="none" borderWidth="1px" borderColor="border.warning" borderRadius="md" p={3} bg="bg.panel">
      <Stack gap={2}>
        <Flex gap={2} align="center" wrap="wrap">
          <Text fontWeight="semibold">{postingSummaryText(record.summary)}</Text>
          <Badge colorPalette="blue" variant="subtle">
            Pending in this browser
          </Badge>
        </Flex>
        <Muted>{`Business date: ${formatBusinessDate(record.summary.businessDate)}`}</Muted>
        <Muted>
          The server doesn't list this request as unconfirmed. It may still be within its
          two-minute window, may never have reached the server, or may already be settled.
          Resolving finds out without sending the posting again.
        </Muted>
        <Text fontSize="xs" color="fg.muted" wordBreak="break-all">
          {`Request key: ${record.key}`}
        </Text>
        {failure && (
          <Text role="alert" fontSize="sm" color="fg.error">
            {failure}
          </Text>
        )}
        {settled ? (
          <Flex>
            <Button
              size="sm"
              variant="outline"
              colorPalette="orange"
              loading={resolving}
              disabled={disabled}
              onClick={onResolve}
            >
              Resolve this request
            </Button>
          </Flex>
        ) : (
          <Muted>
            {`It can be resolved from ${
              formatLagosTimestamp(new Date(settlesAt).toISOString()) ?? "two minutes after its latest attempt"
            }.`}
          </Muted>
        )}
      </Stack>
    </Box>
  );
};

/** Two minutes after this browser last started or sent the request. */
const localSettlesAt = (record: LedgerPostingIntentRecord) =>
  Math.max(Date.parse(record.startedAt) || 0, Date.parse(record.lastAttemptAt ?? "") || 0) +
  ATTEMPT_SETTLE_WINDOW_MS;

interface Resolution {
  key: string;
  result: Extract<ResolveResult, { kind: "resolved" }>;
  hadLocalRecord: boolean;
}

/**
 * F2B-3 unconfirmed attempts (RFC v0.3 §7.3–§7.6): posting requests whose
 * outcome the server never confirmed, and resolving them.
 *
 * Only for `finance.manage`. The server decides what each officer sees (their
 * own keys; the owner everyone's) and what may be resolved. Resolving works
 * while bookkeeping is suspended or writes are off, so this panel does not
 * depend on posting readiness. Only a proved outcome clears this browser's
 * pending record, and only the one for that key.
 */
const UnconfirmedAttemptsPanel = ({
  organisationId,
  onOpenJournal,
  enabled = LEDGER_REVERSALS_UI_ENABLED,
}: {
  organisationId: string;
  onOpenJournal?: (journalId: string) => void;
  enabled?: boolean;
}) => {
  const headingId = useId();
  const { has, isOwner } = usePermissions();
  const canManage = has("finance.manage");
  const officerId = useGlobalStore((store) => store.user.id);
  const attempts = useUnresolvedLedgerAttempts(organisationId, enabled && canManage);
  const { resolve, intent } = useResolveLedgerAttempt(organisationId);
  const { confirm, confirmDialog } = useConfirm();
  const [resolvingKey, setResolvingKey] = useState<string | null>(null);
  const [failures, setFailures] = useState<Record<string, string>>({});
  const [resolutions, setResolutions] = useState<Resolution[]>([]);

  const localRecords = intent.read.kind === "pending" ? intent.read.intents : [];
  const listed = new Set((attempts.items ?? []).map((item) => item.idempotencyKey));
  const unlisted = attempts.items ? localRecords.filter((record) => !listed.has(record.key)) : [];
  const now = useSettleClock([
    ...(attempts.items ?? []).map((item) => attemptSettlesAt(item)?.getTime() ?? 0),
    ...unlisted.map(localSettlesAt),
  ]);

  if (!enabled || !canManage) return null;

  /** True only when the server proved the key's outcome. */
  const runResolve = async (key: string, { byKey = false } = {}): Promise<boolean> => {
    const confirmed = await confirm({
      title: byKey ? "Resolve this request key?" : "Resolve this request?",
      body: byKey ? `${RESOLVE_BY_KEY_EXPLANATION}\n\nRequest key: ${key}` : RESOLVE_EXPLANATION,
      confirmLabel: "Resolve request",
    });
    if (!confirmed) return false;
    const hadLocalRecord = localRecords.some((record) => record.key === key);
    setResolvingKey(key);
    setFailures(({ [key]: _previous, ...rest }) => rest);
    try {
      const result = await resolve(key);
      if (result.kind === "resolved") {
        setResolutions((current) => [
          { key, result, hadLocalRecord },
          ...current.filter((entry) => entry.key !== key),
        ]);
        return true;
      }
      // An officer can't void a key the server has no attempt from them
      // for; only the owner can, and only with the key itself.
      const message =
        result.reason === "forbidden" && !isOwner
          ? `${result.message} Give the owner this request key so they can resolve it: ${key}`
          : result.message;
      setFailures((current) => ({ ...current, [key]: message }));
      return false;
    } finally {
      setResolvingKey(null);
    }
  };

  const list = (() => {
    if (attempts.isLoading) return <PageLoader label="Loading unconfirmed attempts" h="120px" />;
    if (attempts.isError && !attempts.items) {
      return (
        <ErrorState
          title="Unconfirmed attempts couldn't be loaded"
          description={errorMessage(attempts.error)}
          onRetry={() => void attempts.refetch()}
          retrying={attempts.isFetching}
        />
      );
    }
    if (!attempts.items) return null;
    if (attempts.items.length === 0 && unlisted.length === 0) {
      return (
        <EmptyState
          title="No unconfirmed attempts"
          description={
            isOwner
              ? "No posting request in this organisation is waiting to be resolved."
              : "None of your posting requests is waiting to be resolved."
          }
        />
      );
    }
    return (
      <Stack gap={2}>
        <Box as="ul" display="flex" flexDirection="column" gap={2} m={0} p={0}>
          {attempts.items.map((item) => (
            <AttemptCard
              key={item.idempotencyKey}
              item={item}
              localRecord={localRecords.find((record) => record.key === item.idempotencyKey) ?? null}
              officerId={officerId}
              now={now}
              resolving={resolvingKey === item.idempotencyKey}
              disabled={resolvingKey !== null}
              failure={failures[item.idempotencyKey] ?? null}
              onResolve={() => void runResolve(item.idempotencyKey)}
            />
          ))}
          {unlisted.map((record) => (
            <LocalPendingCard
              key={record.key}
              record={record}
              now={now}
              resolving={resolvingKey === record.key}
              disabled={resolvingKey !== null}
              failure={failures[record.key] ?? null}
              onResolve={() => void runResolve(record.key)}
            />
          ))}
        </Box>
        {attempts.hasMore && (
          <Flex>
            <Button size="sm" variant="outline" loading={attempts.isLoadingMore} onClick={attempts.loadMore}>
              Load more
            </Button>
          </Flex>
        )}
      </Stack>
    );
  })();

  return (
    <Box as="section" aria-labelledby={headingId}>
      <Text as="h2" id={headingId} fontSize="lg" fontWeight="semibold" mb={2}>
        Unconfirmed attempts
      </Text>
      <Text fontSize="sm" color="fg.muted" mb={3}>
        {isOwner
          ? "Posting requests in this organisation whose outcome the server couldn't confirm. As the owner you see every officer's requests."
          : "Your posting requests whose outcome the server couldn't confirm. The owner can see and resolve every officer's requests."}
      </Text>
      <Stack gap={3}>
        {resolutions.map((entry) => (
          <ResolutionResult
            key={entry.key}
            idempotencyKey={entry.key}
            outcome={entry.result.outcome}
            cleared={entry.result.cleared}
            hadLocalRecord={entry.hadLocalRecord}
            officerId={officerId}
            onOpenJournal={onOpenJournal}
            onDismiss={() =>
              setResolutions((current) => current.filter((other) => other.key !== entry.key))
            }
          />
        ))}
        {list}
        {isOwner && (
          <ResolveByKeyForm
            resolvingKey={resolvingKey}
            failureFor={(key) => failures[key] ?? null}
            onResolve={(key) => runResolve(key, { byKey: true })}
          />
        )}
      </Stack>
      {confirmDialog}
    </Box>
  );
};

export default UnconfirmedAttemptsPanel;
