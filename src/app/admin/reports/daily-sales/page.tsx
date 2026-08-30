"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useBranchAccess } from "@/hooks/use-branch-access";
import { useAuthStore } from "@/stores/auth-store";
import { formatDateInputLabel, shiftDateInput, toDateInputValue } from "@/lib/dates";
import {
  flattenDailySalesRows,
  sumDailyCashAdds,
  summarizeDailySalesReport,
} from "@/lib/daily-sales-report";
import { getBranches } from "@/lib/firestore/branches";
import {
  addDailyCashAdd,
  deleteDailyCashAdd,
  getDailyCashRecord,
  saveDailyCashAmounts,
} from "@/lib/firestore/daily-cash";
import {
  addDailyExpense,
  deleteDailyExpense,
  getDailyExpenses,
} from "@/lib/firestore/daily-expenses";
import { getPosSales } from "@/lib/firestore/pos-sales";
import { formatCurrency } from "@/lib/format";
import { parseMoneyInput, moneyInputText } from "@/lib/pos-payments";
import type { Branch, DailyCashRecord, DailyExpense, PosSale } from "@/types";

export default function DailySalesReportPage() {
  const user = useAuthStore((s) => s.user);
  const { canViewAllBranches, assignedBranchId } = useBranchAccess();

  const [branches, setBranches] = useState<Branch[]>([]);
  const [selectedBranchId, setSelectedBranchId] = useState("");
  const [date, setDate] = useState(() => toDateInputValue());
  const [sales, setSales] = useState<PosSale[]>([]);
  const [expenses, setExpenses] = useState<DailyExpense[]>([]);
  const [cashRecord, setCashRecord] = useState<DailyCashRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingExpense, setSavingExpense] = useState(false);
  const [savingCashAmounts, setSavingCashAmounts] = useState(false);
  const [savingCashAdd, setSavingCashAdd] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deletingCashAddId, setDeletingCashAddId] = useState<string | null>(
    null
  );

  const [expenseDescription, setExpenseDescription] = useState("");
  const [expenseAmountText, setExpenseAmountText] = useState("");
  const [openingCashText, setOpeningCashText] = useState("");
  const [cashAddNote, setCashAddNote] = useState("");
  const [cashAddAmountText, setCashAddAmountText] = useState("");
  const [expenseDialogOpen, setExpenseDialogOpen] = useState(false);
  const [cashDialogOpen, setCashDialogOpen] = useState(false);

  useEffect(() => {
    getBranches(true)
      .then((list) => {
        setBranches(list);
        setSelectedBranchId((prev) => {
          if (prev) return prev;
          if (assignedBranchId && list.some((b) => b.id === assignedBranchId)) {
            return assignedBranchId;
          }
          return list[0]?.id ?? "";
        });
      })
      .catch(console.error);
  }, [assignedBranchId]);

  useEffect(() => {
    if (!canViewAllBranches && assignedBranchId) {
      setSelectedBranchId(assignedBranchId);
    }
  }, [canViewAllBranches, assignedBranchId]);

  const scopeBranchId = canViewAllBranches
    ? selectedBranchId || null
    : assignedBranchId;

  const selectedBranch = useMemo(
    () => branches.find((b) => b.id === scopeBranchId) ?? null,
    [branches, scopeBranchId]
  );

  const load = useCallback(async () => {
    if (!scopeBranchId) {
      setSales([]);
      setExpenses([]);
      setCashRecord(null);
      setOpeningCashText("");
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const [saleRows, expenseRows, cashRow] = await Promise.all([
        getPosSales({
          branchId: scopeBranchId,
          fromDate: date,
          toDate: date,
          max: 2000,
        }),
        getDailyExpenses({ branchId: scopeBranchId, date }),
        getDailyCashRecord(scopeBranchId, date),
      ]);
      setSales(saleRows);
      setExpenses(expenseRows);
      setCashRecord(cashRow);
      setOpeningCashText(cashRow ? moneyInputText(cashRow.openingCash) : "");
    } catch (error) {
      console.error(error);
      toast.error("Failed to load daily sales report");
    } finally {
      setLoading(false);
    }
  }, [scopeBranchId, date]);

  useEffect(() => {
    void load();
  }, [load]);

  const rows = useMemo(() => flattenDailySalesRows(sales), [sales]);
  const openingCash = parseMoneyInput(openingCashText) ?? 0;
  const cashAddsTotal = sumDailyCashAdds(cashRecord?.additions ?? []);
  const summary = useMemo(
    () =>
      summarizeDailySalesReport({
        sales,
        expenses,
        openingCash,
        cashAddsTotal,
      }),
    [sales, expenses, openingCash, cashAddsTotal]
  );

  const handleAddExpense = async () => {
    if (!scopeBranchId || !selectedBranch || !user) return;
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
        branchId: scopeBranchId,
        branchName: selectedBranch.name,
        date,
        description: expenseDescription,
        amount,
        createdBy: user.uid,
        createdByName: user.displayName,
      });
      setExpenseDescription("");
      setExpenseAmountText("");
      toast.success("Expense added");
      await load();
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
      await load();
    } catch (error) {
      console.error(error);
      toast.error("Failed to remove expense");
    } finally {
      setDeletingId(null);
    }
  };

  const handleSaveCashAmounts = async () => {
    if (!scopeBranchId || !selectedBranch || !user) return;
    const opening = parseMoneyInput(openingCashText);
    if (openingCashText.trim() !== "" && (opening == null || opening < 0)) {
      toast.error("Enter a valid opening cash amount");
      return;
    }

    setSavingCashAmounts(true);
    try {
      await saveDailyCashAmounts({
        branchId: scopeBranchId,
        branchName: selectedBranch.name,
        date,
        openingCash: opening ?? 0,
        createdBy: user.uid,
        createdByName: user.displayName,
      });
      toast.success("Opening cash saved");
      await load();
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
    if (!scopeBranchId || !selectedBranch || !user) return;
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
        branchId: scopeBranchId,
        branchName: selectedBranch.name,
        date,
        note: cashAddNote,
        amount,
        createdBy: user.uid,
        createdByName: user.displayName,
      });
      setCashAddNote("");
      setCashAddAmountText("");
      toast.success("Cash added");
      await load();
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
    if (!scopeBranchId) return;
    setDeletingCashAddId(addId);
    try {
      await deleteDailyCashAdd({
        branchId: scopeBranchId,
        date,
        addId,
      });
      toast.success("Cash entry removed");
      await load();
    } catch (error) {
      console.error(error);
      toast.error("Failed to remove cash entry");
    } finally {
      setDeletingCashAddId(null);
    }
  };

  if (!canViewAllBranches && !assignedBranchId) {
    return (
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">
          Daily sales report
        </h1>
        <p className="text-sm text-muted-foreground">
          Your account is not assigned to a branch.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Daily sales report
          </h1>
          <p className="text-sm text-muted-foreground">
            {formatDateInputLabel(date)}
            {selectedBranch ? ` · ${selectedBranch.name}` : null}
          </p>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
          <div className="flex min-w-0 flex-col gap-2">
            <Label htmlFor="daily-sales-date">Date</Label>
            <div className="flex items-center gap-1">
              <Button
                type="button"
                variant="outline"
                size="icon"
                aria-label="Previous date"
                onClick={() => setDate(shiftDateInput(date, -1))}
              >
                <ChevronLeft />
              </Button>
              <Input
                id="daily-sales-date"
                type="date"
                value={date}
                max={toDateInputValue()}
                onChange={(e) => setDate(e.target.value || date)}
                className="h-8 w-full sm:w-44"
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                aria-label="Next date"
                disabled={date >= toDateInputValue()}
                onClick={() => setDate(shiftDateInput(date, 1))}
              >
                <ChevronRight />
              </Button>
            </div>
          </div>
          {canViewAllBranches ? (
            <div className="flex min-w-0 flex-col gap-2">
              <Label>Branch</Label>
              <Select
                value={selectedBranchId}
                onValueChange={(value) => {
                  if (value) setSelectedBranchId(value);
                }}
              >
                <SelectTrigger size="sm" className="w-full sm:w-56">
                  <SelectValue placeholder="Select branch">
                    {(value) => {
                      if (!value) return null;
                      const branch = branches.find((b) => b.id === value);
                      return branch?.name ?? null;
                    }}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {branches.map((branch) => (
                    <SelectItem key={branch.id} value={branch.id}>
                      {branch.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : (
            <div className="flex min-w-0 flex-col gap-2">
              <Label>Branch</Label>
              <div className="flex h-8 w-full items-center rounded-lg border border-input px-2.5 text-sm sm:w-56">
                {selectedBranch?.name ?? "—"}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          onClick={() => setExpenseDialogOpen(true)}
          disabled={!scopeBranchId}
        >
          <Plus className="size-4" />
          Set expenses
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => setCashDialogOpen(true)}
          disabled={!scopeBranchId}
        >
          <Plus className="size-4" />
          Set daily cash record
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          Loading report…
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
          <div className="space-y-6">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Sales</CardTitle>
                <CardDescription>
                  Itemized sales for the selected day
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="overflow-x-auto rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[7.5rem]">Amount</TableHead>
                        <TableHead>Item</TableHead>
                        <TableHead className="w-[11rem]">Notes</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rows.length === 0 ? (
                        <TableRow>
                          <TableCell
                            colSpan={3}
                            className="py-8 text-center text-muted-foreground"
                          >
                            No sales for this day
                          </TableCell>
                        </TableRow>
                      ) : (
                        rows.map((row) => (
                          <TableRow key={row.key}>
                            <TableCell className="tabular-nums font-medium">
                              {formatCurrency(row.amount)}
                            </TableCell>
                            <TableCell>{row.itemLabel}</TableCell>
                            <TableCell>
                              {row.paymentNote ? (
                                <Badge
                                  variant="outline"
                                  className="border-red-200 text-red-700"
                                >
                                  {row.paymentNote}
                                </Badge>
                              ) : null}
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
                <div className="flex justify-end text-sm font-semibold text-red-700">
                  TOTAL SALES: {formatCurrency(summary.totalSales)}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base text-red-700">
                  Expenses
                </CardTitle>
                <CardDescription>
                  Costs for this branch and day (saved)
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <NamedAmountList
                  items={expenses.map((expense) => ({
                    id: expense.id,
                    label: expense.description,
                    amount: expense.amount,
                  }))}
                  emptyLabel="No expenses yet"
                  amountClassName="text-muted-foreground"
                />
                <div className="flex justify-end text-sm font-medium">
                  Expenses total: {formatCurrency(summary.expensesTotal)}
                </div>
              </CardContent>
            </Card>
          </div>

          <Card className="h-fit">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Cash summary</CardTitle>
              <CardDescription>
                Closing cash is opening + added cash + net cash from the day
                (sales minus bank transfer, home credit, and expenses).
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <SummaryRow
                label="TOTAL SALES"
                value={formatCurrency(summary.totalSales)}
              />
              <SummaryRow
                label="BT (Bank transfer)"
                value={`− ${formatCurrency(summary.bankTransferTotal)}`}
                muted
              />
              <SummaryRow
                label="HC (Home Credit)"
                value={`− ${formatCurrency(summary.homeCreditTotal)}`}
                muted
              />
              <SummaryRow
                label="EX (Expenses)"
                value={`− ${formatCurrency(summary.expensesTotal)}`}
                muted
              />
              <div className="border-t pt-3">
                <SummaryRow
                  label="Net cash from day"
                  value={formatCurrency(summary.netCashFromDay)}
                  strong
                />
              </div>
              <SummaryRow
                label="+ Opening cash"
                value={formatCurrency(summary.openingCash)}
              />
              <SummaryRow
                label="+ Cash added"
                value={formatCurrency(summary.cashAddsTotal)}
              />
              <div className="rounded-md bg-muted/50 px-3 py-3">
                <SummaryRow
                  label="Closing cash"
                  value={formatCurrency(summary.closingCash)}
                  strong
                />
              </div>
            </CardContent>
          </Card>
        </div>
      )}

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
            <ExpenseFields
              description={expenseDescription}
              amountText={expenseAmountText}
              disabled={savingExpense || !scopeBranchId}
              onDescriptionChange={setExpenseDescription}
              onAmountChange={setExpenseAmountText}
            />
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
              disabled={savingExpense || !scopeBranchId}
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
                    setMoneyText(e.target.value, setOpeningCashText)
                  }
                  disabled={savingCashAmounts || !scopeBranchId}
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
                disabled={savingCashAmounts || !scopeBranchId}
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
              <CashAddFields
                note={cashAddNote}
                amountText={cashAddAmountText}
                disabled={savingCashAdd || !scopeBranchId}
                onNoteChange={setCashAddNote}
                onAmountChange={setCashAddAmountText}
              />
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
              disabled={savingCashAdd || !scopeBranchId}
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
    </div>
  );
}

function SummaryRow({
  label,
  value,
  muted,
  strong,
}: {
  label: string;
  value: string;
  muted?: boolean;
  strong?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span
        className={
          muted
            ? "text-muted-foreground"
            : strong
              ? "font-semibold"
              : "font-medium"
        }
      >
        {label}
      </span>
      <span
        className={
          strong
            ? "tabular-nums text-base font-semibold"
            : "tabular-nums font-medium"
        }
      >
        {value}
      </span>
    </div>
  );
}

function setMoneyText(raw: string, setValue: (value: string) => void) {
  if (raw !== "" && !/^\d*\.?\d*$/.test(raw)) return;
  setValue(raw);
}

function NamedAmountList({
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

function ExpenseFields({
  description,
  amountText,
  disabled,
  onDescriptionChange,
  onAmountChange,
}: {
  description: string;
  amountText: string;
  disabled: boolean;
  onDescriptionChange: (value: string) => void;
  onAmountChange: (value: string) => void;
}) {
  return (
    <div className="grid gap-2 sm:grid-cols-[1fr_7rem]">
      <Input
        placeholder="Description (e.g. FUEL)"
        value={description}
        onChange={(e) => onDescriptionChange(e.target.value)}
        disabled={disabled}
      />
      <Input
        placeholder="0.00"
        inputMode="decimal"
        value={amountText}
        onChange={(e) => setMoneyText(e.target.value, onAmountChange)}
        disabled={disabled}
      />
    </div>
  );
}

function CashAddFields({
  note,
  amountText,
  disabled,
  onNoteChange,
  onAmountChange,
}: {
  note: string;
  amountText: string;
  disabled: boolean;
  onNoteChange: (value: string) => void;
  onAmountChange: (value: string) => void;
}) {
  return (
    <div className="grid gap-2 sm:grid-cols-[1fr_7rem]">
      <Input
        placeholder="Note (e.g. CHANGE FROM BANK)"
        value={note}
        onChange={(e) => onNoteChange(e.target.value)}
        disabled={disabled}
      />
      <Input
        placeholder="0.00"
        inputMode="decimal"
        value={amountText}
        onChange={(e) => setMoneyText(e.target.value, onAmountChange)}
        disabled={disabled}
      />
    </div>
  );
}
