import {
  Timestamp,
  doc,
  getDoc,
  runTransaction,
  serverTimestamp,
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

function serializeCashAdds(
  rows: Array<DailyCashAdd & { createdAt?: Date | Timestamp }>
) {
  return rows.map((row) => ({
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
  }));
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

export async function updateDailyCashAdd(input: {
  branchId: string;
  date: string;
  addId: string;
  note: string;
  amount: number;
}): Promise<void> {
  const note = input.note.trim();
  if (!note) {
    throw new Error("Cash note is required");
  }
  const amount = roundMoney(input.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("Cash amount must be greater than 0");
  }

  const db = getClientDb();
  const ref = doc(
    db,
    COLLECTIONS.dailyCashRecords,
    dailyCashRecordId(input.branchId, input.date)
  );

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) {
      throw new Error("Cash record not found");
    }
    const record = snap.data() as {
      additions?: Array<DailyCashAdd & { createdAt?: Date | Timestamp }>;
    };
    const existing = record.additions ?? [];
    const index = existing.findIndex((row) => row.id === input.addId);
    if (index < 0) {
      throw new Error("Cash entry not found");
    }
    const next = existing.map((row, i) =>
      i === index ? { ...row, note, amount } : row
    );
    tx.update(ref, {
      additions: serializeCashAdds(next),
      updatedAt: serverTimestamp(),
    });
  });
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
      additions: serializeCashAdds(remaining),
      updatedAt: serverTimestamp(),
    });
  });
}
