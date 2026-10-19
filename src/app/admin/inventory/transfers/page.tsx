"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, Search, X } from "lucide-react";
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { InventoryActivityFeed } from "@/components/admin/inventory-activity-feed";
import { MobileSelectionBar } from "@/components/admin/mobile-selection-bar";
import { TablePagination } from "@/components/admin/table-pagination";
import { useBranchAccess } from "@/hooks/use-branch-access";
import { useAuthStore } from "@/stores/auth-store";
import { getBranches } from "@/lib/firestore/branches";
import { getProducts } from "@/lib/firestore/products";
import { getBranchInventory } from "@/lib/firestore/inventory";
import {
  createBranchTransfer,
  getBranchTransfers,
} from "@/lib/firestore/transfers";
import {
  mergeSellingVariantsWithInventory,
  type VariantWithStock,
} from "@/lib/inventory";
import { formatVariantLabel } from "@/lib/product-variants";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { paginateItems, TABLE_PAGE_SIZE } from "@/lib/pagination";
import type { Branch, BranchTransfer, Product } from "@/types";

function firstDestinationId(branches: Branch[], fromId: string) {
  return branches.find((b) => b.id !== fromId)?.id ?? "";
}

function rowLabel(row: VariantWithStock, products: Product[]) {
  const product = products.find((p) => p.id === row.productId);
  const variantLabel = formatVariantLabel(row, product?.options ?? []);
  return variantLabel === "Default"
    ? row.productName
    : `${row.productName} — ${variantLabel}`;
}

function TransferSelectionPanel({
  selectedRows,
  products,
  qtyByVariant,
  bulkQtyText,
  notes,
  submitting,
  canSubmit,
  lineCount,
  totalUnits,
  visibleCount,
  onBulkQtyTextChange,
  onSetQty,
  onRemove,
  onClear,
  onSelectAllVisible,
  onNotesChange,
  onSubmit,
}: {
  selectedRows: VariantWithStock[];
  products: Product[];
  qtyByVariant: Record<string, number>;
  bulkQtyText: string;
  notes: string;
  submitting: boolean;
  canSubmit: boolean;
  lineCount: number;
  totalUnits: number;
  visibleCount: number;
  onBulkQtyTextChange: (value: string) => void;
  onSetQty: (variantId: string, value: number) => void;
  onRemove: (id: string) => void;
  onClear: () => void;
  onSelectAllVisible: () => void;
  onNotesChange: (value: string) => void;
  onSubmit: () => void;
}) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-start justify-between gap-2 border-b px-4 py-3">
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
              const qty = qtyByVariant[row.id] ?? 1;
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
                      Available {row.stock}
                      {row.sku ? ` · ${row.sku}` : ""}
                    </p>
                    <Input
                      type="number"
                      min={1}
                      max={row.stock}
                      value={qty}
                      className="mt-2 h-8"
                      disabled={submitting}
                      onChange={(e) =>
                        onSetQty(
                          row.id,
                          Math.min(
                            row.stock,
                            Math.max(1, Number(e.target.value) || 1)
                          )
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
        <div className="space-y-1.5">
          <Input
            type="number"
            min={1}
            placeholder="Qty for all"
            value={bulkQtyText}
            disabled={submitting || selectedRows.length === 0}
            className="h-8"
            onChange={(e) => {
              const raw = e.target.value;
              if (raw === "" || /^\d*$/.test(raw)) onBulkQtyTextChange(raw);
            }}
          />
          <p className="text-xs text-muted-foreground">
            {selectedRows.length === 0
              ? "Select items to set qty for all at once."
              : `Updates qty on all ${selectedRows.length} selected item${
                  selectedRows.length === 1 ? "" : "s"
                } (capped by available stock).`}
          </p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="transfer-notes">Notes (optional)</Label>
          <Textarea
            id="transfer-notes"
            value={notes}
            onChange={(e) => onNotesChange(e.target.value)}
            placeholder="Reason or reference for this transfer..."
            rows={2}
            disabled={submitting}
          />
        </div>
        {lineCount > 0 ? (
          <div className="rounded-lg border bg-muted/30 p-3 text-sm">
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium">Ready to transfer</span>
              <span className="tabular-nums font-semibold">
                {lineCount} variant{lineCount === 1 ? "" : "s"} · {totalUnits}{" "}
                unit{totalUnits === 1 ? "" : "s"}
              </span>
            </div>
          </div>
        ) : null}
        <Button
          className="w-full"
          onClick={onSubmit}
          disabled={submitting || !canSubmit}
        >
          {submitting ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : null}
          Complete transfer
          {lineCount > 0 ? ` · ${lineCount}` : ""}
        </Button>
      </div>
    </div>
  );
}

