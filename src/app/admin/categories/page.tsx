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
import { CategoryFreebiesEditor } from "@/components/admin/category-freebies-editor";
import { TablePagination } from "@/components/admin/table-pagination";
import { useBranchAccess } from "@/hooks/use-branch-access";
import {
  archiveCategory,
  createCategory,
  deleteCategory,
  getCategories,
  resolveCategorySlug,
  restoreCategory,
} from "@/lib/firestore/categories";
import { getProducts } from "@/lib/firestore/products";
import { slugify } from "@/lib/slug";
import { useSlugField } from "@/hooks/use-slug-field";
import { paginateItems } from "@/lib/pagination";
import type { Category, CategoryFreebieVariant, Product } from "@/types";

function matchesQuery(value: string, query: string): boolean {
  if (!query.trim()) return true;
  return value.toLowerCase().includes(query.trim().toLowerCase());
}

export default function AdminCategoriesPage() {
  const { isElevatedAdmin } = useBranchAccess();
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [permanentDeleteId, setPermanentDeleteId] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [name, setName] = useState("");
  const resolveSlug = useCallback(
    (categoryName: string, preferredSlug?: string) =>
      resolveCategorySlug(categoryName, preferredSlug),
    []
  );
  const { slug, syncSlugFromName, resetSlugField } =
    useSlugField(resolveSlug);
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
    getProducts(false)
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

  useEffect(() => {
    setPage(1);
  }, [showArchived, search]);

  useEffect(() => {
    if (page !== safePage) setPage(safePage);
  }, [page, safePage]);

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
    } catch {
      toast.error("Failed to archive category");
    } finally {
      setDeleteId(null);
    }
  };

  const handlePermanentDelete = async () => {
    if (!permanentDeleteId) return;
    try {
      await deleteCategory(permanentDeleteId);
      toast.success("Category permanently deleted");
      loadCategories();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to delete category"
      );
    } finally {
      setPermanentDeleteId(null);
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
              products={catalogProducts}
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
              <Table>
                <TableHeader>
                  <TableRow>
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
                    return (
                    <TableRow key={category.id}>
                      <TableCell className="font-medium">
                        <Link
                          href={`/admin/categories/${category.id}`}
                          className="hover:underline"
                        >
                          {category.name}
                        </Link>
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
                            >
                              <ArchiveRestore className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => setPermanentDeleteId(category.id)}
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </>
                        ) : (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setDeleteId(category.id)}
                          >
                            <Archive className="h-4 w-4 text-destructive" />
                          </Button>
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
              Archived categories are hidden from product assignment. Existing
              product links are kept until you update them.
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
            <AlertDialogTitle>Delete category permanently?</AlertDialogTitle>
            <AlertDialogDescription>
              This cannot be undone. Products may still reference this category
              until you update them.
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
