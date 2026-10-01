import {
  addDoc,
  collection,
  doc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
  writeBatch,
} from "firebase/firestore";
import { getClientDb } from "@/lib/firebase";
import { COLLECTIONS } from "@/lib/firestore/collections";
import { isVoucherRedeemable } from "@/lib/firestore/vouchers";
import type { Voucher, VoucherGroup } from "@/types";

/** Firestore caps a batch at 500 writes. */
const BATCH_LIMIT = 450;

function toDate(value: unknown): Date {
  if (value && typeof (value as { toDate?: () => Date }).toDate === "function") {
    return (value as { toDate: () => Date }).toDate();
  }
  return value ? new Date(value as Date) : new Date();
}

function parseGroup(id: string, data: Record<string, unknown>): VoucherGroup {
  return {
    id,
    name: String(data.name ?? "").trim(),
    description: String(data.description ?? "").trim(),
    createdBy: String(data.createdBy ?? ""),
    createdByName: (data.createdByName as string | null | undefined) ?? null,
    createdAt: toDate(data.createdAt),
    updatedAt: toDate(data.updatedAt),
  };
}

export async function getVoucherGroups(): Promise<VoucherGroup[]> {
  const snapshot = await getDocs(
    query(
      collection(getClientDb(), COLLECTIONS.voucherGroups),
      orderBy("createdAt", "desc")
    )
  );
  return snapshot.docs.map((d) =>
    parseGroup(d.id, d.data() as Record<string, unknown>)
  );
}

export async function createVoucherGroup(input: {
  name: string;
  description?: string;
  createdBy: string;
  createdByName?: string | null;
}): Promise<VoucherGroup> {
  const name = input.name.trim();
  if (!name) throw new Error("Enter a group name");
  const description = input.description?.trim() ?? "";
  const ref = await addDoc(collection(getClientDb(), COLLECTIONS.voucherGroups), {
    name,
    description,
    createdBy: input.createdBy,
    createdByName: input.createdByName ?? null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  const now = new Date();
  return {
    id: ref.id,
    name,
    description,
    createdBy: input.createdBy,
    createdByName: input.createdByName ?? null,
    createdAt: now,
    updatedAt: now,
  };
}

export async function updateVoucherGroup(
  id: string,
  input: { name: string; description?: string }
): Promise<void> {
  const name = input.name.trim();
  if (!name) throw new Error("Enter a group name");
  await updateDoc(doc(getClientDb(), COLLECTIONS.voucherGroups, id), {
    name,
    description: input.description?.trim() ?? "",
    updatedAt: serverTimestamp(),
  });
}

/** Sets `groupId` on many vouchers (null removes them from their group). */
export async function assignVouchersToGroup(
  voucherIds: string[],
  groupId: string | null
): Promise<number> {
  const db = getClientDb();
  const ids = [...new Set(voucherIds)];
  for (let i = 0; i < ids.length; i += BATCH_LIMIT) {
    const batch = writeBatch(db);
    for (const id of ids.slice(i, i + BATCH_LIMIT)) {
      batch.update(doc(db, COLLECTIONS.vouchers, id), {
        groupId,
        updatedAt: serverTimestamp(),
      });
    }
    await batch.commit();
  }
  return ids.length;
}

/** Deletes the group; its vouchers are kept and become ungrouped. */
export async function deleteVoucherGroup(id: string): Promise<void> {
  const db = getClientDb();
  const members = await getDocs(
    query(collection(db, COLLECTIONS.vouchers), where("groupId", "==", id))
  );
  await assignVouchersToGroup(
    members.docs.map((d) => d.id),
    null
  );
  const batch = writeBatch(db);
  batch.delete(doc(db, COLLECTIONS.voucherGroups, id));
  await batch.commit();
}

export type VoucherAvailability = "available" | "used" | "expired" | "void";

export function voucherAvailability(
  voucher: Voucher,
  now = new Date()
): VoucherAvailability {
  if (voucher.status === "void") return "void";
  if (voucher.status === "depleted") return "used";
  if (voucher.expiresAt && voucher.expiresAt.getTime() <= now.getTime()) {
    return "expired";
  }
  return isVoucherRedeemable(voucher, now) ? "available" : "void";
}

export interface VoucherGroupStats {
  total: number;
  available: number;
  used: number;
  expired: number;
  void: number;
}

export function emptyVoucherGroupStats(): VoucherGroupStats {
  return { total: 0, available: 0, used: 0, expired: 0, void: 0 };
}

/** Stats keyed by groupId; ungrouped vouchers are under the "" key. */
export function voucherStatsByGroup(
  vouchers: Voucher[],
  now = new Date()
): Map<string, VoucherGroupStats> {
  const map = new Map<string, VoucherGroupStats>();
  for (const voucher of vouchers) {
    const key = voucher.groupId ?? "";
    const stats = map.get(key) ?? emptyVoucherGroupStats();
    stats.total += 1;
    stats[voucherAvailability(voucher, now)] += 1;
    map.set(key, stats);
  }
  return map;
}
