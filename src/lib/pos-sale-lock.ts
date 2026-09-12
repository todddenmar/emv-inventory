import {
  isDateInputValue,
  toDateInputValue,
} from "@/lib/dates";

export type PosSaleLock = {
  branchId: string;
  saleDate: string;
};

export function parsePosSaleLock(input: {
  branch?: string | null;
  date?: string | null;
}): PosSaleLock | null {
  const branchId = input.branch?.trim() ?? "";
  const saleDate = input.date?.trim() ?? "";
  if (!branchId || !isDateInputValue(saleDate)) return null;
  if (saleDate > toDateInputValue()) return null;
  return { branchId, saleDate };
}

export function parsePosSaleLockFromSearchParams(params: {
  get: (key: string) => string | null;
}): PosSaleLock | null {
  return parsePosSaleLock({
    branch: params.get("branch"),
    date: params.get("date"),
  });
}

export function posSaleLockQuery(lock: PosSaleLock): string {
  const params = new URLSearchParams();
  params.set("branch", lock.branchId);
  params.set("date", lock.saleDate);
  return params.toString();
}

export function lockedPosPath(lock: PosSaleLock): string {
  return `/admin/pos?${posSaleLockQuery(lock)}`;
}

export function lockedPosCheckoutPath(lock: PosSaleLock): string {
  return `/admin/pos/checkout?${posSaleLockQuery(lock)}`;
}

export function dailySalesReportPath(lock: PosSaleLock): string {
  return `/admin/reports/daily-sales?${posSaleLockQuery(lock)}`;
}
