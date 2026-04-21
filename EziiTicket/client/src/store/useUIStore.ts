import { create } from "zustand";
import { persist } from "zustand/middleware";

type UIState = {
  counter: number;
  inc: () => void;
  reset: () => void;
  brand: "ezii" | "resolve" | "client" | "ngo";
  mode: "light" | "dark";
  setBrand: (brand: UIState["brand"]) => void;
  toggleMode: () => void;
};

export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      counter: 0,
      inc: () => set((s) => ({ counter: s.counter + 1 })),
      reset: () => set({ counter: 0 }),
      brand: "ezii",
      mode: "light",
      setBrand: (brand) => set({ brand }),
      toggleMode: () => set((s) => ({ mode: s.mode === "dark" ? "light" : "dark" })),
    }),
    { name: "ui" }
  )
);

