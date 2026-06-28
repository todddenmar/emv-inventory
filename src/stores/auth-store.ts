import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { AppUser } from "@/types";

interface AuthState {
  user: AppUser | null;
  loading: boolean;
  setUser: (user: AppUser | null) => void;
  setLoading: (loading: boolean) => void;
  clear: () => void;
}

export const useAuthStore = create<AuthState>()((set) => ({
  user: null,
  loading: true,
  setUser: (user) => set({ user }),
  setLoading: (loading) => set({ loading }),
  clear: () => set({ user: null, loading: false }),
}));

export function useIsStaff(): boolean {
  const user = useAuthStore((s) => s.user);
  return user?.role === "master-admin" || user?.role === "manager";
}

export function useIsMasterAdmin(): boolean {
  const user = useAuthStore((s) => s.user);
  return user?.role === "master-admin";
}

export function useAssignedBranchId(): string | null {
  const user = useAuthStore((s) => s.user);
  return user?.branchId ?? null;
}
