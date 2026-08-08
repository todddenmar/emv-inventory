"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Plus,
  Pencil,
  Archive,
  ArchiveRestore,
  Loader2,
  Trash2,
  ChevronLeft,
  ChevronRight,
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
import { TagsInput } from "@/components/admin/product-specs-editor";
import { useBranchAccess } from "@/hooks/use-branch-access";
import {
  archiveCategory,
  createCategory,
  deleteCategory,
  getCategories,
  resolveCategorySlug,
  restoreCategory,
} from "@/lib/firestore/categories";
import { slugify } from "@/lib/slug";
import { useSlugField } from "@/hooks/use-slug-field";
import type { Category } from "@/types";

const PAGE_SIZE = 10;

export default function AdminCategoriesPage() {
  const { isMasterAdmin } = useBranchAccess();
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [permanentDeleteId, setPermanentDeleteId] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [page, setPage] = useState(1);
  const [name, setName] = useState("");
  const resolveSlug = useCallback(
    (categoryName: string, preferredSlug?: string) =>
      resolveCategorySlug(categoryName, preferredSlug),
    []
  );
  const { slug, setSlug, syncSlugFromName, resetSlugField } =
    useSlugField(resolveSlug);
  const [tags, setTags] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const visibleCategories = useMemo(
    () =>
      categories.filter((c) => (showArchived ? c.isArchived : !c.isArchived)),
    [categories, showArchived]
  );

  const totalPages = Math.max(1, Math.ceil(visibleCategories.length / PAGE_SIZE));

  const pagedCategories = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return visibleCategories.slice(start, start + PAGE_SIZE);
  }, [visibleCategories, page]);

  const rangeStart =
    visibleCategories.length === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const rangeEnd = Math.min(page * PAGE_SIZE, visibleCategories.length);

  const loadCategories = () => {
    getCategories(true)
      .then(setCategories)
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadCategories();
  }, []);

  useEffect(() => {
    setPage(1);
  }, [showArchived]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  if (!isMasterAdmin) {
    return (
      <Card>
        <CardContent className="pt-6">
          <p className="text-muted-foreground">
            Only the master-admin can manage categories.
          </p>
        </CardContent>
      </Card>
    );
  }

  const openCreate = () => {
    setName("");
    resetSlugField("", false);
    setTags([]);
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
            Organize products with categories and tags
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
        <DialogContent>
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
              <Label htmlFor="cat-slug">URL slug</Label>
              <Input
                id="cat-slug"
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                placeholder="e.g. beverages"
              />
              <p className="text-xs text-muted-foreground">
                Used in /categories/{slug || "your-slug"}
              </p>
            </div>
            <div className="space-y-2">
              <Label>Tags</Label>
              <TagsInput tags={tags} onChange={setTags} />
            </div>
            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Create
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      <Card>
        <CardHeader>
          <CardTitle>All categories</CardTitle>
          <CardDescription>
            {visibleCategories.length === 0
              ? `0 ${showArchived ? "archived" : "active"} categories`
              : `Showing ${rangeStart}–${rangeEnd} of ${visibleCategories.length} ${
                  showArchived ? "archived" : "active"
                } categor${visibleCategories.length === 1 ? "y" : "ies"}`}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {loading ? (
            <p className="text-muted-foreground">Loading...</p>
          ) : visibleCategories.length === 0 ? (
            <p className="text-muted-foreground">
              {showArchived ? "No archived categories." : "No categories yet."}
            </p>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Tags</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pagedCategories.map((category) => (
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
                  ))}
                </TableBody>
              </Table>

              {visibleCategories.length > PAGE_SIZE && (
                <div className="flex items-center justify-end gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={page <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                  >
                    <ChevronLeft className="mr-1 h-4 w-4" />
                    Previous
                  </Button>
                  <span className="text-sm tabular-nums text-muted-foreground">
                    Page {page} of {totalPages}
                  </span>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={page >= totalPages}
                    onClick={() =>
                      setPage((p) => Math.min(totalPages, p + 1))
                    }
                  >
                    Next
                    <ChevronRight className="ml-1 h-4 w-4" />
                  </Button>
                </div>
              )}
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
