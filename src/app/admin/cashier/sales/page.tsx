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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { CashSummaryCard } from "@/components/admin/cash-summary-card";
import { SaleInvoiceButton } from "@/components/admin/sale-invoice-dialog";
import { TablePagination } from "@/components/admin/table-pagination";
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
import { getBranch } from "@/lib/firestore/branches";
import { getDailyCashRecord } from "@/lib/firestore/daily-cash";
import { getDailyExpenses } from "@/lib/firestore/daily-expenses";
import { getPosSales } from "@/lib/firestore/pos-sales";
import { formatCurrency, formatDate } from "@/lib/format";
import { paginateItems } from "@/lib/pagination";
import {
  isNonRevenueCustomerType,
  posCustomerTypeLabel,
} from "@/lib/pos-customer-type";
import type { Branch, DailyCashRecord, DailyExpense, PosSale } from "@/types";

export default function CashierSalesPage() {
  const { assignedBranchId } = useBranchAccess();
  const { methods: paymentMethods } = usePaymentMethods();
  const [date, setDate] = useState(() => toDateInputValue());
  const [branch, setBranch] = useState<Branch | null>(null);
  const [sales, setSales] = useState<PosSale[]>([]);
  const [expenses, setExpenses] = useState<DailyExpense[]>([]);
  const [cashRecord, setCashRecord] = useState<DailyCashRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);

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
      toast.error("Failed to load sales");
    } finally {
      setLoading(false);
    }
  }, [assignedBranchId, date]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setPage(1);
  }, [date]);

  const cashAddsTotal = sumDailyCashAdds(cashRecord?.additions ?? []);
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

  const {
    page: safePage,
    totalPages,
    pagedItems,
    total,
  } = useMemo(() => paginateItems(sales, page), [sales, page]);

  useEffect(() => {
    if (page !== safePage) setPage(safePage);
  }, [page, safePage]);

  if (!assignedBranchId) {
    return (
      <p className="text-muted-foreground">
        Your account needs a branch assignment.
      </p>
    );
  }

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Sales history</h1>
        <p className="text-muted-foreground">
          Shop and wholesale receipts for your branch till ·{" "}
          {formatDateInputLabel(date)}
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="cashier-sales-date">Date</Label>
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
            id="cashier-sales-date"
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

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          Loading…
        </div>
      ) : (
        <CashSummaryCard
          summary={summary}
          branchName={
            branch?.name || cashRecord?.branchName || sales[0]?.branchName
          }
        />
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Receipts</CardTitle>
          <CardDescription>
            {total} receipt{total === 1 ? "" : "s"} · {formatDateInputLabel(date)}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-10">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : sales.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No receipts on this day.
            </p>
          ) : (
            <>
              <ul className="space-y-3 md:hidden">
                {pagedItems.map((sale) => (
                  <li key={sale.id} className="rounded-lg border px-3 py-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 space-y-1">
                        <p className="text-sm font-medium">
                          {formatDate(sale.createdAt)}
                        </p>
                        <div className="flex flex-wrap items-center gap-1.5">
                          {sale.saleChannel === "wholesale" ? (
                            <Badge variant="outline" className="text-[10px]">
                              Wholesale
                            </Badge>
                          ) : (
                            <Badge variant="secondary" className="text-[10px]">
                              Shop
                            </Badge>
                          )}
                          <p className="text-xs text-muted-foreground">
                            {sale.createdByName ?? "Staff"} · {sale.itemCount}{" "}
                            item{sale.itemCount === 1 ? "" : "s"}
                          </p>
                        </div>
                        <p className="line-clamp-2 text-xs text-muted-foreground">
                          {sale.items
                            .slice(0, 3)
                            .map((item) => item.productName)
                            .join(", ")}
                          {sale.items.length > 3 ? "…" : ""}
                        </p>
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-2">
                        <p className="font-semibold tabular-nums">
                          {isNonRevenueCustomerType(sale.customerType)
                            ? "—"
                            : formatCurrency(sale.total)}
                        </p>
                        {isNonRevenueCustomerType(sale.customerType) ? (
                          <Badge variant="outline" className="text-[10px]">
                            {posCustomerTypeLabel(sale.customerType)}
                          </Badge>
                        ) : null}
                        <SaleInvoiceButton sale={sale} />
                      </div>
                    </div>
                  </li>
                ))}
              </ul>

              <div className="hidden overflow-x-auto rounded-md border md:block">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>When</TableHead>
                      <TableHead>Channel</TableHead>
                      <TableHead>Staff</TableHead>
                      <TableHead>Items</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                      <TableHead className="w-12 text-right">
                        <span className="sr-only">Actions</span>
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pagedItems.map((sale) => (
                      <TableRow key={sale.id}>
                        <TableCell className="whitespace-nowrap text-sm">
                          {formatDate(sale.createdAt)}
                        </TableCell>
                        <TableCell>
                          {sale.saleChannel === "wholesale" ? (
                            <Badge variant="outline" className="text-xs">
                              Wholesale
                            </Badge>
                          ) : (
                            <span className="text-sm text-muted-foreground">
                              Shop
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {sale.createdByName ?? "Staff"}
                        </TableCell>
                        <TableCell className="text-sm">
                          <span className="tabular-nums">{sale.itemCount}</span>
                          <span className="text-muted-foreground">
                            {" "}
                            ·{" "}
                            {sale.items
                              .slice(0, 2)
                              .map((item) => item.productName)
                              .join(", ")}
                            {sale.items.length > 2 ? "…" : ""}
                          </span>
                        </TableCell>
                        <TableCell className="text-right">
                          {isNonRevenueCustomerType(sale.customerType) ? (
                            <div className="flex flex-col items-end gap-1">
                              <span className="tabular-nums text-muted-foreground">
                                —
                              </span>
                              <Badge variant="outline" className="text-xs">
                                {posCustomerTypeLabel(sale.customerType)}
                              </Badge>
                            </div>
                          ) : (
                            <span className="font-medium tabular-nums">
                              {formatCurrency(sale.total)}
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <SaleInvoiceButton sale={sale} />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              <TablePagination
                page={safePage}
                totalPages={totalPages}
                total={total}
                onPageChange={setPage}
                className="mt-4"
              />
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
