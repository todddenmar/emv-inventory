"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Plus,
  Pencil,
  Archive,
  ArchiveRestore,
  Loader2,
  Search,
  Trash2,
  Lock,
  Unlock,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { LinkButton } from "@/components/ui/link-button";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { CategoryFreebiesEditor } from "@/components/admin/category-freebies-editor";
import { TableBulkBar } from "@/components/admin/table-bulk-bar";
import { TablePagination } from "@/components/admin/table-pagination";
import { useBranchAccess } from "@/hooks/use-branch-access";
import {
  archiveCategory,
  createCategory,
  deleteCategory,
  getCategories,
  resolveCategorySlug,
  restoreCategory,
  setCategoryLocked,
} from "@/lib/firestore/categories";
import { getProducts } from "@/lib/firestore/products";
import { slugify } from "@/lib/slug";
import { useSlugField } from "@/hooks/use-slug-field";
import { paginateItems } from "@/lib/pagination";
import { runBulkActions, summarizeBulkResult } from "@/lib/bulk";
import { useAuthStore, useIsMasterAdmin } from "@/stores/auth-store";
import type { Category, CategoryFreebieVariant, Product } from "@/types";

function matchesQuery(value: string, query: string): boolean {
  if (!query.trim()) return true;
  return value.toLowerCase().includes(query.trim().toLowerCase());
}

