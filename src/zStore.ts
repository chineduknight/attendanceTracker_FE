import { create } from "zustand";
import { persist } from "zustand/middleware";

export type currentAttendanceType = {
  name: string;
  categoryId?: string;
  subCategoryId?: string;
  date: Date;
  members?: Array<any>;
};
type UserType = {
  token: string;
  id: string;
  username: string;
};

type OrganisationType = {
  name: string;
  image: string;
  owner: string;
  id: string;
};

interface GlobalStoreState {
  user: UserType;
  setUser: (user: UserType) => void;
  organisation: OrganisationType;
  updateOrganisation: (org: OrganisationType) => void;
  currentAttendance: currentAttendanceType;
  updateCurrentAttendance: (attendance: currentAttendanceType) => void;
}

const globalStore = <F extends Function>(set: F) => ({
  user: {
    token: "",
    id: "",
    username: "",
  },
  setUser: (user) => {
    set({ user });
  },
  organisation: {
    name: "",
    image: "",
    owner: "",
    id: "",
  },
  updateOrganisation: (organisation: any) => {
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
