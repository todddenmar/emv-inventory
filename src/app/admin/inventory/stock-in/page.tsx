"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, History, X } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
import { TablePagination } from "@/components/admin/table-pagination";
import { useBranchAccess } from "@/hooks/use-branch-access";
import { useAuthStore } from "@/stores/auth-store";
import { getBranches } from "@/lib/firestore/branches";
import { getCategories } from "@/lib/firestore/categories";
import { getVendors } from "@/lib/firestore/vendors";
import { getProducts } from "@/lib/firestore/products";
import { getBranchInventory } from "@/lib/firestore/inventory";
import {
  completeSupplierStockIn,
  getSupplierStockIns,
} from "@/lib/firestore/supplier-stock-ins";
import {
  mergeVariantsWithInventory,
  type VariantWithStock,
} from "@/lib/inventory";
import { isProductPublished } from "@/lib/products-catalog";
import { formatVariantLabel } from "@/lib/product-variants";
import { formatDate } from "@/lib/format";
import { TABLE_PAGE_SIZE, paginateItems } from "@/lib/pagination";
import { cn } from "@/lib/utils";
import type {
  Branch,
  Category,
  Product,
  SupplierStockIn,
  Vendor,
} from "@/types";

type StockFilter = "all" | "low" | "out_of_stock" | "in_stock";

const STOCK_IN_PAGE_SIZE = TABLE_PAGE_SIZE; // 10

function rowLabel(row: VariantWithStock, products: Product[]): string {
  const product = products.find((p) => p.id === row.productId);
  const variantLabel = formatVariantLabel(row, product?.options ?? []);
  return variantLabel === "Default"
    ? row.productName
    : `${row.productName} — ${variantLabel}`;
}

function StockInSelectionPanel({
  selectedRows,
  products,
  qtyByVariant,
  bulkQtyText,
  notes,
  submitting,
  canSubmit,
  receivingCount,
  onBulkQtyTextChange,
  onApplyBulkQty,
  onSetQty,
  onRemove,
  onClear,
  onSelectAllVisible,
  onNotesChange,
  onSubmit,
  visibleCount,
}: {
  selectedRows: VariantWithStock[];
  products: Product[];
  qtyByVariant: Record<string, number>;
  bulkQtyText: string;
  notes: string;
  submitting: boolean;
  canSubmit: boolean;
  receivingCount: number;
  onBulkQtyTextChange: (value: string) => void;
  onApplyBulkQty: () => void;
  onSetQty: (variantId: string, value: number) => void;
  onRemove: (id: string) => void;
  onClear: () => void;
  onSelectAllVisible: () => void;
  onNotesChange: (value: string) => void;
  onSubmit: () => void;
  visibleCount: number;
}) {
  const selectedWithQty = selectedRows.filter(
    (row) => (qtyByVariant[row.id] ?? 0) > 0
  ).length;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-start justify-between gap-2 border-b px-4 py-3">
        <div className="min-w-0">
          <p className="font-semibold">Selected</p>
          <p className="text-sm text-muted-foreground">
            {selectedRows.length === 0
              ? "Select items in the table"
              : `${selectedRows.length} item${selectedRows.length === 1 ? "" : "s"}${
                  selectedWithQty > 0 ? ` · ${selectedWithQty} with qty` : ""
                }`}
          </p>
        </div>
        {selectedRows.length > 0 ? (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={submitting}
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
              const label = rowLabel(row, products);
              const qty = qtyByVariant[row.id] ?? 0;
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
                      Current {row.stock}
                      {row.sku ? ` · ${row.sku}` : ""}
                    </p>
                    <Input
                      type="number"
                      min={0}
                      value={qty || ""}
                      placeholder="Qty in"
                      className="mt-2 h-8"
                      disabled={submitting}
                      onChange={(e) =>
                        onSetQty(
                          row.id,
                          Math.max(0, Number(e.target.value) || 0)
                        )
                      }
                    />
                  </div>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="size-7 shrink-0"
                    disabled={submitting}
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

      <div className="shrink-0 space-y-3 border-t p-4">
        {selectedRows.length < visibleCount ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="w-full"
            disabled={submitting || visibleCount === 0}
            onClick={onSelectAllVisible}
          >
            Select all on page ({visibleCount})
          </Button>
        ) : null}
        <div className="flex gap-2">
          <Input
            type="number"
            min={0}
            placeholder="Qty for all"
            value={bulkQtyText}
            disabled={submitting || selectedRows.length === 0}
            className="h-8"
            onChange={(e) => {
              const raw = e.target.value;
              if (raw === "" || /^\d*$/.test(raw)) onBulkQtyTextChange(raw);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                onApplyBulkQty();
              }
            }}
          />
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={
              submitting ||
              selectedRows.length === 0 ||
              bulkQtyText.trim() === ""
            }
            onClick={onApplyBulkQty}
          >
            Apply
          </Button>
        </div>
        <div className="space-y-2">
          <Label htmlFor="stock-in-notes">Notes (optional)</Label>
          <Textarea
            id="stock-in-notes"
            value={notes}
            onChange={(e) => onNotesChange(e.target.value)}
            placeholder="Invoice #, delivery ref…"
            rows={2}
            disabled={submitting}
          />
        </div>
        <Button
          className="w-full"
          onClick={onSubmit}
          disabled={submitting || !canSubmit}
        >
          {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Complete stock in
          {receivingCount > 0 ? ` (${receivingCount})` : ""}
        </Button>
      </div>
    </div>
  );
}

