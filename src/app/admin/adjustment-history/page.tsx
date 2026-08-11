"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { History } from "lucide-react";
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
import { TablePagination } from "@/components/admin/table-pagination";
import { CategoryFilterPanel } from "@/components/admin/category-filter-panel";
import { SaleInvoiceButton } from "@/components/admin/sale-invoice-dialog";
import { useBranchAccess } from "@/hooks/use-branch-access";
import {
  formatDateInputLabel,
  shiftDateInput,
  toDateInputValue,
} from "@/lib/dates";
import {
  filterInventoryLogsByProducts,
  productIdsForCategoryFilter,
} from "@/lib/category-filters";
import { getBranches } from "@/lib/firestore/branches";
import { getCategories } from "@/lib/firestore/categories";
import { getCategoryGroups } from "@/lib/firestore/category-groups";
import {
  getInventoryLogs,
  inventoryLogReasonLabel,
} from "@/lib/firestore/inventory-logs";
import { getProducts } from "@/lib/firestore/products";
import { formatDate } from "@/lib/format";
import { paginateItems } from "@/lib/pagination";
import type {
  Branch,
  Category,
  CategoryGroup,
  InventoryLog,
  InventoryLogReason,
  Product,
} from "@/types";

type ReasonFilter = "all" | InventoryLogReason;
type RangeMode = "day" | "range";
type Preset = "today" | "yesterday" | "last7" | "thisMonth" | "custom";

const REASON_OPTIONS: { value: ReasonFilter; label: string }[] = [
  { value: "all", label: "All activities" },
  { value: "manual_adjustment", label: "Manual adjustment" },
  { value: "pos_sale", label: "Sale" },
  { value: "supplier_stock_in", label: "Supplier stock in" },
  { value: "transfer_in", label: "Transfer in" },
  { value: "transfer_out", label: "Transfer out" },
];

function applyPreset(preset: Preset): {
  mode: RangeMode;
  fromDate: string;
  toDate: string;
} {
  const today = toDateInputValue();
  if (preset === "today") {
    return { mode: "day", fromDate: today, toDate: today };
  }
  if (preset === "yesterday") {
    const yesterday = shiftDateInput(today, -1);
    return { mode: "day", fromDate: yesterday, toDate: yesterday };
  }
  if (preset === "last7") {
    return {
      mode: "range",
      fromDate: shiftDateInput(today, -6),
      toDate: today,
    };
  }
  const [y, m] = today.split("-").map(Number);
  const monthStart = `${y}-${String(m).padStart(2, "0")}-01`;
  return { mode: "range", fromDate: monthStart, toDate: today };
}

