"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { SaleInvoiceButton } from "@/components/admin/sale-invoice-dialog";
import { TablePagination } from "@/components/admin/table-pagination";
import { useBranchAccess } from "@/hooks/use-branch-access";
import { shiftDateInput, toDateInputValue } from "@/lib/dates";
import { getPosSales } from "@/lib/firestore/pos-sales";
import { formatCurrency, formatDate } from "@/lib/format";
import { paginateItems } from "@/lib/pagination";
import { summarizeSales } from "@/lib/reports";
import type { PosSale } from "@/types";

type Preset = "today" | "yesterday" | "last7";

function rangeForPreset(preset: Preset): { fromDate: string; toDate: string } {
  const today = toDateInputValue();
  if (preset === "today") {
    return { fromDate: today, toDate: today };
  }
  if (preset === "yesterday") {
    const yesterday = shiftDateInput(today, -1);
    return { fromDate: yesterday, toDate: yesterday };
  }
  return { fromDate: shiftDateInput(today, -6), toDate: today };
}

export default function CashierSalesPage() {
  const { assignedBranchId } = useBranchAccess();
  const [preset, setPreset] = useState<Preset>("today");
  const [sales, setSales] = useState<PosSale[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);

  const { fromDate, toDate } = useMemo(() => rangeForPreset(preset), [preset]);

  const load = useCallback(async () => {
    if (!assignedBranchId) {
      setSales([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const rows = await getPosSales({
        branchId: assignedBranchId,
        fromDate,
        toDate,
        max: 500,
      });
      setSales(rows);
    } catch (error) {
      console.error(error);
      toast.error("Failed to load sales");
    } finally {
      setLoading(false);
    }
  }, [assignedBranchId, fromDate, toDate]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setPage(1);
  }, [preset]);

  const totals = useMemo(() => summarizeSales(sales), [sales]);

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
          Shop and wholesale receipts for your branch till
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {(
          [
            ["today", "Today"],
            ["yesterday", "Yesterday"],
            ["last7", "Last 7 days"],
          ] as const
        ).map(([key, label]) => (
          <Button
            key={key}
            type="button"
            size="sm"
            variant={preset === key ? "default" : "outline"}
            onClick={() => setPreset(key)}
          >
            {label}
          </Button>
        ))}
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Revenue</CardDescription>
            <CardTitle className="text-xl tabular-nums">
              {formatCurrency(totals.revenue)}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Receipts</CardDescription>
            <CardTitle className="text-xl tabular-nums">
              {totals.receipts}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Items sold</CardDescription>
            <CardTitle className="text-xl tabular-nums">
              {totals.itemsSold}
            </CardTitle>
          </CardHeader>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Receipts</CardTitle>
          <CardDescription>
            {fromDate === toDate
              ? formatDate(new Date(`${fromDate}T12:00:00`))
              : `${fromDate} → ${toDate}`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-10">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : sales.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No receipts in this period.
            </p>
          ) : (
            <>
              {/* Mobile cards */}
              <ul className="space-y-3 md:hidden">
                {pagedItems.map((sale) => (
                  <li
                    key={sale.id}
                    className="rounded-lg border px-3 py-3"
                  >
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
                          {formatCurrency(sale.total)}
                        </p>
                        <SaleInvoiceButton sale={sale} />
                      </div>
                    </div>
                  </li>
                ))}
              </ul>

              {/* Desktop table */}
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
                        <TableCell className="text-right font-medium tabular-nums">
                          {formatCurrency(sale.total)}
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
