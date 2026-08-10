"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Loader2, Store } from "lucide-react";
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
  getAllBranchInventory,
  getBranchInventory,
  sellingBranchIdsForProduct,
  setVariantSelling,
  setVariantsSellingBulk,
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

  useEffect(() => {
    setPage(1);
  }, [search, categoryFilter, sellingFilter, isElevatedAdmin]);

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

  useEffect(() => {
    if (page !== safePage) setPage(safePage);
  }, [page, safePage]);

  const activeBranch = branches.find((b) => b.id === managerBranchId);
  const sellingCount = variants.filter((v) => v.isSelling).length;

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
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-center">
              <Input
                placeholder="Search products or SKU..."
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
                value={sellingFilter}
                onValueChange={(v) =>
                  setSellingFilter((v as SellingFilter) ?? "all")
                }
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
            </div>

            <div className="overflow-x-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Product</TableHead>
                    <TableHead className="w-28">Variants</TableHead>
                    <TableHead>Selling at</TableHead>
                    <TableHead className="w-40 text-right">Actions</TableHead>
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
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => setAssignProduct(product)}
                            >
                              <Store className="mr-2 h-4 w-4" />
                              Assign branches
                            </Button>
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
              value={sellingFilter}
              onValueChange={(v) =>
                setSellingFilter((v as SellingFilter) ?? "all")
              }
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
