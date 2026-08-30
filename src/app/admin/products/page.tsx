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
  Lock,
  Unlock,
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
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { CategoryMultiSelect } from "@/components/admin/category-multi-select";
import { TableBulkBar } from "@/components/admin/table-bulk-bar";
import { TablePagination } from "@/components/admin/table-pagination";
import { useBranchAccess } from "@/hooks/use-branch-access";
import {
  archiveProduct,
  deleteProduct,
  getProducts,
  publishProduct,
  restoreProduct,
  setProductLocked,
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
import { runBulkActions, summarizeBulkResult } from "@/lib/bulk";
import { useAuthStore } from "@/stores/auth-store";
import type { Category, Product } from "@/types";

function matchesQuery(value: string, query: string): boolean {
  if (!query.trim()) return true;
  return value.toLowerCase().includes(query.trim().toLowerCase());
}

export default function AdminProductsPage() {
  const { isMasterAdmin, isElevatedAdmin } = useBranchAccess();
  const user = useAuthStore((s) => s.user);
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [permanentDeleteId, setPermanentDeleteId] = useState<string | null>(
    null
  );
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [lockingId, setLockingId] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkRunning, setBulkRunning] = useState(false);
  const [bulkArchiveOpen, setBulkArchiveOpen] = useState(false);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [bulkDeleteConfirm, setBulkDeleteConfirm] = useState("");
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
    setSelectedIds([]);
  }, [showArchived, search]);

  useEffect(() => {
    if (page !== safePage) setPage(safePage);
  }, [page, safePage]);

  const pageIds = useMemo(
    () => pagedProducts.map((product) => product.id),
    [pagedProducts]
  );
  const allPageSelected =
    pageIds.length > 0 && pageIds.every((id) => selectedIds.includes(id));
  const somePageSelected = pageIds.some((id) => selectedIds.includes(id));

  const toggleSelectPage = (checked: boolean) => {
    if (checked) {
      setSelectedIds((prev) => [...new Set([...prev, ...pageIds])]);
      return;
    }
    setSelectedIds((prev) => prev.filter((id) => !pageIds.includes(id)));
  };

  const toggleSelected = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const reportBulk = (
    result: { ok: number; failed: number; messages: string[] },
    verb: string
  ) => {
    const summary = summarizeBulkResult(result, verb);
    if (summary.success) toast.success(summary.success);
    if (summary.error) toast.error(summary.error);
  };

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
      setDeleteId(null);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to archive product"
      );
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

  const closePermanentDelete = () => {
    setPermanentDeleteId(null);
    setDeleteConfirmText("");
  };

  const canConfirmDelete = deleteConfirmText === "delete";

  const permanentDeleteProduct = useMemo(
    () => products.find((p) => p.id === permanentDeleteId) ?? null,
    [products, permanentDeleteId]
  );

  const handlePermanentDelete = async () => {
    if (!permanentDeleteId || !canConfirmDelete) return;
    setDeleting(true);
    try {
      await deleteProduct(permanentDeleteId);
      toast.success("Product permanently deleted");
      closePermanentDelete();
      loadData();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to delete product"
      );
    } finally {
      setDeleting(false);
    }
  };

  const closeBulkDelete = () => {
    setBulkDeleteOpen(false);
    setBulkDeleteConfirm("");
  };

  const handleBulkArchive = async () => {
    if (selectedIds.length === 0) return;
    setBulkRunning(true);
    try {
      const result = await runBulkActions(selectedIds, archiveProduct);
      reportBulk(result, "archived");
      setBulkArchiveOpen(false);
      setSelectedIds([]);
      loadData();
    } finally {
      setBulkRunning(false);
    }
  };

  const handleBulkRestore = async () => {
    if (selectedIds.length === 0) return;
    setBulkRunning(true);
    try {
      const result = await runBulkActions(selectedIds, restoreProduct);
      reportBulk(result, "restored");
      setSelectedIds([]);
      loadData();
    } finally {
      setBulkRunning(false);
    }
  };

  const handleBulkDelete = async () => {
    if (selectedIds.length === 0 || bulkDeleteConfirm !== "delete") return;
    setBulkRunning(true);
    try {
      const result = await runBulkActions(selectedIds, deleteProduct);
      reportBulk(result, "deleted");
      closeBulkDelete();
      setSelectedIds([]);
      loadData();
    } finally {
      setBulkRunning(false);
    }
  };

  const canUnlockProduct = (product: Product) =>
    isMasterAdmin || product.lockedBy === user?.uid;

  const handleToggleLock = async (product: Product) => {
    if (!user) return;
    if (product.isLocked && !canUnlockProduct(product)) {
      toast.error(
        "Only the admin who locked this product or a master admin can unlock it"
      );
      return;
    }

    setLockingId(product.id);
    try {
      await setProductLocked(product.id, {
        locked: !product.isLocked,
        uid: user.uid,
        displayName: user.displayName || user.email || null,
        isMasterAdmin,
      });
      toast.success(product.isLocked ? "Product unlocked" : "Product locked");
      loadData();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to update lock"
      );
    } finally {
      setLockingId(null);
    }
  };

  const openArchive = (product: Product) => {
    if (product.isLocked) {
      toast.error("Unlock the product before archiving it");
      return;
    }
    setDeleteId(product.id);
  };

  const openPermanentDelete = (product: Product) => {
    if (product.isLocked) {
      toast.error("Unlock the product before deleting it");
      return;
    }
    setDeleteConfirmText("");
    setPermanentDeleteId(product.id);
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
              <TableBulkBar
                selectedCount={selectedIds.length}
                visibleCount={visibleProducts.length}
                itemLabel={showArchived ? "archived products" : "products"}
                onSelectAllVisible={() =>
                  setSelectedIds(visibleProducts.map((product) => product.id))
                }
                onClear={() => setSelectedIds([])}
              >
                {showArchived ? (
                  <>
                    <Button
                      type="button"
                      variant="outline"
                      disabled={bulkRunning}
                      onClick={() => void handleBulkRestore()}
                    >
                      {bulkRunning ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <ArchiveRestore className="h-4 w-4" />
                      )}
                      Restore
                    </Button>
                    <Button
                      type="button"
                      variant="destructive"
                      disabled={bulkRunning}
                      onClick={() => {
                        setBulkDeleteConfirm("");
                        setBulkDeleteOpen(true);
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                      Delete
                    </Button>
                  </>
                ) : (
                  <Button
                    type="button"
                    variant="outline"
                    disabled={bulkRunning}
                    onClick={() => setBulkArchiveOpen(true)}
                  >
                    <Archive className="h-4 w-4" />
                    Archive
                  </Button>
                )}
              </TableBulkBar>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">
                      <Checkbox
                        checked={allPageSelected}
                        indeterminate={somePageSelected && !allPageSelected}
                        onCheckedChange={(checked) =>
                          toggleSelectPage(checked === true)
                        }
                        aria-label="Select all on this page"
                      />
                    </TableHead>
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
                  const unlockAllowed = canUnlockProduct(product);

                  return (
                    <TableRow key={product.id}>
                      <TableCell>
                        <Checkbox
                          checked={selectedIds.includes(product.id)}
                          onCheckedChange={() => toggleSelected(product.id)}
                          aria-label={`Select ${product.name.trim() || "product"}`}
                        />
                      </TableCell>
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
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <Link
                                href={`/admin/products/${product.id}`}
                                className="font-medium hover:underline"
                              >
                                {product.name.trim() || "Untitled draft"}
                              </Link>
                              {product.isLocked ? (
                                <Badge
                                  variant="secondary"
                                  className="gap-1"
                                  title={
                                    product.lockedByName
                                      ? `Locked by ${product.lockedByName}`
                                      : "Locked"
                                  }
                                >
                                  <Lock className="h-3 w-3" />
                                  Locked
                                </Badge>
                              ) : null}
                            </div>
                          </div>
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
                            <DropdownMenuItem
                              disabled={
                                lockingId === product.id ||
                                (product.isLocked && !unlockAllowed)
                              }
                              onClick={() => handleToggleLock(product)}
                            >
                              {lockingId === product.id ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : product.isLocked ? (
                                <Unlock className="h-4 w-4" />
                              ) : (
                                <Lock className="h-4 w-4" />
                              )}
                              {product.isLocked
                                ? unlockAllowed
                                  ? "Unlock"
                                  : "Locked by another admin"
                                : "Lock"}
                            </DropdownMenuItem>
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
                                  disabled={product.isLocked}
                                  onClick={() => openPermanentDelete(product)}
                                >
                                  <Trash2 className="h-4 w-4" />
                                  Delete permanently
                                </DropdownMenuItem>
                              </>
                            ) : (
                              <DropdownMenuItem
                                variant="destructive"
                                disabled={product.isLocked}
                                onClick={() => openArchive(product)}
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
              Archived products are hidden from the shop and catalog lists. The
              product must be unlocked and have no remaining stock across
              branches.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleArchive}>Archive</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog
        open={!!permanentDeleteId}
        onOpenChange={(open) => {
          if (!open) closePermanentDelete();
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete product permanently?</DialogTitle>
            <DialogDescription>
              This cannot be undone
              {permanentDeleteProduct
                ? ` for “${
                    permanentDeleteProduct.name.trim() || "Untitled draft"
                  }”`
                : ""}
              . The product must be archived, unlocked, and have no remaining
              stock. Images will be removed.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="confirm-delete-product">
              Type <span className="font-mono font-semibold">delete</span> to
              confirm
            </Label>
            <Input
              id="confirm-delete-product"
              value={deleteConfirmText}
              onChange={(e) => setDeleteConfirmText(e.target.value)}
              placeholder="delete"
              autoComplete="off"
              disabled={deleting}
            />
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={closePermanentDelete}
              disabled={deleting}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={!canConfirmDelete || deleting}
              onClick={handlePermanentDelete}
            >
              {deleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Delete permanently
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={bulkArchiveOpen}
        onOpenChange={setBulkArchiveOpen}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Archive {selectedIds.length} product
              {selectedIds.length === 1 ? "" : "s"}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Archived products are hidden from the shop and catalog lists.
              Locked products and items with remaining stock will be skipped.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={bulkRunning}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={bulkRunning}
              onClick={() => void handleBulkArchive()}
            >
              {bulkRunning ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              Archive selected
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog
        open={bulkDeleteOpen}
        onOpenChange={(open) => {
          if (!open) closeBulkDelete();
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              Delete {selectedIds.length} product
              {selectedIds.length === 1 ? "" : "s"} permanently?
            </DialogTitle>
            <DialogDescription>
              This cannot be undone. Locked products and items with remaining
              stock will be skipped.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="confirm-bulk-delete-product">
              Type <span className="font-mono font-semibold">delete</span> to
              confirm
            </Label>
            <Input
              id="confirm-bulk-delete-product"
              value={bulkDeleteConfirm}
              onChange={(e) => setBulkDeleteConfirm(e.target.value)}
              placeholder="delete"
              autoComplete="off"
              disabled={bulkRunning}
            />
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={closeBulkDelete}
              disabled={bulkRunning}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={bulkDeleteConfirm !== "delete" || bulkRunning}
              onClick={() => void handleBulkDelete()}
            >
              {bulkRunning && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Delete permanently
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
