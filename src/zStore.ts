import {create} from "zustand";
interface GlobalStoreState {
  organisation: any;
  updateOrganisation: (products: any) => void;
  
}



const globalStore = <F extends Function>(set: F) => ({
  organisation: {
    name: "",
  },
  updateOrganisation: (organisation: any) => {
    set({ organisation });
  },
 
});






/**
 * This is for the globalStore
 */

const useGlobalStore = create<GlobalStoreState>(globalStore);

export type GlobalStore = ReturnType<typeof globalStore>;

export default useGlobalStore;
