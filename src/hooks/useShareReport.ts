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
 * pending for the old one is thrown away and never shown or shared.
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
  const [stored, setStored] = useState<ShareReportState<T>>(IDLE);
  // Bumped by every new request, cancel and snapshot change: a response
  // only lands while its number is still the latest, so an older response
  // can never overwrite a newer one.
  const request = useRef(0);
  const latest = useRef(snapshot);
  // The device share sheet is open: a second tap would make it fail.
  const sharing = useRef(false);
  // Noted during render, not in an effect: an effect runs after paint, and
  // a tap in between would start a request the effect then voided.
  if (latest.current !== snapshot) {
    latest.current = snapshot;
    request.current += 1;
  }

  // State left over from another snapshot reads as idle from the very
  // render that switches.
  const state: ShareReportState<T> =
    stored.phase !== "idle" && stored.snapshot === snapshot ? stored : IDLE;

  const isCurrent = (id: number, target: T) =>
    id === request.current && latest.current === target;

  const start = () => {
    const target = latest.current;
    if (!target || state.phase === "preparing") return;
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
