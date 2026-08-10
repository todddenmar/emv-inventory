"use client";

import Link from "next/link";
import { ArrowRightLeft } from "lucide-react";
import { Badge } from "@/components/ui/badge";
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
import { LinkButton } from "@/components/ui/link-button";
import { TablePagination } from "@/components/admin/table-pagination";
import {
  getInventoryLogs,
  inventoryLogReasonLabel,
} from "@/lib/firestore/inventory-logs";
import { formatDate } from "@/lib/format";
import { paginateItems } from "@/lib/pagination";
import type { InventoryLog } from "@/types";
import { useEffect, useMemo, useState } from "react";

interface InventoryActivityFeedProps {
  branchId?: string | null;
  title?: string;
  description?: string;
  max?: number;
  showViewAll?: boolean;
}

export function InventoryActivityFeed({
  branchId = null,
  title = "Recent inventory activity",
  description = "Sales, adjustments, and transfers across branches",
  max = 15,
  showViewAll = true,
}: InventoryActivityFeedProps) {
  const [logs, setLogs] = useState<InventoryLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);

  useEffect(() => {
    getInventoryLogs({ branchId, max })
      .then(setLogs)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [branchId, max]);

  useEffect(() => {
    setPage(1);
  }, [branchId, max]);

  const {
    page: safePage,
    totalPages,
    pagedItems,
    total,
  } = useMemo(() => paginateItems(logs, page), [logs, page]);

  useEffect(() => {
    if (page !== safePage) setPage(safePage);
  }, [page, safePage]);

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div>
          <CardTitle className="flex items-center gap-2">
            <ArrowRightLeft className="h-5 w-5" />
            {title}
          </CardTitle>
          <CardDescription>{description}</CardDescription>
        </div>
        {showViewAll && (
          <LinkButton href="/admin/transfers" variant="outline" size="sm">
            Transfers
          </LinkButton>
        )}
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading activity...</p>
        ) : logs.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No inventory movements recorded yet.
          </p>
        ) : (
          <div className="space-y-4">
            <div className="overflow-x-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>When</TableHead>
                    <TableHead>Branch</TableHead>
                    <TableHead>Product</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead className="text-right">Change</TableHead>
                    <TableHead className="text-right">Stock</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pagedItems.map((log) => (
                    <TableRow key={log.id}>
                      <TableCell className="whitespace-nowrap text-sm">
                        {formatDate(log.createdAt)}
                      </TableCell>
                      <TableCell className="text-sm">
                        {log.branchName ?? log.branchId}
                      </TableCell>
                      <TableCell className="max-w-[160px] truncate text-sm">
                        {log.productName ?? log.productId}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="capitalize text-xs">
                          {inventoryLogReasonLabel(log.reason)}
                        </Badge>
                      </TableCell>
                      <TableCell
                        className={`text-right font-medium ${
                          log.delta > 0
                            ? "text-green-600"
                            : log.delta < 0
                              ? "text-red-600"
                              : ""
                        }`}
                      >
                        {log.delta > 0 ? "+" : ""}
                        {log.delta}
                      </TableCell>
                      <TableCell className="text-right text-sm text-muted-foreground">
                        {log.previousStock} → {log.newStock}
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
            />
          </div>
        )}
        {showViewAll && logs.length > 0 && (
          <p className="mt-3 text-xs text-muted-foreground">
            Reference details appear in transfer and order records.{" "}
            <Link href="/admin/inventory" className="underline">
              Manage inventory
            </Link>
          </p>
        )}
      </CardContent>
    </Card>
  );
}
