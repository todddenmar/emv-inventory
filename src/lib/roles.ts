import type { UserRole } from "@/types";

export function isStaffRole(role: UserRole | null | undefined): boolean {
  return (
    role === "master-admin" ||
    role === "admin" ||
    role === "manager" ||
    role === "cashier"
  );
}

export function isCashierRole(role: UserRole | null | undefined): boolean {
  return role === "cashier";
}

/** Manager or cashier — branch-scoped staff (not elevated). */
export function isBranchStaffRole(
  role: UserRole | null | undefined
): boolean {
  return role === "manager" || role === "cashier";
}

export function isMasterAdminRole(role: UserRole | null | undefined): boolean {
  return role === "master-admin";
}

/** Master-admin or admin — full catalog / multi-branch access. */
export function isElevatedAdminRole(
  role: UserRole | null | undefined
): boolean {
  return role === "master-admin" || role === "admin";
}

export function roleAssignableBy(
  actorRole: UserRole,
  targetRole: UserRole
): boolean {
  if (actorRole === "master-admin") return true;
  if (actorRole === "admin") {
    return (
      targetRole === "admin" ||
      targetRole === "manager" ||
      targetRole === "cashier" ||
      targetRole === "customer"
    );
  }
  return false;
}
