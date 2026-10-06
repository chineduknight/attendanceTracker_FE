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
};


interface GlobalStoreState {
  user: UserType;
  setUser: (user: UserType) => void;
  organisation: OrganisationType;
  updateOrganisation: (organisation: OrganisationType) => void;
  currentAttendance: currentAttendanceType;
  updateCurrentAttendance: (attendance: currentAttendanceType) => void;
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
    name: "",
    categoryId: "",
    subCategoryId: "",
    date: "",
    members: [],
  },
  updateCurrentAttendance: (currentAttendance: currentAttendanceType) => {
    set({ currentAttendance });
  },
});

/**
 * This is for the globalStore
 */
const persistedCartStore: any = persist(globalStore, { name: "GLOBAL_STORE" });
const useGlobalStore = create<GlobalStoreState>(persistedCartStore);

export type GlobalStore = ReturnType<typeof globalStore>;

export default useGlobalStore;
