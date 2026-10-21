import { useCallback, useEffect } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import {
  BOOKS_HOME,
  BooksLocation,
  BooksScreen,
  BooksSheet,
  parentOf,
  readBooksLocation,
  readFinanceTab,
  writeBooksLocation,
} from "helpers/booksNavigation";

/** Marks history entries Books pushed, so closing can step Back to them. */
const PUSHED = { booksPushed: true };

/**
 * Books screen and sheet navigation. Every move forward pushes a history
 * entry, so the phone's Back returns one Books level at a time. Closing steps
 * back only through entries Books itself pushed: a page opened directly at a
 * Books URL (reload, shared link) replaces with the parent instead of leaving
 * the app.
 */
export const useBooksNav = (organisationId: string) => {
  const [params, setParams] = useSearchParams();
  const routerLocation = useLocation();
  const navigate = useNavigate();
  const { location, valid } = readBooksLocation(params, organisationId);
  const onBooks = readFinanceTab(params) === "books";

  const push = useCallback(
    (next: BooksLocation) =>
      setParams(writeBooksLocation(params, organisationId, next), { state: PUSHED }),
    [params, organisationId, setParams],
  );

  const replace = useCallback(
    (next: BooksLocation) =>
      setParams(writeBooksLocation(params, organisationId, next), { replace: true }),
    [params, organisationId, setParams],
  );

  // Another organisation's or a malformed Books URL: show this
  // organisation's Overview, without adding a history entry.
  useEffect(() => {
    if (onBooks && !valid) replace(BOOKS_HOME);
  }, [onBooks, valid, replace]);

  const go = (screen: BooksScreen, journalId?: string) =>
    push({ screen, sheet: null, journalId: screen === "entry" ? journalId ?? null : null });

  const openSheet = (sheet: BooksSheet) => push({ ...location, sheet });

  const close = () => {
    const state = routerLocation.state as { booksPushed?: boolean } | null;
    if (state?.booksPushed) navigate(-1);
    else replace(parentOf(location));
  };

  return { location, go, openSheet, close, replace };
};
