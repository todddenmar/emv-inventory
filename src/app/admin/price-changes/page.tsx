"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowDown, ArrowUp, TrendingUp } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
import { TablePagination } from "@/components/admin/table-pagination";
import { useBranchAccess } from "@/hooks/use-branch-access";
import { useIsStaff } from "@/stores/auth-store";
import { getProductPriceLogs } from "@/lib/firestore/price-logs";
import { formatCurrency, formatDate } from "@/lib/format";
import { paginateItems } from "@/lib/pagination";
import type { PriceChangeDirection, ProductPriceLog } from "@/types";

type DirectionFilter = "all" | PriceChangeDirection;

export default function AdminPriceChangesPage() {
  const { isElevatedAdmin } = useBranchAccess();
  const isStaff = useIsStaff();
  const [logs, setLogs] = useState<ProductPriceLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [directionFilter, setDirectionFilter] =
    useState<DirectionFilter>("all");
  const [page, setPage] = useState(1);

  useEffect(() => {
    getProductPriceLogs({ max: 200 })
      .then(setLogs)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    if (directionFilter === "all") return logs;
    return logs.filter((log) => log.direction === directionFilter);
  }, [logs, directionFilter]);

  useEffect(() => {
    setPage(1);
  }, [directionFilter]);

  const {
    page: safePage,
    totalPages,
    pagedItems,
    total,
  } = useMemo(() => paginateItems(filtered, page), [filtered, page]);

  useEffect(() => {
    if (page !== safePage) setPage(safePage);
  }, [page, safePage]);

  const counts = useMemo(() => {
    return {
      total: logs.length,
      increases: logs.filter((l) => l.direction === "increase").length,
      decreases: logs.filter((l) => l.direction === "decrease").length,
    };
  }, [logs]);

  if (!isStaff) {
    return (
      <Card>
        <CardContent className="pt-6">
          <p className="text-muted-foreground">Staff access required.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Price changes</h1>
          <p className="text-muted-foreground">
            Log of product variant price increases and decreases
            {!isElevatedAdmin ? " (read-only)" : ""}
          </p>
        </div>
        <Select
          value={directionFilter}
          onValueChange={(value) =>
            setDirectionFilter((value as DirectionFilter) || "all")
          }
        >
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Filter">
              {(value) => {
                if (value === "increase") return "Increases only";
                if (value === "decrease") return "Decreases only";
                return "All changes";
              }}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All changes</SelectItem>
            <SelectItem value="increase">Increases only</SelectItem>
            <SelectItem value="decrease">Decreases only</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total logged</CardDescription>
            <CardTitle className="text-3xl">{counts.total}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Increases</CardDescription>
            <CardTitle className="text-3xl text-emerald-600">
              {counts.increases}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Decreases</CardDescription>
            <CardTitle className="text-3xl text-rose-600">
              {counts.decreases}
            </CardTitle>
          </CardHeader>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <TrendingUp className="h-4 w-4" />
            Change history
          </CardTitle>
          <CardDescription>
            Catalog price edits and temporary sale start/end events.{" "}
            <Link
              href="/admin/price-promotions"
              className="underline underline-offset-2"
            >
              Manage promotions
            </Link>
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-muted-foreground">Loading price changes...</p>
          ) : filtered.length === 0 ? (
            <p className="text-muted-foreground">
              No price changes recorded yet.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>When</TableHead>
                    <TableHead>Product</TableHead>
                    <TableHead>Variant</TableHead>
                    <TableHead className="text-right">Previous</TableHead>
                    <TableHead className="text-right">New</TableHead>
                    <TableHead className="text-right">Change</TableHead>
                    <TableHead>By</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pagedItems.map((log) => (
                    <TableRow key={log.id}>
                      <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                        {formatDate(log.createdAt)}
                      </TableCell>
                      <TableCell className="font-medium">
                        <div>
                          <p>{log.productName || "—"}</p>
                          {log.note ? (
                            <p className="text-xs text-muted-foreground">
                              {log.note}
                            </p>
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell>{log.variantLabel}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatCurrency(log.previousPrice)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatCurrency(log.newPrice)}
                      </TableCell>
                      <TableCell className="text-right">
                        <Badge
                          variant="outline"
                          className={
                            log.direction === "increase"
                              ? "gap-1 text-emerald-700"
                              : "gap-1 text-rose-700"
                          }
                        >
                          {log.direction === "increase" ? (
                            <ArrowUp className="h-3 w-3" />
                          ) : (
                            <ArrowDown className="h-3 w-3" />
                          )}
                          {log.delta > 0 ? "+" : ""}
                          {formatCurrency(log.delta)}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {log.performedByName || "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
          {!loading && filtered.length > 0 && (
            <TablePagination
              page={safePage}
              totalPages={totalPages}
              total={total}
              onPageChange={setPage}
              className="mt-4"
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
