"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  ChevronLeft,
  ChevronRight,
  Loader2,
  MoreHorizontal,
  ShoppingCart,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { LinkButton } from "@/components/ui/link-button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { ArchiveSaleDialog } from "@/components/admin/archive-sale-dialog";
import { NamedAmountList } from "@/components/admin/daily-cash-controls";
import { CashSummaryCard } from "@/components/admin/cash-summary-card";
import { EditSalePaymentDialog } from "@/components/admin/edit-sale-payment-dialog";
import { SaleInvoiceDialog } from "@/components/admin/sale-invoice-dialog";
import { useBranchAccess } from "@/hooks/use-branch-access";
import { usePaymentMethods } from "@/hooks/use-payment-methods";
import {
  formatDateInputLabel,
  isDateInputValue,
  shiftDateInput,
  toDateInputValue,
} from "@/lib/dates";
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
import { saleAmountDue } from "@/lib/pos-payments";
import { lockedPosPath } from "@/lib/pos-sale-lock";
import type {
  Branch,
  DailyCashRecord,
  DailyExpense,
  PosSale,
  PosSaleChannel,
} from "@/types";

function DailyChannelReportInner({
  saleChannel,
}: {
  saleChannel: PosSaleChannel;
}) {
  const isWholesale = saleChannel === "wholesale";
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { canViewAllBranches, assignedBranchId, isElevatedAdmin } =
    useBranchAccess();
  const { methods: paymentMethods } = usePaymentMethods();

  const [branches, setBranches] = useState<Branch[]>([]);
  const [selectedBranchId, setSelectedBranchId] = useState(
    () => searchParams.get("branch")?.trim() ?? ""
  );
  const [date, setDate] = useState(() => {
    const urlDate = searchParams.get("date");
    const today = toDateInputValue();
    if (isDateInputValue(urlDate) && urlDate <= today) return urlDate;
    return today;
  });
  const [sales, setSales] = useState<PosSale[]>([]);
  const [expenses, setExpenses] = useState<DailyExpense[]>([]);
  const [cashRecord, setCashRecord] = useState<DailyCashRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [editSaleId, setEditSaleId] = useState<string | null>(null);
  const [invoiceSaleId, setInvoiceSaleId] = useState<string | null>(null);
  const [archiveSaleId, setArchiveSaleId] = useState<string | null>(null);

  useEffect(() => {
    getBranches(true)
      .then((list) => {
        const nextList = isWholesale
          ? list.filter((branch) => branch.supportsWholesale)
          : list;
        setBranches(nextList);
        setSelectedBranchId((prev) => {
          if (prev && nextList.some((b) => b.id === prev)) return prev;
          if (
            assignedBranchId &&
            nextList.some((b) => b.id === assignedBranchId)
          ) {
            return assignedBranchId;
          }
          return nextList[0]?.id ?? "";
        });
      })
      .catch(console.error);
  }, [assignedBranchId, isWholesale]);

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

  const branchSupportsChannel =
    !isWholesale || selectedBranch?.supportsWholesale === true;

  const newSaleHref =
    isElevatedAdmin && scopeBranchId && branchSupportsChannel
      ? lockedPosPath(
          { branchId: scopeBranchId, saleDate: date },
          saleChannel
        )
      : null;

  useEffect(() => {
    const next = new URLSearchParams();
    next.set("date", date);
    if (scopeBranchId) next.set("branch", scopeBranchId);
    const nextQs = next.toString();
    const currentQs = searchParams.toString();
    if (nextQs === currentQs) return;
    router.replace(`${pathname}?${nextQs}`);
  }, [date, scopeBranchId, pathname, router, searchParams]);

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
      if (isWholesale) {
        const saleRows = await getPosSales({
          branchId: scopeBranchId,
          fromDate: date,
          toDate: date,
          saleChannel: "wholesale",
          max: 2000,
        });
        setSales(saleRows);
        setExpenses([]);
        setCashRecord(null);
      } else {
        const [saleRows, expenseRows, cashRow] = await Promise.all([
          getPosSales({
            branchId: scopeBranchId,
            fromDate: date,
            toDate: date,
            saleChannel: "shop",
            max: 2000,
          }),
          getDailyExpenses({ branchId: scopeBranchId, date }),
          getDailyCashRecord(scopeBranchId, date),
        ]);
        setSales(saleRows);
        setExpenses(expenseRows);
        setCashRecord(cashRow);
      }
    } catch (error) {
      console.error(error);
      toast.error(
        isWholesale
          ? "Failed to load daily wholesale report"
          : "Failed to load daily sales report"
      );
    } finally {
      setLoading(false);
    }
  }, [scopeBranchId, date, isWholesale]);

  useEffect(() => {
    void load();
  }, [load]);

  const rows = useMemo(
    () => flattenDailySalesRows(sales, paymentMethods),
    [sales, paymentMethods]
  );
  const cashAddsTotal = isWholesale
    ? 0
    : sumDailyCashAdds(cashRecord?.additions ?? []);
  const summary = useMemo(
    () =>
      summarizeDailySalesReport({
        sales,
        expenses: isWholesale ? [] : expenses,
        cashAddsTotal,
        paymentMethods,
      }),
    [sales, expenses, cashAddsTotal, paymentMethods, isWholesale]
  );

  const title = isWholesale ? "Daily wholesale" : "Daily sales report";
  const dateInputId = isWholesale ? "daily-wholesale-date" : "daily-sales-date";

  if (!canViewAllBranches && !assignedBranchId) {
    return (
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        <p className="text-sm text-muted-foreground">
          Your account is not assigned to a branch.
        </p>
      </div>
    );
  }

  if (isWholesale && canViewAllBranches && branches.length === 0) {
    return (
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        <p className="text-sm text-muted-foreground">
          No wholesale-capable branch found. Enable Supports wholesale on a
          branch first.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          <p className="text-sm text-muted-foreground">
            {formatDateInputLabel(date)}
            {selectedBranch ? ` · ${selectedBranch.name}` : null}
            {isWholesale
              ? ". Wholesale receipts only — shop sales stay on Daily sales."
              : ". Shop sales only. Expenses and daily cash are recorded by cashiers."}
          </p>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
          <div className="flex min-w-0 flex-col gap-2">
            <Label htmlFor={dateInputId}>Date</Label>
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
                id={dateInputId}
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
          {newSaleHref ? (
            <LinkButton href={newSaleHref} className="sm:self-end">
              <ShoppingCart />
              New sale
            </LinkButton>
          ) : null}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          Loading report...
        </div>
      ) : (
        <div className="grid min-w-0 gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
          <div className="min-w-0 space-y-6">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">
                  {isWholesale ? "Wholesale sales" : "Sales"}
                </CardTitle>
                <CardDescription>
                  {isWholesale
                    ? "Itemized wholesale receipts for the selected day"
                    : "Itemized shop sales for the selected day"}
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
                        <TableHead className="w-14 text-right">
                          <span className="sr-only">Actions</span>
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rows.length === 0 ? (
                        <TableRow>
                          <TableCell
                            colSpan={4}
                            className="py-8 text-center text-muted-foreground"
                          >
                            {isWholesale
                              ? "No wholesale sales for this day"
                              : "No sales for this day"}
                            {newSaleHref ? ". Use New sale to add one." : ""}
                          </TableCell>
                        </TableRow>
                      ) : (
                        rows.map((row) => {
                          const sale = sales.find(
                            (item) => item.id === row.saleId
                          );
                          const canEditSale =
                            isElevatedAdmin &&
                            sale != null &&
                            saleAmountDue(sale) > 0.01;
                          return (
                            <TableRow key={row.key}>
                              <TableCell className="tabular-nums font-medium">
                                {row.omitAmount
                                  ? "—"
                                  : formatCurrency(row.amount)}
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
                              <TableCell className="text-right">
                                <DropdownMenu>
                                  <DropdownMenuTrigger
                                    render={
                                      <Button
                                        type="button"
                                        size="icon"
                                        variant="ghost"
                                      >
                                        <MoreHorizontal className="h-4 w-4" />
                                        <span className="sr-only">
                                          Actions
                                        </span>
                                      </Button>
                                    }
                                  />
                                  <DropdownMenuContent align="end">
                                    {isElevatedAdmin ? (
                                      <DropdownMenuItem
                                        disabled={!canEditSale}
                                        onClick={() =>
                                          setEditSaleId(row.saleId)
                                        }
                                      >
                                        Edit sale
                                      </DropdownMenuItem>
                                    ) : null}
                                    <DropdownMenuItem
                                      onClick={() =>
                                        setInvoiceSaleId(row.saleId)
                                      }
                                    >
                                      View invoice
                                    </DropdownMenuItem>
                                    {isElevatedAdmin ? (
                                      <>
                                        <DropdownMenuSeparator />
                                        <DropdownMenuItem
                                          variant="destructive"
                                          onClick={() =>
                                            setArchiveSaleId(row.saleId)
                                          }
                                        >
                                          Archive sale
                                        </DropdownMenuItem>
                                      </>
                                    ) : null}
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              </TableCell>
                            </TableRow>
                          );
                        })
                      )}
                    </TableBody>
                  </Table>
                </div>
                <div className="flex justify-end text-sm font-semibold text-red-700">
                  TOTAL SALES: {formatCurrency(summary.totalSales)}
                </div>
              </CardContent>
            </Card>

            {!isWholesale ? (
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
            ) : null}
          </div>

          <CashSummaryCard
            className="min-w-0 lg:sticky lg:top-4"
            summary={summary}
            branchName={selectedBranch?.name}
          />
        </div>
      )}

      <EditSalePaymentDialog
        sale={sales.find((sale) => sale.id === editSaleId) ?? null}
        saleId={editSaleId}
        open={editSaleId != null}
        onOpenChange={(open) => {
          if (!open) setEditSaleId(null);
        }}
        onUpdated={(updated) => {
          setSales((prev) =>
            prev.map((row) => (row.id === updated.id ? updated : row))
          );
        }}
      />
      <SaleInvoiceDialog
        sale={sales.find((sale) => sale.id === invoiceSaleId) ?? null}
        saleId={invoiceSaleId}
        open={invoiceSaleId != null}
        onOpenChange={(open) => {
          if (!open) setInvoiceSaleId(null);
        }}
      />
      <ArchiveSaleDialog
        sale={sales.find((sale) => sale.id === archiveSaleId) ?? null}
        saleId={archiveSaleId}
        open={archiveSaleId != null}
        onOpenChange={(open) => {
          if (!open) setArchiveSaleId(null);
        }}
        onArchived={(id) => {
          setSales((prev) => prev.filter((row) => row.id !== id));
        }}
      />
    </div>
  );
}

export function DailyChannelReportPage({
  saleChannel,
}: {
  saleChannel: PosSaleChannel;
}) {
  return (
    <Suspense
      fallback={
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          Loading report...
        </div>
      }
    >
      <DailyChannelReportInner saleChannel={saleChannel} />
    </Suspense>
  );
}
