"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { History, AlertTriangle, MoreHorizontal, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  InventoryAdjustmentHistorySheet,
  type AdjustmentHistoryTarget,
} from "@/components/admin/inventory-adjustment-history-sheet";
import { CategoryFilterPanel } from "@/components/admin/category-filter-panel";
import {
  StockChangePopover,
  computeNextStock,
  type StockChangeMode,
} from "@/components/admin/stock-change-popover";
import { TablePagination } from "@/components/admin/table-pagination";
import { useBranchAccess } from "@/hooks/use-branch-access";
import { productIdsForCategoryFilter } from "@/lib/category-filters";
import { getBranches } from "@/lib/firestore/branches";
import {
  getAllBranchInventory,
  getBranchInventory,
  setBranchStockWithLog,
} from "@/lib/firestore/inventory";
import { getProducts } from "@/lib/firestore/products";
import { getCategories } from "@/lib/firestore/categories";
import { getCategoryGroups } from "@/lib/firestore/category-groups";
import {
  mergeSellingVariantsWithInventory,
  getLowStockVariants,
  type VariantWithStock,
} from "@/lib/inventory";
import { formatCurrency } from "@/lib/format";
import { paginateItems } from "@/lib/pagination";
import { formatVariantLabel } from "@/lib/product-variants";
import { summarizeBulkResult } from "@/lib/bulk";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/stores/auth-store";
import type {
  Branch,
  BranchInventory,
  Category,
  CategoryGroup,
  Product,
} from "@/types";

type StockFilter = "all" | "low" | "in_stock" | "out_of_stock";

const INVENTORY_PAGE_SIZE = 20;

function selectedItemLabel(
  row: VariantWithStock,
  products: Product[]
): string {
  const product = products.find((p) => p.id === row.productId);
  const variantLabel = formatVariantLabel(row, product?.options ?? []);
  return variantLabel !== "Default"
    ? `${row.productName} — ${variantLabel}`
    : row.productName;
}

