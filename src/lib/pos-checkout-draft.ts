import type {
  PosCartLine,
  PosCustomerDraft,
} from "@/components/admin/pos-cart";
import type {
  PosPaymentMethod,
  PosSaleChannel,
  PosCustomerType,
  PosTenderMethod,
  Voucher,
} from "@/types";

export interface PosCheckoutDraft {
  saleChannel: PosSaleChannel;
  branchId: string;
  branchName: string;
  lines: PosCartLine[];
  paymentMethod: PosPaymentMethod;
  tenderMethod: PosTenderMethod;
  selectedPaymentAccountId: string | null;
  customerType: PosCustomerType;
  customer: PosCustomerDraft;
  appliedVoucher: Voucher | null;
  voucherCodeInput: string;
  savedAt: number;
}

function draftKey(saleChannel: PosSaleChannel): string {
  return `emv-pos-checkout:${saleChannel}`;
}

export function savePosCheckoutDraft(draft: PosCheckoutDraft): void {
  if (typeof window === "undefined") return;
  sessionStorage.setItem(
    draftKey(draft.saleChannel),
    JSON.stringify({ ...draft, savedAt: Date.now() })
  );
}

export function loadPosCheckoutDraft(
  saleChannel: PosSaleChannel
): PosCheckoutDraft | null {
  if (typeof window === "undefined") return null;
  const raw = sessionStorage.getItem(draftKey(saleChannel));
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
    // Revive voucher dates if present
    if (parsed.appliedVoucher) {
      const v = parsed.appliedVoucher;
      parsed.appliedVoucher = {
        ...v,
        createdAt: v.createdAt ? new Date(v.createdAt) : new Date(),
        updatedAt: v.updatedAt ? new Date(v.updatedAt) : new Date(),
        expiresAt: v.expiresAt ? new Date(v.expiresAt) : null,
      } as Voucher;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function clearPosCheckoutDraft(saleChannel: PosSaleChannel): void {
  if (typeof window === "undefined") return;
  sessionStorage.removeItem(draftKey(saleChannel));
}

export function posCheckoutPath(saleChannel: PosSaleChannel): string {
  return saleChannel === "wholesale"
    ? "/admin/wholesale/checkout"
    : "/admin/pos/checkout";
}

export function posHomePath(saleChannel: PosSaleChannel): string {
  return saleChannel === "wholesale" ? "/admin/wholesale" : "/admin/pos";
}
