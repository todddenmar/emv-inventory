"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, Plus, Trash2 } from "lucide-react";
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
import { formatDateInputLabel, toDateInputValue } from "@/lib/dates";
import {
  flattenDailySalesRows,
  summarizeDailySalesReport,
} from "@/lib/daily-sales-report";
import { getBranches } from "@/lib/firestore/branches";
import {
  addDailyExpense,
  deleteDailyExpense,
  getDailyExpenses,
} from "@/lib/firestore/daily-expenses";
import { getPosSales } from "@/lib/firestore/pos-sales";
import { formatCurrency } from "@/lib/format";
import { parseMoneyInput } from "@/lib/pos-payments";
import type { Branch, DailyExpense, PosSale } from "@/types";

export default function DailySalesReportPage() {
  const user = useAuthStore((s) => s.user);
  const { canViewAllBranches, assignedBranchId } = useBranchAccess();

  const [branches, setBranches] = useState<Branch[]>([]);
  const [selectedBranchId, setSelectedBranchId] = useState("");
  const [date, setDate] = useState(() => toDateInputValue());
  const [sales, setSales] = useState<PosSale[]>([]);
  const [expenses, setExpenses] = useState<DailyExpense[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingExpense, setSavingExpense] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const [expenseDescription, setExpenseDescription] = useState("");
  const [expenseAmountText, setExpenseAmountText] = useState("");
  const [priorCashText, setPriorCashText] = useState("");

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
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const [saleRows, expenseRows] = await Promise.all([
        getPosSales({
          branchId: scopeBranchId,
          fromDate: date,
          toDate: date,
          max: 2000,
        }),
        getDailyExpenses({ branchId: scopeBranchId, date }),
      ]);
      setSales(saleRows);
      setExpenses(expenseRows);
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
  const priorCash = parseMoneyInput(priorCashText) ?? 0;
  const summary = useMemo(
    () =>
      summarizeDailySalesReport({
        sales,
        expenses,
        priorCash,
      }),
    [sales, expenses, priorCash]
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

        <div className="grid grid-cols-2 items-end gap-3 sm:flex sm:flex-wrap">
          <div className="space-y-1.5">
            <Label htmlFor="daily-sales-date">Date</Label>
            <Input
              id="daily-sales-date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="h-9 w-full sm:w-[11.5rem]"
            />
          </div>
          {canViewAllBranches ? (
            <div className="space-y-1.5">
              <Label>Branch</Label>
              <Select
                value={selectedBranchId}
                onValueChange={(value) => {
                  if (value) setSelectedBranchId(value);
                }}
              >
                <SelectTrigger className="h-9 w-full sm:w-[14rem]">
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
            <div className="space-y-1.5">
              <Label>Branch</Label>
              <div className="flex h-9 w-full items-center rounded-lg border border-input px-2.5 text-sm sm:w-[14rem]">
                {selectedBranch?.name ?? "—"}
              </div>
            </div>
          )}
        </div>
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
                <ul className="space-y-2">
                  {expenses.length === 0 ? (
                    <li className="text-sm text-muted-foreground">
                      No expenses yet
                    </li>
                  ) : (
                    expenses.map((expense) => (
                      <li
                        key={expense.id}
                        className="flex items-center justify-between gap-3 rounded-md border px-3 py-2 text-sm"
                      >
                        <div className="min-w-0">
                          <p className="truncate font-medium uppercase tracking-wide">
                            {expense.description}
                          </p>
                          <p className="tabular-nums text-muted-foreground">
                            {formatCurrency(expense.amount)}
                          </p>
                        </div>
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          className="shrink-0"
                          disabled={deletingId === expense.id}
                          onClick={() => void handleDeleteExpense(expense.id)}
                          aria-label={`Delete ${expense.description}`}
                        >
                          {deletingId === expense.id ? (
                            <Loader2 className="size-4 animate-spin" />
                          ) : (
                            <Trash2 className="size-4" />
                          )}
                        </Button>
                      </li>
                    ))
                  )}
                </ul>

                <div className="grid gap-2 sm:grid-cols-[1fr_7rem_auto]">
                  <Input
                    placeholder="Description (e.g. FUEL)"
                    value={expenseDescription}
                    onChange={(e) => setExpenseDescription(e.target.value)}
                    disabled={savingExpense || !scopeBranchId}
                  />
                  <Input
                    placeholder="0.00"
                    inputMode="decimal"
                    value={expenseAmountText}
                    onChange={(e) => {
                      const raw = e.target.value;
                      if (raw !== "" && !/^\d*\.?\d*$/.test(raw)) return;
                      setExpenseAmountText(raw);
                    }}
                    disabled={savingExpense || !scopeBranchId}
                  />
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
                </div>

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
                Prior cash is for this view only and is not saved
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
              <div className="flex items-center justify-between gap-3 border-t pt-3">
                <Label htmlFor="prior-cash" className="shrink-0 font-medium">
                  + Prior cash
                </Label>
                <Input
                  id="prior-cash"
                  className="max-w-[10rem] text-right tabular-nums"
                  inputMode="decimal"
                  placeholder="0.00"
                  value={priorCashText}
                  onChange={(e) => {
                    const raw = e.target.value;
                    if (raw !== "" && !/^\d*\.?\d*$/.test(raw)) return;
                    setPriorCashText(raw);
                  }}
                />
              </div>
              <div className="rounded-md bg-muted/50 px-3 py-3">
                <SummaryRow
                  label="Cash on hand"
                  value={formatCurrency(summary.cashOnHand)}
                  strong
                />
              </div>
            </CardContent>
          </Card>
        </div>
      )}
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
