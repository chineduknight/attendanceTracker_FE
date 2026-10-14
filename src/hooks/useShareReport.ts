import { useRef, useState } from "react";

/*
 * Share a report in two taps: Share prepares the message (which needs a
 * network read), Share now hands it to the device.
 *
 * Browsers only allow navigator.share() or a wa.me pop-up straight from a
 * user's tap. Awaiting a request first can lose that permission, so the
 * message is prepared first and Share now launches it synchronously in its
 * own click.
 *
 * Everything is tied to one snapshot (an object: a session's loaded roster,
 * say). When the caller passes a different snapshot or null (another
 * session, another organisation, a reload), anything prepared or still
 * pending is thrown away for good and never shown or shared — even if the
 * same snapshot object comes back later (session A → B → A).
 */

export type ShareReportState<T> =
  | { phase: "idle" }
  | { phase: "preparing"; snapshot: T }
  | { phase: "failed"; snapshot: T; error: unknown }
  | {
      phase: "ready";
      snapshot: T;
      message: string;
      /** The share sheet failed: offer WhatsApp instead, from a fresh tap. */
      nativeFailed: boolean;
    };

const IDLE = { phase: "idle" } as const;

/** A state together with the snapshot epoch it was created in. */
type Stored<T> = { epoch: number; state: ShareReportState<T> };

const openWhatsApp = (message: string) => {
  window.open(
    `https://wa.me/?text=${encodeURIComponent(message)}`,
    "_blank",
    "noopener,noreferrer"
  );
};

export const useShareReport = <T extends object>(
  snapshot: T | null,
  prepare: (snapshot: T) => Promise<string>
) => {
  const [stored, setStoredState] = useState<Stored<T>>({
    epoch: 0,
    state: IDLE,
  });
  // Bumped by every new request, cancel and snapshot change: a response
  // only lands while its number is still the latest, so an older response
  // can never overwrite a newer one.
  const request = useRef(0);
  // Bumped by every snapshot change, never reset. State is only shown in
  // the epoch it was created in, so returning to an earlier snapshot object
  // cannot bring back its old preview, error or spinner.
  const epoch = useRef(0);
  const latest = useRef(snapshot);
  // The device share sheet is open: a second tap would make it fail.
  const sharing = useRef(false);
  // Noted during render, not in an effect: an effect runs after paint, and
  // a tap in between would start a request the effect then voided.
  if (latest.current !== snapshot) {
    latest.current = snapshot;
    request.current += 1;
    epoch.current += 1;
  }

  // The epoch this render's handlers belong to: a handler kept from before
  // a switch (even one back to the same snapshot) does nothing.
  const renderEpoch = epoch.current;

  const setStored = (next: ShareReportState<T>) =>
    setStoredState({ epoch: epoch.current, state: next });

  // State from an earlier epoch reads as idle from the very render that
  // switches, and stays idle.
  const state: ShareReportState<T> =
    stored.epoch === epoch.current &&
    stored.state.phase !== "idle" &&
    stored.state.snapshot === snapshot
      ? stored.state
      : IDLE;

  const isCurrent = (id: number, target: T) =>
    id === request.current && latest.current === target;

  const start = () => {
    const target = latest.current;
    if (
      !target ||
      renderEpoch !== epoch.current ||
      state.phase === "preparing"
    ) {
      return;
    }
    const id = ++request.current;
    setStored({ phase: "preparing", snapshot: target });
    prepare(target).then(
      (message) => {
        if (isCurrent(id, target)) {
          setStored({
            phase: "ready",
            snapshot: target,
            message,
            nativeFailed: false,
          });
        }
      },
      (error) => {
        if (isCurrent(id, target))
          setStored({ phase: "failed", snapshot: target, error });
      }
    );
  };

  const cancel = () => {
    request.current += 1;
    setStored(IDLE);
  };

  // Runs inside Share now's own click handler: nothing is awaited before
  // the share sheet or WhatsApp opens.
  const shareNow = () => {
    if (
      state.phase !== "ready" ||
      renderEpoch !== epoch.current ||
      latest.current !== state.snapshot ||
      sharing.current
    ) {
      return;
    }
    const { message, snapshot: target } = state;
    if (!navigator.share || state.nativeFailed) {
      openWhatsApp(message);
      cancel();
      return;
    }
    const id = request.current;
    const shareFailed = () => {
      if (isCurrent(id, target)) {
        setStored({
          phase: "ready",
          snapshot: target,
          message,
          nativeFailed: true,
        });
      }
    };
    sharing.current = true;
    try {
      navigator
        .share({ title: "", text: message })
        .then(
          () => {
            if (isCurrent(id, target)) cancel();
          },
          (error) => {
            // Dismissing the share sheet is harmless: the preview stays open.
            if (error?.name !== "AbortError") shareFailed();
          }
        )
        .finally(() => {
          sharing.current = false;
        });
    } catch {
      sharing.current = false;
      shareFailed();
    }
  };

  return { state, start, cancel, shareNow };
};
