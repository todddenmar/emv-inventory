import {
  useAuthStore,
  useIsElevatedAdmin,
  useIsMasterAdmin,
} from "@/stores/auth-store";

export function useBranchAccess() {
  const user = useAuthStore((s) => s.user);
  const isMasterAdmin = useIsMasterAdmin();
  const isElevatedAdmin = useIsElevatedAdmin();
  const assignedBranchId = user?.branchId ?? null;
  const isManager = user?.role === "manager";
  const isAdmin = user?.role === "admin";

  const canAccessBranch = (branchId: string) =>
    isElevatedAdmin || assignedBranchId === branchId;

  const scopedBranchId = isElevatedAdmin ? null : assignedBranchId;

  return {
    user,
    isMasterAdmin,
    isElevatedAdmin,
    isAdmin,
    isManager,
    assignedBranchId,
    scopedBranchId,
    canAccessBranch,
    hasBranchAssignment: isElevatedAdmin || !!assignedBranchId,
  };
}
