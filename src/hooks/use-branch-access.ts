import { useAuthStore, useIsMasterAdmin } from "@/stores/auth-store";

export function useBranchAccess() {
  const user = useAuthStore((s) => s.user);
  const isMasterAdmin = useIsMasterAdmin();
  const assignedBranchId = user?.branchId ?? null;
  const isManager = user?.role === "manager";

  const canAccessBranch = (branchId: string) =>
    isMasterAdmin || assignedBranchId === branchId;

  const scopedBranchId = isMasterAdmin ? null : assignedBranchId;

  return {
    user,
    isMasterAdmin,
    isManager,
    assignedBranchId,
    scopedBranchId,
    canAccessBranch,
    hasBranchAssignment: isMasterAdmin || !!assignedBranchId,
  };
}
