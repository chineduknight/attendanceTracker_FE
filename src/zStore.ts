import { create } from "zustand";
import { persist } from "zustand/middleware";

export type currentAttendanceType = {
  name: string;
  category: string;
  subCategory: string;
  date: Date
  members: Array<any>
}
type UserType = {
  token:string;
  id:string;
  username:string;
}
interface GlobalStoreState {
  user:UserType;
  setUser:(user: UserType) => void;
  organisation: any;
  updateOrganisation: (products: any) => void;
  currentAttendance: currentAttendanceType;
  updateCurrentAttendance: (attendance: currentAttendanceType) => void;
}



const globalStore = <F extends Function>(set: F) => ({
  user:{
    token:"",
    id:"",
    username:"",
  },
  setUser:(user)=>{
    set({ user });
  },
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
const persistedCartStore: any = persist(globalStore, { name: 'GLOBAL_STORE' });
const useGlobalStore = create<GlobalStoreState>(persistedCartStore);


export type GlobalStore = ReturnType<typeof globalStore>;

export default useGlobalStore;

