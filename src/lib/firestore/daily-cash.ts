import {
  Timestamp,
  doc,
  getDoc,
  runTransaction,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";
import { getClientDb } from "@/lib/firebase";
import { COLLECTIONS } from "@/lib/firestore/collections";
import { dailyCashRecordConverter } from "@/lib/firestore/converters";
import { roundMoney } from "@/lib/pos-payments";
import type { DailyCashAdd, DailyCashRecord } from "@/types";

export function dailyCashRecordId(branchId: string, date: string): string {
  return `${branchId}_${date}`;
}

function recordRef(branchId: string, date: string) {
  return doc(
    getClientDb(),
    COLLECTIONS.dailyCashRecords,
    dailyCashRecordId(branchId, date)
  ).withConverter(dailyCashRecordConverter);
}

export async function getDailyCashRecord(
  branchId: string,
  date: string
): Promise<DailyCashRecord | null> {
  const snap = await getDoc(recordRef(branchId, date));
  return snap.exists() ? snap.data() : null;
}

export async function getDailyCashRecordsForBranches(
  branchIds: string[],
  date: string
): Promise<DailyCashRecord[]> {
  if (branchIds.length === 0) return [];
  const rows = await Promise.all(
    branchIds.map((id) => getDailyCashRecord(id, date))
  );
  return rows.filter((row): row is DailyCashRecord => row != null);
}

export async function saveDailyCashAmounts(input: {
  branchId: string;
  branchName: string;
  date: string;
  openingCash: number;
  createdBy: string;
  createdByName?: string | null;
}): Promise<void> {
  const openingCash = roundMoney(Math.max(0, input.openingCash));
  if (!Number.isFinite(openingCash)) {
    throw new Error("Opening cash must be a valid amount");
  }

  const ref = doc(
    getClientDb(),
    COLLECTIONS.dailyCashRecords,
    dailyCashRecordId(input.branchId, input.date)
  );
  const snap = await getDoc(ref);
  if (snap.exists()) {
    await setDoc(
      ref,
      {
        openingCash,
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
    return;
  }

  await setDoc(ref, {
    branchId: input.branchId,
    branchName: input.branchName,
    date: input.date,
    openingCash,
    closingCash: null,
    additions: [],
    createdBy: input.createdBy,
    createdByName: input.createdByName ?? null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

export async function addDailyCashAdd(input: {
  branchId: string;
  branchName: string;
  date: string;
  note: string;
  amount: number;
  createdBy: string;
  createdByName?: string | null;
}): Promise<string> {
  const note = input.note.trim();
  if (!note) {
    throw new Error("Cash note is required");
  }
  const amount = roundMoney(input.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("Cash amount must be greater than 0");
  }

  const addId =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `cash-${Date.now()}`;
  const db = getClientDb();
  const ref = doc(
    db,
    COLLECTIONS.dailyCashRecords,
    dailyCashRecordId(input.branchId, input.date)
  );

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    const nextAdd = {
      id: addId,
      note,
      amount,
      createdBy: input.createdBy,
      createdByName: input.createdByName ?? null,
      createdAt: Timestamp.now(),
    };

    if (!snap.exists()) {
      tx.set(ref, {
        branchId: input.branchId,
        branchName: input.branchName,
        date: input.date,
        openingCash: 0,
        closingCash: null,
        additions: [nextAdd],
        createdBy: input.createdBy,
        createdByName: input.createdByName ?? null,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      return;
    }

    const data = snap.data() as { additions?: DailyCashAdd[] };
    const existing = Array.isArray(data.additions) ? data.additions : [];
    tx.update(ref, {
      additions: [...existing, nextAdd],
      updatedAt: serverTimestamp(),
    });
  });

  return addId;
}

export async function deleteDailyCashAdd(options: {
  branchId: string;
  date: string;
  addId: string;
}): Promise<void> {
  const db = getClientDb();
  const ref = doc(
    db,
    COLLECTIONS.dailyCashRecords,
    dailyCashRecordId(options.branchId, options.date)
  );

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) return;
    const record = snap.data() as {
      additions?: Array<DailyCashAdd & { createdAt?: Date | Timestamp }>;
    };
    const remaining = (record.additions ?? []).filter(
      (row) => row.id !== options.addId
    );
    tx.update(ref, {
      additions: remaining.map((row) => ({
        id: row.id,
        note: row.note,
        amount: row.amount,
        createdBy: row.createdBy,
        createdByName: row.createdByName ?? null,
        createdAt:
          row.createdAt instanceof Timestamp
            ? row.createdAt
            : row.createdAt instanceof Date
              ? Timestamp.fromDate(row.createdAt)
              : Timestamp.now(),
      })),
      updatedAt: serverTimestamp(),
    });
  });
}
