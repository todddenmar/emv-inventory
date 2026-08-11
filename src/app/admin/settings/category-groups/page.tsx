"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Archive,
  ArchiveRestore,
  FolderKanban,
  Loader2,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
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
import { CategoryMultiSelect } from "@/components/admin/category-multi-select";
import { TablePagination } from "@/components/admin/table-pagination";
import { useBranchAccess } from "@/hooks/use-branch-access";
import { getCategories } from "@/lib/firestore/categories";
import {
  archiveCategoryGroup,
  createCategoryGroup,
  deleteCategoryGroup,
  getCategoryGroups,
  restoreCategoryGroup,
  updateCategoryGroup,
} from "@/lib/firestore/category-groups";
import { paginateItems } from "@/lib/pagination";
import type { Category, CategoryGroup } from "@/types";

export default function AdminCategoryGroupsPage() {
  const { isElevatedAdmin } = useBranchAccess();
  const [groups, setGroups] = useState<CategoryGroup[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<CategoryGroup | null>(null);
  const [archiveId, setArchiveId] = useState<string | null>(null);
  const [permanentDeleteId, setPermanentDeleteId] = useState<string | null>(
    null
  );
  const [showArchived, setShowArchived] = useState(false);
  const [name, setName] = useState("");
  const [categoryIds, setCategoryIds] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [page, setPage] = useState(1);

  const categoryMap = useMemo(() => {
    const map: Record<string, Category> = {};
    for (const category of categories) map[category.id] = category;
    return map;
  }, [categories]);

  const activeCategories = useMemo(
    () => categories.filter((category) => !category.isArchived),
    [categories]
  );

  const visibleGroups = useMemo(
    () =>
      groups.filter((group) =>
        showArchived ? group.isArchived : !group.isArchived
      ),
    [groups, showArchived]
  );

  const {
    page: safePage,
    totalPages,
    pagedItems,
    rangeStart,
    rangeEnd,
    total,
  } = useMemo(
    () => paginateItems(visibleGroups, page),
    [visibleGroups, page]
  );

  const load = () => {
    Promise.all([getCategoryGroups(true), getCategories(true)])
      .then(([groupList, categoryList]) => {
        setGroups(groupList);
        setCategories(categoryList);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    setPage(1);
  }, [showArchived]);

  useEffect(() => {
    if (page !== safePage) setPage(safePage);
  }, [page, safePage]);

  if (!isElevatedAdmin) {
    return (
      <Card>
        <CardContent className="pt-6">
          <p className="text-muted-foreground">
            Only admins can manage category groups.
          </p>
        </CardContent>
      </Card>
    );
  }

  const openCreate = () => {
    setEditing(null);
    setName("");
    setCategoryIds([]);
    setDialogOpen(true);
  };

  const openEdit = (group: CategoryGroup) => {
    setEditing(group);
    setName(group.name);
    setCategoryIds(
      group.categoryIds.filter((id) =>
        activeCategories.some((category) => category.id === id)
      )
    );
    setDialogOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.error("Group name is required");
      return;
    }
    if (categoryIds.length === 0) {
      toast.error("Select at least one category");
      return;
    }

    setSubmitting(true);
    try {
      if (editing) {
        await updateCategoryGroup(editing.id, {
          name: name.trim(),
          categoryIds,
        });
        toast.success("Category group updated");
      } else {
        await createCategoryGroup({
          name: name.trim(),
          categoryIds,
        });
        toast.success("Category group created");
      }
      setDialogOpen(false);
      load();
    } catch {
      toast.error("Failed to save category group");
    } finally {
      setSubmitting(false);
    }
  };

  const handleArchive = async () => {
    if (!archiveId) return;
    try {
      await archiveCategoryGroup(archiveId);
      toast.success("Category group archived");
      load();
    } catch {
      toast.error("Failed to archive category group");
    } finally {
      setArchiveId(null);
    }
  };

  const handleRestore = async (id: string) => {
    try {
      await restoreCategoryGroup(id);
      toast.success("Category group restored");
      load();
    } catch {
      toast.error("Failed to restore category group");
    }
  };

  const handlePermanentDelete = async () => {
    if (!permanentDeleteId) return;
    try {
      await deleteCategoryGroup(permanentDeleteId);
      toast.success("Category group permanently deleted");
      load();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to delete category group"
      );
    } finally {
      setPermanentDeleteId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Category groups</h1>
          <p className="text-muted-foreground">
            Bundle categories for report and history filters (e.g. Paddles)
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
              Add group
            </Button>
          )}
        </div>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editing ? "Edit category group" : "Add category group"}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="group-name">Name</Label>
              <Input
                id="group-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Paddles"
                disabled={submitting}
              />
            </div>
            <div className="space-y-2">
              <Label>Categories</Label>
              <CategoryMultiSelect
                categories={activeCategories}
                selectedIds={categoryIds}
                onChange={setCategoryIds}
                idPrefix="group-cat"
                disabled={submitting}
              />
            </div>
            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {editing ? "Save changes" : "Create group"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <FolderKanban className="h-4 w-4" />
            All groups
          </CardTitle>
          <CardDescription>
            {visibleGroups.length === 0
              ? `0 ${showArchived ? "archived" : "active"} groups`
              : `Showing ${rangeStart}–${rangeEnd} of ${total} ${
                  showArchived ? "archived" : "active"
                } group${total === 1 ? "" : "s"}`}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {loading ? (
            <p className="text-muted-foreground">Loading...</p>
          ) : visibleGroups.length === 0 ? (
            <p className="text-muted-foreground">
              {showArchived
                ? "No archived category groups."
                : "No category groups yet."}
            </p>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Categories</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pagedItems.map((group) => (
                    <TableRow key={group.id}>
                      <TableCell className="font-medium">{group.name}</TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {group.categoryIds.length === 0 ? (
                            <span className="text-sm text-muted-foreground">
                              —
                            </span>
                          ) : (
                            group.categoryIds.map((id) => (
                              <Badge key={id} variant="outline">
                                {categoryMap[id]?.name ?? id}
                              </Badge>
                            ))
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        {!group.isArchived && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => openEdit(group)}
                          >
                            <Pencil className="h-4 w-4" />
                            <span className="sr-only">Edit</span>
                          </Button>
                        )}
                        {group.isArchived ? (
                          <>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => void handleRestore(group.id)}
                            >
                              <ArchiveRestore className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => setPermanentDeleteId(group.id)}
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </>
                        ) : (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setArchiveId(group.id)}
                          >
                            <Archive className="h-4 w-4 text-destructive" />
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
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

      <AlertDialog
        open={!!archiveId}
        onOpenChange={(open) => !open && setArchiveId(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Archive category group?</AlertDialogTitle>
            <AlertDialogDescription>
              Archived groups are hidden from report filters. Categories
              themselves are unchanged.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => void handleArchive()}>
              Archive
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={!!permanentDeleteId}
        onOpenChange={(open) => !open && setPermanentDeleteId(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete permanently?</AlertDialogTitle>
            <AlertDialogDescription>
              This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => void handlePermanentDelete()}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
