import { create } from "zustand";

export type JwtUserClaims = {
  org_id: string;
  user_id: string;
  role_id: string;
  user_type_id: string;
  role_name: string;
  ticket_role?: string | null;
  exp?: number;
  nbf?: number;
  iss?: string;
  aud?: string | string[];
};

type AuthState = {
  user: JwtUserClaims | null;
  setUser: (user: JwtUserClaims | null) => void;
  logout: () => void;
};

export const useAuthStore = create<AuthState>()((set) => ({
  user: null,
  setUser: (user) => set({ user }),
  logout: () => {
    try {
      localStorage.removeItem("jwt_token");
    } catch {
      // ignore
    }
    set({ user: null });
  },
}));

