"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { toast } from "sonner";
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
import { CashSummaryCard } from "@/components/admin/cash-summary-card";
import {
  DailyCashExpenseControls,
  NamedAmountList,
} from "@/components/admin/daily-cash-controls";
import { useBranchAccess } from "@/hooks/use-branch-access";
import { usePaymentMethods } from "@/hooks/use-payment-methods";
import {
  formatDateInputLabel,
  shiftDateInput,
  toDateInputValue,
} from "@/lib/dates";
import {
  sumDailyCashAdds,
  summarizeDailySalesReport,
} from "@/lib/daily-sales-report";
import { getBranch, getBranches } from "@/lib/firestore/branches";
import { getDailyCashRecord } from "@/lib/firestore/daily-cash";
import { getDailyExpenses } from "@/lib/firestore/daily-expenses";
import { getPosSales } from "@/lib/firestore/pos-sales";
import { formatCurrency } from "@/lib/format";
import type { Branch, DailyCashRecord, DailyExpense, PosSale } from "@/types";

/**
 * Daily cash / expenses for one branch day.
 * Cashiers are locked to their assigned branch; admins can pick any branch.
 */
export function DailyCashWorkspace({
  lockToAssignedBranch = false,
}: {
  lockToAssignedBranch?: boolean;
}) {
  const { assignedBranchId, canViewAllBranches } = useBranchAccess();
  const { methods: paymentMethods } = usePaymentMethods();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [selectedBranchId, setSelectedBranchId] = useState("");
  const [branch, setBranch] = useState<Branch | null>(null);
  const [date, setDate] = useState(() => toDateInputValue());
  const [sales, setSales] = useState<PosSale[]>([]);
  const [expenses, setExpenses] = useState<DailyExpense[]>([]);
  const [cashRecord, setCashRecord] = useState<DailyCashRecord | null>(null);
  const [loading, setLoading] = useState(true);

  const canPickBranch = !lockToAssignedBranch && canViewAllBranches;
  const activeBranchId = lockToAssignedBranch
    ? assignedBranchId ?? ""
    : canPickBranch
      ? selectedBranchId
      : assignedBranchId ?? selectedBranchId;

  useEffect(() => {
    if (lockToAssignedBranch) return;
    getBranches(true)
      .then((rows) => {
        setBranches(rows);
        setSelectedBranchId((prev) => {
          if (prev && rows.some((b) => b.id === prev)) return prev;
          if (assignedBranchId && rows.some((b) => b.id === assignedBranchId)) {
            return assignedBranchId;
          }
          return rows[0]?.id ?? "";
        });
      })
      .catch(console.error);
  }, [lockToAssignedBranch, assignedBranchId]);

  useEffect(() => {
    if (!activeBranchId) {
      setBranch(null);
      return;
    }
    const cached = branches.find((b) => b.id === activeBranchId);
    if (cached) {
      setBranch(cached);
      return;
    }
    getBranch(activeBranchId)
      .then(setBranch)
      .catch(console.error);
  }, [activeBranchId, branches]);

  const load = useCallback(async () => {
    if (!activeBranchId) {
      setSales([]);
      setExpenses([]);
      setCashRecord(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const [saleRows, expenseRows, cashRow] = await Promise.all([
        getPosSales({
          branchId: activeBranchId,
          fromDate: date,
          toDate: date,
          max: 2000,
        }),
        getDailyExpenses({ branchId: activeBranchId, date }),
        getDailyCashRecord(activeBranchId, date),
      ]);
      setSales(saleRows);
      setExpenses(expenseRows);
      setCashRecord(cashRow);
    } catch (error) {
      console.error(error);
      toast.error("Failed to load daily cash");
    } finally {
      setLoading(false);
    }
  }, [activeBranchId, date]);

  useEffect(() => {
    void load();
  }, [load]);

  const cashAddsTotal = sumDailyCashAdds(cashRecord?.additions ?? []);
  const cashAdditions = cashRecord?.additions ?? [];
  const summary = useMemo(
    () =>
      summarizeDailySalesReport({
        sales,
        expenses,
        cashAddsTotal,
        paymentMethods,
      }),
    [sales, expenses, cashAddsTotal, paymentMethods]
  );

  if (lockToAssignedBranch && !assignedBranchId) {
    return (
      <p className="text-sm text-muted-foreground">
        Your account needs a branch assignment.
      </p>
    );
  }

  if (!lockToAssignedBranch && !canViewAllBranches && !assignedBranchId) {
    return (
      <p className="text-sm text-muted-foreground">
        Your account is not assigned to a branch.
      </p>
    );
  }

  const canAct = Boolean(activeBranchId);

  return (
    <div className="w-full space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight lg:text-3xl">
            Daily cash
          </h1>
          <p className="text-sm text-muted-foreground">
            {formatDateInputLabel(date)}
            {branch ? ` · ${branch.name}` : null}
            . Record expenses and cash added for the day.
          </p>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
          <div className="flex min-w-0 flex-col gap-2">
            <Label htmlFor="daily-cash-date">Date</Label>
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
                id="daily-cash-date"
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

          {canPickBranch ? (
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
                      return branches.find((b) => b.id === value)?.name ?? null;
                    }}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {branches.map((row) => (
                    <SelectItem key={row.id} value={row.id}>
                      {row.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : (
            <div className="flex min-w-0 flex-col gap-2">
              <Label>Branch</Label>
              <div className="flex h-8 w-full items-center rounded-lg border border-input px-2.5 text-sm sm:w-56">
                {branch?.name ?? "—"}
              </div>
            </div>
          )}

          {canAct ? (
            <div className="sm:self-end">
              <DailyCashExpenseControls
                branchId={activeBranchId}
                branchName={branch?.name ?? ""}
                date={date}
                expenses={expenses}
                cashRecord={cashRecord}
                summary={summary}
                onReload={load}
              />
            </div>
          ) : null}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          Loading…
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem] xl:grid-cols-[minmax(0,1fr)_26rem] lg:items-start">
          <div className="grid min-w-0 gap-4 md:grid-cols-2">
            <Card className="min-w-0">
              <CardHeader className="pb-3">
                <CardTitle className="text-base text-red-700">
                  Expenses
                </CardTitle>
                <CardDescription>
                  Costs for this branch and day
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
                  className="max-h-72 lg:max-h-[28rem]"
                />
                <div className="flex justify-end border-t pt-3 text-sm font-medium">
                  Expenses total: {formatCurrency(summary.expensesTotal)}
                </div>
              </CardContent>
            </Card>

            <Card className="min-w-0">
              <CardHeader className="pb-3">
                <CardTitle className="text-base text-emerald-700">
                  Cash added
                </CardTitle>
                <CardDescription>
                  Extra cash put in the till for this day
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <NamedAmountList
                  items={cashAdditions.map((add) => ({
                    id: add.id,
                    label: add.note,
                    amount: add.amount,
                  }))}
                  emptyLabel="No extra cash yet"
                  amountClassName="text-emerald-700"
                  className="max-h-72 lg:max-h-[28rem]"
                />
                <div className="flex justify-end border-t pt-3 text-sm font-medium">
                  Cash added total: {formatCurrency(summary.cashAddsTotal)}
                </div>
              </CardContent>
            </Card>
          </div>

          <CashSummaryCard
            className="min-w-0 lg:sticky lg:top-4"
            summary={summary}
            branchName={branch?.name}
          />
        </div>
      )}
    </div>
  );
}