export default function AdminCategoriesPage() {
  const { isElevatedAdmin } = useBranchAccess();
  const user = useAuthStore((s) => s.user);
  const isMasterAdmin = useIsMasterAdmin();
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
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
  const [name, setName] = useState("");
  const resolveSlug = useCallback(
    (categoryName: string, preferredSlug?: string) =>
      resolveCategorySlug(categoryName, preferredSlug),
    []
  );
  const { slug, syncSlugFromName, resetSlugField } = useSlugField(resolveSlug);
  const [tags, setTags] = useState<string[]>([]);
  const [lowStockThreshold, setLowStockThreshold] = useState(5);
  const [freebieVariants, setFreebieVariants] = useState<
    CategoryFreebieVariant[]
  >([]);
  const [catalogProducts, setCatalogProducts] = useState<Product[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const visibleCategories = useMemo(() => {
    const archivedFiltered = categories.filter((c) =>
      showArchived ? c.isArchived : !c.isArchived
    );
    const query = search.trim();
    if (!query) return archivedFiltered;
    return archivedFiltered.filter((category) => {
      if (matchesQuery(category.name, query)) return true;
      if (matchesQuery(category.slug, query)) return true;
      return category.tags.some((tag) => matchesQuery(tag, query));
    });
  }, [categories, showArchived, search]);

  const {
    page: safePage,
    totalPages,
    pagedItems: pagedCategories,
    rangeStart,
    rangeEnd,
    total,
  } = useMemo(
    () => paginateItems(visibleCategories, page),
    [visibleCategories, page]
  );

  const loadCategories = () => {
    getCategories(true)
      .then(setCategories)
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadCategories();
    getProducts(false, true)
      .then(setCatalogProducts)
      .catch(console.error);
  }, []);

  const categoryCounts = useMemo(() => {
    const map = new Map<string, { products: number; variants: number }>();
    for (const product of catalogProducts) {
      for (const categoryId of product.categoryIds) {
        const current = map.get(categoryId) ?? { products: 0, variants: 0 };
        current.products += 1;
        current.variants += product.variants.length;
        map.set(categoryId, current);
      }
    }
    return map;
  }, [catalogProducts]);

  const permanentDeleteCategory = useMemo(
    () => categories.find((c) => c.id === permanentDeleteId) ?? null,
    [categories, permanentDeleteId]
  );

  const canConfirmDelete = deleteConfirmText === "delete";

  useEffect(() => {
    setPage(1);
    setSelectedIds([]);
  }, [showArchived, search]);

  useEffect(() => {
    if (page !== safePage) setPage(safePage);
  }, [page, safePage]);

  const pageIds = useMemo(
    () => pagedCategories.map((category) => category.id),
    [pagedCategories]
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

  if (!isElevatedAdmin) {
    return (
      <Card>
        <CardContent className="pt-6">
          <p className="text-muted-foreground">
            Only admins can manage categories.
          </p>
        </CardContent>
      </Card>
    );
  }

  const openCreate = () => {
    setName("");
    resetSlugField("", false);
    setTags([]);
    setLowStockThreshold(5);
    setFreebieVariants([]);
    setDialogOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.error("Category name is required");
      return;
    }

    setSubmitting(true);
    try {
      await createCategory({
        name: name.trim(),
        slug: slug.trim() || slugify(name),
        tags,
        lowStockThreshold: Math.max(0, lowStockThreshold),
        freebieVariants,
      });
      toast.success("Category created");
      setDialogOpen(false);
      loadCategories();
    } catch {
      toast.error("Failed to save category");
    } finally {
      setSubmitting(false);
    }
  };

  const handleArchive = async () => {
    if (!deleteId) return;
    try {
      await archiveCategory(deleteId);
      toast.success("Category archived");
      loadCategories();
      setDeleteId(null);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to archive category"
      );
    }
  };

  const closePermanentDelete = () => {
    setPermanentDeleteId(null);
    setDeleteConfirmText("");
  };

  const handlePermanentDelete = async () => {
    if (!permanentDeleteId || !canConfirmDelete) return;
    setDeleting(true);
    try {
      await deleteCategory(permanentDeleteId);
      toast.success("Category permanently deleted");
      closePermanentDelete();
      loadCategories();
      getProducts(false, true)
        .then(setCatalogProducts)
        .catch(console.error);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to delete category"
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
      const result = await runBulkActions(selectedIds, archiveCategory);
      reportBulk(result, "archived");
      setBulkArchiveOpen(false);
      setSelectedIds([]);
      loadCategories();
    } finally {
      setBulkRunning(false);
    }
  };

  const handleBulkRestore = async () => {
    if (selectedIds.length === 0) return;
    setBulkRunning(true);
    try {
      const result = await runBulkActions(selectedIds, restoreCategory);
      reportBulk(result, "restored");
      setSelectedIds([]);
      loadCategories();
    } finally {
      setBulkRunning(false);
    }
  };

  const handleBulkDelete = async () => {
    if (selectedIds.length === 0 || bulkDeleteConfirm !== "delete") return;
    setBulkRunning(true);
    try {
      const result = await runBulkActions(selectedIds, deleteCategory);
      reportBulk(result, "deleted");
      closeBulkDelete();
      setSelectedIds([]);
      loadCategories();
      getProducts(false, true)
        .then(setCatalogProducts)
        .catch(console.error);
    } finally {
      setBulkRunning(false);
    }
  };

  const handleRestore = async (categoryId: string) => {
    try {
      await restoreCategory(categoryId);
      toast.success("Category restored");
      loadCategories();
    } catch {
      toast.error("Failed to restore category");
    }
  };

  const canUnlockCategory = (category: Category) =>
    isMasterAdmin || category.lockedBy === user?.uid;

  const handleToggleLock = async (category: Category) => {
    if (!user) return;
    if (category.isLocked && !canUnlockCategory(category)) {
      toast.error(
        "Only the admin who locked this category or a master admin can unlock it"
      );
      return;
    }

    setLockingId(category.id);
    try {
      await setCategoryLocked(category.id, {
        locked: !category.isLocked,
        uid: user.uid,
        displayName: user.displayName || user.email || null,
        isMasterAdmin,
      });
      toast.success(category.isLocked ? "Category unlocked" : "Category locked");
      loadCategories();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to update lock"
      );
    } finally {
      setLockingId(null);
    }
  };

  const openArchive = (category: Category) => {
    const productCount = categoryCounts.get(category.id)?.products ?? 0;
    if (category.isLocked) {
      toast.error("Unlock the category before archiving it");
      return;
    }
    if (productCount > 0) {
      toast.error(
        `Cannot archive: ${productCount} product${productCount === 1 ? "" : "s"} still assigned to this category`
      );
      return;
    }
    setDeleteId(category.id);
  };

  const openPermanentDelete = (category: Category) => {
    const productCount = categoryCounts.get(category.id)?.products ?? 0;
    if (category.isLocked) {
      toast.error("Unlock the category before deleting it");
      return;
    }
    if (productCount > 0) {
      toast.error(
        `Cannot delete: ${productCount} product${productCount === 1 ? "" : "s"} still assigned to this category`
      );
      return;
    }
    setDeleteConfirmText("");
    setPermanentDeleteId(category.id);
  };

  return (
    <div>
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Categories</h1>
          <p className="text-muted-foreground">
            Organize products into categories
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant={showArchived ? "default" : "outline"}
            onClick={() => setShowArchived((v) => !v)}
          >
            {showArchived ? "Showing archived" : "Show archived"}
          </Button>
          {!showArchived && (
            <Button onClick={openCreate}>
              <Plus className="mr-2 h-4 w-4" />
              Add category
            </Button>
          )}
        </div>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Add category</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="cat-name">Name</Label>
              <Input
                id="cat-name"
                value={name}
                onChange={(e) => {
                  const nextName = e.target.value;
                  setName(nextName);
                  syncSlugFromName(nextName);
                }}
                placeholder="e.g. Beverages"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cat-low-at">Low at</Label>
              <Input
                id="cat-low-at"
                type="number"
                min={0}
                inputMode="numeric"
                className="h-9 min-w-[8rem] tabular-nums [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                value={lowStockThreshold}
                onChange={(e) =>
                  setLowStockThreshold(Number(e.target.value) || 0)
                }
                disabled={submitting}
              />
              <p className="text-xs text-muted-foreground">
                Inventory alerts when stock is at or below this for products in
                this category.
              </p>
            </div>
            <CategoryFreebiesEditor
              freebies={freebieVariants}
              onChange={setFreebieVariants}
              products={catalogProducts.filter((p) => !p.isArchived)}
              disabled={submitting}
            />
            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Create
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      <Card>
        <CardHeader className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <CardTitle>All categories</CardTitle>
              <CardDescription>
                {visibleCategories.length === 0
                  ? search.trim()
                    ? "No matches"
                    : `0 ${showArchived ? "archived" : "active"} categories`
                  : `Showing ${rangeStart}–${rangeEnd} of ${visibleCategories.length}${
                      search.trim()
                        ? ` match${visibleCategories.length === 1 ? "" : "es"}`
                        : ` ${showArchived ? "archived" : "active"} categor${
                            visibleCategories.length === 1 ? "y" : "ies"
                          }`
                    }`}
              </CardDescription>
            </div>
            <div className="relative w-full sm:max-w-sm">
              <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search name, slug, or tags…"
                className="pl-9"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {loading ? (
            <p className="text-muted-foreground">Loading...</p>
          ) : visibleCategories.length === 0 ? (
            <p className="text-muted-foreground">
              {search.trim()
                ? "No categories match your search."
                : showArchived
                  ? "No archived categories."
                  : "No categories yet."}
            </p>
          ) : (
            <>
              <TableBulkBar
                selectedCount={selectedIds.length}
                visibleCount={visibleCategories.length}
                itemLabel={showArchived ? "archived categories" : "categories"}
                onSelectAllVisible={() =>
                  setSelectedIds(visibleCategories.map((category) => category.id))
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
                    <TableHead>Name</TableHead>
                    <TableHead>Tags</TableHead>
                    <TableHead className="w-24 text-right">Products</TableHead>
                    <TableHead className="w-24 text-right">Variants</TableHead>
                    <TableHead className="w-24">Low at</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pagedCategories.map((category) => {
                    const counts = categoryCounts.get(category.id) ?? {
                      products: 0,
                      variants: 0,
                    };
                    const inUseOrLocked =
                      category.isLocked || counts.products > 0;
                    const unlockAllowed = canUnlockCategory(category);
                    const lockButton = (
                      <Button
                        variant="ghost"
                        size="icon"
                        disabled={
                          lockingId === category.id ||
                          (category.isLocked && !unlockAllowed)
                        }
                        onClick={() => handleToggleLock(category)}
                        title={
                          category.isLocked
                            ? unlockAllowed
                              ? "Unlock"
                              : "Locked by another admin"
                            : category.isArchived
                              ? "Lock (blocks permanent delete)"
                              : "Lock (blocks archive)"
                        }
                      >
                        {lockingId === category.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : category.isLocked ? (
                          <Unlock className="h-4 w-4" />
                        ) : (
                          <Lock className="h-4 w-4" />
                        )}
                        <span className="sr-only">
                          {category.isLocked ? "Unlock" : "Lock"}
                        </span>
                      </Button>
                    );

                    return (
                      <TableRow key={category.id}>
                        <TableCell>
                          <Checkbox
                            checked={selectedIds.includes(category.id)}
                            onCheckedChange={() => toggleSelected(category.id)}
                            aria-label={`Select ${category.name}`}
                          />
                        </TableCell>
                        <TableCell className="font-medium">
                          <div className="flex flex-wrap items-center gap-2">
                            <Link
                              href={`/admin/categories/${category.id}`}
                              className="hover:underline"
                            >
                              {category.name}
                            </Link>
                            {category.isLocked ? (
                              <Badge
                                variant="secondary"
                                className="gap-1"
                                title={
                                  category.lockedByName
                                    ? `Locked by ${category.lockedByName}`
                                    : "Locked"
                                }
                              >
                                <Lock className="h-3 w-3" />
                                Locked
                              </Badge>
                            ) : null}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {category.tags.length === 0 ? (
                              <span className="text-muted-foreground text-sm">
                                —
                              </span>
                            ) : (
                              category.tags.map((tag) => (
                                <Badge key={tag} variant="outline">
                                  {tag}
                                </Badge>
                              ))
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="tabular-nums text-right text-muted-foreground">
                          {counts.products}
                        </TableCell>
                        <TableCell className="tabular-nums text-right text-muted-foreground">
                          {counts.variants}
                        </TableCell>
                        <TableCell className="tabular-nums text-muted-foreground">
                          {category.lowStockThreshold}
                        </TableCell>
                        <TableCell className="text-right">
                          {!category.isArchived && (
                            <LinkButton
                              href={`/admin/categories/${category.id}`}
                              variant="ghost"
                              size="icon"
                            >
                              <Pencil className="h-4 w-4" />
                              <span className="sr-only">Edit category</span>
                            </LinkButton>
                          )}
                          {category.isArchived ? (
                            <>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleRestore(category.id)}
                                title="Restore"
                              >
                                <ArchiveRestore className="h-4 w-4" />
                                <span className="sr-only">Restore</span>
                              </Button>
                              {lockButton}
                              <Button
                                variant="ghost"
                                size="icon"
                                disabled={inUseOrLocked}
                                onClick={() => openPermanentDelete(category)}
                                title={
                                  category.isLocked
                                    ? "Unlock before deleting"
                                    : counts.products > 0
                                      ? "Remove from all products before deleting"
                                      : "Delete permanently"
                                }
                              >
                                <Trash2 className="h-4 w-4 text-destructive" />
                                <span className="sr-only">Delete</span>
                              </Button>
                            </>
                          ) : (
                            <>
                              {lockButton}
                              <Button
                                variant="ghost"
                                size="icon"
                                disabled={inUseOrLocked}
                                onClick={() => openArchive(category)}
                                title={
                                  category.isLocked
                                    ? "Unlock before archiving"
                                    : counts.products > 0
                                      ? "Remove from all products before archiving"
                                      : "Archive"
                                }
                              >
                                <Archive className="h-4 w-4 text-destructive" />
                                <span className="sr-only">Archive</span>
                              </Button>
                            </>
                          )}
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

      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Archive category?</AlertDialogTitle>
            <AlertDialogDescription>
              Archived categories are hidden from product assignment. The
              category must be unlocked and not assigned to any products.
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
            <DialogTitle>Delete category permanently?</DialogTitle>
            <DialogDescription>
              This cannot be undone
              {permanentDeleteCategory
                ? ` for “${permanentDeleteCategory.name}”`
                : ""}
              . The category must be archived, unlocked, and not assigned to any
              products.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="confirm-delete">
              Type <span className="font-mono font-semibold">delete</span> to
              confirm
            </Label>
            <Input
              id="confirm-delete"
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
              Archive {selectedIds.length} categor
              {selectedIds.length === 1 ? "y" : "ies"}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Archived categories are hidden from product assignment. Locked
              categories and those still assigned to products will be skipped.
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
              Delete {selectedIds.length} categor
              {selectedIds.length === 1 ? "y" : "ies"} permanently?
            </DialogTitle>
            <DialogDescription>
              This cannot be undone. Locked categories and those still assigned
              to products will be skipped.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="confirm-bulk-delete-category">
              Type <span className="font-mono font-semibold">delete</span> to
              confirm
            </Label>
            <Input
              id="confirm-bulk-delete-category"
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
