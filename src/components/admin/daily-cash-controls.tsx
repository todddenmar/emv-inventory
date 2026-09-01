"use client";

import { useState } from "react";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  addDailyCashAdd,
  deleteDailyCashAdd,
  saveDailyCashAmounts,
} from "@/lib/firestore/daily-cash";
import {
  addDailyExpense,
  deleteDailyExpense,
} from "@/lib/firestore/daily-expenses";
import { formatCurrency } from "@/lib/format";
import { parseMoneyInput } from "@/lib/pos-payments";
import { useAuthStore } from "@/stores/auth-store";
import type { DailyCashRecord, DailyExpense } from "@/types";
import type { DailySalesReportSummary } from "@/lib/daily-sales-report";

function setMoneyText(raw: string, setValue: (value: string) => void) {
  if (raw !== "" && !/^\d*\.?\d*$/.test(raw)) return;
  setValue(raw);
}

export function NamedAmountList({
  items,
  emptyLabel,
  deletingId,
  amountClassName,
  onDelete,
}: {
  items: Array<{ id: string; label: string; amount: number }>;
  emptyLabel: string;
  deletingId?: string | null;
  amountClassName?: string;
  onDelete?: (id: string) => void;
}) {
  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground">{emptyLabel}</p>;
  }

  return (
    <ul className="max-h-64 space-y-2 overflow-y-auto">
      {items.map((item) => (
        <li
          key={item.id}
          className="flex items-center justify-between gap-3 rounded-md border px-3 py-2 text-sm"
        >
          <div className="min-w-0">
            <p className="truncate font-medium uppercase tracking-wide">
              {item.label}
            </p>
            <p className={`tabular-nums ${amountClassName ?? ""}`}>
              {formatCurrency(item.amount)}
            </p>
          </div>
          {onDelete ? (
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="shrink-0"
              disabled={deletingId === item.id}
              onClick={() => onDelete(item.id)}
              aria-label={`Delete ${item.label}`}
            >
              {deletingId === item.id ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Trash2 className="size-4" />
              )}
            </Button>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

export function DailyCashExpenseControls({
  branchId,
  branchName,
  date,
  expenses,
  cashRecord,
  summary,
  openingCashText,
  onOpeningCashTextChange,
  onReload,
}: {
  branchId: string | null;
  branchName: string;
  date: string;
  expenses: DailyExpense[];
  cashRecord: DailyCashRecord | null;
  summary: DailySalesReportSummary;
  openingCashText: string;
  onOpeningCashTextChange: (value: string) => void;
  onReload: () => Promise<void>;
}) {
  const user = useAuthStore((s) => s.user);
  const [expenseDialogOpen, setExpenseDialogOpen] = useState(false);
  const [cashDialogOpen, setCashDialogOpen] = useState(false);
  const [expenseDescription, setExpenseDescription] = useState("");
  const [expenseAmountText, setExpenseAmountText] = useState("");
  const [cashAddNote, setCashAddNote] = useState("");
  const [cashAddAmountText, setCashAddAmountText] = useState("");
  const [savingExpense, setSavingExpense] = useState(false);
  const [savingCashAmounts, setSavingCashAmounts] = useState(false);
  const [savingCashAdd, setSavingCashAdd] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deletingCashAddId, setDeletingCashAddId] = useState<string | null>(
    null
  );

  const canAct = Boolean(branchId && branchName && user);

  const handleAddExpense = async () => {
    if (!branchId || !user) return;
    const amount = parseMoneyInput(expenseAmountText);
    if (!expenseDescription.trim()) {
      toast.error("Enter an expense description");
      return;
    }
    if (amount == null || amount <= 0) {
      toast.error("Enter an expense amount greater than 0");
      return;
    }

    setSavingExpense(true);
    try {
      await addDailyExpense({
        branchId,
        branchName,
        date,
        description: expenseDescription,
        amount,
        createdBy: user.uid,
        createdByName: user.displayName,
      });
      setExpenseDescription("");
      setExpenseAmountText("");
      toast.success("Expense added");
      await onReload();
    } catch (error) {
      console.error(error);
      toast.error(
        error instanceof Error ? error.message : "Failed to add expense"
      );
    } finally {
      setSavingExpense(false);
    }
  };

  const handleDeleteExpense = async (id: string) => {
    setDeletingId(id);
    try {
      await deleteDailyExpense(id);
      toast.success("Expense removed");
      await onReload();
    } catch (error) {
      console.error(error);
      toast.error("Failed to remove expense");
    } finally {
      setDeletingId(null);
    }
  };

  const handleSaveCashAmounts = async () => {
    if (!branchId || !user) return;
    const opening = parseMoneyInput(openingCashText);
    if (openingCashText.trim() !== "" && (opening == null || opening < 0)) {
      toast.error("Enter a valid opening cash amount");
      return;
    }

    setSavingCashAmounts(true);
    try {
      await saveDailyCashAmounts({
        branchId,
        branchName,
        date,
        openingCash: opening ?? 0,
        createdBy: user.uid,
        createdByName: user.displayName,
      });
      toast.success("Opening cash saved");
      await onReload();
    } catch (error) {
      console.error(error);
      toast.error(
        error instanceof Error ? error.message : "Failed to save opening cash"
      );
    } finally {
      setSavingCashAmounts(false);
    }
  };

  const handleAddCash = async () => {
    if (!branchId || !user) return;
    const amount = parseMoneyInput(cashAddAmountText);
    if (!cashAddNote.trim()) {
      toast.error("Enter a note for this cash");
      return;
    }
    if (amount == null || amount <= 0) {
      toast.error("Enter a cash amount greater than 0");
      return;
    }

    setSavingCashAdd(true);
    try {
      await addDailyCashAdd({
        branchId,
        branchName,
        date,
        note: cashAddNote,
        amount,
        createdBy: user.uid,
        createdByName: user.displayName,
      });
      setCashAddNote("");
      setCashAddAmountText("");
      toast.success("Cash added");
      await onReload();
    } catch (error) {
      console.error(error);
      toast.error(
        error instanceof Error ? error.message : "Failed to add cash"
      );
    } finally {
      setSavingCashAdd(false);
    }
  };

  const handleDeleteCashAdd = async (addId: string) => {
    if (!branchId) return;
    setDeletingCashAddId(addId);
    try {
      await deleteDailyCashAdd({
        branchId,
        date,
        addId,
      });
      toast.success("Cash entry removed");
      await onReload();
    } catch (error) {
      console.error(error);
      toast.error("Failed to remove cash entry");
    } finally {
      setDeletingCashAddId(null);
    }
  };

  return (
    <>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          onClick={() => setExpenseDialogOpen(true)}
          disabled={!canAct}
        >
          <Plus className="size-4" />
          Set expenses
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => setCashDialogOpen(true)}
          disabled={!canAct}
        >
          <Plus className="size-4" />
          Set daily cash record
        </Button>
      </div>

      <Dialog open={expenseDialogOpen} onOpenChange={setExpenseDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Set expenses</DialogTitle>
            <DialogDescription>
              List and add costs for this branch and day.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <NamedAmountList
              items={expenses.map((expense) => ({
                id: expense.id,
                label: expense.description,
                amount: expense.amount,
              }))}
              emptyLabel="No expenses yet"
              deletingId={deletingId}
              amountClassName="text-muted-foreground"
              onDelete={(id) => void handleDeleteExpense(id)}
            />
            <div className="flex justify-end text-sm font-medium">
              Expenses total: {formatCurrency(summary.expensesTotal)}
            </div>
            <div className="grid gap-2 sm:grid-cols-[1fr_7rem]">
              <Input
                placeholder="Description (e.g. FUEL)"
                value={expenseDescription}
                onChange={(e) => setExpenseDescription(e.target.value)}
                disabled={savingExpense || !canAct}
              />
              <Input
                placeholder="0.00"
                inputMode="decimal"
                value={expenseAmountText}
                onChange={(e) =>
                  setMoneyText(e.target.value, setExpenseAmountText)
                }
                disabled={savingExpense || !canAct}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setExpenseDialogOpen(false)}
            >
              Close
            </Button>
            <Button
              type="button"
              onClick={() => void handleAddExpense()}
              disabled={savingExpense || !canAct}
            >
              {savingExpense ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Plus className="size-4" />
              )}
              Add
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={cashDialogOpen} onOpenChange={setCashDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Set daily cash record</DialogTitle>
            <DialogDescription>
              Set opening cash and add extra cash for this branch and day.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="opening-cash">Opening cash</Label>
                <Input
                  id="opening-cash"
                  inputMode="decimal"
                  placeholder="0.00"
                  className="tabular-nums"
                  value={openingCashText}
                  onChange={(e) =>
                    setMoneyText(e.target.value, onOpeningCashTextChange)
                  }
                  disabled={savingCashAmounts || !canAct}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Closing cash</Label>
                <div className="flex h-9 items-center rounded-lg border border-input bg-muted/40 px-2.5 text-sm font-medium tabular-nums">
                  {formatCurrency(summary.closingCash)}
                </div>
              </div>
            </div>
            <div className="flex justify-end">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void handleSaveCashAmounts()}
                disabled={savingCashAmounts || !canAct}
              >
                {savingCashAmounts ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : null}
                Save opening cash
              </Button>
            </div>
            <div className="space-y-2 border-t pt-4">
              <p className="text-sm font-medium">Cash added</p>
              <NamedAmountList
                items={(cashRecord?.additions ?? []).map((add) => ({
                  id: add.id,
                  label: add.note,
                  amount: add.amount,
                }))}
                emptyLabel="No extra cash yet"
                deletingId={deletingCashAddId}
                amountClassName="text-emerald-700"
                onDelete={(id) => void handleDeleteCashAdd(id)}
              />
              <div className="grid gap-2 sm:grid-cols-[1fr_7rem]">
                <Input
                  placeholder="Note (e.g. CHANGE FROM BANK)"
                  value={cashAddNote}
                  onChange={(e) => setCashAddNote(e.target.value)}
                  disabled={savingCashAdd || !canAct}
                />
                <Input
                  placeholder="0.00"
                  inputMode="decimal"
                  value={cashAddAmountText}
                  onChange={(e) =>
                    setMoneyText(e.target.value, setCashAddAmountText)
                  }
                  disabled={savingCashAdd || !canAct}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setCashDialogOpen(false)}
            >
              Close
            </Button>
            <Button
              type="button"
              onClick={() => void handleAddCash()}
              disabled={savingCashAdd || !canAct}
            >
              {savingCashAdd ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Plus className="size-4" />
              )}
              Add
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
