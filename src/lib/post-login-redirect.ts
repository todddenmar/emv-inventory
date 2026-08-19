import { isCashierRole, isOwnerRole } from "@/lib/roles";
import type { UserRole } from "@/types";

export const CASHIER_HOME = "/admin/cashier";
export const OWNER_HOME = "/admin/reports";

/** Paths cashiers may access under /admin. */
export function isCashierAllowedPath(pathname: string): boolean {
  if (pathname === CASHIER_HOME || pathname.startsWith(`${CASHIER_HOME}/`)) {
    return true;
  }
  if (pathname === "/admin/pos" || pathname.startsWith("/admin/pos/")) {
    return true;
  }
  if (
    pathname === "/admin/wholesale" ||
    pathname.startsWith("/admin/wholesale/")
  ) {
    return true;
  }
  return false;
}

/** Paths owners may access under /admin. */
export function isOwnerAllowedPath(pathname: string): boolean {
  if (pathname === "/admin/reports" || pathname.startsWith("/admin/reports/")) {
    return true;
  }
  // Stock levels only — not nested inventory tools (stock-in, transfers, etc.).
  if (pathname === "/admin/inventory") {
    return true;
  }
  return false;
}

export function resolvePostLoginRedirect(
  isStaff: boolean,
  redirect: string,
  role?: UserRole | null
): string {
  if (!isStaff) {
    return "/login?denied=1";
  }

  if (isCashierRole(role)) {
    if (redirect && isCashierAllowedPath(redirect)) {
      return redirect;
    }
    return CASHIER_HOME;
  }

  if (isOwnerRole(role)) {
    if (redirect && isOwnerAllowedPath(redirect)) {
      return redirect;
    }
    return OWNER_HOME;
  }

  const path = redirect || "/admin";
  return path.startsWith("/admin") ? path : "/admin";
}
