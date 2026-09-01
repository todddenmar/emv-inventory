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
import { CashSummaryCard } from "@/components/admin/cash-summary-card";
import {
  DailyCashExpenseControls,
  NamedAmountList,
} from "@/components/admin/daily-cash-controls";
import { useBranchAccess } from "@/hooks/use-branch-access";
import {
  formatDateInputLabel,
  shiftDateInput,
  toDateInputValue,
} from "@/lib/dates";
import {
  sumDailyCashAdds,
  summarizeDailySalesReport,
} from "@/lib/daily-sales-report";
import { getBranch } from "@/lib/firestore/branches";
import { getDailyCashRecord } from "@/lib/firestore/daily-cash";
import { getDailyExpenses } from "@/lib/firestore/daily-expenses";
import { getPosSales } from "@/lib/firestore/pos-sales";
import { formatCurrency } from "@/lib/format";
import type { Branch, DailyCashRecord, DailyExpense, PosSale } from "@/types";

export default function CashierDailyCashPage() {
  const { assignedBranchId } = useBranchAccess();
  const [branch, setBranch] = useState<Branch | null>(null);
  const [date, setDate] = useState(() => toDateInputValue());
  const [sales, setSales] = useState<PosSale[]>([]);
  const [expenses, setExpenses] = useState<DailyExpense[]>([]);
  const [cashRecord, setCashRecord] = useState<DailyCashRecord | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!assignedBranchId) {
      setBranch(null);
      return;
    }
    getBranch(assignedBranchId)
      .then(setBranch)
      .catch(console.error);
  }, [assignedBranchId]);

  const load = useCallback(async () => {
    if (!assignedBranchId) {
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
          branchId: assignedBranchId,
          fromDate: date,
          toDate: date,
          max: 2000,
        }),
        getDailyExpenses({ branchId: assignedBranchId, date }),
        getDailyCashRecord(assignedBranchId, date),
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
  }, [assignedBranchId, date]);

  useEffect(() => {
    void load();
  }, [load]);

  const cashAddsTotal = sumDailyCashAdds(cashRecord?.additions ?? []);
  const summary = useMemo(
    () =>
      summarizeDailySalesReport({
        sales,
        expenses,
        cashAddsTotal,
      }),
    [sales, expenses, cashAddsTotal]
  );

  if (!assignedBranchId) {
    return (
      <p className="text-sm text-muted-foreground">
        Your account needs a branch assignment.
      </p>
    );
  }

  return (
    <div className="mx-auto w-full max-w-lg space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Daily cash</h1>
        <p className="text-sm text-muted-foreground">
          {formatDateInputLabel(date)}
          {branch ? ` · ${branch.name}` : null}
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="cashier-cash-date">Date</Label>
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
            id="cashier-cash-date"
            type="date"
            value={date}
            max={toDateInputValue()}
            onChange={(e) => setDate(e.target.value || date)}
            className="h-8 flex-1"
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

      <DailyCashExpenseControls
        branchId={assignedBranchId}
        branchName={branch?.name ?? ""}
        date={date}
        expenses={expenses}
        cashRecord={cashRecord}
        summary={summary}
        onReload={load}
      />

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          Loading…
        </div>
      ) : (
        <>
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base text-red-700">Expenses</CardTitle>
              <CardDescription>Costs for this branch and day</CardDescription>
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

          <CashSummaryCard summary={summary} />
        </>
      )}
    </div>
  );
}
