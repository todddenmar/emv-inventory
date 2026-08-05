"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Loader2, Save, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useBranchAccess } from "@/hooks/use-branch-access";
import { getBranches } from "@/lib/firestore/branches";
import {
  getAllBranchInventory,
  getBranchInventory,
  setBranchStockWithLog,
} from "@/lib/firestore/inventory";
import { getProducts } from "@/lib/firestore/products";
import { getCategories } from "@/lib/firestore/categories";
import { getProductThumbnailUrl } from "@/lib/products";
import { mergeVariantsWithInventory, getLowStockVariants } from "@/lib/inventory";
import { formatCurrency } from "@/lib/format";
import { isProductOnSale } from "@/lib/product-pricing";
import { formatVariantLabel } from "@/lib/product-variants";
import { useAuthStore } from "@/stores/auth-store";
import type { Branch, BranchInventory, Category, Product } from "@/types";

type StockDraft = Record<string, { stock: number; lowStockThreshold: number }>;
type StockFilter = "all" | "low" | "in_stock" | "out_of_stock";

export default function AdminInventoryPage() {
  const { isMasterAdmin, assignedBranchId } = useBranchAccess();
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

  const activeBranchId = isMasterAdmin ? selectedBranchId : assignedBranchId ?? "";

  const loadBranches = async () => {
    const all = await getBranches(true);
    setBranches(all);
    if (!selectedBranchId && all.length > 0) {
      setSelectedBranchId(
        isMasterAdmin
          ? all[0].id
          : assignedBranchId ?? all[0].id
      );
    }
  };

  const loadInventory = async (branchId: string) => {
    if (!branchId) return;
    const [p, inv, cats] = await Promise.all([
      getProducts(),
      isMasterAdmin && branchId === "all"
        ? getAllBranchInventory()
        : getBranchInventory(branchId),
      getCategories(),
    ]);
    setProducts(p);
    setInventory(inv);
    setCategories(cats.filter((c) => !c.isArchived));

    if (branchId !== "all") {
      const variantRows = mergeVariantsWithInventory(p, inv);
      const nextDraft: StockDraft = {};
      for (const row of variantRows) {
        nextDraft[row.id] = {
          stock: row.stock,
          lowStockThreshold: row.lowStockThreshold,
        };
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
    return mergeVariantsWithInventory(products, branchInventory);
  }, [products, branchInventory, activeBranchId]);

  const getStockValues = (
    variantId: string,
    row: (typeof variantsWithStock)[0]
  ) => {
    return (
      draft[variantId] ?? {
        stock: row.stock,
        lowStockThreshold: row.lowStockThreshold,
      }
    );
  };

  const isLowStockRow = (row: (typeof variantsWithStock)[0]) => {
    const values = getStockValues(row.id, row);
    return values.stock > 0 && values.stock <= values.lowStockThreshold;
  };

  const filteredVariants = variantsWithStock.filter((row) => {
    const product = products.find((p) => p.id === row.productId);
    const matchesSearch =
      row.productName.toLowerCase().includes(search.toLowerCase()) ||
      row.sku.toLowerCase().includes(search.toLowerCase()) ||
      formatVariantLabel(row, product?.options ?? [])
        .toLowerCase()
        .includes(search.toLowerCase());
    const matchesCategory =
      categoryFilter === "all" || row.categoryIds.includes(categoryFilter);
    const values = getStockValues(row.id, row);
    const matchesStock =
      stockFilter === "all" ||
      (stockFilter === "low" && isLowStockRow(row)) ||
      (stockFilter === "in_stock" && values.stock > 0) ||
      (stockFilter === "out_of_stock" && values.stock <= 0);

    return matchesSearch && matchesCategory && matchesStock;
  });

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
    if (!isMasterAdmin) return [];
    return branches.map((branch) => {
      const rows = inventory.filter((i) => i.branchId === branch.id);
      const stocked = rows.filter((r) => r.stock > 0).length;
      const low = rows.filter(
        (r) => r.stock > 0 && r.stock <= r.lowStockThreshold
      ).length;
      return { branch, stocked, low, totalSkus: rows.length };
    });
  }, [branches, inventory, isMasterAdmin]);

  const updateDraft = (
    variantId: string,
    field: "stock" | "lowStockThreshold",
    value: number,
    fallback?: { stock: number; lowStockThreshold: number }
  ) => {
    setDraft((prev) => ({
      ...prev,
      [variantId]: {
        ...(prev[variantId] ?? fallback ?? { stock: 0, lowStockThreshold: 5 }),
        [field]: value,
      },
    }));
  };

  const saveStock = async (variantId: string, productId: string) => {
    if (!activeBranchId || activeBranchId === "all") return;
    const values = draft[variantId];
    if (!values) return;

    setSavingId(variantId);
    try {
      const row = variantsWithStock.find((v) => v.id === variantId);
      const product = products.find((p) => p.id === productId);
      const label = row
        ? `${row.productName} — ${formatVariantLabel(row, product?.options ?? [])}`
        : product?.name;
      await setBranchStockWithLog(
        activeBranchId,
        productId,
        variantId,
        values.stock,
        values.lowStockThreshold,
        {
          productName: label ?? null,
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
            {isMasterAdmin
              ? "Stock levels across branches"
              : `Stock for ${activeBranch?.name ?? "your branch"}`}
          </p>
        </div>
        {isMasterAdmin && (
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

      {isMasterAdmin && selectedBranchId === "all" && (
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
                Set stock per variant for this branch
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
                      <TableHead className="w-32">Price</TableHead>
                      <TableHead className="w-32">Compare at</TableHead>
                      <TableHead className="w-28">Stock</TableHead>
                      <TableHead className="w-28">Low at</TableHead>
                      <TableHead className="w-24 text-right">Save</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredVariants.length === 0 ? (
                      <TableRow>
                        <TableCell
                          colSpan={7}
                          className="py-8 text-center text-muted-foreground"
                        >
                          No variants match your filters.
                        </TableCell>
                      </TableRow>
                    ) : (
                    filteredVariants.map((row) => {
                      const product = products.find((p) => p.id === row.productId);
                      const thumb = product ? getProductThumbnailUrl(product) : null;
                      const values = getStockValues(row.id, row);
                      const isLow = isLowStockRow(row);
                      const onSale = isProductOnSale({
                        price: row.price,
                        compareAtPrice: row.compareAtPrice,
                      });
                      const variantLabel = formatVariantLabel(
                        row,
                        product?.options ?? []
                      );

                      return (
                        <TableRow key={row.id}>
                          <TableCell>
                            <div className="flex min-w-[220px] items-center gap-3">
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
                                        <Badge
                                          key={id}
                                          variant="secondary"
                                          className="text-xs"
                                        >
                                          {categoryMap[id].name}
                                        </Badge>
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
                          <TableCell>
                            <span className={onSale ? "font-semibold text-green-700 dark:text-green-400" : undefined}>
                              {formatCurrency(row.price)}
                            </span>
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {onSale
                              ? formatCurrency(row.compareAtPrice!)
                              : "—"}
                          </TableCell>
                          <TableCell>
                            <Input
                              type="number"
                              min={0}
                              value={values.stock}
                              onChange={(e) =>
                                updateDraft(
                                  row.id,
                                  "stock",
                                  Number(e.target.value) || 0,
                                  values
                                )
                              }
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              type="number"
                              min={0}
                              value={values.lowStockThreshold}
                              onChange={(e) =>
                                updateDraft(
                                  row.id,
                                  "lowStockThreshold",
                                  Number(e.target.value) || 0,
                                  values
                                )
                              }
                            />
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={savingId === row.id}
                              onClick={() => saveStock(row.id, row.productId)}
                            >
                              {savingId === row.id ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <Save className="h-4 w-4" />
                              )}
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
