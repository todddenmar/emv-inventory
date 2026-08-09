import { create } from "zustand";
import type { AppUser } from "@/types";
import {
  isElevatedAdminRole,
  isMasterAdminRole,
  isStaffRole,
} from "@/lib/roles";

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
  return isStaffRole(user?.role);
}

export function useIsMasterAdmin(): boolean {
  const user = useAuthStore((s) => s.user);
  return isMasterAdminRole(user?.role);
}

export function useIsElevatedAdmin(): boolean {
  const user = useAuthStore((s) => s.user);
  return isElevatedAdminRole(user?.role);
}

export function useAssignedBranchId(): string | null {
  const user = useAuthStore((s) => s.user);
  return user?.branchId ?? null;
}
