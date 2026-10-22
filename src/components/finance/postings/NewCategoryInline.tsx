import { useState } from "react";
import { Button, Field, Flex, Input, Stack, Text } from "@chakra-ui/react";
import { LedgerAccount } from "components/finance/ledgerTypes";
import { CategoryKind, buildCategoryPayload, checkCategoryName } from "helpers/booksCategories";
import { MAX_ACCOUNT_NAME_LENGTH } from "helpers/ledgerSetup";
import { useAccountWrites } from "hooks/useAccountWrites";

/**
 * "+ New category" inside Money in / Money out.
 *
 * The category field stays empty until the officer chooses one: creating a
 * category never posts money, and the form's own validation still refuses to
 * submit without a valid category. A retired category with the same name is
 * RESTORED rather than duplicated, and the restored category is selected.
 *
 * Every write goes through `useAccountWrites`, so the durable marker and the
 * organisation's unconfirmed-change latch apply here exactly as they do in
 * Categories & Accounts.
 */
const NewCategoryInline = ({
  organisationId,
  kind,
  accounts,
  disabled = false,
  onCreated,
}: {
  organisationId: string;
  kind: CategoryKind;
  accounts: readonly LedgerAccount[];
  disabled?: boolean;
  onCreated: (account: LedgerAccount) => void;
}) => {
  const writes = useAccountWrites(organisationId);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [issue, setIssue] = useState<string | null>(null);
  const [retired, setRetired] = useState<LedgerAccount | null>(null);
  const [attempted, setAttempted] = useState(false);

  const reset = () => {
    setOpen(false);
    setName("");
    setIssue(null);
    setRetired(null);
    setAttempted(false);
  };

  if (!open) {
    return (
      <Button
        variant="ghost"
        alignSelf="flex-start"
        minH="44px"
        px={2}
        ml={-2}
        disabled={disabled || writes.blocked}
        onClick={() => {
          writes.clearError();
          setOpen(true);
        }}
      >
        + New category
      </Button>
    );
  }

  const submit = () => {
    const check = checkCategoryName(name, kind, accounts);
    if (check.kind === "issue") {
      setIssue(check.message);
      setRetired(null);
      return;
    }
    if (check.kind === "retired") {
      setIssue("A retired category has this name.");
      setRetired(check.account);
      return;
    }
    setIssue(null);
    setRetired(null);
    setAttempted(true);
    writes.create([buildCategoryPayload(check.name, kind)], (created) => {
      const account = created?.[0] ?? null;
      if (!account) {
        reset();
        return;
      }
      onCreated(account);
      reset();
    });
  };

  const restore = () => {
    if (!retired) return;
    setAttempted(true);
    writes.setActive(retired, true, () => {
      onCreated({ ...retired, active: true });
      reset();
    });
  };

  return (
    <Stack gap={3} role="group" aria-label="New category">
      <Field.Root invalid={Boolean(issue)}>
        <Field.Label>New category name</Field.Label>
        <Input
          value={name}
          maxLength={MAX_ACCOUNT_NAME_LENGTH}
          autoComplete="off"
          disabled={disabled || writes.blocked}
          onChange={(event) => {
            setName(event.target.value);
            setIssue(null);
            setRetired(null);
          }}
        />
        {issue && <Field.ErrorText>{issue}</Field.ErrorText>}
      </Field.Root>
      {retired && (
        <Stack gap={2}>
          <Text fontSize="sm" color="fg.muted">
            {`"${retired.name}" is retired. Restore it instead of adding a duplicate?`}
          </Text>
          <Button
            alignSelf="flex-start"
            size="sm"
            variant="outline"
            loading={writes.isSaving}
            disabled={disabled || writes.blocked}
            onClick={restore}
          >
            Restore
          </Button>
        </Stack>
      )}
      {writes.error && (
        <Text role="alert" fontSize="sm" color="fg.error">
          {writes.error}
        </Text>
      )}
      {attempted && writes.blocked && !writes.error && (
        <Text role="alert" fontSize="sm" color="fg.muted">
          We couldn't confirm the new category. Check Categories &amp; Accounts before trying
          again.
        </Text>
      )}
      <Flex gap={2} wrap="wrap">
        <Button
          size="sm"
          colorPalette="teal"
          loading={writes.isSaving}
          disabled={disabled || writes.blocked}
          onClick={submit}
        >
          Add
        </Button>
        <Button size="sm" variant="ghost" disabled={writes.isSaving} onClick={reset}>
          Cancel
        </Button>
      </Flex>
    </Stack>
  );
};

export default NewCategoryInline;
