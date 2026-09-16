import {
  isCashierRole,
  isInventoryViewerRole,
  isOwnerRole,
} from "@/lib/roles";
import type { UserRole } from "@/types";

export const CASHIER_HOME = "/admin/cashier";
export const OWNER_HOME = "/admin";
export const STAFF_HOME = "/staff";

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
  if (pathname === "/admin") return true;
  if (pathname === "/admin/reports" || pathname.startsWith("/admin/reports/")) {
    return true;
  }
  if (pathname === "/admin/sales" || pathname.startsWith("/admin/sales/")) {
    return true;
  }
  // Stock levels and remaining-stocks guide — not nested tools (stock-in, transfers, etc.).
  if (pathname === "/admin/inventory") {
    return true;
  }
  if (
    pathname === "/admin/inventory/remaining-stocks" ||
    pathname.startsWith("/admin/inventory/remaining-stocks/")
  ) {
    return true;
  }
  if (
    pathname === "/admin/price-changes" ||
    pathname.startsWith("/admin/price-changes/")
  ) {
    return true;
  }
  if (
    pathname === "/admin/price-promotions" ||
    pathname.startsWith("/admin/price-promotions/")
  ) {
    return true;
  }
  return false;
}

export function isOwnerNavHref(href: string): boolean {
  return (
    href === "/admin" ||
    href === "/admin/reports" ||
    href === "/admin/sales" ||
    href === "/admin/inventory" ||
    href === "/admin/inventory/remaining-stocks" ||
    href === "/admin/price-changes" ||
    href === "/admin/price-promotions"
  );
}

/** Paths inventory-viewer staff may access under /staff. */
export function isStaffAllowedPath(pathname: string): boolean {
  if (pathname === STAFF_HOME || pathname === `${STAFF_HOME}/`) {
    return true;
  }
  if (pathname === "/staff/inventory") {
    return true;
  }
  if (
    pathname === "/staff/inventory/remaining-stocks" ||
    pathname.startsWith("/staff/inventory/remaining-stocks/")
  ) {
    return true;
  }
  if (
    pathname === "/staff/inventory/daily-stock-changes" ||
    pathname.startsWith("/staff/inventory/daily-stock-changes/")
  ) {
    return true;
  }
  if (
    pathname === "/staff/inventory/adjustment-history" ||
    pathname.startsWith("/staff/inventory/adjustment-history/")
  ) {
    return true;
  }
  if (
    pathname === "/staff/find-stock" ||
    pathname.startsWith("/staff/find-stock/")
  ) {
    return true;
  }
  return false;
}

export function isStaffNavHref(href: string): boolean {
  return (
    href === STAFF_HOME ||
    href === "/staff/inventory" ||
    href === "/staff/inventory/remaining-stocks" ||
    href === "/staff/inventory/daily-stock-changes" ||
    href === "/staff/inventory/adjustment-history" ||
    href === "/staff/find-stock"
  );
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

  if (isInventoryViewerRole(role)) {
    if (redirect && isStaffAllowedPath(redirect)) {
      return redirect;
    }
    return STAFF_HOME;
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
