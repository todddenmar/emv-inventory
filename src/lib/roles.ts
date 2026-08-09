import type { UserRole } from "@/types";

export function isStaffRole(role: UserRole | null | undefined): boolean {
  return role === "master-admin" || role === "admin" || role === "manager";
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
      targetRole === "customer"
    );
  }
  return false;
}