export default function AdminAdjustmentHistoryPage() {
  const { isElevatedAdmin, assignedBranchId } = useBranchAccess();
  const initial = applyPreset("today");

  const [branches, setBranches] = useState<Branch[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [categoryGroups, setCategoryGroups] = useState<CategoryGroup[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<string[]>([]);
  const [logs, setLogs] = useState<InventoryLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedBranchId, setSelectedBranchId] = useState<string>("all");
  const [reasonFilter, setReasonFilter] = useState<ReasonFilter>("all");
  const [search, setSearch] = useState("");
  const [mode, setMode] = useState<RangeMode>(initial.mode);
  const [preset, setPreset] = useState<Preset>("today");
  const [fromDate, setFromDate] = useState(initial.fromDate);
  const [toDate, setToDate] = useState(initial.toDate);
  const [page, setPage] = useState(1);

  const scopeBranchId = isElevatedAdmin
    ? selectedBranchId === "all"
      ? null
      : selectedBranchId
    : assignedBranchId;

  const effectiveFrom = fromDate;
  const effectiveTo = mode === "day" ? fromDate : toDate;

  const periodLabel =
    effectiveFrom === effectiveTo
      ? formatDateInputLabel(effectiveFrom)
      : `${formatDateInputLabel(effectiveFrom)} – ${formatDateInputLabel(effectiveTo)}`;

  useEffect(() => {
    Promise.all([
      getBranches(true),
      getCategories(),
      getCategoryGroups(),
      getProducts(true),
    ])
      .then(([branchList, categoryList, groupList, productList]) => {
        setBranches(branchList);
        setCategories(categoryList);
        setCategoryGroups(groupList);
        setProducts(productList);
        if (!isElevatedAdmin && assignedBranchId) {
          setSelectedBranchId(assignedBranchId);
        }
      })
      .catch(console.error);
  }, [isElevatedAdmin, assignedBranchId]);

  const load = useCallback(async () => {
    if (!isElevatedAdmin && !assignedBranchId) {
      setLogs([]);
      setLoading(false);
      return;
    }

    if (mode === "range" && effectiveFrom > effectiveTo) {
      toast.error("Start date must be on or before end date");
      return;
    }

    setLoading(true);
    try {
      const rows = await getInventoryLogs({
        branchId: scopeBranchId,
        max: 500,
        fromDate: effectiveFrom,
        toDate: effectiveTo,
      });
      setLogs(rows);
    } catch (error) {
      console.error(error);
      toast.error("Failed to load adjustment history");
    } finally {
      setLoading(false);
    }
  }, [
    assignedBranchId,
    effectiveFrom,
    effectiveTo,
    isElevatedAdmin,
    mode,
    scopeBranchId,
  ]);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const allowedProductIds = productIdsForCategoryFilter(
      products,
      selectedCategoryIds
    );
    const categoryFiltered = filterInventoryLogsByProducts(
      logs,
      allowedProductIds
    );
    const q = search.trim().toLowerCase();
    return categoryFiltered.filter((log) => {
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
  }, [logs, reasonFilter, search, products, selectedCategoryIds]);

  useEffect(() => {
    setPage(1);
  }, [
    search,
    reasonFilter,
    selectedBranchId,
    effectiveFrom,
    effectiveTo,
    selectedCategoryIds,
  ]);

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

  const selectPreset = (next: Preset) => {
    const applied = applyPreset(next);
    setPreset(next);
    setMode(applied.mode);
    setFromDate(applied.fromDate);
    setToDate(applied.toDate);
  };

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
            Showing up to 500 entries for {periodLabel}
            {scopeBranchId
              ? ` · ${branches.find((b) => b.id === scopeBranchId)?.name ?? "this branch"}`
              : " · all branches"}
            .
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {(
              [
                ["today", "Today"],
                ["yesterday", "Yesterday"],
                ["last7", "Last 7 days"],
                ["thisMonth", "This month"],
              ] as const
            ).map(([key, label]) => (
              <Button
                key={key}
                type="button"
                size="sm"
                variant={preset === key ? "default" : "outline"}
                onClick={() => selectPreset(key)}
              >
                {label}
              </Button>
            ))}
          </div>

          <div className="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-end">
            <div className="space-y-2">
              <Label>Mode</Label>
              <div className="flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant={mode === "day" ? "default" : "outline"}
                  onClick={() => {
                    setMode("day");
                    setPreset("custom");
                    setToDate(fromDate);
                  }}
                >
                  Single day
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={mode === "range" ? "default" : "outline"}
                  onClick={() => {
                    setMode("range");
                    setPreset("custom");
                  }}
                >
                  Date range
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="adjustment-from">
                {mode === "day" ? "Date" : "From"}
              </Label>
              <Input
                id="adjustment-from"
                type="date"
                value={fromDate}
                onChange={(e) => {
                  const next = e.target.value || toDateInputValue();
                  setFromDate(next);
                  setPreset("custom");
                  if (mode === "day") setToDate(next);
                }}
                className="w-full lg:w-44"
              />
            </div>

            {mode === "range" ? (
              <div className="space-y-2">
                <Label htmlFor="adjustment-to">To</Label>
                <Input
                  id="adjustment-to"
                  type="date"
                  value={toDate}
                  onChange={(e) => {
                    setToDate(e.target.value || toDateInputValue());
                    setPreset("custom");
                  }}
                  className="w-full lg:w-44"
                />
              </div>
            ) : null}

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
            <CategoryFilterPanel
              categories={categories}
              groups={categoryGroups}
              selectedCategoryIds={selectedCategoryIds}
              onChange={setSelectedCategoryIds}
            />
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
                    <TableHead className="w-12 text-right">
                      <span className="sr-only">Actions</span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={8}
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
                        <TableCell className="text-right">
                          {log.reason === "pos_sale" && log.referenceId ? (
                            <SaleInvoiceButton saleId={log.referenceId} />
                          ) : null}
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
