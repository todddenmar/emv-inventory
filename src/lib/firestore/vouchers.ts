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
import type { Voucher, VoucherStatus } from "@/types";

function vouchersRef(): CollectionReference<Voucher> {
  return collection(getClientDb(), COLLECTIONS.vouchers).withConverter(
    voucherConverter
  );
}

function generateVoucherCode(): string {
  const chunk = crypto.randomUUID().replace(/-/g, "").slice(0, 8).toUpperCase();
  return `VCH-${chunk}`;
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

  return {
    id,
    code: String(data.code ?? "").toUpperCase(),
    resellerId: (data.resellerId as string | null | undefined) ?? null,
    resellerName: (data.resellerName as string | null | undefined) ?? null,
    initialAmount: Number(data.initialAmount ?? 0),
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
  const normalized = code.trim().toUpperCase();
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
      v.remainingAmount > 0 &&
      (!v.expiresAt || v.expiresAt.getTime() > now.getTime())
  );
}

export function isVoucherRedeemable(
  voucher: Voucher,
  now = new Date()
): boolean {
  if (voucher.status !== "active") return false;
  if (voucher.remainingAmount <= 0) return false;
  if (voucher.expiresAt && voucher.expiresAt.getTime() <= now.getTime()) {
    return false;
  }
  return true;
}

export function voucherOwnerLabel(voucher: Pick<Voucher, "resellerId" | "resellerName">): string {
  if (voucher.resellerId && voucher.resellerName) return voucher.resellerName;
  if (voucher.resellerId) return "Reseller";
  return "Walk-in";
}

export async function issueVoucher(input: {
  resellerId?: string | null;
  resellerName?: string | null;
  amount: number;
  expiresAt?: Date | null;
  createdBy: string;
  createdByName?: string | null;
}): Promise<Voucher> {
  const amount = Number(input.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("Voucher amount must be greater than zero");
  }

  const resellerId = input.resellerId?.trim() || null;
  const resellerName = resellerId
    ? input.resellerName?.trim() || null
    : null;

  if (resellerId && !resellerName) {
    throw new Error("Reseller name is required when linking a reseller");
  }

  const code = generateVoucherCode();
  const docRef = await addDoc(collection(getClientDb(), COLLECTIONS.vouchers), {
    code,
    resellerId,
    resellerName,
    initialAmount: amount,
    remainingAmount: amount,
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
    resellerId,
    resellerName,
    initialAmount: amount,
    remainingAmount: amount,
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
