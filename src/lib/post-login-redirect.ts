import { isCashierRole } from "@/lib/roles";
import type { UserRole } from "@/types";

export const CASHIER_HOME = "/admin/cashier";

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

  const path = redirect || "/admin";
  return path.startsWith("/admin") ? path : "/admin";
}
