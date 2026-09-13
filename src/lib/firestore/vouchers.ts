import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
  type CollectionReference,
  type QueryConstraint,
} from "firebase/firestore";
import { getClientDb } from "@/lib/firebase";
import { COLLECTIONS } from "@/lib/firestore/collections";
import { voucherConverter } from "@/lib/firestore/converters";
import { roundMoney } from "@/lib/pos-payments";
import type {
  Voucher,
  VoucherDiscountType,
  VoucherRedemption,
  VoucherStatus,
} from "@/types";

function vouchersRef(): CollectionReference<Voucher> {
  return collection(getClientDb(), COLLECTIONS.vouchers).withConverter(
    voucherConverter
  );
}

function generateVoucherCode(): string {
  const chunk = crypto.randomUUID().replace(/-/g, "").slice(0, 8).toUpperCase();
  return `VCH-${chunk}`;
}

export function normalizeVoucherCode(code: string): string {
  return code.trim().toUpperCase().replace(/\s+/g, "");
}

export function parseVoucherDiscountType(
  value: unknown
): VoucherDiscountType {
  return value === "percent" ? "percent" : "amount";
}

export function isAmountVoucher(
  voucher: Pick<Voucher, "discountType">
): boolean {
  return parseVoucherDiscountType(voucher.discountType) === "amount";
}

/** Pesos deducted from the cart for this voucher (full entitlement). */
export function computeVoucherAppliedAmount(
  voucher: Voucher | null | undefined,
  subtotal: number
): number {
  if (!voucher || !Number.isFinite(subtotal) || subtotal <= 0) return 0;
  if (parseVoucherDiscountType(voucher.discountType) === "percent") {
    const pct = Math.min(100, Math.max(0, Number(voucher.discountValue) || 0));
    return roundMoney((subtotal * pct) / 100);
  }
  const less = Math.max(0, Number(voucher.discountValue) || 0);
  return roundMoney(Math.min(less, subtotal));
}

/**
 * Applied less amount: uses `requested` when set, capped at 0…max entitlement.
 * When `requested` is null/undefined, returns the full computed amount.
 */
export function clampVoucherAppliedAmount(
  voucher: Voucher | null | undefined,
  subtotal: number,
  requested?: number | null
): number {
  const max = computeVoucherAppliedAmount(voucher, subtotal);
  if (requested == null || !Number.isFinite(requested)) return max;
  return roundMoney(Math.min(max, Math.max(0, requested)));
}

function parseVoucherDoc(
  id: string,
  data: Record<string, unknown>
): Voucher {
  const expiresRaw = data.expiresAt as
    | { toDate?: () => Date }
    | Date
    | null
    | undefined;
  const createdRaw = data.createdAt as { toDate?: () => Date } | Date | undefined;
  const updatedRaw = data.updatedAt as { toDate?: () => Date } | Date | undefined;
  const discountType = parseVoucherDiscountType(data.discountType);
  const initialAmount = Number(data.initialAmount ?? 0);
  const discountValue = Number(
    data.discountValue ??
      (discountType === "percent" ? 0 : initialAmount)
  );

  return {
    id,
    code: String(data.code ?? "").toUpperCase(),
    name: String(data.name ?? "").trim(),
    description: String(data.description ?? "").trim(),
    resellerId: (data.resellerId as string | null | undefined) ?? null,
    resellerName: (data.resellerName as string | null | undefined) ?? null,
    discountType,
    discountValue,
    initialAmount,
    remainingAmount: Number(data.remainingAmount ?? 0),
    status:
      data.status === "void" || data.status === "depleted"
        ? data.status
        : "active",
    expiresAt: expiresRaw
      ? typeof (expiresRaw as { toDate?: () => Date }).toDate === "function"
        ? (expiresRaw as { toDate: () => Date }).toDate()
        : new Date(expiresRaw as Date)
      : null,
    createdBy: String(data.createdBy ?? ""),
    createdByName: (data.createdByName as string | null | undefined) ?? null,
    createdAt:
      createdRaw &&
      typeof (createdRaw as { toDate?: () => Date }).toDate === "function"
        ? (createdRaw as { toDate: () => Date }).toDate()
        : createdRaw
          ? new Date(createdRaw as Date)
          : new Date(),
    updatedAt:
      updatedRaw &&
      typeof (updatedRaw as { toDate?: () => Date }).toDate === "function"
        ? (updatedRaw as { toDate: () => Date }).toDate()
        : updatedRaw
          ? new Date(updatedRaw as Date)
          : new Date(),
  };
}

