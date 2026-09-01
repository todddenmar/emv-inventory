import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  where,
  type CollectionReference,
} from "firebase/firestore";
import { getClientDb } from "@/lib/firebase";
import { COLLECTIONS } from "@/lib/firestore/collections";
import { dailyExpenseConverter } from "@/lib/firestore/converters";
import { roundMoney } from "@/lib/pos-payments";
import type { DailyExpense } from "@/types";

function expensesRef(): CollectionReference<DailyExpense> {
  return collection(getClientDb(), COLLECTIONS.dailyExpenses).withConverter(
    dailyExpenseConverter
  );
}

export async function getDailyExpenses(options: {
  branchId: string;
  date: string;
}): Promise<DailyExpense[]> {
  const { branchId, date } = options;
  try {
    const snapshot = await getDocs(
      query(
        expensesRef(),
        where("branchId", "==", branchId),
        where("date", "==", date),
        orderBy("createdAt", "asc")
      )
    );
    return snapshot.docs.map((d) => d.data());
  } catch (error) {
    console.warn("getDailyExpenses indexed query failed, using fallback", error);
    const snapshot = await getDocs(
      query(expensesRef(), where("branchId", "==", branchId))
    );
    return snapshot.docs
      .map((d) => d.data())
      .filter((row) => row.date === date)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  }
}

export async function getDailyExpensesForBranches(
  branchIds: string[],
  date: string
): Promise<DailyExpense[]> {
  if (branchIds.length === 0) return [];
  const lists = await Promise.all(
    branchIds.map((branchId) => getDailyExpenses({ branchId, date }))
  );
  return lists.flat();
}

export async function addDailyExpense(input: {
  branchId: string;
  branchName: string;
  date: string;
  description: string;
  amount: number;
  createdBy: string;
  createdByName?: string | null;
}): Promise<string> {
  const description = input.description.trim();
  if (!description) {
    throw new Error("Expense description is required");
  }
  const amount = roundMoney(input.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("Expense amount must be greater than 0");
  }

  const ref = await addDoc(collection(getClientDb(), COLLECTIONS.dailyExpenses), {
    branchId: input.branchId,
    branchName: input.branchName,
    date: input.date,
    description,
    amount,
    createdBy: input.createdBy,
    createdByName: input.createdByName ?? null,
    createdAt: serverTimestamp(),
  });
  return ref.id;
}

export async function deleteDailyExpense(id: string): Promise<void> {
  await deleteDoc(doc(getClientDb(), COLLECTIONS.dailyExpenses, id));
}