function InventorySelectionPanel({
  selectedRows,
  products,
  saving,
  onRemove,
  onClear,
  onSelectAllVisible,
  visibleCount,
  onSaveBulk,
}: {
  selectedRows: VariantWithStock[];
  products: Product[];
  saving: boolean;
  onRemove: (id: string) => void;
  onClear: () => void;
  onSelectAllVisible: () => void;
  visibleCount: number;
  onSaveBulk: (input: {
    mode: StockChangeMode;
    amount: number;
  }) => Promise<boolean>;
}) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-start justify-between gap-2 border-b px-4 py-3">
        <div className="min-w-0">
          <p className="font-semibold">Selected</p>
          <p className="text-sm text-muted-foreground">
            {selectedRows.length === 0
              ? "Select items in the table"
              : `${selectedRows.length} item${selectedRows.length === 1 ? "" : "s"}`}
          </p>
        </div>
        {selectedRows.length > 0 ? (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={saving}
            onClick={onClear}
          >
            Clear
          </Button>
        ) : null}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
        {selectedRows.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            No items selected yet.
          </p>
        ) : (
          <ul className="space-y-2">
            {selectedRows.map((row) => {
              const label = selectedItemLabel(row, products);
              return (
                <li
                  key={row.id}
                  className="flex items-start gap-2 rounded-lg border bg-background px-2.5 py-2"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium leading-snug break-words">
                      {label}
                    </p>
                    <p className="mt-0.5 text-xs tabular-nums text-muted-foreground">
                      Stock {row.stock}
                      {row.sku ? ` · ${row.sku}` : ""}
                    </p>
                  </div>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="size-7 shrink-0"
                    disabled={saving}
                    aria-label={`Remove ${label}`}
                    onClick={() => onRemove(row.id)}
                  >
                    <X className="size-3.5" />
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="space-y-2 border-t p-4">
        {selectedRows.length < visibleCount ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="w-full"
            disabled={saving || visibleCount === 0}
            onClick={onSelectAllVisible}
          >
            Select all on page ({visibleCount})
          </Button>
        ) : null}
        <StockChangePopover
          selectedCount={selectedRows.length}
          saving={saving}
          disabled={saving || selectedRows.length === 0}
          triggerLabel="Change stock"
          triggerClassName="w-full"
          onSaveBulk={onSaveBulk}
        />
      </div>
    </div>
  );
}

export default function AdminInventoryPage() {
  const {
    canViewAllBranches,
    canEditStock,
    isOwner,
    isInventoryViewer,
    assignedBranchId,
  } = useBranchAccess();
  const user = useAuthStore((s) => s.user);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [categoryGroups, setCategoryGroups] = useState<CategoryGroup[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [inventory, setInventory] = useState<BranchInventory[]>([]);
  const [selectedBranchId, setSelectedBranchId] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<string[]>([]);
  const [stockFilter, setStockFilter] = useState<StockFilter>("all");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [selectionSheetOpen, setSelectionSheetOpen] = useState(false);
  const [historyTarget, setHistoryTarget] =
    useState<AdjustmentHistoryTarget | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [page, setPage] = useState(1);

  const activeBranchId = canViewAllBranches
    ? selectedBranchId
    : assignedBranchId ?? "";

  const loadBranches = async () => {
    const all = await getBranches(true);
    setBranches(all);
    if (!selectedBranchId && all.length > 0) {
      setSelectedBranchId(
        canViewAllBranches
          ? all[0].id
          : assignedBranchId ?? all[0].id
      );
    }
  };

  const loadInventory = async (branchId: string) => {
    if (!branchId) return;
    const [p, inv, cats, groups] = await Promise.all([
      getProducts(),
      canViewAllBranches && branchId === "all"
        ? getAllBranchInventory()
        : getBranchInventory(branchId),
      getCategories(),
      getCategoryGroups(),
    ]);
    setProducts(p);
    setInventory(inv);
    setCategories(cats.filter((c) => !c.isArchived));
    setCategoryGroups(groups);
  };

  useEffect(() => {
    loadBranches().catch(console.error).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!activeBranchId) return;
    loadInventory(activeBranchId).catch(console.error);
  }, [activeBranchId]);

  const branchInventory = useMemo(() => {
    if (activeBranchId === "all") return inventory;
    return inventory.filter((i) => i.branchId === activeBranchId);
  }, [inventory, activeBranchId]);

  const variantsWithStock = useMemo(() => {
    if (activeBranchId === "all") return [];
    return mergeSellingVariantsWithInventory(
      products,
      branchInventory,
      categories
    );
  }, [products, branchInventory, activeBranchId, categories]);

  const isLowStockRow = (row: (typeof variantsWithStock)[0]) =>
    row.stock > 0 && row.stock <= row.lowStockThreshold;

  const filteredVariants = useMemo(() => {
    const allowedProductIds = productIdsForCategoryFilter(
      products,
      selectedCategoryIds
    );

    return variantsWithStock.filter((row) => {
      const product = products.find((p) => p.id === row.productId);
      const matchesSearch =
        row.productName.toLowerCase().includes(search.toLowerCase()) ||
        row.sku.toLowerCase().includes(search.toLowerCase()) ||
        formatVariantLabel(row, product?.options ?? [])
          .toLowerCase()
          .includes(search.toLowerCase());
      const matchesCategory =
        !allowedProductIds || allowedProductIds.has(row.productId);
      const matchesStock =
        stockFilter === "all" ||
        (stockFilter === "low" && isLowStockRow(row)) ||
        (stockFilter === "in_stock" && row.stock > 0) ||
        (stockFilter === "out_of_stock" && row.stock <= 0);

      return matchesSearch && matchesCategory && matchesStock;
    });
  }, [variantsWithStock, products, search, selectedCategoryIds, stockFilter]);

  useEffect(() => {
    setPage(1);
    setSelectedIds([]);
  }, [search, selectedCategoryIds, stockFilter, activeBranchId]);

  const {
    page: safePage,
    totalPages,
    pagedItems,
    total,
  } = useMemo(
    () => paginateItems(filteredVariants, page, INVENTORY_PAGE_SIZE),
    [filteredVariants, page]
  );

  useEffect(() => {
    if (page !== safePage) setPage(safePage);
  }, [page, safePage]);

  const pageIds = pagedItems.map((row) => row.id);
  const allPageSelected =
    pageIds.length > 0 && pageIds.every((id) => selectedIds.includes(id));
  const somePageSelected = pageIds.some((id) => selectedIds.includes(id));

  const selectedRows = useMemo(() => {
    const byId = new Map(variantsWithStock.map((row) => [row.id, row]));
    return selectedIds
      .map((id) => byId.get(id))
      .filter((row): row is VariantWithStock => row != null);
  }, [selectedIds, variantsWithStock]);

  const toggleSelected = (id: string) => {
    if (!canEditStock) return;
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const selectAllVisible = () => {
    setSelectedIds((prev) => [...new Set([...prev, ...pageIds])]);
  };

  const deselectPage = () => {
    setSelectedIds((prev) => prev.filter((id) => !pageIds.includes(id)));
  };

  const clearSelection = () => setSelectedIds([]);

  const lowStock = getLowStockVariants(variantsWithStock);
  const activeBranch = branches.find((b) => b.id === activeBranchId);

  const branchSelectLabel = (value: string | null) => {
    if (!value) return null;
    if (value === "all") return "All branches (overview)";
    const branch = branches.find((b) => b.id === value);
    return branch ? `${branch.name} (${branch.code})` : null;
  };

  const stockSelectLabel = (value: string | null) => {
    switch (value as StockFilter) {
      case "low":
        return "Low stock";
      case "in_stock":
        return "In stock";
      case "out_of_stock":
        return "Out of stock";
      default:
        return "All stock levels";
    }
  };

  const categoryMap = Object.fromEntries(categories.map((c) => [c.id, c]));

  const branchSummaries = useMemo(() => {
    if (!canViewAllBranches) return [];
    return branches.map((branch) => {
      const branchInv = inventory.filter((i) => i.branchId === branch.id);
      const rows = mergeSellingVariantsWithInventory(
        products,
        branchInv,
        categories
      );
      const stocked = rows.filter((r) => r.stock > 0).length;
      const low = getLowStockVariants(rows).length;
      return { branch, stocked, low, totalSkus: rows.length };
    });
  }, [branches, inventory, products, categories, canViewAllBranches]);

  const saveStock = async (
    variantId: string,
    productId: string,
    stock: number,
    options?: { silent?: boolean }
  ): Promise<boolean> => {
    if (!canEditStock) return false;
    if (!activeBranchId || activeBranchId === "all") return false;
    const row = variantsWithStock.find((v) => v.id === variantId);
    if (!row) return false;
    if (!Number.isFinite(stock) || stock < 0) {
      if (!options?.silent) toast.error("Stock must be zero or greater");
      return false;
    }
    if (stock === row.stock) return false;

    const product = products.find((p) => p.id === productId);
    const label = `${row.productName} — ${formatVariantLabel(row, product?.options ?? [])}`;
    await setBranchStockWithLog(
      activeBranchId,
      productId,
      variantId,
      stock,
      row.lowStockThreshold,
      {
        productName: label,
        branchName: activeBranch?.name ?? null,
        performedBy: user?.uid ?? "unknown",
        performedByName: user?.displayName ?? user?.email ?? null,
      }
    );
    return true;
  };

  const saveBulkStock = async (input: {
    mode: StockChangeMode;
    amount: number;
  }): Promise<boolean> => {
    if (!canEditStock || selectedIds.length === 0) return false;
    if (!activeBranchId || activeBranchId === "all") return false;

    setSaving(true);
    try {
      let ok = 0;
      let skipped = 0;
      const messages: string[] = [];

      for (const id of selectedIds) {
        const row = variantsWithStock.find((v) => v.id === id);
        if (!row) {
          messages.push("Item not found");
          continue;
        }
        const next = computeNextStock(row.stock, input.mode, input.amount);
        if (next === row.stock) {
          skipped += 1;
          continue;
        }
        try {
          const saved = await saveStock(row.id, row.productId, next, {
            silent: true,
          });
          if (saved) ok += 1;
          else messages.push(`${row.productName}: unchanged`);
        } catch (error) {
          messages.push(
            error instanceof Error ? error.message : `${row.productName}: failed`
          );
        }
      }

      await loadInventory(activeBranchId);
      const summary = summarizeBulkResult(
        { ok, failed: messages.length, messages },
        "updated"
      );
      if (summary.success) toast.success(summary.success);
      else if (skipped > 0 && ok === 0 && messages.length === 0) {
        toast.message("No stock changes needed");
      }
      if (summary.error) toast.error(summary.error);
      if (ok > 0) clearSelection();
      return ok > 0;
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <p className="text-muted-foreground">Loading inventory...</p>;
  }

  if (branches.length === 0) {
    return (
      <Card>
        <CardContent className="pt-6">
          <p className="text-muted-foreground">
            Create a branch first before managing inventory.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Inventory</h1>
          <p className="text-muted-foreground">
            {canViewAllBranches
              ? isOwner
                ? "View stock levels across branches"
                : "Select items, then change stock for all selected"
              : `Stock for ${activeBranch?.name ?? "your branch"}`}
          </p>
        </div>
        {canViewAllBranches && (
          <Select
            value={selectedBranchId}
            onValueChange={(v) => setSelectedBranchId(v ?? "")}
          >
            <SelectTrigger className="w-full lg:w-64">
              <SelectValue placeholder="Select branch">
                {(value) => branchSelectLabel(value as string | null)}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All branches (overview)</SelectItem>
              {branches.map((branch) => (
                <SelectItem key={branch.id} value={branch.id}>
                  {branch.name} ({branch.code})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {canViewAllBranches && selectedBranchId === "all" && (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {branchSummaries.map(({ branch, stocked, low, totalSkus }) => (
            <Card
              key={branch.id}
              className="cursor-pointer transition-colors hover:bg-muted/30"
              onClick={() => setSelectedBranchId(branch.id)}
            >
              <CardHeader className="pb-2">
                <CardTitle className="text-base">{branch.name}</CardTitle>
                <CardDescription>{branch.code}</CardDescription>
              </CardHeader>
              <CardContent className="flex gap-4 text-sm">
                <div>
                  <p className="text-muted-foreground">SKUs tracked</p>
                  <p className="text-xl font-semibold">{totalSkus}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">In stock</p>
                  <p className="text-xl font-semibold">{stocked}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Low stock</p>
                  <p className="text-xl font-semibold text-amber-600">{low}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {activeBranchId !== "all" && (
        <>
          {lowStock.length > 0 && (
            <Card className="border-amber-200 bg-amber-50/50 dark:bg-amber-950/20">
              <CardContent className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-start gap-2 sm:items-center">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-800 dark:text-amber-200 sm:mt-0" />
                  <div>
                    <p className="font-medium text-amber-800 dark:text-amber-200">
                      {lowStock.length} variant
                      {lowStock.length === 1 ? "" : "s"} with low stock
                      {activeBranch ? ` at ${activeBranch.name}` : ""}
                    </p>
                    <p className="text-sm text-amber-800/80 dark:text-amber-200/80">
                      At or below the category threshold.
                    </p>
                  </div>
                </div>
                {stockFilter !== "low" ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="shrink-0 border-amber-300 bg-background text-amber-900 hover:bg-amber-100 dark:border-amber-800 dark:text-amber-100 dark:hover:bg-amber-950"
                    onClick={() => setStockFilter("low")}
                  >
                    Show low stock
                  </Button>
                ) : null}
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>{activeBranch?.name} stock</CardTitle>
              <CardDescription>
                {canEditStock
                  ? "Select items in the table, then change stock for the whole selection."
                  : "Stock for variants this branch sells."}{" "}
                Low-at thresholds come from{" "}
                <Link
                  href="/admin/categories"
                  className="underline underline-offset-2"
                >
                  categories
                </Link>
                .{" "}
                {!isOwner && !isInventoryViewer ? (
                  <Link
                    href="/admin/settings/assortment"
                    className="underline underline-offset-2"
                  >
                    Manage assortment
                  </Link>
                ) : null}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-center">
                <Input
                  placeholder="Search products, SKU, or variant..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="max-w-md"
                />
                <CategoryFilterPanel
                  categories={categories}
                  groups={categoryGroups}
                  selectedCategoryIds={selectedCategoryIds}
                  onChange={setSelectedCategoryIds}
                />
                <Select
                  value={stockFilter}
                  onValueChange={(v) =>
                    setStockFilter((v as StockFilter) ?? "all")
                  }
                >
                  <SelectTrigger className="w-full lg:w-48">
                    <SelectValue placeholder="All stock levels">
                      {(value) => stockSelectLabel(value as string | null)}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All stock levels</SelectItem>
                    <SelectItem value="low">Low stock</SelectItem>
                    <SelectItem value="in_stock">In stock</SelectItem>
                    <SelectItem value="out_of_stock">Out of stock</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div
                className={cn(
                  "gap-4",
                  canEditStock
                    ? "flex flex-col lg:flex-row lg:items-start"
                    : "block"
                )}
              >
                <div
                  className={cn(
                    "min-w-0 space-y-4",
                    canEditStock && "flex-1 lg:pb-0",
                    canEditStock && selectedIds.length > 0 && "pb-24 lg:pb-0"
                  )}
                >
                  {filteredVariants.length === 0 ? (
                    <p className="py-12 text-center text-muted-foreground">
                      {variantsWithStock.length === 0 ? (
                        isOwner || isInventoryViewer ? (
                          "No selling variants for this branch."
                        ) : (
                          <>
                            No selling variants for this branch.{" "}
                            <Link
                              href="/admin/settings/assortment"
                              className="underline underline-offset-2"
                            >
                              Assign variants in Branch assortment
                            </Link>
                            .
                          </>
                        )
                      ) : (
                        "No variants match your filters."
                      )}
                    </p>
                  ) : (
                    <div className="overflow-x-auto rounded-md border">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            {canEditStock ? (
                              <TableHead className="w-10">
                                <Checkbox
                                  checked={allPageSelected}
                                  indeterminate={
                                    somePageSelected && !allPageSelected
                                  }
                                  onCheckedChange={() => {
                                    if (allPageSelected) deselectPage();
                                    else selectAllVisible();
                                  }}
                                  aria-label="Select all on page"
                                />
                              </TableHead>
                            ) : null}
                            <TableHead>Product / variant</TableHead>
                            <TableHead className="w-28">SKU</TableHead>
                            <TableHead className="w-28">Cash</TableHead>
                            <TableHead className="w-28">Retail</TableHead>
                            <TableHead className="w-28">Stock</TableHead>
                            <TableHead className="w-28">Low at</TableHead>
                            <TableHead className="w-14 text-right">
                              Actions
                            </TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {pagedItems.map((row) => {
                            const product = products.find(
                              (p) => p.id === row.productId
                            );
                            const isLow = isLowStockRow(row);
                            const variantLabel = formatVariantLabel(
                              row,
                              product?.options ?? []
                            );
                            const selected = selectedIds.includes(row.id);

                            return (
                              <TableRow
                                key={row.id}
                                data-state={selected ? "selected" : undefined}
                                className={cn(
                                  canEditStock && "cursor-pointer",
                                  selected && "bg-primary/5"
                                )}
                                onClick={() => {
                                  if (canEditStock) toggleSelected(row.id);
                                }}
                              >
                                {canEditStock ? (
                                  <TableCell
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    <Checkbox
                                      checked={selected}
                                      onCheckedChange={() =>
                                        toggleSelected(row.id)
                                      }
                                      aria-label={`Select ${row.productName}`}
                                    />
                                  </TableCell>
                                ) : null}
                                <TableCell>
                                  <div className="min-w-[200px]">
                                    <div className="flex flex-wrap items-center gap-1.5">
                                      <Link
                                        href={`/admin/products/${row.productId}`}
                                        className="font-medium hover:underline"
                                        onClick={(e) => e.stopPropagation()}
                                      >
                                        {row.productName}
                                      </Link>
                                      {variantLabel === "Default" && isLow ? (
                                        <Badge
                                          variant="outline"
                                          className="text-xs text-amber-700"
                                        >
                                          Low stock
                                        </Badge>
                                      ) : null}
                                    </div>
                                    {variantLabel !== "Default" ? (
                                      <div className="flex flex-wrap items-center gap-1.5">
                                        <p className="text-sm text-muted-foreground">
                                          {variantLabel}
                                        </p>
                                        {isLow ? (
                                          <Badge
                                            variant="outline"
                                            className="text-xs text-amber-700"
                                          >
                                            Low stock
                                          </Badge>
                                        ) : null}
                                      </div>
                                    ) : null}
                                    {row.categoryIds.length > 0 ? (
                                      <div className="mt-1 flex flex-wrap gap-1">
                                        {row.categoryIds.map((id) =>
                                          categoryMap[id] ? (
                                            <Link
                                              key={id}
                                              href={`/admin/categories/${id}`}
                                              onClick={(e) =>
                                                e.stopPropagation()
                                              }
                                            >
                                              <Badge
                                                variant="secondary"
                                                className="text-xs"
                                              >
                                                {categoryMap[id].name}
                                              </Badge>
                                            </Link>
                                          ) : null
                                        )}
                                      </div>
                                    ) : null}
                                  </div>
                                </TableCell>
                                <TableCell className="text-sm text-muted-foreground">
                                  {row.sku || "—"}
                                </TableCell>
                                <TableCell className="tabular-nums">
                                  {formatCurrency(row.price)}
                                </TableCell>
                                <TableCell className="tabular-nums text-muted-foreground">
                                  {row.retailPrice != null
                                    ? formatCurrency(row.retailPrice)
                                    : "None"}
                                </TableCell>
                                <TableCell>
                                  <span
                                    className={cn(
                                      "tabular-nums font-medium",
                                      isLow && "text-amber-700"
                                    )}
                                  >
                                    {row.stock}
                                  </span>
                                </TableCell>
                                <TableCell className="tabular-nums text-muted-foreground">
                                  {row.lowStockThreshold}
                                </TableCell>
                                <TableCell
                                  className="text-right"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <DropdownMenu>
                                    <DropdownMenuTrigger
                                      render={
                                        <Button
                                          type="button"
                                          size="icon"
                                          variant="ghost"
                                          disabled={saving}
                                        >
                                          <MoreHorizontal className="h-4 w-4" />
                                          <span className="sr-only">
                                            Actions
                                          </span>
                                        </Button>
                                      }
                                    />
                                    <DropdownMenuContent align="end">
                                      <DropdownMenuItem
                                        onClick={() => {
                                          setHistoryTarget({
                                            branchId: activeBranchId,
                                            variantId: row.id,
                                            productName: row.productName,
                                            variantLabel,
                                            branchName:
                                              activeBranch?.name ?? null,
                                          });
                                          setHistoryOpen(true);
                                        }}
                                      >
                                        <History className="h-4 w-4" />
                                        Adjustment history
                                      </DropdownMenuItem>
                                    </DropdownMenuContent>
                                  </DropdownMenu>
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </div>
                  )}

                  <TablePagination
                    page={safePage}
                    totalPages={totalPages}
                    total={total}
                    pageSize={INVENTORY_PAGE_SIZE}
                    onPageChange={setPage}
                  />
                </div>

                {canEditStock ? (
                  <aside className="hidden w-full shrink-0 overflow-hidden rounded-xl border bg-muted/20 lg:sticky lg:top-4 lg:block lg:w-[320px] xl:w-[360px]">
                    <div className="flex max-h-[calc(100dvh-8rem)] flex-col">
                      <InventorySelectionPanel
                        selectedRows={selectedRows}
                        products={products}
                        saving={saving}
                        onRemove={(id) =>
                          setSelectedIds((prev) =>
                            prev.filter((rowId) => rowId !== id)
                          )
                        }
                        onClear={clearSelection}
                        onSelectAllVisible={selectAllVisible}
                        visibleCount={pageIds.length}
                        onSaveBulk={saveBulkStock}
                      />
                    </div>
                  </aside>
                ) : null}
              </div>
            </CardContent>
          </Card>

          {canEditStock && selectedIds.length > 0 ? (
            <div className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 p-3 backdrop-blur lg:hidden">
              <Button
                type="button"
                className="h-11 w-full"
                onClick={() => setSelectionSheetOpen(true)}
              >
                {selectedIds.length} selected — review & change stock
              </Button>
            </div>
          ) : null}

          {canEditStock ? (
            <Sheet
              open={selectionSheetOpen}
              onOpenChange={setSelectionSheetOpen}
            >
              <SheetContent
                side="bottom"
                className="flex h-[min(85dvh,40rem)] flex-col gap-0 p-0"
              >
                <SheetHeader className="sr-only">
                  <SheetTitle>Selected stock items</SheetTitle>
                </SheetHeader>
                <InventorySelectionPanel
                  selectedRows={selectedRows}
                  products={products}
                  saving={saving}
                  onRemove={(id) =>
                    setSelectedIds((prev) =>
                      prev.filter((rowId) => rowId !== id)
                    )
                  }
                  onClear={() => {
                    clearSelection();
                    setSelectionSheetOpen(false);
                  }}
                  onSelectAllVisible={selectAllVisible}
                  visibleCount={pageIds.length}
                  onSaveBulk={async (input) => {
                    const ok = await saveBulkStock(input);
                    if (ok) setSelectionSheetOpen(false);
                    return ok;
                  }}
                />
              </SheetContent>
            </Sheet>
          ) : null}
        </>
      )}

      <InventoryAdjustmentHistorySheet
        target={historyTarget}
        open={historyOpen}
        onOpenChange={(open) => {
          setHistoryOpen(open);
          if (!open) setHistoryTarget(null);
        }}
      />
    </div>
  );
}
