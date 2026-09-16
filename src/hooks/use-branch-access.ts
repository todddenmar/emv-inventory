import {
  useAuthStore,
  useIsElevatedAdmin,
  useIsMasterAdmin,
} from "@/stores/auth-store";
import {
  canEditStockRole,
  canViewAllBranchesRole,
  isBranchStaffRole,
  isInventoryViewerRole,
  isOwnerRole,
} from "@/lib/roles";

export function useBranchAccess() {
  const user = useAuthStore((s) => s.user);
  const isMasterAdmin = useIsMasterAdmin();
  const isElevatedAdmin = useIsElevatedAdmin();
  const assignedBranchId = user?.branchId ?? null;
  const isCashier = user?.role === "cashier";
  const isOwner = isOwnerRole(user?.role);
  const isInventoryViewer = isInventoryViewerRole(user?.role);
  const isBranchStaff = isBranchStaffRole(user?.role);
  const isAdmin = user?.role === "admin";
  const canViewAllBranches = canViewAllBranchesRole(user?.role);
  const canEditStock = canEditStockRole(user?.role);

  const canAccessBranch = (branchId: string) =>
    canViewAllBranches || assignedBranchId === branchId;

  const scopedBranchId = canViewAllBranches ? null : assignedBranchId;

  return {
    user,
    isMasterAdmin,
    isElevatedAdmin,
    isAdmin,
    isOwner,
    isInventoryViewer,
    isCashier,
    isBranchStaff,
    canViewAllBranches,
    canEditStock,
    assignedBranchId,
    scopedBranchId,
    canAccessBranch,
    hasBranchAssignment: canViewAllBranches || !!assignedBranchId,
    canManagePricePromotions: isElevatedAdmin || isOwner,
  };
}
