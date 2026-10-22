"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Loader2, MoreHorizontal, RefreshCw, Search, Store } from "lucide-react";
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
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
import { AssignBranchesDialog } from "@/components/admin/assign-branches-dialog";
import { TablePagination } from "@/components/admin/table-pagination";
import { useBranchAccess } from "@/hooks/use-branch-access";
import { getBranches } from "@/lib/firestore/branches";
import {
  findMissingPosDetailForProduct,
  findProductsMissingFromPos,
  getAllBranchInventory,
  getBranchInventory,
  sellingBranchIdsForProduct,
  setVariantSelling,
  setVariantsSellingBulk,
  syncMissingPosVariantsForProduct,
  type PosAssortmentGap,
} from "@/lib/firestore/inventory";
import { getProducts } from "@/lib/firestore/products";
import { getCategories } from "@/lib/firestore/categories";
import { getCatalogImageUrl, showCatalogImages } from "@/lib/products";
import { mergeVariantsWithInventory } from "@/lib/inventory";
import { useAppSettings } from "@/hooks/use-app-settings";
import { formatVariantLabel } from "@/lib/product-variants";
import { isProductPublished } from "@/lib/products-catalog";
import { paginateItems } from "@/lib/pagination";
import type { Branch, BranchInventory, Category, Product } from "@/types";

type SellingFilter = "all" | "selling" | "not_selling";

