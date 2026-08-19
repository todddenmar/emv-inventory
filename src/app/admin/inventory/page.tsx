"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { History, Loader2, MoreHorizontal, Save, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  InventoryAdjustmentHistorySheet,
  type AdjustmentHistoryTarget,
} from "@/components/admin/inventory-adjustment-history-sheet";
import { TablePagination } from "@/components/admin/table-pagination";
import { useBranchAccess } from "@/hooks/use-branch-access";
import { getBranches } from "@/lib/firestore/branches";
import {
  getAllBranchInventory,
  getBranchInventory,
  setBranchStockWithLog,
} from "@/lib/firestore/inventory";
import { getProducts } from "@/lib/firestore/products";
import { getCategories } from "@/lib/firestore/categories";
import { getCatalogImageUrl, showCatalogImages } from "@/lib/products";
import { mergeSellingVariantsWithInventory, getLowStockVariants } from "@/lib/inventory";
import { useAppSettings } from "@/hooks/use-app-settings";
import { formatCurrency } from "@/lib/format";
import { paginateItems } from "@/lib/pagination";
import { formatVariantLabel } from "@/lib/product-variants";
import { useAuthStore } from "@/stores/auth-store";
import type { Branch, BranchInventory, Category, Product } from "@/types";

type StockDraft = Record<string, number | "">;
type StockFilter = "all" | "low" | "in_stock" | "out_of_stock";

function toStockNumber(value: number | "" | undefined, fallback: number): number {
  if (value === "" || value == null) return fallback;
  return Number.isFinite(value) ? value : fallback;
}

