"use client";

import { useEffect, useMemo, useState } from "react";
import { History } from "lucide-react";
import { Badge } from "@/components/ui/badge";
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
import { TablePagination } from "@/components/admin/table-pagination";
import { useBranchAccess } from "@/hooks/use-branch-access";
import { getBranches } from "@/lib/firestore/branches";
import {
  getInventoryLogs,
  inventoryLogReasonLabel,
  toDateInputValue,
} from "@/lib/firestore/inventory-logs";
import { formatDate } from "@/lib/format";
import { paginateItems } from "@/lib/pagination";
import type { Branch, InventoryLog, InventoryLogReason } from "@/types";

type ReasonFilter = "all" | InventoryLogReason;

const REASON_OPTIONS: { value: ReasonFilter; label: string }[] = [
  { value: "all", label: "All activities" },
  { value: "manual_adjustment", label: "Manual adjustment" },
  { value: "pos_sale", label: "Sale" },
  { value: "supplier_stock_in", label: "Supplier stock in" },
  { value: "transfer_in", label: "Transfer in" },
  { value: "transfer_out", label: "Transfer out" },
];

export default function AdminAdjustmentHistoryPage() {
  const { isElevatedAdmin, assignedBranchId } = useBranchAccess();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [logs, setLogs] = useState<InventoryLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedBranchId, setSelectedBranchId] = useState<string>("all");
  const [reasonFilter, setReasonFilter] = useState<ReasonFilter>("all");
  const [search, setSearch] = useState("");
  const [date, setDate] = useState(() => toDateInputValue());
  const [page, setPage] = useState(1);

  const scopeBranchId = isElevatedAdmin
    ? selectedBranchId === "all"
      ? null
      : selectedBranchId
    : assignedBranchId;

  useEffect(() => {
    getBranches(true)
      .then((list) => {
        setBranches(list);
        if (!isElevatedAdmin && assignedBranchId) {
          setSelectedBranchId(assignedBranchId);
        }
      })
      .catch(console.error);
  }, [isElevatedAdmin, assignedBranchId]);

  useEffect(() => {
    if (!isElevatedAdmin && !assignedBranchId) {
      setLogs([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    getInventoryLogs({
      branchId: scopeBranchId,
      max: 200,
      date,
    })
      .then(setLogs)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [scopeBranchId, isElevatedAdmin, assignedBranchId, date]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return logs.filter((log) => {
      const matchesReason =
        reasonFilter === "all" || log.reason === reasonFilter;
      const matchesSearch =
        !q ||
        (log.productName ?? "").toLowerCase().includes(q) ||
        (log.branchName ?? "").toLowerCase().includes(q) ||
        (log.performedByName ?? "").toLowerCase().includes(q) ||
        (log.referenceLabel ?? "").toLowerCase().includes(q);
      return matchesReason && matchesSearch;
    });
  }, [logs, reasonFilter, search]);

  useEffect(() => {
    setPage(1);
  }, [search, reasonFilter, selectedBranchId, date]);

  const {
    page: safePage,
    totalPages,
    pagedItems,
    total,
  } = useMemo(() => paginateItems(filtered, page), [filtered, page]);

  useEffect(() => {
    if (page !== safePage) setPage(safePage);
  }, [page, safePage]);

  const branchSelectLabel = (value: string | null) => {
    if (!value || value === "all") return "All branches";
    const branch = branches.find((b) => b.id === value);
    return branch ? `${branch.name} (${branch.code})` : null;
  };

  const reasonSelectLabel = (value: string | null) => {
    return (
      REASON_OPTIONS.find((opt) => opt.value === value)?.label ??
      "All activities"
    );
  };

  const dateLabel = useMemo(() => {
    try {
      const [y, m, d] = date.split("-").map(Number);
      return new Intl.DateTimeFormat("en-US", { dateStyle: "medium" }).format(
        new Date(y, m - 1, d)
      );
    } catch {
      return date;
    }
  }, [date]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Adjustment history</h1>
        <p className="text-muted-foreground">
          Stock changes from manual adjustments, sales, and transfers
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <History className="h-4 w-4" />
            Inventory movements
          </CardTitle>
          <CardDescription>
            Showing up to 200 entries for {dateLabel}
            {scopeBranchId
              ? ` · ${branches.find((b) => b.id === scopeBranchId)?.name ?? "this branch"}`
              : " · all branches"}
            .
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-end">
            <div className="space-y-2">
              <Label htmlFor="adjustment-date">Date</Label>
              <Input
                id="adjustment-date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value || toDateInputValue())}
                className="w-full lg:w-44"
              />
            </div>
            <Input
              placeholder="Search product, branch, staff, or reference..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="max-w-md"
            />
            {isElevatedAdmin && (
              <Select
                value={selectedBranchId}
                onValueChange={(v) => setSelectedBranchId(v ?? "all")}
              >
                <SelectTrigger className="w-full lg:w-56">
                  <SelectValue placeholder="All branches">
                    {(value) => branchSelectLabel(value as string | null)}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All branches</SelectItem>
                  {branches.map((branch) => (
                    <SelectItem key={branch.id} value={branch.id}>
                      {branch.name} ({branch.code})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <Select
              value={reasonFilter}
              onValueChange={(v) =>
                setReasonFilter((v as ReasonFilter) ?? "all")
              }
            >
              <SelectTrigger className="w-full lg:w-52">
                <SelectValue placeholder="All activities">
                  {(value) => reasonSelectLabel(value as string | null)}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {REASON_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {loading ? (
            <p className="text-sm text-muted-foreground">Loading history...</p>
          ) : (
            <div className="overflow-x-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Branch</TableHead>
                    <TableHead>Product</TableHead>
                    <TableHead>Activity</TableHead>
                    <TableHead>Adjusted by</TableHead>
                    <TableHead className="text-right">Change</TableHead>
                    <TableHead className="text-right">Available</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={7}
                        className="py-8 text-center text-muted-foreground"
                      >
                        No adjustments match your filters.
                      </TableCell>
                    </TableRow>
                  ) : (
                    pagedItems.map((log) => (
                      <TableRow key={log.id}>
                        <TableCell className="whitespace-nowrap text-sm">
                          {formatDate(log.createdAt)}
                        </TableCell>
                        <TableCell className="text-sm">
                          {log.branchName ?? log.branchId}
                        </TableCell>
                        <TableCell className="max-w-[220px]">
                          <p className="truncate text-sm font-medium">
                            {log.productName ?? log.productId}
                          </p>
                          {log.referenceLabel ? (
                            <p className="truncate text-xs text-muted-foreground">
                              {log.referenceLabel}
                            </p>
                          ) : null}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-xs">
                            {inventoryLogReasonLabel(log.reason)}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {log.performedByName ?? "Staff"}
                        </TableCell>
                        <TableCell
                          className={`text-right font-medium tabular-nums ${
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
                        <TableCell className="text-right text-sm tabular-nums text-muted-foreground">
                          {log.previousStock} → {log.newStock}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
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
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
