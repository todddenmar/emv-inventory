import {
  useAuthStore,
  useIsElevatedAdmin,
  useIsMasterAdmin,
} from "@/stores/auth-store";
import { canViewAllBranchesRole, isOwnerRole } from "@/lib/roles";

export function useBranchAccess() {
  const user = useAuthStore((s) => s.user);
  const isMasterAdmin = useIsMasterAdmin();
  const isElevatedAdmin = useIsElevatedAdmin();
  const assignedBranchId = user?.branchId ?? null;
  const isManager = user?.role === "manager";
  const isCashier = user?.role === "cashier";
  const isOwner = isOwnerRole(user?.role);
  const isBranchStaff = isManager || isCashier;
  const isAdmin = user?.role === "admin";
  const canViewAllBranches = canViewAllBranchesRole(user?.role);

  const canAccessBranch = (branchId: string) =>
    canViewAllBranches || assignedBranchId === branchId;

  const scopedBranchId = canViewAllBranches ? null : assignedBranchId;

  return {
    user,
    isMasterAdmin,
    isElevatedAdmin,
    isAdmin,
    isOwner,
    isManager,
    isCashier,
    isBranchStaff,
    canViewAllBranches,
    assignedBranchId,
    scopedBranchId,
    canAccessBranch,
    hasBranchAssignment: canViewAllBranches || !!assignedBranchId,
  };
}
