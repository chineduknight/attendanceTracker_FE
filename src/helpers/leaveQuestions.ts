import type { ConfirmOptions } from "components/ui/confirm-dialog";
import { LABELS } from "config/presentationLabels";
import {
  OrganisationTerminology,
  lowerTerm,
} from "helpers/organisationPresentation";
import type { LeaveReason } from "hooks/useUnsavedChangesGuard";

/**
 * The question asked before leaving changes held only in memory: leaving
 * loses them. `subject` names what was changed, e.g. "these settings".
 */
export const discardChangesQuestion = (
  subject: string,
  reason: LeaveReason,
): ConfirmOptions => {
  const loggingOut = reason === "logout";
  return {
    title: "Discard your changes?",
    body: `Your changes to ${subject} haven't been saved. ${
      loggingOut ? "Log out" : "Leave"
    } without saving them?`,
    confirmLabel: loggingOut ? "Discard and log out" : "Discard changes",
    cancelLabel: "Keep editing",
    destructive: true,
  };
};

/**
 * The question asked before leaving attendance work, worded for what leaving
 * actually does: work held only in memory is lost, a draft saved on this
 * device stays resumable. Leaving a draft is never called a discard.
 */
export type AttendanceWork =
  /** Changes to a stored attendance, held in memory until Update. */
  | "edit"
  /** A new attendance being marked: its draft is saved on this device. */
  | "draft"
  /** Create Attendance details not yet turned into a draft by Continue. */
  | "setup";

export const attendanceLeaveQuestion = (
  work: AttendanceWork,
  reason: LeaveReason,
  terms: OrganisationTerminology,
): ConfirmOptions => {
  const session = lowerTerm(terms.attendanceSingular);
  const loggingOut = reason === "logout";
  switch (work) {
    case "edit":
      return discardChangesQuestion(`this ${session}`, reason);
    case "draft":
      return {
        title: loggingOut ? "Log out while marking?" : "Stop marking for now?",
        body: `Your progress on this ${session} is saved on this device. ${
          loggingOut ? "Log back in on this browser and open" : "Open"
        } ${LABELS.createAttendance(terms)} here to continue marking it.`,
        confirmLabel: loggingOut ? "Log out" : "Leave",
        cancelLabel: "Keep marking",
      };
    case "setup":
      return {
        title: `Discard this new ${session}?`,
        body: `The details you entered haven't been saved. ${
          loggingOut ? "Logging out" : "Leaving"
        } now discards them.`,
        confirmLabel: loggingOut ? "Discard and log out" : "Discard",
        cancelLabel: "Keep editing",
        destructive: true,
      };
  }
};
