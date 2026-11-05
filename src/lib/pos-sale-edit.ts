import { toDateInputValue } from "@/lib/dates";
import {
  isCashierRole,
  isElevatedAdminRole,
} from "@/lib/roles";
import type { PosSale, UserRole } from "@/types";

/** Sale calendar day matches local today. */
export function isPosSaleSameLocalDay(
  sale: Pick<PosSale, "createdAt">,
  now: Date = new Date()
): boolean {
  return toDateInputValue(sale.createdAt) === toDateInputValue(now);
}

/**
 * Elevated admins: any non-archived sale.
 * Cashiers: own sale (`createdBy`), assigned branch, same local day only.
 */
export function canEditPosSale(options: {
  sale: PosSale | null | undefined;
  role: UserRole | null | undefined;
  userId: string | null | undefined;
  assignedBranchId: string | null | undefined;
  now?: Date;
}): boolean {
  const { sale, role, userId, assignedBranchId, now } = options;
  if (!sale || sale.archivedAt != null) return false;
  if (isElevatedAdminRole(role)) return true;
  if (!isCashierRole(role)) return false;
  if (!userId || sale.createdBy !== userId) return false;
  if (!assignedBranchId || sale.branchId !== assignedBranchId) return false;
  return isPosSaleSameLocalDay(sale, now);
}

/** @deprecated Prefer `canEditPosSale` (includes own-sale check for cashiers). */
export function canEditPosSalePayments(options: {
  sale: PosSale | null | undefined;
  role: UserRole | null | undefined;
  assignedBranchId: string | null | undefined;
  userId?: string | null | undefined;
  now?: Date;
}): boolean {
  return canEditPosSale({
    sale: options.sale,
    role: options.role,
    userId: options.userId,
    assignedBranchId: options.assignedBranchId,
    now: options.now,
  });
}

/** Only elevated admins may move a sale onto another calendar day. */
export function canChangePosSaleDate(
  role: UserRole | null | undefined
): boolean {
  return isElevatedAdminRole(role);
}