export async function getVouchers(options?: {
  resellerId?: string | null;
  status?: VoucherStatus | null;
  /** When true with no resellerId filter, only walk-in (unassigned) vouchers. */
  unassignedOnly?: boolean;
}): Promise<Voucher[]> {
  const constraints: QueryConstraint[] = [];
  if (options?.resellerId) {
    constraints.push(where("resellerId", "==", options.resellerId));
  }
  if (options?.status) {
    constraints.push(where("status", "==", options.status));
  }
  constraints.push(orderBy("createdAt", "desc"));

  try {
    const snapshot = await getDocs(query(vouchersRef(), ...constraints));
    let rows = snapshot.docs.map((d) => d.data());
    if (options?.unassignedOnly) {
      rows = rows.filter((v) => !v.resellerId);
    }
    return rows;
  } catch (error) {
    console.warn("getVouchers query failed, using fallback", error);
    const snapshot = await getDocs(
      query(vouchersRef(), orderBy("createdAt", "desc"))
    );
    let rows = snapshot.docs.map((d) => d.data());
    if (options?.resellerId) {
      rows = rows.filter((v) => v.resellerId === options.resellerId);
    }
    if (options?.unassignedOnly) {
      rows = rows.filter((v) => !v.resellerId);
    }
    if (options?.status) {
      rows = rows.filter((v) => v.status === options.status);
    }
    return rows;
  }
}

export async function getVoucher(id: string): Promise<Voucher | null> {
  const snap = await getDoc(doc(vouchersRef(), id));
  return snap.exists() ? snap.data() : null;
}

export async function getVoucherByCode(code: string): Promise<Voucher | null> {
  const normalized = normalizeVoucherCode(code);
  if (!normalized) return null;
  const snapshot = await getDocs(
    query(
      collection(getClientDb(), COLLECTIONS.vouchers),
      where("code", "==", normalized),
      limit(1)
    )
  );
  if (snapshot.empty) return null;
  const d = snapshot.docs[0];
  return parseVoucherDoc(d.id, d.data() as Record<string, unknown>);
}

export async function getActiveVouchersForReseller(
  resellerId: string
): Promise<Voucher[]> {
  const rows = await getVouchers({ resellerId, status: "active" });
  const now = new Date();
  return rows.filter(
    (v) =>
      isVoucherRedeemable(v, now)
  );
}

export function isVoucherRedeemable(
  voucher: Voucher,
  now = new Date()
): boolean {
  // Unlimited reuse until voided (legacy "depleted" still blocked).
  if (voucher.status === "void" || voucher.status === "depleted") return false;
  if (voucher.status !== "active") return false;
  if (voucher.expiresAt && voucher.expiresAt.getTime() <= now.getTime()) {
    return false;
  }
  if (parseVoucherDiscountType(voucher.discountType) === "percent") {
    const pct = Number(voucher.discountValue) || 0;
    return pct > 0 && pct <= 100;
  }
  return (Number(voucher.discountValue) || 0) > 0;
}

export function voucherOwnerLabel(voucher: Pick<Voucher, "resellerId" | "resellerName">): string {
  if (voucher.resellerId && voucher.resellerName) return voucher.resellerName;
  if (voucher.resellerId) return "Reseller";
  return "Walk-in";
}

export function voucherValueLabel(voucher: Voucher): string {
  if (parseVoucherDiscountType(voucher.discountType) === "percent") {
    return `${roundMoney(voucher.discountValue)}% less`;
  }
  return `₱${roundMoney(voucher.discountValue).toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} less`;
}