function RecentReceiptsList({
  history,
  pagedHistory,
  page,
  totalPages,
  total,
  onPageChange,
}: {
  history: SupplierStockIn[];
  pagedHistory: SupplierStockIn[];
  page: number;
  totalPages: number;
  total: number;
  onPageChange: (page: number) => void;
}) {
  if (history.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        No stock ins yet.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {pagedHistory.map((entry) => (
        <div
          key={entry.id}
          className="border-b pb-3 last:border-0 last:pb-0"
        >
          <div className="flex items-start justify-between gap-2">
            <p className="text-sm font-medium">{entry.vendorName}</p>
            <p className="shrink-0 text-xs text-muted-foreground">
              {formatDate(entry.createdAt)}
            </p>
          </div>
          <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
            {entry.items
              .map((i) => `${i.productName} ×${i.quantity}`)
              .join(", ")}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {entry.createdByName ?? "Staff"}
          </p>
        </div>
      ))}
      <TablePagination
        page={page}
        totalPages={totalPages}
        total={total}
        onPageChange={onPageChange}
      />
    </div>
  );
}

export default function AdminStockInPage() {
  const { isElevatedAdmin, assignedBranchId } = useBranchAccess();
  const user = useAuthStore((s) => s.user);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [branchId, setBranchId] = useState("");
  const [vendorId, setVendorId] = useState("");
  const [notes, setNotes] = useState("");
  const [qtyByVariant, setQtyByVariant] = useState<Record<string, number>>({});
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkQtyText, setBulkQtyText] = useState("");
  const [selectionSheetOpen, setSelectionSheetOpen] = useState(false);
  const [historyDialogOpen, setHistoryDialogOpen] = useState(false);
  const [variantRows, setVariantRows] = useState<VariantWithStock[]>([]);
  const [history, setHistory] = useState<SupplierStockIn[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [search, setSearch] = useState("");
  const [stockFilter, setStockFilter] = useState<StockFilter>("all");
  const [historyPage, setHistoryPage] = useState(1);
  const [productPage, setProductPage] = useState(1);

  const defaultBranch = isElevatedAdmin ? "" : assignedBranchId ?? "";

  useEffect(() => {
    Promise.all([
      getBranches(true),
      getVendors(),
      getProducts(),
      getCategories(),
    ])
      .then(([b, v, p, cats]) => {
        setBranches(b);
        setVendors(v);
        setProducts(p.filter((x) => !x.isArchived && isProductPublished(x)));
        setCategories(cats.filter((c) => !c.isArchived));
        if (defaultBranch) setBranchId(defaultBranch);
        else if (isElevatedAdmin && b[0]) setBranchId(b[0].id);
        if (v[0]) setVendorId(v[0].id);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [defaultBranch, isElevatedAdmin]);

  useEffect(() => {
    if (!branchId) {
      setVariantRows([]);
      setHistory([]);
      return;
    }

    Promise.all([
      getBranchInventory(branchId),
      getSupplierStockIns({
        branchId: isElevatedAdmin ? branchId : assignedBranchId,
        max: 30,
      }),
    ])
      .then(([inv, stockIns]) => {
        setVariantRows(mergeVariantsWithInventory(products, inv, categories));
        setHistory(stockIns);
      })
      .catch(console.error);
  }, [branchId, products, categories, isElevatedAdmin, assignedBranchId]);

  const branch = branches.find((b) => b.id === branchId);
  const vendor = vendors.find((v) => v.id === vendorId);

  const supplierVariants = useMemo(() => {
    if (!vendorId) return [];
    return variantRows
      .filter((row) => {
        const product = products.find((p) => p.id === row.productId);
        return product?.vendorId === vendorId;
      })
      .sort((a, b) => {
        if (a.stock !== b.stock) return a.stock - b.stock;
        const nameCmp = a.productName.localeCompare(b.productName);
        if (nameCmp !== 0) return nameCmp;
        return a.id.localeCompare(b.id);
      });
  }, [variantRows, products, vendorId]);

  const filteredVariants = useMemo(() => {
    const q = search.trim().toLowerCase();
    return supplierVariants.filter((row) => {
      const product = products.find((p) => p.id === row.productId);
      const variantLabel = formatVariantLabel(row, product?.options ?? []);
      const matchesSearch =
        !q ||
        row.productName.toLowerCase().includes(q) ||
        row.sku.toLowerCase().includes(q) ||
        variantLabel.toLowerCase().includes(q);

      const isOut = row.stock <= 0;
      const isLow = row.stock > 0 && row.stock <= row.lowStockThreshold;
      const matchesStock =
        stockFilter === "all" ||
        (stockFilter === "out_of_stock" && isOut) ||
        (stockFilter === "low" && isLow) ||
        (stockFilter === "in_stock" && row.stock > 0);

      return matchesSearch && matchesStock;
    });
  }, [supplierVariants, products, search, stockFilter]);

  useEffect(() => {
    setQtyByVariant({});
    setSelectedIds([]);
    setBulkQtyText("");
  }, [vendorId, branchId]);

  useEffect(() => {
    setProductPage(1);
    setSelectedIds([]);
  }, [search, stockFilter, vendorId, branchId]);

  useEffect(() => {
    setHistoryPage(1);
  }, [branchId]);

  const {
    page: safeProductPage,
    totalPages: productTotalPages,
    pagedItems,
    total: productTotal,
  } = useMemo(
    () => paginateItems(filteredVariants, productPage, STOCK_IN_PAGE_SIZE),
    [filteredVariants, productPage]
  );

  useEffect(() => {
    if (productPage !== safeProductPage) setProductPage(safeProductPage);
  }, [productPage, safeProductPage]);

  const {
    page: safeHistoryPage,
    totalPages: historyTotalPages,
    pagedItems: pagedHistory,
    total: historyTotal,
  } = useMemo(
    () => paginateItems(history, historyPage),
    [history, historyPage]
  );

  useEffect(() => {
    if (historyPage !== safeHistoryPage) setHistoryPage(safeHistoryPage);
  }, [historyPage, safeHistoryPage]);

  const pageIds = pagedItems.map((row) => row.id);
  const allPageSelected =
    pageIds.length > 0 && pageIds.every((id) => selectedIds.includes(id));
  const somePageSelected = pageIds.some((id) => selectedIds.includes(id));

  const selectedRows = useMemo(() => {
    const byId = new Map(supplierVariants.map((row) => [row.id, row]));
    return selectedIds
      .map((id) => byId.get(id))
      .filter((row): row is VariantWithStock => row != null);
  }, [selectedIds, supplierVariants]);

  const linesToSubmit = useMemo(() => {
    return supplierVariants
      .map((row) => {
        const quantity = qtyByVariant[row.id] ?? 0;
        if (quantity <= 0) return null;
        return {
          productId: row.productId,
          productName: rowLabel(row, products),
          variantId: row.id,
          quantity,
          currentStock: row.stock,
        };
      })
      .filter((line): line is NonNullable<typeof line> => line != null);
  }, [supplierVariants, qtyByVariant, products]);

  const totalQtyIn = useMemo(
    () => linesToSubmit.reduce((sum, line) => sum + line.quantity, 0),
    [linesToSubmit]
  );

  const outCount = useMemo(
    () => supplierVariants.filter((row) => row.stock <= 0).length,
    [supplierVariants]
  );

  const lowCount = useMemo(
    () =>
      supplierVariants.filter(
        (row) => row.stock > 0 && row.stock <= row.lowStockThreshold
      ).length,
    [supplierVariants]
  );

  const branchSelectLabel = (value: string | null) => {
    if (!value) return null;
    const b = branches.find((row) => row.id === value);
    return b ? `${b.name} (${b.code})` : null;
  };

  const vendorSelectLabel = (value: string | null) => {
    if (!value) return null;
    return vendors.find((v) => v.id === value)?.name ?? null;
  };

  const stockSelectLabel = (value: string | null) => {
    switch (value as StockFilter) {
      case "low":
        return "Low stock";
      case "out_of_stock":
        return "Out of stock";
      case "in_stock":
        return "In stock";
      default:
        return "All stock levels";
    }
  };

  const setQty = (variantId: string, value: number) => {
    setQtyByVariant((prev) => {
      const next = { ...prev };
      if (value <= 0) {
        delete next[variantId];
      } else {
        next[variantId] = value;
      }
      return next;
    });
  };

  const toggleSelected = (id: string) => {
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

  const clearSelection = () => {
    setSelectedIds([]);
    setBulkQtyText("");
  };

  const applyBulkQty = () => {
    const amount = Math.floor(Number(bulkQtyText));
    if (!Number.isFinite(amount) || amount < 0 || selectedIds.length === 0) {
      return;
    }
    setQtyByVariant((prev) => {
      const next = { ...prev };
      for (const id of selectedIds) {
        if (amount <= 0) delete next[id];
        else next[id] = amount;
      }
      return next;
    });
    toast.success(
      amount <= 0
        ? `Cleared qty on ${selectedIds.length} item${selectedIds.length === 1 ? "" : "s"}`
        : `Set qty ${amount} on ${selectedIds.length} item${selectedIds.length === 1 ? "" : "s"}`
    );
  };

  const handleSubmit = async () => {
    if (!user || !branch || !vendor) {
      toast.error("Select branch and supplier");
      return;
    }
    if (linesToSubmit.length === 0) {
      toast.error("Enter a quantity for at least one variant");
      return;
    }

    setSubmitting(true);
    try {
      await completeSupplierStockIn({
        branchId: branch.id,
        branchName: branch.name,
        vendorId: vendor.id,
        vendorName: vendor.name,
        items: linesToSubmit.map(
          ({ productId, productName, variantId, quantity }) => ({
            productId,
            productName,
            variantId,
            quantity,
          })
        ),
        notes: notes.trim() || null,
        createdBy: user.uid,
        createdByName: user.displayName ?? user.email,
      });
      toast.success("Stock in recorded");
      setQtyByVariant({});
      setSelectedIds([]);
      setBulkQtyText("");
      setNotes("");
      const [inv, stockIns] = await Promise.all([
        getBranchInventory(branch.id),
        getSupplierStockIns({ branchId: branch.id, max: 30 }),
      ]);
      setVariantRows(mergeVariantsWithInventory(products, inv, categories));
      setHistory(stockIns);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Stock in failed");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return <p className="text-muted-foreground">Loading stock in...</p>;
  }

  if (branches.length === 0) {
    return (
      <p className="text-muted-foreground">
        Create a branch before recording supplier stock in.
      </p>
    );
  }

  if (vendors.length === 0) {
    return (
      <p className="text-muted-foreground">
        Add a supplier first under Settings → Suppliers.
      </p>
    );
  }

  const selectionPanel = (
    <StockInSelectionPanel
      selectedRows={selectedRows}
      products={products}
      qtyByVariant={qtyByVariant}
      bulkQtyText={bulkQtyText}
      notes={notes}
      submitting={submitting}
      canSubmit={
        linesToSubmit.length > 0 && Boolean(vendorId) && Boolean(branchId)
      }
      receivingCount={linesToSubmit.length}
      onBulkQtyTextChange={setBulkQtyText}
      onApplyBulkQty={applyBulkQty}
      onSetQty={setQty}
      onRemove={(id) =>
        setSelectedIds((prev) => prev.filter((rowId) => rowId !== id))
      }
      onClear={clearSelection}
      onSelectAllVisible={selectAllVisible}
      onNotesChange={setNotes}
      onSubmit={() => void handleSubmit()}
      visibleCount={pageIds.length}
    />
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Supplier stock in</h1>
          <p className="text-muted-foreground">
            Select variants, set receive quantities, then complete stock in
          </p>
        </div>
        <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center lg:w-auto">
          <Select
            value={branchId}
            onValueChange={(v) => setBranchId(v ?? "")}
            disabled={!isElevatedAdmin}
          >
            <SelectTrigger className="w-full sm:w-56">
              <SelectValue placeholder="Select branch">
                {(value) => branchSelectLabel(value as string | null)}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {branches.map((b) => (
                <SelectItem key={b.id} value={b.id}>
                  {b.name} ({b.code})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={vendorId}
            onValueChange={(v) => setVendorId(v ?? "")}
          >
            <SelectTrigger className="w-full sm:w-56">
              <SelectValue placeholder="Select supplier">
                {(value) => vendorSelectLabel(value as string | null)}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {vendors.map((v) => (
                <SelectItem key={v.id} value={v.id}>
                  {v.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            type="button"
            variant="outline"
            className="w-full sm:w-auto"
            disabled={!branchId}
            onClick={() => setHistoryDialogOpen(true)}
          >
            <History className="mr-2 h-4 w-4" />
            Recent receipts
            {history.length > 0 ? ` (${history.length})` : ""}
          </Button>
        </div>
      </div>

      <div
        className={cn(
          "flex min-w-0 flex-col gap-4 lg:flex-row lg:items-start",
          selectedIds.length > 0 && "pb-24 lg:pb-0"
        )}
      >
        <Card className="min-w-0 flex-1">
          <CardHeader className="space-y-4 pb-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <CardTitle className="text-base">
                  {vendor ? `${vendor.name} variants` : "Supplier variants"}
                </CardTitle>
                <CardDescription>
                  {branch
                    ? `Current stock at ${branch.name}. Select items, set qty (10 per page).`
                    : "Select a branch to load stock."}
                </CardDescription>
              </div>
              {branchId && vendorId ? (
                <div className="flex shrink-0 gap-3 text-sm">
                  <div className="text-center">
                    <p className="text-xs text-muted-foreground">Variants</p>
                    <p className="font-semibold tabular-nums">
                      {supplierVariants.length}
                    </p>
                  </div>
                  <div className="text-center">
                    <p className="text-xs text-muted-foreground">Out</p>
                    <p className="font-semibold tabular-nums text-destructive">
                      {outCount}
                    </p>
                  </div>
                  <div className="text-center">
                    <p className="text-xs text-muted-foreground">Low</p>
                    <p className="font-semibold tabular-nums text-amber-700">
                      {lowCount}
                    </p>
                  </div>
                </div>
              ) : null}
            </div>
            {branchId && vendorId ? (
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <Input
                  placeholder="Search product, SKU, or variant..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="sm:max-w-xs"
                />
                <Select
                  value={stockFilter}
                  onValueChange={(v) =>
                    setStockFilter((v as StockFilter) ?? "all")
                  }
                >
                  <SelectTrigger className="sm:w-44">
                    <SelectValue placeholder="All stock levels">
                      {(value) => stockSelectLabel(value as string | null)}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All stock levels</SelectItem>
                    <SelectItem value="out_of_stock">Out of stock</SelectItem>
                    <SelectItem value="low">Low stock</SelectItem>
                    <SelectItem value="in_stock">In stock</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            ) : null}
          </CardHeader>
          <CardContent className="space-y-4">
            {!branchId || !vendorId ? (
              <p className="py-12 text-center text-sm text-muted-foreground">
                Select a branch and supplier to see variants.
              </p>
            ) : (
              <>
                <div className="overflow-x-auto rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-10">
                          <Checkbox
                            checked={allPageSelected}
                            indeterminate={
                              somePageSelected && !allPageSelected
                            }
                            disabled={pagedItems.length === 0}
                            onCheckedChange={() => {
                              if (allPageSelected) deselectPage();
                              else selectAllVisible();
                            }}
                            aria-label="Select all on page"
                          />
                        </TableHead>
                        <TableHead>Product / variant</TableHead>
                        <TableHead className="w-24">SKU</TableHead>
                        <TableHead className="w-20">Current</TableHead>
                        <TableHead className="w-20">Low at</TableHead>
                        <TableHead className="w-28">Qty in</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredVariants.length === 0 ? (
                        <TableRow>
                          <TableCell
                            colSpan={6}
                            className="py-8 text-center text-muted-foreground"
                          >
                            {supplierVariants.length === 0
                              ? "No products assigned to this supplier."
                              : "No variants match your filters."}
                          </TableCell>
                        </TableRow>
                      ) : (
                        pagedItems.map((row) => {
                          const isOut = row.stock <= 0;
                          const isLow =
                            row.stock > 0 &&
                            row.stock <= row.lowStockThreshold;
                          const qty = qtyByVariant[row.id] ?? 0;
                          const selected = selectedIds.includes(row.id);
                          const product = products.find(
                            (p) => p.id === row.productId
                          );
                          const variantLabel = formatVariantLabel(
                            row,
                            product?.options ?? []
                          );

                          return (
                            <TableRow
                              key={row.id}
                              data-state={selected ? "selected" : undefined}
                              className={cn(
                                "cursor-pointer",
                                isOut && "bg-destructive/5",
                                isLow &&
                                  "bg-amber-50/60 dark:bg-amber-950/20",
                                selected && "bg-primary/5"
                              )}
                              onClick={() => toggleSelected(row.id)}
                            >
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
                              <TableCell>
                                <div className="min-w-[180px]">
                                  <div className="flex flex-wrap items-center gap-1.5">
                                    <p className="font-medium">
                                      {row.productName}
                                    </p>
                                    {variantLabel === "Default" && isOut ? (
                                      <Badge
                                        variant="outline"
                                        className="text-xs text-destructive"
                                      >
                                        Out of stock
                                      </Badge>
                                    ) : null}
                                    {variantLabel === "Default" &&
                                    !isOut &&
                                    isLow ? (
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
                                      {isOut ? (
                                        <Badge
                                          variant="outline"
                                          className="text-xs text-destructive"
                                        >
                                          Out of stock
                                        </Badge>
                                      ) : isLow ? (
                                        <Badge
                                          variant="outline"
                                          className="text-xs text-amber-700"
                                        >
                                          Low stock
                                        </Badge>
                                      ) : null}
                                    </div>
                                  ) : null}
                                </div>
                              </TableCell>
                              <TableCell className="text-sm text-muted-foreground">
                                {row.sku || "—"}
                              </TableCell>
                              <TableCell
                                className={cn(
                                  "tabular-nums font-medium",
                                  isOut && "text-destructive",
                                  isLow && "text-amber-700"
                                )}
                              >
                                {row.stock}
                              </TableCell>
                              <TableCell className="tabular-nums text-muted-foreground">
                                {row.lowStockThreshold}
                              </TableCell>
                              <TableCell
                                onClick={(e) => e.stopPropagation()}
                              >
                                <Input
                                  type="number"
                                  min={0}
                                  value={qty || ""}
                                  placeholder="0"
                                  className="w-24"
                                  disabled={submitting}
                                  onChange={(e) => {
                                    const next = Math.max(
                                      0,
                                      Number(e.target.value) || 0
                                    );
                                    setQty(row.id, next);
                                    if (next > 0 && !selected) {
                                      setSelectedIds((prev) =>
                                        prev.includes(row.id)
                                          ? prev
                                          : [...prev, row.id]
                                      );
                                    }
                                  }}
                                />
                              </TableCell>
                            </TableRow>
                          );
                        })
                      )}
                    </TableBody>
                  </Table>
                </div>
                <TablePagination
                  page={safeProductPage}
                  totalPages={productTotalPages}
                  total={productTotal}
                  pageSize={STOCK_IN_PAGE_SIZE}
                  onPageChange={setProductPage}
                />
              </>
            )}
          </CardContent>
        </Card>

        {branchId && vendorId ? (
          <aside className="hidden h-[calc(100dvh-8rem)] w-full shrink-0 overflow-hidden rounded-xl border bg-muted/20 lg:sticky lg:top-4 lg:block lg:w-[300px] xl:w-[320px]">
            {selectionPanel}
          </aside>
        ) : null}
      </div>

      {branchId && vendorId && selectedIds.length > 0 ? (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 p-3 backdrop-blur lg:hidden">
          <Button
            type="button"
            className="h-11 w-full"
            onClick={() => setSelectionSheetOpen(true)}
          >
            {selectedIds.length} selected — review & set qty
            {totalQtyIn > 0 ? ` · qty ${totalQtyIn}` : ""}
          </Button>
        </div>
      ) : null}

      <Sheet open={selectionSheetOpen} onOpenChange={setSelectionSheetOpen}>
        <SheetContent
          side="bottom"
          className="flex h-[min(85dvh,40rem)] flex-col gap-0 p-0"
        >
          <SheetHeader className="sr-only">
            <SheetTitle>Selected stock-in items</SheetTitle>
          </SheetHeader>
          {selectionPanel}
        </SheetContent>
      </Sheet>

      <Dialog open={historyDialogOpen} onOpenChange={setHistoryDialogOpen}>
        <DialogContent className="flex max-h-[85dvh] flex-col gap-0 overflow-hidden p-0 sm:max-w-md">
          <DialogHeader className="shrink-0 border-b p-4 pr-12">
            <DialogTitle>Recent receipts</DialogTitle>
            <DialogDescription>
              {branch
                ? `Supplier stock-ins for ${branch.name}`
                : "Select a branch to view receipts"}
            </DialogDescription>
          </DialogHeader>
          <div className="min-h-0 flex-1 overflow-y-auto p-4">
            <RecentReceiptsList
              history={history}
              pagedHistory={pagedHistory}
              page={safeHistoryPage}
              totalPages={historyTotalPages}
              total={historyTotal}
              onPageChange={setHistoryPage}
            />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
