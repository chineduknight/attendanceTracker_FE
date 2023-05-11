import { create } from "zustand";

export type currentAttendanceType = {
  name: string;
  category: string;
  subCategory: string;
  date: Date
  members: Array<any>
}

interface GlobalStoreState {
  organisation: any;
  updateOrganisation: (products: any) => void;

  currentAttendance: currentAttendanceType;
  updateCurrentAttendance: (attendance: currentAttendanceType) => void;
}



const globalStore = <F extends Function>(set: F) => ({
  organisation: {
    name: "",
  },
  updateOrganisation: (organisation: any) => {
    set({ organisation });
  },
  currentAttendance: {
    name: "",
    category: "",
    subCategory: "",
    date: new Date(),
    members: []
  },
  updateCurrentAttendance: (currentAttendance: currentAttendanceType) => {
    set({ currentAttendance });
  },

});






/**
 * This is for the globalStore
 */

const useGlobalStore = create<GlobalStoreState>(globalStore);

export type GlobalStore = ReturnType<typeof globalStore>;

export default useGlobalStore;
