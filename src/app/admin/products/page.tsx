"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { LinkButton } from "@/components/ui/link-button";
import {
  Plus,
  Pencil,
  Archive,
  ArchiveRestore,
  Trash2,
  MoreHorizontal,
  FileJson,
  Loader2,
  Tags,
  Search,
} from "lucide-react";
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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { CategoryMultiSelect } from "@/components/admin/category-multi-select";
import { TablePagination } from "@/components/admin/table-pagination";
import { useBranchAccess } from "@/hooks/use-branch-access";
import {
  archiveProduct,
  deleteProduct,
  getProducts,
  publishProduct,
  restoreProduct,
  unpublishProduct,
  updateProduct,
} from "@/lib/firestore/products";
import { getCategories } from "@/lib/firestore/categories";
import { getProductThumbnailUrl } from "@/lib/products";
import {
  canPublishProduct,
  isProductPublished,
} from "@/lib/products-catalog";
import { getProductPriceRange, getDefaultVariant } from "@/lib/product-variants";
import { formatCurrency } from "@/lib/format";
import { paginateItems } from "@/lib/pagination";
import type { Category, Product } from "@/types";

function matchesQuery(value: string, query: string): boolean {
  if (!query.trim()) return true;
  return value.toLowerCase().includes(query.trim().toLowerCase());
}

