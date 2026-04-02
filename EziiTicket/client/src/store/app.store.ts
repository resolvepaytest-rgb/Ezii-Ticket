import { create } from "zustand";
import { persist } from "zustand/middleware";

type AppState = {
  counter: number;
  inc: () => void;
  reset: () => void;
};

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      counter: 0,
      inc: () => set((s) => ({ counter: s.counter + 1 })),
      reset: () => set({ counter: 0 }),
    }),
    { name: "ezii-ticket:app" }
  )
);