export default function AdminTransfersPage() {
  const { isElevatedAdmin, assignedBranchId } = useBranchAccess();
  const user = useAuthStore((s) => s.user);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [fromBranchId, setFromBranchId] = useState("");
  const [toBranchId, setToBranchId] = useState("");
  const [notes, setNotes] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [qtyByVariant, setQtyByVariant] = useState<Record<string, number>>({});
  const [bulkQtyText, setBulkQtyText] = useState("");
  const [sellingVariants, setSellingVariants] = useState<VariantWithStock[]>(
    []
  );
  const [transfers, setTransfers] = useState<BranchTransfer[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [historyPage, setHistoryPage] = useState(1);
  const [catalogPage, setCatalogPage] = useState(1);
  const [catalogSearch, setCatalogSearch] = useState("");
  const [detailsTransfer, setDetailsTransfer] =
    useState<BranchTransfer | null>(null);
  const [selectionSheetOpen, setSelectionSheetOpen] = useState(false);
  const [tab, setTab] = useState("history");

  const defaultFromBranch = isElevatedAdmin ? "" : assignedBranchId ?? "";

  useEffect(() => {
    Promise.all([getBranches(true), getProducts(), getBranchTransfers()])
      .then(([b, p, t]) => {
        setBranches(b);
        setProducts(p.filter((x) => !x.isArchived));
        setTransfers(t);
        const fromId = defaultFromBranch || b[0]?.id || "";
        if (fromId) {
          setFromBranchId(fromId);
          setToBranchId(firstDestinationId(b, fromId));
        }
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [defaultFromBranch]);

  useEffect(() => {
    if (!fromBranchId) return;
    let cancelled = false;
    getBranchInventory(fromBranchId)
      .then((inv) => {
        if (cancelled) return;
        const rows = mergeSellingVariantsWithInventory(
          products.filter((x) => !x.isArchived),
          inv
        );
        setSellingVariants(rows);
      })
      .catch(console.error);
    return () => {
      cancelled = true;
    };
  }, [fromBranchId, products]);

  const fromBranch = branches.find((b) => b.id === fromBranchId);
  const toBranch = branches.find((b) => b.id === toBranchId);
  const destinationOptions = branches.filter((b) => b.id !== fromBranchId);

  const branchSelectLabel = (value: string | null) => {
    if (!value) return null;
    const branch = branches.find((b) => b.id === value);
    return branch ? `${branch.name} (${branch.code})` : null;
  };

  const inStockVariants = useMemo(
    () => sellingVariants.filter((v) => v.stock > 0),
    [sellingVariants]
  );

  const filteredCatalog = useMemo(() => {
    const q = catalogSearch.trim().toLowerCase();
    if (!q) return inStockVariants;
    return inStockVariants.filter((row) => {
      const product = products.find((p) => p.id === row.productId);
      const label = formatVariantLabel(row, product?.options ?? []);
      return (
        row.productName.toLowerCase().includes(q) ||
        row.sku.toLowerCase().includes(q) ||
        label.toLowerCase().includes(q)
      );
    });
  }, [inStockVariants, catalogSearch, products]);

  const {
    page: safeCatalogPage,
    totalPages: catalogTotalPages,
    pagedItems: pagedCatalog,
    total: catalogTotal,
  } = useMemo(
    () => paginateItems(filteredCatalog, catalogPage, TABLE_PAGE_SIZE),
    [filteredCatalog, catalogPage]
  );

  const {
    page: safeHistoryPage,
    totalPages: historyTotalPages,
    pagedItems: pagedHistory,
    total: historyTotal,
  } = useMemo(
    () => paginateItems(transfers, historyPage),
    [transfers, historyPage]
  );

  const pageIds = useMemo(
    () => pagedCatalog.map((row) => row.id),
    [pagedCatalog]
  );
  const allPageSelected =
    pageIds.length > 0 && pageIds.every((id) => selectedIds.includes(id));
  const somePageSelected = pageIds.some((id) => selectedIds.includes(id));

  const selectedRows = useMemo(() => {
    const byId = new Map(inStockVariants.map((row) => [row.id, row]));
    return selectedIds
      .map((id) => byId.get(id))
      .filter((row): row is VariantWithStock => row != null);
  }, [selectedIds, inStockVariants]);

  const linesToSubmit = useMemo(() => {
    return selectedRows
      .map((row) => {
        const quantity = qtyByVariant[row.id] ?? 1;
        if (quantity < 1 || quantity > row.stock) return null;
        return {
          productId: row.productId,
          productName: rowLabel(row, products),
          variantId: row.id,
          quantity,
        };
      })
      .filter((line): line is NonNullable<typeof line> => line != null);
  }, [selectedRows, qtyByVariant, products]);

  const totalUnits = useMemo(
    () => linesToSubmit.reduce((sum, line) => sum + line.quantity, 0),
    [linesToSubmit]
  );

  const canSubmit =
    Boolean(user && fromBranch && toBranch) && linesToSubmit.length > 0;

  const clearSelection = () => {
    setSelectedIds([]);
    setQtyByVariant({});
    setBulkQtyText("");
  };

  const setQty = (variantId: string, value: number) => {
    setQtyByVariant((prev) => ({ ...prev, [variantId]: value }));
  };

  const toggleSelected = (id: string) => {
    setSelectedIds((prev) => {
      if (prev.includes(id)) {
        setQtyByVariant((qty) => {
          const next = { ...qty };
          delete next[id];
          return next;
        });
        return prev.filter((x) => x !== id);
      }
      setQtyByVariant((qty) => ({ ...qty, [id]: qty[id] ?? 1 }));
      return [...prev, id];
    });
  };

  const selectAllVisible = () => {
    setSelectedIds((prev) => [...new Set([...prev, ...pageIds])]);
    setQtyByVariant((prev) => {
      const next = { ...prev };
      for (const id of pageIds) {
        if (next[id] == null) next[id] = 1;
      }
      return next;
    });
  };

  const deselectPage = () => {
    const pageSet = new Set(pageIds);
    setSelectedIds((prev) => prev.filter((id) => !pageSet.has(id)));
    setQtyByVariant((prev) => {
      const next = { ...prev };
      for (const id of pageIds) delete next[id];
      return next;
    });
  };

  const handleBulkQtyTextChange = (raw: string) => {
    setBulkQtyText(raw);
    if (raw === "") return;
    const amount = Math.floor(Number(raw));
    if (!Number.isFinite(amount) || amount < 1) return;
    if (selectedRows.length === 0) return;

    setQtyByVariant((prev) => {
      const next = { ...prev };
      for (const row of selectedRows) {
        next[row.id] = Math.min(row.stock, amount);
      }
      return next;
    });
  };

  const handleFromBranchChange = (nextFrom: string) => {
    setFromBranchId(nextFrom);
    setSellingVariants([]);
    clearSelection();
    setCatalogSearch("");
    setCatalogPage(1);
    setToBranchId(firstDestinationId(branches, nextFrom));
  };

  const handleTransfer = async () => {
    if (!user || !fromBranch || !toBranch) {
      toast.error("Select source and destination branches");
      return;
    }
    if (linesToSubmit.length === 0) {
      toast.error("Select at least one variant with a valid quantity");
      return;
    }

    setSubmitting(true);
    try {
      await createBranchTransfer({
        fromBranchId: fromBranch.id,
        fromBranchName: fromBranch.name,
        toBranchId: toBranch.id,
        toBranchName: toBranch.name,
        items: linesToSubmit,
        notes: notes.trim() || null,
        createdBy: user.uid,
        createdByName: user.displayName ?? user.email,
      });
      toast.success("Transfer completed");
      clearSelection();
      setNotes("");
      setSelectionSheetOpen(false);
      setToBranchId(firstDestinationId(branches, fromBranch.id));
      const [inv, t] = await Promise.all([
        getBranchInventory(fromBranch.id),
        getBranchTransfers(),
      ]);
      setSellingVariants(
        mergeSellingVariantsWithInventory(
          products.filter((x) => !x.isArchived),
          inv
        )
      );
      setTransfers(t);
      setTab("history");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Transfer failed");
    } finally {
      setSubmitting(false);
    }
  };

  const selectionPanel = (
    <TransferSelectionPanel
      selectedRows={selectedRows}
      products={products}
      qtyByVariant={qtyByVariant}
      bulkQtyText={bulkQtyText}
      notes={notes}
      submitting={submitting}
      canSubmit={canSubmit}
      lineCount={linesToSubmit.length}
      totalUnits={totalUnits}
      visibleCount={pageIds.length}
      onBulkQtyTextChange={handleBulkQtyTextChange}
      onSetQty={setQty}
      onRemove={(id) => {
        setSelectedIds((prev) => prev.filter((x) => x !== id));
        setQtyByVariant((prev) => {
          const next = { ...prev };
          delete next[id];
          return next;
        });
      }}
      onClear={clearSelection}
      onSelectAllVisible={selectAllVisible}
      onNotesChange={setNotes}
      onSubmit={() => void handleTransfer()}
    />
  );

  if (loading) {
    return <p className="text-muted-foreground">Loading transfers...</p>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Stock transfers</h1>
        <p className="text-muted-foreground">
          Move inventory between branches with a full audit trail
        </p>
      </div>

      <Tabs
        value={tab}
        onValueChange={(value) => setTab(value ?? "history")}
        className="gap-4"
      >
        <TabsList>
          <TabsTrigger value="history" className="px-3">
            Transfer history
          </TabsTrigger>
          <TabsTrigger value="activity" className="px-3">
            Recent activity
          </TabsTrigger>
          <TabsTrigger value="new" className="px-3">
            New transfer
          </TabsTrigger>
        </TabsList>

        <TabsContent value="history" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Transfer history</CardTitle>
              <CardDescription>
                Recent branch-to-branch movements
              </CardDescription>
            </CardHeader>
            <CardContent>
              {transfers.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No transfers yet.
                </p>
              ) : (
                <div className="overflow-x-auto rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>From</TableHead>
                        <TableHead>To</TableHead>
                        <TableHead>Items</TableHead>
                        <TableHead>By</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {pagedHistory.map((transfer) => {
                        const first = transfer.items[0];
                        const itemCount = transfer.items.length;
                        return (
                          <TableRow key={transfer.id}>
                            <TableCell className="whitespace-nowrap text-sm">
                              {formatDate(transfer.createdAt)}
                            </TableCell>
                            <TableCell>{transfer.fromBranchName}</TableCell>
                            <TableCell>{transfer.toBranchName}</TableCell>
                            <TableCell className="max-w-xs text-sm">
                              {first ? (
                                <div className="space-y-1">
                                  <p className="truncate">
                                    {first.productName} ×{first.quantity}
                                  </p>
                                  {itemCount > 1 ? (
                                    <Button
                                      type="button"
                                      variant="link"
                                      size="sm"
                                      className="h-auto p-0"
                                      onClick={() =>
                                        setDetailsTransfer(transfer)
                                      }
                                    >
                                      Show all ({itemCount}) items
                                    </Button>
                                  ) : null}
                                </div>
                              ) : (
                                <span className="text-muted-foreground">—</span>
                              )}
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground">
                              {transfer.createdByName ?? "Staff"}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
              {transfers.length > 0 ? (
                <TablePagination
                  page={safeHistoryPage}
                  totalPages={historyTotalPages}
                  total={historyTotal}
                  onPageChange={setHistoryPage}
                  className="mt-4"
                />
              ) : null}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="activity">
          <InventoryActivityFeed
            branchId={isElevatedAdmin ? null : assignedBranchId}
            showViewAll={false}
            max={20}
          />
        </TabsContent>

        <TabsContent value="new" className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Branches</CardTitle>
              <CardDescription>
                {isElevatedAdmin
                  ? "Transfer selling variants from any branch to another"
                  : `Transfer stock out of ${fromBranch?.name ?? "your branch"}`}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>From branch</Label>
                  <Select
                    value={fromBranchId}
                    onValueChange={(v) => handleFromBranchChange(v ?? "")}
                    disabled={!isElevatedAdmin}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select source branch">
                        {(value) => branchSelectLabel(value as string | null)}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {branches.map((branch) => (
                        <SelectItem key={branch.id} value={branch.id}>
                          {branch.name} ({branch.code})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>To branch</Label>
                  <Select
                    value={toBranchId}
                    onValueChange={(v) => setToBranchId(v ?? "")}
                    disabled={!fromBranchId}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select destination branch">
                        {(value) => branchSelectLabel(value as string | null)}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {destinationOptions.map((branch) => (
                        <SelectItem key={branch.id} value={branch.id}>
                          {branch.name} ({branch.code})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>

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
                    <CardTitle className="text-base">Catalog</CardTitle>
                    <CardDescription>
                      {fromBranch
                        ? `In-stock selling variants at ${fromBranch.name} (${TABLE_PAGE_SIZE} per page).`
                        : "Select a source branch to load stock."}
                    </CardDescription>
                  </div>
                  {fromBranchId ? (
                    <div className="text-center text-sm">
                      <p className="text-xs text-muted-foreground">In stock</p>
                      <p className="font-semibold tabular-nums">
                        {inStockVariants.length}
                      </p>
                    </div>
                  ) : null}
                </div>
                {fromBranchId ? (
                  <div className="relative max-w-md">
                    <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      value={catalogSearch}
                      onChange={(e) => {
                        setCatalogSearch(e.target.value);
                        setCatalogPage(1);
                      }}
                      placeholder="Search product, SKU, or variant…"
                      className="pl-9"
                    />
                  </div>
                ) : null}
              </CardHeader>
              <CardContent className="space-y-4">
                {!fromBranchId ? (
                  <p className="py-12 text-center text-sm text-muted-foreground">
                    Select a source branch to see variants.
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
                                disabled={pagedCatalog.length === 0}
                                onCheckedChange={() => {
                                  if (allPageSelected) deselectPage();
                                  else selectAllVisible();
                                }}
                                aria-label="Select all on page"
                              />
                            </TableHead>
                            <TableHead>Product / variant</TableHead>
                            <TableHead className="w-28">SKU</TableHead>
                            <TableHead className="w-28">Available</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {pagedCatalog.length === 0 ? (
                            <TableRow>
                              <TableCell
                                colSpan={4}
                                className="py-8 text-center text-muted-foreground"
                              >
                                {inStockVariants.length === 0
                                  ? "No in-stock selling variants at this branch."
                                  : "No variants match your search."}
                              </TableCell>
                            </TableRow>
                          ) : (
                            pagedCatalog.map((row) => {
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
                                  data-state={
                                    selected ? "selected" : undefined
                                  }
                                  className={cn(
                                    "cursor-pointer",
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
                                    <p className="font-medium">
                                      {row.productName}
                                    </p>
                                    {variantLabel !== "Default" ? (
                                      <p className="text-sm text-muted-foreground">
                                        {variantLabel}
                                      </p>
                                    ) : null}
                                  </TableCell>
                                  <TableCell className="text-sm text-muted-foreground">
                                    {row.sku || "—"}
                                  </TableCell>
                                  <TableCell className="tabular-nums font-medium">
                                    {row.stock}
                                  </TableCell>
                                </TableRow>
                              );
                            })
                          )}
                        </TableBody>
                      </Table>
                    </div>
                    <TablePagination
                      page={safeCatalogPage}
                      totalPages={catalogTotalPages}
                      total={catalogTotal}
                      pageSize={TABLE_PAGE_SIZE}
                      onPageChange={setCatalogPage}
                    />
                  </>
                )}
              </CardContent>
            </Card>

            {fromBranchId ? (
              <aside className="hidden h-[calc(100dvh-8rem)] w-full shrink-0 overflow-hidden rounded-xl border bg-muted/20 lg:sticky lg:top-4 lg:block lg:w-[300px] xl:w-[320px]">
                {selectionPanel}
              </aside>
            ) : null}
          </div>

          {fromBranchId && !selectionSheetOpen ? (
            <MobileSelectionBar
              count={selectedIds.length}
              hint={
                totalUnits > 0
                  ? `Total ${totalUnits} unit${totalUnits === 1 ? "" : "s"}`
                  : "Review and set qty"
              }
              onAction={() => setSelectionSheetOpen(true)}
            />
          ) : null}

          <Sheet
            open={selectionSheetOpen}
            onOpenChange={setSelectionSheetOpen}
          >
            <SheetContent
              side="bottom"
              className="flex h-[min(85dvh,40rem)] flex-col gap-0 p-0"
            >
              <SheetHeader className="sr-only">
                <SheetTitle>Selected transfer items</SheetTitle>
              </SheetHeader>
              {selectionPanel}
            </SheetContent>
          </Sheet>
        </TabsContent>
      </Tabs>

      <Dialog
        open={detailsTransfer != null}
        onOpenChange={(open) => {
          if (!open) setDetailsTransfer(null);
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Transfer details</DialogTitle>
            <DialogDescription>
              {detailsTransfer
                ? `${formatDate(detailsTransfer.createdAt)} · ${detailsTransfer.fromBranchName} → ${detailsTransfer.toBranchName}`
                : null}
            </DialogDescription>
          </DialogHeader>
          {detailsTransfer ? (
            <div className="space-y-4">
              <dl className="grid gap-2 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-muted-foreground">From</dt>
                  <dd className="font-medium">
                    {detailsTransfer.fromBranchName}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">To</dt>
                  <dd className="font-medium">
                    {detailsTransfer.toBranchName}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">By</dt>
                  <dd>{detailsTransfer.createdByName ?? "Staff"}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Date</dt>
                  <dd>{formatDate(detailsTransfer.createdAt)}</dd>
                </div>
              </dl>
              <div className="grid grid-cols-2 gap-3 rounded-lg border bg-muted/30 p-3 text-sm">
                <div>
                  <p className="text-muted-foreground">Total items</p>
                  <p className="text-lg font-semibold tabular-nums">
                    {detailsTransfer.items.reduce(
                      (sum, item) => sum + item.quantity,
                      0
                    )}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground">Unique items</p>
                  <p className="text-lg font-semibold tabular-nums">
                    {detailsTransfer.items.length}
                  </p>
                </div>
              </div>
              {detailsTransfer.notes ? (
                <div className="text-sm">
                  <p className="text-muted-foreground">Notes</p>
                  <p className="mt-0.5 whitespace-pre-wrap">
                    {detailsTransfer.notes}
                  </p>
                </div>
              ) : null}
              <div className="max-h-[min(50vh,24rem)] overflow-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Item</TableHead>
                      <TableHead className="w-24 text-right">Qty</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {detailsTransfer.items.map((item) => (
                      <TableRow key={item.variantId}>
                        <TableCell>{item.productName}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {item.quantity}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
