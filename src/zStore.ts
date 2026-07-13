import { create } from "zustand";
import { persist } from "zustand/middleware";
import { PermissionKey } from "rbac/permissions";

export type currentAttendanceType = {
  name: string;
  categoryId?: string;
  subCategoryId?: string;
  date: Date;
  members?: Array<any>;
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
    date: new Date(),
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