export async function issueVoucher(input: {
  name: string;
  description?: string | null;
  resellerId?: string | null;
  resellerName?: string | null;
  discountType: VoucherDiscountType;
  /** Pesos for amount vouchers, or percent (1–100) for percent vouchers. */
  discountValue: number;
  /** Optional custom code. Auto-generated when omitted. */
  code?: string | null;
  expiresAt?: Date | null;
  createdBy: string;
  createdByName?: string | null;
}): Promise<Voucher> {
  const name = input.name.trim();
  if (!name) {
    throw new Error("Voucher name is required");
  }

  const description = input.description?.trim() ?? "";
  const discountType = parseVoucherDiscountType(input.discountType);
  const discountValue = Number(input.discountValue);

  if (discountType === "percent") {
    if (!Number.isFinite(discountValue) || discountValue <= 0 || discountValue > 100) {
      throw new Error("Percent must be between 0 and 100");
    }
  } else if (!Number.isFinite(discountValue) || discountValue <= 0) {
    throw new Error("Voucher amount must be greater than zero");
  }

  const resellerId = input.resellerId?.trim() || null;
  const resellerName = resellerId
    ? input.resellerName?.trim() || null
    : null;

  if (resellerId && !resellerName) {
    throw new Error("Reseller name is required when linking a reseller");
  }

  let code = normalizeVoucherCode(input.code ?? "");
  if (code) {
    if (!/^[A-Z0-9][A-Z0-9\-_]{2,31}$/.test(code)) {
      throw new Error(
        "Code must be 3–32 characters: letters, numbers, hyphen, or underscore"
      );
    }
    const existing = await getVoucherByCode(code);
    if (existing) {
      throw new Error("That voucher code is already in use");
    }
  } else {
    for (let attempt = 0; attempt < 5; attempt++) {
      code = generateVoucherCode();
      const existing = await getVoucherByCode(code);
      if (!existing) break;
      if (attempt === 4) {
        throw new Error("Could not generate a unique voucher code");
      }
    }
  }

  const storedDiscountValue = roundMoney(discountValue);
  // Kept for older docs/UI; amount vouchers no longer deplete a balance.
  const initialAmount =
    discountType === "amount" ? storedDiscountValue : 0;
  const remainingAmount = initialAmount;

  const docRef = await addDoc(collection(getClientDb(), COLLECTIONS.vouchers), {
    code,
    name,
    description,
    resellerId,
    resellerName,
    discountType,
    discountValue: storedDiscountValue,
    initialAmount,
    remainingAmount,
    status: "active" satisfies VoucherStatus,
    expiresAt: input.expiresAt ?? null,
    createdBy: input.createdBy,
    createdByName: input.createdByName ?? null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  return {
    id: docRef.id,
    code,
    name,
    description,
    resellerId,
    resellerName,
    discountType,
    discountValue: storedDiscountValue,
    initialAmount,
    remainingAmount,
    status: "active",
    expiresAt: input.expiresAt ?? null,
    createdBy: input.createdBy,
    createdByName: input.createdByName ?? null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

export async function voidVoucher(id: string): Promise<void> {
  const existing = await getVoucher(id);
  if (!existing) throw new Error("Voucher not found");
  if (existing.status === "void") return;

  await updateDoc(doc(getClientDb(), COLLECTIONS.vouchers, id), {
    status: "void",
    updatedAt: serverTimestamp(),
  });
}

export async function updateVoucher(
  id: string,
  input: {
    name: string;
    description?: string | null;
    code: string;
    resellerId?: string | null;
    resellerName?: string | null;
    /** Percent (1–100) or less-amount pesos. */
    discountValue: number;
    expiresAt?: Date | null;
  }
): Promise<Voucher> {
  const existing = await getVoucher(id);
  if (!existing) throw new Error("Voucher not found");
  if (existing.status === "void") {
    throw new Error("Voided vouchers cannot be edited");
  }

  const name = input.name.trim();
  if (!name) {
    throw new Error("Voucher name is required");
  }

  const description = input.description?.trim() ?? "";
  const discountType = parseVoucherDiscountType(existing.discountType);
  const discountValue = Number(input.discountValue);

  if (discountType === "percent") {
    if (!Number.isFinite(discountValue) || discountValue <= 0 || discountValue > 100) {
      throw new Error("Percent must be between 0 and 100");
    }
  } else if (!Number.isFinite(discountValue) || discountValue <= 0) {
    throw new Error("Less amount must be greater than zero");
  }

  const resellerId = input.resellerId?.trim() || null;
  const resellerName = resellerId
    ? input.resellerName?.trim() || null
    : null;

  if (resellerId && !resellerName) {
    throw new Error("Reseller name is required when linking a reseller");
  }

  const code = normalizeVoucherCode(input.code);
  if (!code) {
    throw new Error("Voucher code is required");
  }
  if (!/^[A-Z0-9][A-Z0-9\-_]{2,31}$/.test(code)) {
    throw new Error(
      "Code must be 3–32 characters: letters, numbers, hyphen, or underscore"
    );
  }
  if (code !== existing.code) {
    const conflict = await getVoucherByCode(code);
    if (conflict && conflict.id !== id) {
      throw new Error("That voucher code is already in use");
    }
  }

  const storedDiscountValue = roundMoney(discountValue);
  const initialAmount =
    discountType === "amount" ? storedDiscountValue : 0;
  const remainingAmount = initialAmount;
  const status: VoucherStatus = "active";
  const expiresAt = input.expiresAt ?? null;

  await updateDoc(doc(getClientDb(), COLLECTIONS.vouchers, id), {
    code,
    name,
    description,
    resellerId,
    resellerName,
    discountType,
    discountValue: storedDiscountValue,
    initialAmount,
    remainingAmount,
    status,
    expiresAt,
    updatedAt: serverTimestamp(),
  });

  return {
    ...existing,
    code,
    name,
    description,
    resellerId,
    resellerName,
    discountType,
    discountValue: storedDiscountValue,
    initialAmount,
    remainingAmount,
    status,
    expiresAt,
    updatedAt: new Date(),
  };
}

function parseRedemptionDoc(
  id: string,
  data: Record<string, unknown>
): VoucherRedemption {
  const createdRaw = data.createdAt as { toDate?: () => Date } | Date | undefined;
  return {
    id,
    voucherId: String(data.voucherId ?? ""),
    voucherCode: String(data.voucherCode ?? "").toUpperCase(),
    saleId: String(data.saleId ?? ""),
    branchId: String(data.branchId ?? ""),
    branchName: String(data.branchName ?? ""),
    amountApplied: Number(data.amountApplied ?? 0),
    customerName: (data.customerName as string | null | undefined) ?? null,
    customerMobile: (data.customerMobile as string | null | undefined) ?? null,
    customerEmail: (data.customerEmail as string | null | undefined) ?? null,
    customerAddress:
      (data.customerAddress as string | null | undefined) ?? null,
    redeemedBy: String(data.redeemedBy ?? ""),
    redeemedByName: (data.redeemedByName as string | null | undefined) ?? null,
    createdAt:
      createdRaw &&
      typeof (createdRaw as { toDate?: () => Date }).toDate === "function"
        ? (createdRaw as { toDate: () => Date }).toDate()
        : createdRaw
          ? new Date(createdRaw as Date)
          : new Date(),
  };
}

export async function getVoucherRedemptions(
  voucherId: string
): Promise<VoucherRedemption[]> {
  if (!voucherId) return [];
  try {
    const snapshot = await getDocs(
      query(
        collection(getClientDb(), COLLECTIONS.voucherRedemptions),
        where("voucherId", "==", voucherId),
        orderBy("createdAt", "desc")
      )
    );
    return snapshot.docs.map((d) =>
      parseRedemptionDoc(d.id, d.data() as Record<string, unknown>)
    );
  } catch (error) {
    console.warn("getVoucherRedemptions query failed, using fallback", error);
    const snapshot = await getDocs(
      query(
        collection(getClientDb(), COLLECTIONS.voucherRedemptions),
        where("voucherId", "==", voucherId)
      )
    );
    return snapshot.docs
      .map((d) => parseRedemptionDoc(d.id, d.data() as Record<string, unknown>))
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }
}