export default function AdminProductsPage() {
  const { isMasterAdmin, isElevatedAdmin } = useBranchAccess();
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [permanentDeleteId, setPermanentDeleteId] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [categoryEditProduct, setCategoryEditProduct] =
    useState<Product | null>(null);
  const [editCategoryIds, setEditCategoryIds] = useState<string[]>([]);
  const [savingCategories, setSavingCategories] = useState(false);

  const categoryMap = useMemo(
    () => Object.fromEntries(categories.map((c) => [c.id, c])),
    [categories]
  );

  const visibleProducts = useMemo(() => {
    const archivedFiltered = products.filter((p) =>
      showArchived ? p.isArchived : !p.isArchived
    );

    const query = search.trim();
    if (!query) return archivedFiltered;

    return archivedFiltered.filter((product) => {
      if (matchesQuery(product.name, query)) return true;
      if (matchesQuery(product.productType, query)) return true;
      if (matchesQuery(product.slug, query)) return true;
      return product.categoryIds.some((id) =>
        matchesQuery(categoryMap[id]?.name ?? "", query)
      );
    });
  }, [products, showArchived, search, categoryMap]);

  const {
    page: safePage,
    totalPages,
    pagedItems: pagedProducts,
    rangeStart,
    rangeEnd,
    total,
  } = useMemo(
    () => paginateItems(visibleProducts, page),
    [visibleProducts, page]
  );

  const loadData = () => {
    Promise.all([getProducts(false, true), getCategories()])
      .then(([p, c]) => {
        setProducts(p);
        setCategories(c);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    setPage(1);
  }, [showArchived, search]);

  useEffect(() => {
    if (page !== safePage) setPage(safePage);
  }, [page, safePage]);

  const openCategoryEditor = (product: Product) => {
    setCategoryEditProduct(product);
    setEditCategoryIds([...product.categoryIds]);
  };

  const closeCategoryEditor = () => {
    if (savingCategories) return;
    setCategoryEditProduct(null);
    setEditCategoryIds([]);
  };

  const handleSaveCategories = async () => {
    if (!categoryEditProduct) return;

    setSavingCategories(true);
    try {
      await updateProduct(categoryEditProduct.id, {
        categoryIds: editCategoryIds,
      });
      setProducts((prev) =>
        prev.map((product) =>
          product.id === categoryEditProduct.id
            ? { ...product, categoryIds: editCategoryIds }
            : product
        )
      );
      toast.success("Categories updated");
      setCategoryEditProduct(null);
      setEditCategoryIds([]);
    } catch {
      toast.error("Failed to update categories");
    } finally {
      setSavingCategories(false);
    }
  };

  const handleArchive = async () => {
    if (!deleteId) return;
    try {
      await archiveProduct(deleteId);
      toast.success("Product archived");
      loadData();
    } catch {
      toast.error("Failed to archive product");
    } finally {
      setDeleteId(null);
    }
  };

  const handleRestore = async (id: string) => {
    try {
      await restoreProduct(id);
      toast.success("Product restored");
      loadData();
    } catch {
      toast.error("Failed to restore product");
    }
  };

  const handlePermanentDelete = async () => {
    if (!permanentDeleteId) return;
    try {
      await deleteProduct(permanentDeleteId);
      toast.success("Product permanently deleted");
      loadData();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to delete product"
      );
    } finally {
      setPermanentDeleteId(null);
    }
  };

  const handleStatusToggle = async (product: Product, publish: boolean) => {
    if (product.isArchived) return;

    if (publish) {
      const check = canPublishProduct(product);
      if (!check.ok) {
        toast.error(check.reason ?? "Complete the product before publishing");
        return;
      }
    }

    setTogglingId(product.id);
    try {
      if (publish) {
        await publishProduct(product.id);
        toast.success("Product published");
      } else {
        await unpublishProduct(product.id);
        toast.success("Product moved to drafts");
      }
      loadData();
    } catch {
      toast.error(
        publish ? "Failed to publish product" : "Failed to unpublish product"
      );
    } finally {
      setTogglingId(null);
    }
  };

  if (!isElevatedAdmin) {
    return (
      <Card>
        <CardContent className="pt-6">
          <p className="text-muted-foreground">
            Only admins can manage the product catalog.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div>
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Products</h1>
          <p className="text-muted-foreground">Manage product catalog</p>
        </div>
        <div className="flex gap-2">
          <Button
            variant={showArchived ? "default" : "outline"}
            onClick={() => setShowArchived((v) => !v)}
          >
            {showArchived ? "Showing archived" : "Show archived"}
          </Button>
          {!showArchived && (
            <>
              {isMasterAdmin && (
                <LinkButton href="/admin/settings/import" variant="outline">
                  <FileJson className="mr-2 h-4 w-4" />
                  Product JSON import
                </LinkButton>
              )}
              <LinkButton href="/admin/products/new">
                <Plus className="mr-2 h-4 w-4" />
                Add product
              </LinkButton>
            </>
          )}
        </div>
      </div>

      <Card>
        <CardHeader className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <CardTitle>Catalog</CardTitle>
              <CardDescription>
                {visibleProducts.length === 0
                  ? search.trim()
                    ? "No matches"
                    : `0 ${showArchived ? "archived" : "active"} products`
                  : `Showing ${rangeStart}–${rangeEnd} of ${visibleProducts.length}${
                      search.trim()
                        ? ` match${visibleProducts.length === 1 ? "" : "es"}`
                        : ` ${showArchived ? "archived" : "active"} product${
                            visibleProducts.length === 1 ? "" : "s"
                          }`
                    }`}
              </CardDescription>
            </div>
            <div className="relative w-full sm:max-w-sm">
              <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search products, types, categories…"
                className="pl-9"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {loading ? (
            <p className="text-muted-foreground">Loading...</p>
          ) : visibleProducts.length === 0 ? (
            <p className="text-muted-foreground">
              {search.trim()
                ? "No products match your search."
                : showArchived
                  ? "No archived products."
                  : "No products yet."}
            </p>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Product</TableHead>
                    <TableHead>Categories</TableHead>
                    <TableHead>Price</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-12 text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pagedProducts.map((product) => {
                  const thumb = getProductThumbnailUrl(product);
                  const published = isProductPublished(product);

                  return (
                    <TableRow key={product.id}>
                      <TableCell>
                        <div className="flex items-center gap-3">
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
                          <Link
                            href={`/admin/products/${product.id}`}
                            className="font-medium hover:underline"
                          >
                            {product.name.trim() || "Untitled draft"}
                          </Link>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <div className="flex min-w-0 flex-1 flex-wrap gap-1">
                            {product.categoryIds.length === 0 ? (
                              <span className="text-sm text-muted-foreground">
                                No categories
                              </span>
                            ) : (
                              product.categoryIds.map((id) => (
                                <Link key={id} href={`/admin/categories/${id}`}>
                                  <Badge
                                    variant="secondary"
                                    className="text-xs"
                                  >
                                    {categoryMap[id]?.name ?? "Unknown"}
                                  </Badge>
                                </Link>
                              ))
                            )}
                          </div>
                          {!product.isArchived && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="shrink-0"
                              onClick={() => openCategoryEditor(product)}
                            >
                              <Tags className="h-4 w-4" />
                              <span className="sr-only">
                                Change categories
                              </span>
                            </Button>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        {(() => {
                          const range = getProductPriceRange(product);
                          if (range.min !== range.max) {
                            return `${formatCurrency(range.min)} – ${formatCurrency(range.max)}`;
                          }
                          return formatCurrency(getDefaultVariant(product).price);
                        })()}
                      </TableCell>
                      <TableCell>
                        {product.isArchived ? (
                          <Badge variant="secondary">Archived</Badge>
                        ) : (
                          <div className="flex items-center gap-2">
                            <Switch
                              checked={published}
                              disabled={togglingId === product.id}
                              onCheckedChange={(checked) =>
                                handleStatusToggle(product, checked)
                              }
                              aria-label={
                                published
                                  ? "Published — switch to draft"
                                  : "Draft — switch to published"
                              }
                            />
                            <span className="text-sm text-muted-foreground">
                              {published ? "Published" : "Draft"}
                            </span>
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger
                            render={
                              <Button variant="ghost" size="icon">
                                <MoreHorizontal className="h-4 w-4" />
                                <span className="sr-only">Open menu</span>
                              </Button>
                            }
                          />
                          <DropdownMenuContent align="end">
                            {!product.isArchived && (
                              <DropdownMenuItem
                                render={
                                  <Link href={`/admin/products/${product.id}`}>
                                    <Pencil className="h-4 w-4" />
                                    Edit
                                  </Link>
                                }
                              />
                            )}
                            {product.isArchived ? (
                              <>
                                <DropdownMenuItem
                                  onClick={() => handleRestore(product.id)}
                                >
                                  <ArchiveRestore className="h-4 w-4" />
                                  Restore
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  variant="destructive"
                                  onClick={() =>
                                    setPermanentDeleteId(product.id)
                                  }
                                >
                                  <Trash2 className="h-4 w-4" />
                                  Delete permanently
                                </DropdownMenuItem>
                              </>
                            ) : (
                              <DropdownMenuItem
                                variant="destructive"
                                onClick={() => setDeleteId(product.id)}
                              >
                                <Archive className="h-4 w-4" />
                                Archive
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>

              <TablePagination
                page={safePage}
                totalPages={totalPages}
                total={total}
                onPageChange={setPage}
              />
            </>
          )}
        </CardContent>
      </Card>

      <Dialog
        open={!!categoryEditProduct}
        onOpenChange={(open) => {
          if (!open) closeCategoryEditor();
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Change categories</DialogTitle>
            <DialogDescription>
              {categoryEditProduct
                ? `Update categories for “${
                    categoryEditProduct.name.trim() || "Untitled draft"
                  }”.`
                : "Update product categories."}
            </DialogDescription>
          </DialogHeader>
          <CategoryMultiSelect
            categories={categories}
            selectedIds={editCategoryIds}
            onChange={setEditCategoryIds}
          />
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={closeCategoryEditor}
              disabled={savingCategories}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => void handleSaveCategories()}
              disabled={savingCategories}
            >
              {savingCategories ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Archive product?</AlertDialogTitle>
            <AlertDialogDescription>
              Archived products are hidden from the shop and catalog lists. You
              can restore them later.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleArchive}>Archive</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={!!permanentDeleteId}
        onOpenChange={() => setPermanentDeleteId(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete product permanently?</AlertDialogTitle>
            <AlertDialogDescription>
              This cannot be undone. The product and its images will be removed
              from the database.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={handlePermanentDelete}
            >
              Delete permanently
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