export default function AdminAssortmentPage() {
  const { isElevatedAdmin, assignedBranchId } = useBranchAccess();
  const { catalogImageSource } = useAppSettings();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [inventory, setInventory] = useState<BranchInventory[]>([]);
  const [allInventory, setAllInventory] = useState<BranchInventory[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [bulkSaving, setBulkSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [sellingFilter, setSellingFilter] = useState<SellingFilter>("all");
  const [assignProduct, setAssignProduct] = useState<Product | null>(null);
  const [syncOpen, setSyncOpen] = useState(false);
  const [syncSearch, setSyncSearch] = useState("");
  const [syncProduct, setSyncProduct] = useState<Product | null>(null);
  const [productSyncSearch, setProductSyncSearch] = useState("");
  const [syncingProductId, setSyncingProductId] = useState<string | null>(null);
  const [syncingAll, setSyncingAll] = useState(false);
  const [page, setPage] = useState(1);

  const managerBranchId = assignedBranchId ?? "";

  const loadAdminData = async () => {
    const [branchList, productList, cats, inv] = await Promise.all([
      getBranches(true),
      getProducts(),
      getCategories(),
      getAllBranchInventory(),
    ]);
    setBranches(branchList);
    setProducts(productList.filter((p) => !p.isArchived));
    setCategories(cats.filter((c) => !c.isArchived));
    setAllInventory(inv);
  };

  const loadManagerAssortment = async (branchId: string) => {
    if (!branchId) return;
    const [branchList, p, inv, cats] = await Promise.all([
      getBranches(true),
      getProducts(),
      getBranchInventory(branchId),
      getCategories(),
    ]);
    setBranches(branchList);
    setProducts(p.filter((product) => !product.isArchived));
    setInventory(inv);
    setCategories(cats.filter((c) => !c.isArchived));
  };

  useEffect(() => {
    async function bootstrap() {
      try {
        if (isElevatedAdmin) {
          await loadAdminData();
        } else if (managerBranchId) {
          await loadManagerAssortment(managerBranchId);
        } else {
          const branchList = await getBranches(true);
          setBranches(branchList);
        }
      } catch (err) {
        console.error(err);
        toast.error("Failed to load assortment");
      } finally {
        setLoading(false);
      }
    }
    bootstrap().catch(console.error);
  }, [isElevatedAdmin, managerBranchId]);

  const categoryMap = Object.fromEntries(categories.map((c) => [c.id, c]));
  const branchMap = Object.fromEntries(branches.map((b) => [b.id, b]));

  const categorySelectLabel = (value: string | null) => {
    if (!value || value === "all") return "All categories";
    return categories.find((c) => c.id === value)?.name ?? null;
  };

  const sellingSelectLabel = (value: string | null) => {
    switch (value as SellingFilter) {
      case "selling":
        return "Selling";
      case "not_selling":
        return "Not selling";
      default:
        return "All";
    }
  };

  // —— Admin product-first view ——
  const filteredProducts = useMemo(() => {
    if (!isElevatedAdmin) return [];
    const q = search.trim().toLowerCase();
    return products.filter((product) => {
      const matchesSearch =
        !q ||
        product.name.toLowerCase().includes(q) ||
        product.slug.toLowerCase().includes(q) ||
        product.variants.some((v) => v.sku.toLowerCase().includes(q));
      const matchesCategory =
        categoryFilter === "all" ||
        product.categoryIds.includes(categoryFilter);
      const sellingBranches = sellingBranchIdsForProduct(
        product.id,
        allInventory
      );
      const matchesSelling =
        sellingFilter === "all" ||
        (sellingFilter === "selling" && sellingBranches.length > 0) ||
        (sellingFilter === "not_selling" && sellingBranches.length === 0);
      return matchesSearch && matchesCategory && matchesSelling;
    });
  }, [
    isElevatedAdmin,
    products,
    search,
    categoryFilter,
    sellingFilter,
    allInventory,
  ]);

  // —— Manager branch-scoped view ——
  const variants = useMemo(
    () =>
      isElevatedAdmin
        ? []
        : mergeVariantsWithInventory(products, inventory),
    [isElevatedAdmin, products, inventory]
  );

  const filteredVariants = useMemo(
    () =>
      variants.filter((row) => {
        const product = products.find((p) => p.id === row.productId);
        const matchesSearch =
          row.productName.toLowerCase().includes(search.toLowerCase()) ||
          row.sku.toLowerCase().includes(search.toLowerCase()) ||
          formatVariantLabel(row, product?.options ?? [])
            .toLowerCase()
            .includes(search.toLowerCase());
        const matchesCategory =
          categoryFilter === "all" || row.categoryIds.includes(categoryFilter);
        const matchesSelling =
          sellingFilter === "all" ||
          (sellingFilter === "selling" && row.isSelling) ||
          (sellingFilter === "not_selling" && !row.isSelling);

        return matchesSearch && matchesCategory && matchesSelling;
      }),
    [variants, products, search, categoryFilter, sellingFilter]
  );

  const adminPagination = useMemo(
    () => paginateItems(filteredProducts, page),
    [filteredProducts, page]
  );
  const managerPagination = useMemo(
    () => paginateItems(filteredVariants, page),
    [filteredVariants, page]
  );
  const safePage = isElevatedAdmin
    ? adminPagination.page
    : managerPagination.page;
  const totalPages = isElevatedAdmin
    ? adminPagination.totalPages
    : managerPagination.totalPages;
  const total = isElevatedAdmin
    ? adminPagination.total
    : managerPagination.total;
  const pagedProducts = adminPagination.pagedItems;
  const pagedVariants = managerPagination.pagedItems;

  const activeBranch = branches.find((b) => b.id === managerBranchId);
  const sellingCount = variants.filter((v) => v.isSelling).length;

  const missingFromPos = useMemo(
    () =>
      isElevatedAdmin
        ? findProductsMissingFromPos(
            products,
            allInventory,
            isProductPublished
          )
        : [],
    [isElevatedAdmin, products, allInventory]
  );

  const filteredMissingFromPos = useMemo(() => {
    const q = syncSearch.trim().toLowerCase();
    if (!q) return missingFromPos;
    return missingFromPos.filter((gap) => {
      const product = gap.product;
      return (
        product.name.toLowerCase().includes(q) ||
        product.slug.toLowerCase().includes(q) ||
        product.variants.some((v) => v.sku.toLowerCase().includes(q))
      );
    });
  }, [missingFromPos, syncSearch]);

  const missingIncompleteCount = useMemo(
    () => missingFromPos.filter((gap) => gap.kind === "incomplete").length,
    [missingFromPos]
  );

  const missingByProductId = useMemo(() => {
    const map = new Map<string, PosAssortmentGap>();
    for (const gap of missingFromPos) map.set(gap.product.id, gap);
    return map;
  }, [missingFromPos]);

  const syncProductDetail = useMemo(() => {
    if (!syncProduct) return null;
    return findMissingPosDetailForProduct(syncProduct, allInventory);
  }, [syncProduct, allInventory]);

  const filteredProductMissingVariants = useMemo(() => {
    if (!syncProductDetail) return [];
    const q = productSyncSearch.trim().toLowerCase();
    const variants = syncProductDetail.missingVariants.map((row) => {
      const variant = syncProductDetail.product.variants.find(
        (v) => v.id === row.variantId
      );
      const label = variant
        ? formatVariantLabel(variant, syncProductDetail.product.options)
        : "Variant";
      const branches =
        syncProductDetail.kind === "unassigned"
          ? []
          : [
              ...new Set(
                syncProductDetail.lines
                  .filter((line) => line.variantId === row.variantId)
                  .map((line) => line.branchId)
                  .filter((id): id is string => id != null)
              ),
            ];
      return { ...row, label, branchIds: branches };
    });
    if (!q) return variants;
    return variants.filter(
      (row) =>
        row.label.toLowerCase().includes(q) ||
        row.sku.toLowerCase().includes(q)
    );
  }, [syncProductDetail, productSyncSearch]);

  const openSyncDialog = () => {
    setSyncSearch("");
    setSyncOpen(true);
  };

  const openProductSyncDialog = (product: Product) => {
    setProductSyncSearch("");
    setSyncProduct(product);
  };

  const syncIncompleteProduct = async (product: Product) => {
    const detail = findMissingPosDetailForProduct(product, allInventory);
    if (detail.kind !== "incomplete") return;
    setSyncingProductId(product.id);
    try {
      const synced = await syncMissingPosVariantsForProduct(detail);
      toast.success(
        synced === 1
          ? `Synced 1 missing variant of “${product.name || "Untitled"}”`
          : `Synced ${synced} missing variants of “${product.name || "Untitled"}”`
      );
      await loadAdminData();
      setSyncProduct(null);
    } catch (err) {
      console.error(err);
      toast.error(
        err instanceof Error ? err.message : "Failed to sync variants"
      );
    } finally {
      setSyncingProductId(null);
    }
  };

  const syncAllIncomplete = async () => {
    const incomplete = missingFromPos.filter((gap) => gap.kind === "incomplete");
    if (incomplete.length === 0) return;
    setSyncingAll(true);
    try {
      let synced = 0;
      // Reload inventory between products so each sync uses fresh state.
      let inventorySnapshot = allInventory;
      for (const gap of incomplete) {
        const detail = findMissingPosDetailForProduct(
          gap.product,
          inventorySnapshot
        );
        synced += await syncMissingPosVariantsForProduct(detail);
        inventorySnapshot = await getAllBranchInventory();
        setAllInventory(inventorySnapshot);
      }
      toast.success(
        `Synced ${synced} missing variant slot${synced === 1 ? "" : "s"} across ${incomplete.length} product${incomplete.length === 1 ? "" : "s"}`
      );
      await loadAdminData();
    } catch (err) {
      console.error(err);
      toast.error(
        err instanceof Error ? err.message : "Failed to sync missing variants"
      );
    } finally {
      setSyncingAll(false);
    }
  };

  const toggleSelling = async (
    variantId: string,
    productId: string,
    next: boolean
  ) => {
    if (!managerBranchId) return;
    setSavingId(variantId);
    try {
      await setVariantSelling(managerBranchId, productId, variantId, next);
      toast.success(next ? "Variant marked as selling" : "Variant unassigned");
      await loadManagerAssortment(managerBranchId);
    } catch {
      toast.error("Failed to update selling status");
    } finally {
      setSavingId(null);
    }
  };

  const bulkSetSelling = async (isSelling: boolean) => {
    if (!managerBranchId || filteredVariants.length === 0) return;
    setBulkSaving(true);
    try {
      await setVariantsSellingBulk(
        managerBranchId,
        filteredVariants.map((row) => ({
          productId: row.productId,
          variantId: row.id,
        })),
        isSelling
      );
      toast.success(
        isSelling
          ? `Assigned ${filteredVariants.length} variants`
          : `Unassigned ${filteredVariants.length} variants`
      );
      await loadManagerAssortment(managerBranchId);
    } catch {
      toast.error("Failed to update assortment");
    } finally {
      setBulkSaving(false);
    }
  };

  if (loading) {
    return <p className="text-muted-foreground">Loading assortment...</p>;
  }

  if (branches.length === 0) {
    return (
      <Card>
        <CardContent className="pt-6">
          <p className="text-muted-foreground">
            Create a branch first before managing which variants it sells.
          </p>
        </CardContent>
      </Card>
    );
  }

  if (isElevatedAdmin) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Branch assortment</h1>
          <p className="text-muted-foreground">
            Assign products to multiple branches at once. All variants of a
            product are included.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Products</CardTitle>
            <CardDescription>
              {filteredProducts.length} of {products.length} products
              {missingFromPos.length > 0
                ? ` · ${missingFromPos.length} missing from POS`
                : ""}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-center">
              <Input
                placeholder="Search products or SKU..."
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                className="max-w-md"
              />
              <Select
                value={categoryFilter}
                onValueChange={(v) => {
                  setCategoryFilter(v ?? "all");
                  setPage(1);
                }}
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
                value={sellingFilter}
                onValueChange={(v) => {
                  setSellingFilter((v as SellingFilter) ?? "all");
                  setPage(1);
                }}
              >
                <SelectTrigger className="w-full lg:w-48">
                  <SelectValue placeholder="All">
                    {(value) => sellingSelectLabel(value as string | null)}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All products</SelectItem>
                  <SelectItem value="selling">Assigned to a branch</SelectItem>
                  <SelectItem value="not_selling">Unassigned</SelectItem>
                </SelectContent>
              </Select>
              <Button
                type="button"
                variant="destructive"
                size="lg"
                onClick={openSyncDialog}
              >
                <RefreshCw className="mr-2 h-4 w-4" />
                Sync missing
                {missingFromPos.length > 0 ? (
                  <Badge
                    variant="secondary"
                    className="ml-2 border-0 bg-destructive/20 tabular-nums text-destructive"
                  >
                    {missingFromPos.length}
                  </Badge>
                ) : null}
              </Button>
            </div>

            <div className="overflow-x-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Product</TableHead>
                    <TableHead className="w-28">Variants</TableHead>
                    <TableHead>Selling at</TableHead>
                    <TableHead className="w-12 text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredProducts.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={4}
                        className="py-8 text-center text-muted-foreground"
                      >
                        No products match your filters.
                      </TableCell>
                    </TableRow>
                  ) : (
                    pagedProducts.map((product) => {
                      const showImages = showCatalogImages(catalogImageSource);
                      const thumb =
                        showImages && product.variants[0]
                          ? getCatalogImageUrl(
                              product,
                              product.variants[0],
                              catalogImageSource
                            )
                          : null;
                      const sellingBranchIds = sellingBranchIdsForProduct(
                        product.id,
                        allInventory
                      );
                      const sellingBranches = sellingBranchIds
                        .map((id) => branchMap[id])
                        .filter(Boolean);

                      return (
                        <TableRow key={product.id}>
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
                                  href={`/admin/products/${product.id}`}
                                  className="font-medium hover:underline"
                                >
                                  {product.name || "Untitled"}
                                </Link>
                                <p className="text-xs text-muted-foreground">
                                  {isProductPublished(product)
                                    ? "Published"
                                    : "Draft"}
                                </p>
                                {product.categoryIds.length > 0 && (
                                  <div className="mt-1 flex flex-wrap gap-1">
                                    {product.categoryIds.map((id) =>
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
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="tabular-nums">
                            {product.variants.length}
                          </TableCell>
                          <TableCell>
                            {sellingBranches.length === 0 ? (
                              <span className="text-sm text-muted-foreground">
                                None
                              </span>
                            ) : (
                              <div className="flex flex-wrap gap-1">
                                {sellingBranches.map((branch) => (
                                  <Badge
                                    key={branch.id}
                                    variant="outline"
                                    className="text-xs"
                                  >
                                    {branch.code}
                                  </Badge>
                                ))}
                              </div>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            <DropdownMenu>
                              <DropdownMenuTrigger
                                render={
                                  <Button variant="ghost" size="icon">
                                    <MoreHorizontal className="h-4 w-4" />
                                    <span className="sr-only">Open actions</span>
                                  </Button>
                                }
                              />
                              <DropdownMenuContent
                                align="end"
                                className="min-w-[11rem]"
                              >
                                <DropdownMenuItem
                                  className="whitespace-nowrap"
                                  onClick={() => setAssignProduct(product)}
                                >
                                  <Store className="h-4 w-4 shrink-0" />
                                  <span className="whitespace-nowrap">
                                    Assign&nbsp;branches
                                  </span>
                                </DropdownMenuItem>
                                {missingByProductId.get(product.id) ? (
                                  <DropdownMenuItem
                                    className="whitespace-nowrap"
                                    onClick={() =>
                                      openProductSyncDialog(product)
                                    }
                                  >
                                    <RefreshCw className="h-4 w-4 shrink-0" />
                                    <span className="whitespace-nowrap">
                                      Sync&nbsp;missing
                                      <span className="tabular-nums text-muted-foreground">
                                        &nbsp;(
                                        {missingByProductId.get(product.id)
                                          ?.missingVariantCount ?? 0}
                                        )
                                      </span>
                                    </span>
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

        <AssignBranchesDialog
          open={Boolean(assignProduct)}
          onOpenChange={(open) => {
            if (!open) setAssignProduct(null);
          }}
          product={assignProduct}
          branches={branches}
          initialSelectedBranchIds={
            assignProduct
              ? sellingBranchIdsForProduct(assignProduct.id, allInventory)
              : []
          }
          existingInventory={allInventory}
          onSaved={() => {
            loadAdminData().catch(console.error);
          }}
        />

        <Dialog
          open={syncOpen}
          onOpenChange={(open) => {
            setSyncOpen(open);
            if (!open) setSyncSearch("");
          }}
        >
          <DialogContent className="flex max-h-[85dvh] flex-col gap-0 overflow-hidden p-0 sm:max-w-lg">
            <DialogHeader className="shrink-0 border-b p-4 pr-12">
              <DialogTitle>Products missing from POS</DialogTitle>
              <DialogDescription>
                {missingFromPos.length === 0
                  ? "Published products with no branch assignment, or with some variants not selling on a branch that already sells others."
                  : `${missingFromPos.length} product${missingFromPos.length === 1 ? "" : "s"} missing${
                      missingIncompleteCount > 0
                        ? ` · ${missingIncompleteCount} incomplete`
                        : ""
                    }. Search below to filter the list.`}
              </DialogDescription>
            </DialogHeader>
            {missingFromPos.length > 0 ? (
              <div className="shrink-0 border-b px-4 py-3">
                <div className="relative">
                  <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={syncSearch}
                    onChange={(e) => setSyncSearch(e.target.value)}
                    placeholder="Search missing products or SKU…"
                    className="pl-9"
                  />
                </div>
                <p className="mt-2 text-xs tabular-nums text-muted-foreground">
                  Showing {filteredMissingFromPos.length} of{" "}
                  {missingFromPos.length}
                </p>
              </div>
            ) : null}
            <div className="min-h-0 flex-1 overflow-y-auto p-4">
              {missingFromPos.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  All published products look complete for POS.
                </p>
              ) : filteredMissingFromPos.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  No missing products match your search.
                </p>
              ) : (
                <ul className="space-y-3">
                  {filteredMissingFromPos.map((gap) => {
                    const branchLabels = gap.partialBranchIds
                      .map((id) => branchMap[id]?.code ?? id)
                      .join(", ");
                    return (
                      <li
                        key={gap.product.id}
                        className="rounded-lg border p-3"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="font-medium">
                              {gap.product.name || "Untitled"}
                            </p>
                            <p className="mt-0.5 text-xs text-muted-foreground">
                              {gap.product.variants.length} variant
                              {gap.product.variants.length === 1 ? "" : "s"}
                              {gap.kind === "unassigned"
                                ? " · not assigned to any branch"
                                : ` · incomplete on ${branchLabels}`}
                            </p>
                            <Badge
                              variant={
                                gap.kind === "unassigned"
                                  ? "outline"
                                  : "secondary"
                              }
                              className="mt-2 text-xs"
                            >
                              {gap.kind === "unassigned"
                                ? "Unassigned"
                                : `${gap.missingVariantSlots} variant slot${gap.missingVariantSlots === 1 ? "" : "s"} missing`}
                            </Badge>
                          </div>
                          <div className="flex shrink-0 flex-col gap-1.5">
                            {gap.kind === "incomplete" ? (
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                disabled={
                                  syncingAll ||
                                  syncingProductId === gap.product.id
                                }
                                onClick={() =>
                                  void syncIncompleteProduct(gap.product)
                                }
                              >
                                {syncingProductId === gap.product.id ? (
                                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                                ) : (
                                  <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
                                )}
                                Sync variants
                              </Button>
                            ) : null}
                            <Button
                              type="button"
                              size="sm"
                              variant={
                                gap.kind === "unassigned"
                                  ? "default"
                                  : "ghost"
                              }
                              disabled={syncingAll || syncingProductId != null}
                              onClick={() => {
                                setAssignProduct(gap.product);
                                setSyncOpen(false);
                              }}
                            >
                              <Store className="mr-1.5 h-3.5 w-3.5" />
                              Assign branches
                            </Button>
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
            {missingIncompleteCount > 0 ? (
              <DialogFooter className="mx-0 mb-0 shrink-0 border-t p-4">
                <Button
                  type="button"
                  disabled={syncingAll || syncingProductId != null}
                  onClick={() => void syncAllIncomplete()}
                >
                  {syncingAll ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <RefreshCw className="mr-2 h-4 w-4" />
                  )}
                  Sync all incomplete ({missingIncompleteCount})
                </Button>
              </DialogFooter>
            ) : null}
          </DialogContent>
        </Dialog>

        <Dialog
          open={syncProduct != null}
          onOpenChange={(open) => {
            if (!open) {
              setSyncProduct(null);
              setProductSyncSearch("");
            }
          }}
        >
          <DialogContent className="flex max-h-[85dvh] flex-col gap-0 overflow-hidden p-0 sm:max-w-lg">
            <DialogHeader className="shrink-0 border-b p-4 pr-12">
              <DialogTitle>
                Missing variants
                {syncProduct
                  ? ` · ${syncProduct.name || "Untitled"}`
                  : ""}
              </DialogTitle>
              <DialogDescription>
                {syncProductDetail == null ||
                syncProductDetail.kind === "complete"
                  ? "This product looks complete for POS."
                  : syncProductDetail.kind === "unassigned"
                    ? `${syncProductDetail.missingVariantSlots} variant${syncProductDetail.missingVariantSlots === 1 ? "" : "s"} not assigned to any branch.`
                    : `${syncProductDetail.missingVariantSlots} missing slot${syncProductDetail.missingVariantSlots === 1 ? "" : "s"} · ${syncProductDetail.missingVariants.length} variant${syncProductDetail.missingVariants.length === 1 ? "" : "s"} incomplete on POS.`}
              </DialogDescription>
            </DialogHeader>
            {syncProductDetail &&
            syncProductDetail.kind !== "complete" &&
            syncProductDetail.missingVariants.length > 0 ? (
              <div className="shrink-0 border-b px-4 py-3">
                <div className="relative">
                  <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={productSyncSearch}
                    onChange={(e) => setProductSyncSearch(e.target.value)}
                    placeholder="Search variants or SKU…"
                    className="pl-9"
                  />
                </div>
                <p className="mt-2 text-xs tabular-nums text-muted-foreground">
                  Showing {filteredProductMissingVariants.length} of{" "}
                  {syncProductDetail.missingVariants.length} missing variant
                  {syncProductDetail.missingVariants.length === 1 ? "" : "s"}
                  {` · ${syncProductDetail.missingVariantSlots} total missing`}
                </p>
              </div>
            ) : null}
            <div className="min-h-0 flex-1 overflow-y-auto p-4">
              {!syncProductDetail ||
              syncProductDetail.kind === "complete" ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  Nothing missing for this product.
                </p>
              ) : filteredProductMissingVariants.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  No variants match your search.
                </p>
              ) : (
                <ul className="space-y-2">
                  {filteredProductMissingVariants.map((row) => (
                    <li
                      key={row.variantId}
                      className="rounded-lg border px-3 py-2"
                    >
                      <p className="text-sm font-medium">{row.label}</p>
                      <p className="text-xs text-muted-foreground">
                        {row.sku ? `SKU ${row.sku}` : "No SKU"}
                        {syncProductDetail.kind === "unassigned"
                          ? " · not on any branch"
                          : row.branchIds.length > 0
                            ? ` · missing on ${row.branchIds
                                .map((id) => branchMap[id]?.code ?? id)
                                .join(", ")}`
                            : ""}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            {syncProductDetail && syncProductDetail.kind !== "complete" ? (
              <DialogFooter className="mx-0 mb-0 shrink-0 gap-2 border-t p-4 sm:justify-between">
                <Button
                  type="button"
                  variant="outline"
                  disabled={syncingProductId != null}
                  onClick={() => {
                    if (!syncProduct) return;
                    setAssignProduct(syncProduct);
                    setSyncProduct(null);
                  }}
                >
                  <Store className="mr-2 h-4 w-4" />
                  Assign branches
                </Button>
                {syncProductDetail.kind === "incomplete" ? (
                  <Button
                    type="button"
                    disabled={
                      syncingProductId === syncProductDetail.product.id
                    }
                    onClick={() =>
                      void syncIncompleteProduct(syncProductDetail.product)
                    }
                  >
                    {syncingProductId === syncProductDetail.product.id ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <RefreshCw className="mr-2 h-4 w-4" />
                    )}
                    Sync variants ({syncProductDetail.missingVariants.length})
                  </Button>
                ) : null}
              </DialogFooter>
            ) : null}
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  // Manager view
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Branch assortment</h1>
        <p className="text-muted-foreground">
          Choose which product variants {activeBranch?.name ?? "this branch"}{" "}
          sells. Unassigning keeps existing stock.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{activeBranch?.name ?? "Branch"} selling variants</CardTitle>
          <CardDescription>
            {sellingCount} of {variants.length} variants marked as selling.
            Inventory only lists selling variants.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-center">
            <Input
              placeholder="Search products, SKU, or variant..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              className="max-w-md"
            />
            <Select
              value={categoryFilter}
              onValueChange={(v) => {
                setCategoryFilter(v ?? "all");
                setPage(1);
              }}
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
              value={sellingFilter}
              onValueChange={(v) => {
                setSellingFilter((v as SellingFilter) ?? "all");
                setPage(1);
              }}
            >
              <SelectTrigger className="w-full lg:w-48">
                <SelectValue placeholder="All variants">
                  {(value) => sellingSelectLabel(value as string | null)}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All variants</SelectItem>
                <SelectItem value="selling">Selling</SelectItem>
                <SelectItem value="not_selling">Not selling</SelectItem>
              </SelectContent>
            </Select>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={bulkSaving || filteredVariants.length === 0}
                onClick={() => bulkSetSelling(true)}
              >
                {bulkSaving ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : null}
                Assign visible
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={bulkSaving || filteredVariants.length === 0}
                onClick={() => bulkSetSelling(false)}
              >
                Unassign visible
              </Button>
            </div>
          </div>

          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product / variant</TableHead>
                  <TableHead className="w-28">SKU</TableHead>
                  <TableHead className="w-24 text-right">Stock</TableHead>
                  <TableHead className="w-32 text-right">Selling</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredVariants.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={4}
                      className="py-8 text-center text-muted-foreground"
                    >
                      No variants match your filters.
                    </TableCell>
                  </TableRow>
                ) : (
                  pagedVariants.map((row) => {
                    const product = products.find((p) => p.id === row.productId);
                    const showImages = showCatalogImages(catalogImageSource);
                    const thumb =
                      product && showImages
                        ? getCatalogImageUrl(product, row, catalogImageSource)
                        : null;
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
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {row.sku || "—"}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {row.stock}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="inline-flex items-center justify-end gap-2">
                            {savingId === row.id ? (
                              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                            ) : null}
                            <Switch
                              checked={row.isSelling}
                              disabled={savingId === row.id || bulkSaving}
                              aria-label={
                                row.isSelling
                                  ? "Stop selling variant"
                                  : "Start selling variant"
                              }
                              onCheckedChange={(checked) =>
                                toggleSelling(row.id, row.productId, checked)
                              }
                            />
                          </div>
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
    </div>
  );
}
