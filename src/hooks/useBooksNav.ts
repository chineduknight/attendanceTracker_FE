import { useCallback, useEffect } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import {
  BOOKS_HOME,
  booksDepthOf,
  BooksLocation,
  BooksScreen,
  BooksSheet,
  parentOf,
  readBooksLocation,
  readFinanceTab,
  writeBooksLocation,
} from "helpers/booksNavigation";

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
  // Entries Books pushed carry their depth, so closing can step Back to them
  // and leaving Books can step back over all of them.
  const depth = booksDepthOf(routerLocation.state);

  const push = useCallback(
    (next: BooksLocation) =>
      setParams(writeBooksLocation(params, organisationId, next), {
        state: { booksDepth: depth + 1 },
      }),
    [params, organisationId, setParams, depth],
  );

  const replace = useCallback(
    (next: BooksLocation) =>
      setParams(writeBooksLocation(params, organisationId, next), {
        replace: true,
        state: { booksDepth: depth },
      }),
    [params, organisationId, setParams, depth],
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
    if (depth > 0) navigate(-1);
    else replace(parentOf(location));
  };

  return { location, onBooks, go, openSheet, close, replace };
};