export default function AdminInventoryPage() {
  const { canViewAllBranches, isOwner, assignedBranchId } = useBranchAccess();
  const { catalogImageSource } = useAppSettings();
  const user = useAuthStore((s) => s.user);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [inventory, setInventory] = useState<BranchInventory[]>([]);
  const [selectedBranchId, setSelectedBranchId] = useState<string>("");
  const [draft, setDraft] = useState<StockDraft>({});
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [stockFilter, setStockFilter] = useState<StockFilter>("all");
  const [historyTarget, setHistoryTarget] =
    useState<AdjustmentHistoryTarget | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [page, setPage] = useState(1);

  const activeBranchId = canViewAllBranches
    ? selectedBranchId
    : assignedBranchId ?? "";
  const canEditStock = !isOwner;

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
    const [p, inv, cats] = await Promise.all([
      getProducts(),
      canViewAllBranches && branchId === "all"
        ? getAllBranchInventory()
        : getBranchInventory(branchId),
      getCategories(),
    ]);
    setProducts(p);
    setInventory(inv);
    setCategories(cats.filter((c) => !c.isArchived));

    if (branchId !== "all") {
      const activeCats = cats.filter((c) => !c.isArchived);
      const variantRows = mergeSellingVariantsWithInventory(p, inv, activeCats);
      const nextDraft: StockDraft = {};
      for (const row of variantRows) {
        nextDraft[row.id] = row.stock;
      }
      setDraft(nextDraft);
    }
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

  const getDraftStock = (
    variantId: string,
    row: (typeof variantsWithStock)[0]
  ): number => toStockNumber(draft[variantId], row.stock);

  const getDraftStockInput = (
    variantId: string,
    row: (typeof variantsWithStock)[0]
  ): number | "" =>
    draft[variantId] !== undefined ? draft[variantId]! : row.stock;

  const isLowStockRow = (row: (typeof variantsWithStock)[0]) => {
    const stock = getDraftStock(row.id, row);
    return stock > 0 && stock <= row.lowStockThreshold;
  };

  const filteredVariants = useMemo(
    () =>
      variantsWithStock.filter((row) => {
        const product = products.find((p) => p.id === row.productId);
        const matchesSearch =
          row.productName.toLowerCase().includes(search.toLowerCase()) ||
          row.sku.toLowerCase().includes(search.toLowerCase()) ||
          formatVariantLabel(row, product?.options ?? [])
            .toLowerCase()
            .includes(search.toLowerCase());
        const matchesCategory =
          categoryFilter === "all" || row.categoryIds.includes(categoryFilter);
        const stock = getDraftStock(row.id, row);
        const matchesStock =
          stockFilter === "all" ||
          (stockFilter === "low" && isLowStockRow(row)) ||
          (stockFilter === "in_stock" && stock > 0) ||
          (stockFilter === "out_of_stock" && stock <= 0);

        return matchesSearch && matchesCategory && matchesStock;
      }),
    [
      variantsWithStock,
      products,
      search,
      categoryFilter,
      stockFilter,
      draft,
    ]
  );

  useEffect(() => {
    setPage(1);
  }, [search, categoryFilter, stockFilter, activeBranchId]);

  const {
    page: safePage,
    totalPages,
    pagedItems,
    total,
  } = useMemo(
    () => paginateItems(filteredVariants, page),
    [filteredVariants, page]
  );

  useEffect(() => {
    if (page !== safePage) setPage(safePage);
  }, [page, safePage]);

  const lowStock = getLowStockVariants(variantsWithStock);
  const activeBranch = branches.find((b) => b.id === activeBranchId);

  const branchSelectLabel = (value: string | null) => {
    if (!value) return null;
    if (value === "all") return "All branches (overview)";
    const branch = branches.find((b) => b.id === value);
    return branch ? `${branch.name} (${branch.code})` : null;
  };

  const categorySelectLabel = (value: string | null) => {
    if (!value || value === "all") return "All categories";
    return categories.find((c) => c.id === value)?.name ?? null;
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

  const updateDraftStock = (variantId: string, value: number | "") => {
    setDraft((prev) => ({
      ...prev,
      [variantId]: value,
    }));
  };

  const saveStock = async (variantId: string, productId: string) => {
    if (!canEditStock) return;
    if (!activeBranchId || activeBranchId === "all") return;
    const row = variantsWithStock.find((v) => v.id === variantId);
    if (!row) return;
    const raw = draft[variantId];
    if (raw === "") {
      toast.error("Enter a stock quantity");
      return;
    }
    const stock = getDraftStock(variantId, row);
    if (!Number.isFinite(stock) || stock < 0) {
      toast.error("Stock must be zero or greater");
      return;
    }

    setSavingId(variantId);
    try {
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
      toast.success("Stock saved");
      await loadInventory(activeBranchId);
    } catch {
      toast.error("Failed to save stock");
    } finally {
      setSavingId(null);
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
                : "Stock levels across branches"
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
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base text-amber-800 dark:text-amber-200">
                  <AlertTriangle className="h-4 w-4" />
                  Low stock at {activeBranch?.name}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {lowStock.map((row) => (
                    <Badge key={row.id} variant="outline">
                      {row.productName}
                      {formatVariantLabel(row, products.find((p) => p.id === row.productId)?.options ?? []) !== "Default"
                        ? ` (${formatVariantLabel(row, products.find((p) => p.id === row.productId)?.options ?? [])})`
                        : ""}
                      : {row.stock} left
                    </Badge>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>{activeBranch?.name} stock</CardTitle>
              <CardDescription>
                Stock for variants this branch sells. Low-at thresholds come from{" "}
                <Link href="/admin/categories" className="underline underline-offset-2">
                  categories
                </Link>
                .{" "}
                <Link href="/admin/settings/assortment" className="underline underline-offset-2">
                  Manage assortment
                </Link>
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
                <Select
                  value={categoryFilter}
                  onValueChange={(v) => setCategoryFilter(v ?? "all")}
                >
                  <SelectTrigger className="w-full lg:w-48">
                    <SelectValue placeholder="All categories">
                      {(value) => categorySelectLabel(value as string | null)}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All categories</SelectItem>
                    {categories.map((category) => (
                      <SelectItem key={category.id} value={category.id}>
                        {category.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
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

              <div className="overflow-x-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Product / variant</TableHead>
                      <TableHead className="w-28">SKU</TableHead>
                      <TableHead className="w-28">Cash</TableHead>
                      <TableHead className="w-28">Retail</TableHead>
                      <TableHead className="w-28">Stock</TableHead>
                      <TableHead className="w-28">Low at</TableHead>
                      <TableHead className="w-14 text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredVariants.length === 0 ? (
                      <TableRow>
                        <TableCell
                          colSpan={7}
                          className="py-8 text-center text-muted-foreground"
                        >
                          {variantsWithStock.length === 0 ? (
                            isOwner ? (
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
                        </TableCell>
                      </TableRow>
                    ) : (
                    pagedItems.map((row) => {
                      const product = products.find((p) => p.id === row.productId);
                      const showImages = showCatalogImages(catalogImageSource);
                      const thumb =
                        product && showImages
                          ? getCatalogImageUrl(product, row, catalogImageSource)
                          : null;
                      const stock = getDraftStock(row.id, row);
                      const stockInput = getDraftStockInput(row.id, row);
                      const isLow = isLowStockRow(row);
                      const variantLabel = formatVariantLabel(
                        row,
                        product?.options ?? []
                      );

                      return (
                        <TableRow key={row.id}>
                          <TableCell>
                            <div className="flex min-w-[220px] items-center gap-3">
                              {showImages ? (
                                <div className="h-10 w-10 shrink-0 overflow-hidden rounded-md bg-muted">
                                  {thumb ? (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img
                                      src={thumb}
                                      alt=""
                                      className="h-full w-full object-cover"
                                    />
                                  ) : null}
                                </div>
                              ) : null}
                              <div>
                                <Link
                                  href={`/admin/products/${row.productId}`}
                                  className="font-medium hover:underline"
                                >
                                  {row.productName}
                                </Link>
                                {variantLabel !== "Default" && (
                                  <p className="text-sm text-muted-foreground">
                                    {variantLabel}
                                  </p>
                                )}
                                {row.categoryIds.length > 0 && (
                                  <div className="mt-1 flex flex-wrap gap-1">
                                    {row.categoryIds.map((id) =>
                                      categoryMap[id] ? (
                                        <Link
                                          key={id}
                                          href={`/admin/categories/${id}`}
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
                                )}
                                {isLow && (
                                  <Badge
                                    variant="outline"
                                    className="mt-1 text-xs text-amber-700"
                                  >
                                    Low stock
                                  </Badge>
                                )}
                              </div>
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
                              : "—"}
                          </TableCell>
                          <TableCell>
                            {canEditStock ? (
                              <Input
                                type="number"
                                min={0}
                                value={stockInput}
                                onChange={(e) => {
                                  const raw = e.target.value;
                                  if (raw === "") {
                                    updateDraftStock(row.id, "");
                                    return;
                                  }
                                  const next = Number(raw);
                                  if (!Number.isFinite(next) || next < 0) return;
                                  updateDraftStock(row.id, next);
                                }}
                              />
                            ) : (
                              <span className="tabular-nums">{stock}</span>
                            )}
                          </TableCell>
                          <TableCell className="tabular-nums text-muted-foreground">
                            {row.lowStockThreshold}
                          </TableCell>
                          <TableCell className="text-right">
                            <DropdownMenu>
                              <DropdownMenuTrigger
                                render={
                                  <Button
                                    type="button"
                                    size="icon"
                                    variant="ghost"
                                    disabled={savingId === row.id}
                                  >
                                    {savingId === row.id ? (
                                      <Loader2 className="h-4 w-4 animate-spin" />
                                    ) : (
                                      <MoreHorizontal className="h-4 w-4" />
                                    )}
                                    <span className="sr-only">Actions</span>
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
                                      branchName: activeBranch?.name ?? null,
                                    });
                                    setHistoryOpen(true);
                                  }}
                                >
                                  <History className="h-4 w-4" />
                                  Adjustment history
                                </DropdownMenuItem>
                                {canEditStock ? (
                                  <DropdownMenuItem
                                    disabled={savingId === row.id}
                                    onClick={() =>
                                      void saveStock(row.id, row.productId)
                                    }
                                  >
                                    <Save className="h-4 w-4" />
                                    Save stock
                                  </DropdownMenuItem>
                                ) : null}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </TableCell>
                        </TableRow>
                      );
                    })
                    )}
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
            </CardContent>
          </Card>
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
