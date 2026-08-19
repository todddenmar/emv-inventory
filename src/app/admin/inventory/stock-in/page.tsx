"use client";

import { useEffect, useMemo, useState } from "react";
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
import { paginateItems } from "@/lib/pagination";
import { cn } from "@/lib/utils";
import type {
  Branch,
  Category,
  Product,
  SupplierStockIn,
  Vendor,
} from "@/types";

type StockFilter = "all" | "low" | "out_of_stock" | "in_stock";

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
  const [variantRows, setVariantRows] = useState<VariantWithStock[]>([]);
  const [history, setHistory] = useState<SupplierStockIn[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [search, setSearch] = useState("");
  const [stockFilter, setStockFilter] = useState<StockFilter>("all");
  const [historyPage, setHistoryPage] = useState(1);

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
  }, [vendorId, branchId]);

  useEffect(() => {
    setHistoryPage(1);
  }, [branchId]);

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

  const linesToSubmit = useMemo(() => {
    return supplierVariants
      .map((row) => {
        const quantity = qtyByVariant[row.id] ?? 0;
        if (quantity <= 0) return null;
        const product = products.find((p) => p.id === row.productId);
        const variantLabel = formatVariantLabel(row, product?.options ?? []);
        const productName =
          variantLabel === "Default"
            ? row.productName
            : `${row.productName} — ${variantLabel}`;
        return {
          productId: row.productId,
          productName,
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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Supplier stock in</h1>
        <p className="text-muted-foreground">
          Receive inventory into a branch from a supplier
        </p>
      </div>

      <div className="flex flex-col gap-6 xl:flex-row xl:items-start">
        <aside className="w-full shrink-0 space-y-4 xl:w-72">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Stock in</CardTitle>
              <CardDescription>
                Choose branch and supplier, then enter qty on the right.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Branch</Label>
                <Select
                  value={branchId}
                  onValueChange={(v) => setBranchId(v ?? "")}
                  disabled={!isElevatedAdmin}
                >
                  <SelectTrigger className="w-full">
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
              </div>

              <div className="space-y-2">
                <Label>Supplier</Label>
                <Select
                  value={vendorId}
                  onValueChange={(v) => setVendorId(v ?? "")}
                >
                  <SelectTrigger className="w-full">
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
              </div>

              {branchId && vendorId ? (
                <div className="grid grid-cols-3 gap-2 rounded-md border p-3 text-center">
                  <div>
                    <p className="text-xs text-muted-foreground">Variants</p>
                    <p className="text-lg font-semibold tabular-nums">
                      {supplierVariants.length}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Out</p>
                    <p className="text-lg font-semibold tabular-nums text-destructive">
                      {outCount}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Low</p>
                    <p className="text-lg font-semibold tabular-nums text-amber-700">
                      {lowCount}
                    </p>
                  </div>
                </div>
              ) : null}

              <div className="space-y-2">
                <Label>Notes (optional)</Label>
                <Textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Invoice #, delivery ref…"
                  rows={3}
                />
              </div>

              {linesToSubmit.length > 0 ? (
                <div className="space-y-2 rounded-md border bg-muted/30 p-3">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Receiving</span>
                    <span className="font-medium tabular-nums">
                      {linesToSubmit.length} · qty {totalQtyIn}
                    </span>
                  </div>
                  <ul className="max-h-40 space-y-1 overflow-y-auto text-xs">
                    {linesToSubmit.map((line) => (
                      <li
                        key={line.variantId}
                        className="flex items-start justify-between gap-2"
                      >
                        <span className="min-w-0 truncate">{line.productName}</span>
                        <span className="shrink-0 tabular-nums text-green-700">
                          +{line.quantity}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              <Button
                className="w-full"
                onClick={() => void handleSubmit()}
                disabled={
                  submitting ||
                  linesToSubmit.length === 0 ||
                  !vendorId ||
                  !branchId
                }
              >
                {submitting && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                Complete stock in
                {linesToSubmit.length > 0 ? ` (${linesToSubmit.length})` : ""}
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Recent</CardTitle>
              <CardDescription>Receipts for this branch</CardDescription>
            </CardHeader>
            <CardContent>
              {history.length === 0 ? (
                <p className="text-sm text-muted-foreground">No stock ins yet.</p>
              ) : (
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
                    page={safeHistoryPage}
                    totalPages={historyTotalPages}
                    total={historyTotal}
                    onPageChange={setHistoryPage}
                  />
                </div>
              )}
            </CardContent>
          </Card>
        </aside>

        <div className="min-w-0 flex-1">
          <Card className="h-full">
            <CardHeader className="space-y-4 pb-3">
              <div>
                <CardTitle className="text-base">
                  {vendor
                    ? `${vendor.name} variants`
                    : "Supplier variants"}
                </CardTitle>
                <CardDescription>
                  {branch
                    ? `Current stock at ${branch.name}. Sorted lowest first.`
                    : "Select a branch to load stock."}
                </CardDescription>
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
            <CardContent>
              {!branchId || !vendorId ? (
                <p className="py-12 text-center text-sm text-muted-foreground">
                  Select a branch and supplier to see variants.
                </p>
              ) : (
                <div className="overflow-x-auto rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
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
                            colSpan={5}
                            className="py-8 text-center text-muted-foreground"
                          >
                            {supplierVariants.length === 0
                              ? "No products assigned to this supplier."
                              : "No variants match your filters."}
                          </TableCell>
                        </TableRow>
                      ) : (
                        filteredVariants.map((row) => {
                          const product = products.find(
                            (p) => p.id === row.productId
                          );
                          const variantLabel = formatVariantLabel(
                            row,
                            product?.options ?? []
                          );
                          const isOut = row.stock <= 0;
                          const isLow =
                            row.stock > 0 &&
                            row.stock <= row.lowStockThreshold;
                          const qty = qtyByVariant[row.id] ?? 0;

                          return (
                            <TableRow
                              key={row.id}
                              className={cn(
                                isOut && "bg-destructive/5",
                                isLow && "bg-amber-50/60 dark:bg-amber-950/20"
                              )}
                            >
                              <TableCell>
                                <div className="min-w-[180px]">
                                  <p className="font-medium">
                                    {row.productName}
                                  </p>
                                  {variantLabel !== "Default" ? (
                                    <p className="text-sm text-muted-foreground">
                                      {variantLabel}
                                    </p>
                                  ) : null}
                                  {isOut ? (
                                    <Badge
                                      variant="outline"
                                      className="mt-1 text-xs text-destructive"
                                    >
                                      Out of stock
                                    </Badge>
                                  ) : isLow ? (
                                    <Badge
                                      variant="outline"
                                      className="mt-1 text-xs text-amber-700"
                                    >
                                      Low stock
                                    </Badge>
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
                              <TableCell>
                                <Input
                                  type="number"
                                  min={0}
                                  value={qty || ""}
                                  placeholder="0"
                                  className="w-24"
                                  onChange={(e) =>
                                    setQty(
                                      row.id,
                                      Math.max(0, Number(e.target.value) || 0)
                                    )
                                  }
                                />
                              </TableCell>
                            </TableRow>
                          );
                        })
                      )}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
