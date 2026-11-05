"use client";

import { useEffect, useMemo, useState } from "react";
import { ClipboardList } from "lucide-react";
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
import { SaleInvoiceButton } from "@/components/admin/sale-invoice-dialog";
import { TablePagination } from "@/components/admin/table-pagination";
import { useBranchAccess } from "@/hooks/use-branch-access";
import { getBranches } from "@/lib/firestore/branches";
import { getPosSaleActivityLogs } from "@/lib/firestore/sale-activity-logs";
import { formatDate } from "@/lib/format";
import { paginateItems } from "@/lib/pagination";
import type { Branch, PosSaleActivityLog } from "@/types";

export default function AdminSaleEditsPage() {
  const { isElevatedAdmin, isOwner, canViewAllBranches, assignedBranchId } =
    useBranchAccess();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [logs, setLogs] = useState<PosSaleActivityLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [branchFilter, setBranchFilter] = useState("all");
  const [page, setPage] = useState(1);

  const canView = isElevatedAdmin || isOwner;

  const scopeBranchId = canViewAllBranches
    ? branchFilter === "all"
      ? null
      : branchFilter
    : assignedBranchId;

  useEffect(() => {
    if (!canView) return;
    getBranches(true)
      .then(setBranches)
      .catch(console.error);
  }, [canView]);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      if (!canView) {
        if (!cancelled) {
          setLogs([]);
          setLoading(false);
        }
        return;
      }

      setLoading(true);
      try {
        const rows = await getPosSaleActivityLogs({
          branchId: scopeBranchId,
          max: 300,
        });
        if (!cancelled) setLogs(rows);
      } catch (error) {
        console.error(error);
        if (!cancelled) setLogs([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [canView, scopeBranchId]);

  const {
    page: safePage,
    totalPages,
    pagedItems,
    total,
  } = useMemo(() => paginateItems(logs, page), [logs, page]);

  const branchSelectLabel = (value: string | null) => {
    if (!value || value === "all") return "All branches";
    return branches.find((b) => b.id === value)?.name ?? null;
  };

  if (!canView) {
    return (
      <Card>
        <CardContent className="pt-6">
          <p className="text-muted-foreground">Admin access required.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Sale edits</h1>
          <p className="text-muted-foreground">
            Activity log of item, payment, detail, date, and archive changes by
            cashiers and admins
          </p>
        </div>
        {canViewAllBranches ? (
          <Select
            value={branchFilter}
            onValueChange={(value) => {
              setBranchFilter(value ?? "all");
              setPage(1);
            }}
          >
            <SelectTrigger className="w-full sm:w-56">
              <SelectValue placeholder="All branches">
                {(value) => branchSelectLabel(value as string | null)}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All branches</SelectItem>
              {branches.map((branch) => (
                <SelectItem key={branch.id} value={branch.id}>
                  {branch.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : null}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ClipboardList className="h-4 w-4" />
            Edit history
          </CardTitle>
          <CardDescription>
            {loading
              ? "Loading…"
              : `${total} recorded edit${total === 1 ? "" : "s"}`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-muted-foreground">Loading sale edits…</p>
          ) : logs.length === 0 ? (
            <p className="text-muted-foreground">No sale edits recorded yet.</p>
          ) : (
            <>
              <div className="overflow-x-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>When</TableHead>
                      <TableHead>Branch</TableHead>
                      <TableHead>Who</TableHead>
                      <TableHead>Change</TableHead>
                      <TableHead className="w-12 text-right">
                        <span className="sr-only">Sale</span>
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pagedItems.map((log) => (
                      <TableRow key={log.id}>
                        <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                          {formatDate(log.createdAt)}
                        </TableCell>
                        <TableCell className="text-sm">
                          {log.branchName || "—"}
                        </TableCell>
                        <TableCell className="text-sm">
                          <div>
                            <p className="font-medium">
                              {log.performedByName || "—"}
                            </p>
                            {log.performedByRole ? (
                              <Badge
                                variant="outline"
                                className="mt-1 text-[10px] capitalize"
                              >
                                {log.performedByRole}
                              </Badge>
                            ) : null}
                          </div>
                        </TableCell>
                        <TableCell className="max-w-md text-sm">
                          <p className="font-medium">{log.summary}</p>
                          {log.previousItemsSummary || log.nextItemsSummary ? (
                            <div className="mt-1 space-y-0.5 text-xs text-muted-foreground">
                              {log.previousItemsSummary ? (
                                <p>Items before: {log.previousItemsSummary}</p>
                              ) : null}
                              {log.nextItemsSummary ? (
                                <p>Items after: {log.nextItemsSummary}</p>
                              ) : null}
                            </div>
                          ) : null}
                          {log.previousPaymentsSummary ||
                          log.nextPaymentsSummary ? (
                            <div className="mt-1 space-y-0.5 text-xs text-muted-foreground">
                              {log.previousPaymentsSummary ? (
                                <p>Payments before: {log.previousPaymentsSummary}</p>
                              ) : null}
                              {log.nextPaymentsSummary ? (
                                <p>Payments after: {log.nextPaymentsSummary}</p>
                              ) : null}
                            </div>
                          ) : null}
                          {log.previousSaleDate && log.nextSaleDate ? (
                            <p className="mt-1 text-xs text-muted-foreground">
                              Date {log.previousSaleDate} → {log.nextSaleDate}
                            </p>
                          ) : null}
                        </TableCell>
                        <TableCell className="text-right">
                          <SaleInvoiceButton saleId={log.saleId} />
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
