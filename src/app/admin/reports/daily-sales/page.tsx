"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
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
import { NamedAmountList } from "@/components/admin/daily-cash-controls";
import { useBranchAccess } from "@/hooks/use-branch-access";
import { formatDateInputLabel, shiftDateInput, toDateInputValue } from "@/lib/dates";
import {
  flattenDailySalesRows,
  sumDailyCashAdds,
  summarizeDailySalesReport,
} from "@/lib/daily-sales-report";
import { getBranches } from "@/lib/firestore/branches";
import { getDailyCashRecord } from "@/lib/firestore/daily-cash";
import { getDailyExpenses } from "@/lib/firestore/daily-expenses";
import { getPosSales } from "@/lib/firestore/pos-sales";
import { formatCurrency } from "@/lib/format";
import type { Branch, DailyCashRecord, DailyExpense, PosSale } from "@/types";

export default function DailySalesReportPage() {
  const { canViewAllBranches, assignedBranchId } = useBranchAccess();

  const [branches, setBranches] = useState<Branch[]>([]);
  const [selectedBranchId, setSelectedBranchId] = useState("");
  const [date, setDate] = useState(() => toDateInputValue());
  const [sales, setSales] = useState<PosSale[]>([]);
  const [expenses, setExpenses] = useState<DailyExpense[]>([]);
  const [cashRecord, setCashRecord] = useState<DailyCashRecord | null>(null);
  const [loading, setLoading] = useState(true);

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
  const openingCash = cashRecord?.openingCash ?? 0;
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
            . Expenses and daily cash are recorded by cashiers.
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
                {selectedBranch?.name ?? "â€”"}
              </div>
            </div>
          )}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          Loading reportâ€¦
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
                  Costs recorded by cashiers for this branch and day
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
                (sales minus bank transfer, home credit, Skyro, Salmon, and
                expenses).
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
                label="SK (Skyro)"
                value={`− ${formatCurrency(summary.skyroTotal)}`}
                muted
              />
              <SummaryRow
                label="SM (Salmon)"
                value={`− ${formatCurrency(summary.salmonTotal)}`}
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

