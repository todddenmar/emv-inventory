"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { History } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { TablePagination } from "@/components/admin/table-pagination";
import {
  getVariantInventoryLogs,
  inventoryLogReasonLabel,
  toDateInputValue,
} from "@/lib/firestore/inventory-logs";
import { formatDate } from "@/lib/format";
import { paginateItems } from "@/lib/pagination";
import type { InventoryLog } from "@/types";

export interface AdjustmentHistoryTarget {
  branchId: string;
  variantId: string;
  productName: string;
  variantLabel: string;
  branchName?: string | null;
}

interface InventoryAdjustmentHistorySheetProps {
  target: AdjustmentHistoryTarget | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function InventoryAdjustmentHistorySheet({
  target,
  open,
  onOpenChange,
}: InventoryAdjustmentHistorySheetProps) {
  const [logs, setLogs] = useState<InventoryLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [fromDate, setFromDate] = useState(() => toDateInputValue());
  const [toDate, setToDate] = useState(() => toDateInputValue());
  const [page, setPage] = useState(1);

  useEffect(() => {
    if (open) {
      const today = toDateInputValue();
      setFromDate(today);
      setToDate(today);
      setPage(1);
    }
  }, [open, target?.variantId, target?.branchId]);

  useEffect(() => {
    setPage(1);
  }, [fromDate, toDate]);

  useEffect(() => {
    if (!open || !target) {
      setLogs([]);
      return;
    }

    const effectiveFrom = fromDate <= toDate ? fromDate : toDate;
    const effectiveTo = fromDate <= toDate ? toDate : fromDate;

    let cancelled = false;
    setLoading(true);
    getVariantInventoryLogs({
      branchId: target.branchId,
      variantId: target.variantId,
      max: 100,
      fromDate: effectiveFrom,
      toDate: effectiveTo,
    })
      .then((rows) => {
        if (!cancelled) setLogs(rows);
      })
      .catch(console.error)
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, target, fromDate, toDate]);

  const {
    page: safePage,
    totalPages,
    pagedItems,
    total,
  } = useMemo(() => paginateItems(logs, page), [logs, page]);

  useEffect(() => {
    if (page !== safePage) setPage(safePage);
  }, [page, safePage]);

  const subtitleParts = [
    target?.productName,
    target?.variantLabel && target.variantLabel !== "Default"
      ? target.variantLabel
      : null,
    target?.branchName,
  ].filter(Boolean);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full gap-0 p-0 sm:max-w-lg"
        showCloseButton
      >
        <SheetHeader className="border-b">
          <SheetTitle className="flex items-center gap-2">
            <History className="h-4 w-4" />
            Adjustment history
          </SheetTitle>
          <SheetDescription>
            {subtitleParts.length > 0
              ? subtitleParts.join(" · ")
              : "Stock changes for this variant"}
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto p-4">
          <div className="mb-4 grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="sheet-adjustment-from">From</Label>
              <Input
                id="sheet-adjustment-from"
                type="date"
                value={fromDate}
                onChange={(e) =>
                  setFromDate(e.target.value || toDateInputValue())
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="sheet-adjustment-to">To</Label>
              <Input
                id="sheet-adjustment-to"
                type="date"
                value={toDate}
                onChange={(e) =>
                  setToDate(e.target.value || toDateInputValue())
                }
              />
            </div>
          </div>

          {loading ? (
            <p className="text-sm text-muted-foreground">Loading history...</p>
          ) : logs.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No adjustments for this variant in the selected date range.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Activity</TableHead>
                    <TableHead>Adjusted by</TableHead>
                    <TableHead className="text-right">Available</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pagedItems.map((log) => (
                    <TableRow key={log.id}>
                      <TableCell className="whitespace-nowrap text-sm">
                        {formatDate(log.createdAt)}
                      </TableCell>
                      <TableCell>
                        <div className="space-y-1">
                          <Badge variant="outline" className="text-xs capitalize">
                            {inventoryLogReasonLabel(log.reason)}
                          </Badge>
                          {log.referenceLabel ? (
                            <p className="text-xs text-muted-foreground">
                              {log.referenceLabel}
                            </p>
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {log.performedByName ?? "Staff"}
                      </TableCell>
                      <TableCell className="text-right text-sm">
                        <div className="tabular-nums text-muted-foreground">
                          {log.previousStock} → {log.newStock}
                        </div>
                        <div
                          className={`tabular-nums font-medium ${
                            log.delta > 0
                              ? "text-green-600"
                              : log.delta < 0
                                ? "text-red-600"
                                : ""
                          }`}
                        >
                          {log.delta > 0 ? "+" : ""}
                          {log.delta}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
          {!loading && logs.length > 0 ? (
            <TablePagination
              page={safePage}
              totalPages={totalPages}
              total={total}
              onPageChange={setPage}
              className="mt-3"
            />
          ) : null}
          <p className="mt-4 text-xs text-muted-foreground">
            <Link
              href="/admin/adjustment-history"
              className="underline underline-offset-2"
            >
              View full adjustment history
            </Link>
          </p>
        </div>
      </SheetContent>
    </Sheet>
  );
}
