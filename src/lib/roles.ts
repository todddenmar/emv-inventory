import type { UserRole } from "@/types";

export function parseUserRole(role: unknown): UserRole {
  if (role === "master-admin") return "master-admin";
  if (role === "admin") return "admin";
  if (role === "owner") return "owner";
  if (role === "cashier" || role === "manager") return "cashier";
  return "customer";
}

export function isStaffRole(role: UserRole | null | undefined): boolean {
  return (
    role === "master-admin" ||
    role === "admin" ||
    role === "owner" ||
    role === "cashier"
  );
}

export function isCashierRole(role: UserRole | null | undefined): boolean {
  return role === "cashier";
}

export function isOwnerRole(role: UserRole | null | undefined): boolean {
  return role === "owner";
}

/** Cashier — branch-scoped staff (not elevated). */
export function isBranchStaffRole(
  role: UserRole | null | undefined
): boolean {
  return role === "cashier";
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

/** Elevated admin or owner — can view data across all branches. */
export function canViewAllBranchesRole(
  role: UserRole | null | undefined
): boolean {
  return isElevatedAdminRole(role) || isOwnerRole(role);
}

export function roleAssignableBy(
  actorRole: UserRole,
  targetRole: UserRole
): boolean {
  if (actorRole === "master-admin") return true;
  if (actorRole === "admin") {
    return (
      targetRole === "admin" ||
      targetRole === "owner" ||
      targetRole === "cashier" ||
      targetRole === "customer"
    );
  }
  return false;
}
