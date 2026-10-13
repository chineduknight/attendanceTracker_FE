import { create } from "zustand";
import { persist } from "zustand/middleware";
import { PermissionKey } from "rbac/permissions";
import { AttendanceEligibilityRule } from "helpers/attendanceEligibility";
import {
  DEFAULT_FEATURE_VISIBILITY,
  DEFAULT_TERMINOLOGY,
  OrganisationFeatureVisibility,
  OrganisationTerminology,
} from "helpers/organisationPresentation";
import {
  AttendanceStatusDefinition,
  DEFAULT_ATTENDANCE_STATUSES,
} from "helpers/attendanceStatuses";
import {
  DEFAULT_WELFARE_REVIEW_WINDOW_DAYS,
  WelfareSettings,
} from "helpers/welfareSettings";

export type currentAttendanceType = {
  name: string;
  // null explicitly clears the field on PUT /attendance/:id; undefined would be
  // dropped from the request body and read as "leave unchanged" by the backend.
  categoryId?: string | null;
  subCategoryId?: string | null;
  date: string;
  members?: Array<any>;
  /** New sessions only; `[]` means everyone is expected. */
  eligibilityRules?: AttendanceEligibilityRule[];
  /**
   * The organisation a NEW session's working state belongs to (stamped on
   * Continue and when a draft is resumed). Absent on legacy persisted state
   * and on edits, which cannot be attributed — readers treat a missing value
   * as unknown, never as "another organisation".
   */
  organisationId?: string;
};

/**
 * The canonical "no attendance in progress" value. Exported so pages can
 * compare against it instead of rebuilding the object, and so clearing a
 * finished draft leaves exactly one recognisable empty shape behind.
 */
export const EMPTY_CURRENT_ATTENDANCE: currentAttendanceType = {
  name: "",
  categoryId: "",
  subCategoryId: "",
  date: "",
  members: [],
  eligibilityRules: [],
};

export type UserType = {
  token: string;
  id: string;
  username: string;
  email: string;
  needsEmail: boolean;
};

export type OrganisationType = {
  name: string;
  image: string;
  owner: string;
  id: string;
  status: string;
  isOwner: boolean;
  roleName: string;
  permissions: PermissionKey[];
  collapseAttendanceByDay?: boolean;
  maxAttendanceEdits?: number | null;
  attendanceStatuses: AttendanceStatusDefinition[];
  /**
   * Display-only presentation config. Optional because a persisted org from
   * an older build may lack it — always read via organisationPresentation.
   */
  terminology?: OrganisationTerminology;
  featureVisibility?: OrganisationFeatureVisibility;
  /**
   * Whether Create Attendance offers eligibility rules. Optional for the same
   * reason — always read via isAttendanceEligibilityEnabled.
   */
  attendanceEligibilityEnabled?: boolean;
  /**
   * Welfare review settings. Optional for the same reason — always read via
   * the welfareSettings helper.
   */
  welfareSettings?: WelfareSettings;
};

export const EMPTY_USER: UserType = {
  token: "",
  id: "",
  username: "",
  email: "",
  needsEmail: false,
};

export const EMPTY_ORG: OrganisationType = {
  name: "",
  image: "",
  owner: "",
  id: "",
  status: "",
  isOwner: false,
  roleName: "",
  permissions: [],
  collapseAttendanceByDay: false,
  maxAttendanceEdits: null,
  attendanceStatuses: [...DEFAULT_ATTENDANCE_STATUSES],
  terminology: { ...DEFAULT_TERMINOLOGY },
  featureVisibility: { ...DEFAULT_FEATURE_VISIBILITY },
  attendanceEligibilityEnabled: false,
  welfareSettings: { reviewWindowDays: DEFAULT_WELFARE_REVIEW_WINDOW_DAYS },
};

interface GlobalStoreState {
  user: UserType;
  setUser: (user: UserType) => void;
  organisation: OrganisationType;
  updateOrganisation: (organisation: OrganisationType) => void;
  currentAttendance: currentAttendanceType;
  updateCurrentAttendance: (attendance: currentAttendanceType) => void;
  /** Back to EMPTY_CURRENT_ATTENDANCE, e.g. after a draft is finished. */
  clearCurrentAttendance: () => void;
}

const globalStore = <F extends Function>(set: F) => ({
  user: EMPTY_USER,
  setUser: (user: UserType) => {
    set({ user });
  },
  organisation: EMPTY_ORG,
  updateOrganisation: (organisation: OrganisationType) => {
    set({ organisation });
  },
  currentAttendance: {
    ...EMPTY_CURRENT_ATTENDANCE,
    members: [],
    eligibilityRules: [],
  },
  updateCurrentAttendance: (currentAttendance: currentAttendanceType) => {
    set({ currentAttendance });
  },
  clearCurrentAttendance: () => {
    set({
      currentAttendance: {
        ...EMPTY_CURRENT_ATTENDANCE,
        members: [],
        eligibilityRules: [],
      },
    });
  },
});

/**
 * This is for the globalStore
 */
const persistedCartStore: any = persist(globalStore, { name: "GLOBAL_STORE" });
const useGlobalStore = create<GlobalStoreState>(persistedCartStore);

export type GlobalStore = ReturnType<typeof globalStore>;

export default useGlobalStore;
