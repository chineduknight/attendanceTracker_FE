import { useEffect } from "react";
import { Box, Button, Flex, Stack, Text } from "@chakra-ui/react";
import FinanceSheet from "components/finance/FinanceSheet";
import { PostingSection } from "components/finance/ledgerPostingTypes";
import PostingIntentNotice from "components/finance/postings/PostingIntentNotice";
import PostingReceipt from "components/finance/postings/PostingReceipt";
import PostingSupersededNotice from "components/finance/postings/PostingSupersededNotice";
import { ExpenseForm, ReceiptForm, TransferForm } from "components/finance/postings/PostingForms";
import { BooksSheet } from "helpers/booksNavigation";
import { CashbookPostings, CashbookView } from "hooks/useCashbookPostings";

export const SHEET_VIEW: Record<BooksSheet, CashbookView> = {
  "money-in": "receipt",
  "money-out": "expense",
  transfer: "transfer",
};

const TITLES: Record<BooksSheet, string> = {
  "money-in": "Money in",
  "money-out": "Money out",
  transfer: "Transfer between accounts",
};

/**
 * Money in, Money out and Transfer as a bottom sheet. The workflow lives in
 * Books, above the sheet: closing (Back included) while a save is in flight
 * leaves it running, and its receipt shows on the Overview.
 */
const PostingSheet = ({
  sheet,
  postings,
  shownSections,
  isRechecking,
  onClose,
  onForMember,
}: {
  sheet: BooksSheet | null;
  postings: CashbookPostings;
  /** Every posting section Books shows; only one offers a pending retry. */
  shownSections: readonly PostingSection[];
  isRechecking: boolean;
  onClose: () => void;
  /** Shown as "For a member" on Money in when member receipts are on. */
  onForMember?: () => void;
}) => {
  const { workflow, canManage, intentRead, hasIntent, readiness, formProps } = postings;
  const { view, success, superseded, panelError, formInstance } = workflow;
  const isPosting = workflow.postings.isPosting;
  const wanted = sheet ? SHEET_VIEW[sheet] : null;

  // Opening a sheet starts its form, unless a save is in flight, a pending
  // posting blocks new ones (the notice then owns the sheet) or a receipt is
  // showing. A pending posting that clears while the sheet is open lets the
  // form start. A sheet closed by the URL (Back, "For a member") leaves the
  // form like Cancel does, so a later change elsewhere can't lock a form that
  // is no longer on screen; a save in flight keeps running.
  useEffect(() => {
    if (!wanted) {
      if (!isPosting && view !== "overview") workflow.back();
      return;
    }
    if (view !== wanted && !isPosting && !hasIntent && !success) workflow.open(wanted);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wanted, hasIntent]);

  const close = () => {
    if (!isPosting) {
      workflow.back();
      workflow.dismissSuccess();
    }
    onClose();
  };

  const form = (() => {
    if (!readiness.ready || view !== wanted) return null;
    switch (view) {
      case "receipt":
        return <ReceiptForm key={formInstance} {...formProps} onCancel={close} />;
      case "expense":
        return <ExpenseForm key={formInstance} {...formProps} onCancel={close} />;
      case "transfer":
        return <TransferForm key={formInstance} {...formProps} onCancel={close} />;
      default:
        return null;
    }
  })();

  return (
    <FinanceSheet isOpen={sheet !== null} onClose={close} title={sheet ? TITLES[sheet] : ""}>
      <Stack gap={4}>
        {sheet === "money-in" && onForMember && (
          <Flex role="group" aria-label="Who the money is for" gap={1} p={1} borderWidth="1px" borderColor="border" borderRadius="full">
            <Button
              flex="1"
              minH="44px"
              borderRadius="full"
              aria-pressed="true"
              bg="teal.solid"
              color="teal.contrast"
              _hover={{ bg: "teal.solid" }}
            >
              Income
            </Button>
            <Button flex="1" minH="44px" borderRadius="full" variant="ghost" aria-pressed="false" onClick={onForMember}>
              For a member
            </Button>
          </Flex>
        )}

        {!isPosting && (
          <PostingIntentNotice
            read={intentRead}
            canManage={canManage}
            isPosting={isPosting}
            isRechecking={isRechecking}
            onRetry={workflow.retry}
            onRecheck={workflow.recheck}
            section="cashbook"
            shownSections={shownSections}
          />
        )}

        {panelError && (
          <Text role="alert" fontSize="sm" color="fg.error">
            {panelError}
          </Text>
        )}

        {success && (
          <Stack gap={3}>
            <PostingReceipt
              result={success.result}
              summary={success.summary}
              onAnother={() => wanted && workflow.open(wanted)}
            />
            <Button variant="outline" minH="44px" onClick={close}>
              Done
            </Button>
          </Stack>
        )}

        {!readiness.ready && (
          <Box borderWidth="1px" borderColor="border.warning" borderRadius="md" p={3} bg="bg.panel">
            <Text fontSize="sm" fontWeight="semibold" mb={1}>
              Recording isn't available
            </Text>
            <Text fontSize="sm" color="fg.muted">
              {readiness.reason}
            </Text>
          </Box>
        )}

        {readiness.ready && view !== "overview" && superseded && (
          <PostingSupersededNotice
            hasPendingIntent={hasIntent}
            isRechecking={isRechecking}
            onRecheck={workflow.recheck}
            onStartNew={workflow.startNewPosting}
          />
        )}

        {!success && form}
      </Stack>
    </FinanceSheet>
  );
};

export default PostingSheet;
