import type {
  PosCartLine,
  PosCustomerDraft,
} from "@/components/admin/pos-cart";
import {
  ensureCartLinePaymentFields,
  sanitizePaymentGroups,
  type PosCheckoutPaymentGroup,
} from "@/lib/pos-payments";
import { parsePosCustomerType } from "@/lib/pos-customer-type";
import type { PosSaleLock } from "@/lib/pos-sale-lock";
import type {
  PosPaymentMethod,
  PosSaleChannel,
  PosCustomerType,
  Voucher,
} from "@/types";

export interface PosCheckoutDraft {
  saleChannel: PosSaleChannel;
  branchId: string;
  branchName: string;
  lines: PosCartLine[];
  paymentMethod: PosPaymentMethod;
  customerType: PosCustomerType;
  customer: PosCustomerDraft;
  appliedVoucher: Voucher | null;
  /** Manual less amount; null = use full voucher entitlement. */
  voucherAppliedOverride: number | null;
  voucherCodeInput: string;
  paymentGroups: PosCheckoutPaymentGroup[];
  savedAt: number;
}

function draftKey(
  saleChannel: PosSaleChannel,
  lock?: PosSaleLock | null
): string {
  if (lock) {
    return `emv-pos-checkout:${saleChannel}:${lock.branchId}:${lock.saleDate}`;
  }
  return `emv-pos-checkout:${saleChannel}`;
}

import { clampVoucherAppliedAmount } from "@/lib/firestore/vouchers";

function merchandiseSubtotal(lines: PosCartLine[]): number {
  return lines.reduce(
    (sum, line) =>
      sum + (line.isFreebie ? 0 : line.unitPrice * line.quantity),
    0
  );
}

export function draftAmountDue(draft: {
  lines: PosCartLine[];
  appliedVoucher: Voucher | null;
  voucherAppliedOverride?: number | null;
}): number {
  const subtotal = merchandiseSubtotal(draft.lines);
  const voucherApplied = clampVoucherAppliedAmount(
    draft.appliedVoucher,
    subtotal,
    draft.voucherAppliedOverride
  );
  return Math.max(0, subtotal - voucherApplied);
}

export function savePosCheckoutDraft(
  draft: PosCheckoutDraft,
  lock?: PosSaleLock | null
): void {
  if (typeof window === "undefined") return;
  sessionStorage.setItem(
    draftKey(draft.saleChannel, lock),
    JSON.stringify({
      ...draft,
      savedAt: Date.now(),
    })
  );
}

export function loadPosCheckoutDraft(
  saleChannel: PosSaleChannel,
  lock?: PosSaleLock | null
): PosCheckoutDraft | null {
  if (typeof window === "undefined") return null;
  const raw = sessionStorage.getItem(draftKey(saleChannel, lock));
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as PosCheckoutDraft;
    if (
      !parsed ||
      parsed.saleChannel !== saleChannel ||
      !parsed.branchId ||
      !Array.isArray(parsed.lines) ||
      parsed.lines.length === 0
    ) {
      return null;
    }
    if (parsed.appliedVoucher) {
      const v = parsed.appliedVoucher;
      const discountType =
        v.discountType === "percent" ? "percent" : "amount";
      const initialAmount = Number(v.initialAmount ?? 0);
      parsed.appliedVoucher = {
        ...v,
        discountType,
        discountValue: Number(
          v.discountValue ??
            (discountType === "percent" ? 0 : initialAmount)
        ),
        initialAmount,
        remainingAmount: Number(v.remainingAmount ?? 0),
        createdAt: v.createdAt ? new Date(v.createdAt) : new Date(),
        updatedAt: v.updatedAt ? new Date(v.updatedAt) : new Date(),
        expiresAt: v.expiresAt ? new Date(v.expiresAt) : null,
      } as Voucher;
    }

    if (lock && parsed.branchId !== lock.branchId) {
      return null;
    }

    const overrideRaw = (parsed as { voucherAppliedOverride?: unknown })
      .voucherAppliedOverride;
    const voucherAppliedOverride =
      overrideRaw == null || overrideRaw === ""
        ? null
        : Number.isFinite(Number(overrideRaw))
          ? Number(overrideRaw)
          : null;

    return {
      ...parsed,
      voucherAppliedOverride,
      customerType: parsePosCustomerType(parsed.customerType),
      lines: parsed.lines.map((line) => ensureCartLinePaymentFields(line)),
      paymentGroups: sanitizePaymentGroups(
        parsed.paymentGroups,
        parsed.lines,
        {
          targetTotal: draftAmountDue({
            lines: parsed.lines,
            appliedVoucher: parsed.appliedVoucher,
            voucherAppliedOverride,
          }),
        }
      ),
    };
  } catch {
    return null;
  }
}

export function clearPosCheckoutDraft(
  saleChannel: PosSaleChannel,
  lock?: PosSaleLock | null
): void {
  if (typeof window === "undefined") return;
  sessionStorage.removeItem(draftKey(saleChannel, lock));
}

export function posHomePath(saleChannel: PosSaleChannel): string {
  return saleChannel === "wholesale" ? "/admin/wholesale" : "/admin/pos";
}

export function posCheckoutPath(saleChannel: PosSaleChannel): string {
  return saleChannel === "wholesale"
    ? "/admin/wholesale/checkout"
    : "/admin/pos/checkout";
}
