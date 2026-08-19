"use client";

import { useEffect, useState } from "react";
import { Filter } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CategoryMultiSelect } from "@/components/admin/category-multi-select";
import type { Category, CategoryGroup } from "@/types";

interface CategoryFilterPanelProps {
  categories: Category[];
  groups: CategoryGroup[];
  selectedCategoryIds: string[];
  onChange: (ids: string[]) => void;
  className?: string;
}

export function CategoryFilterPanel({
  categories,
  groups,
  selectedCategoryIds,
  onChange,
  className,
}: CategoryFilterPanelProps) {
  const [open, setOpen] = useState(false);
  const [draftIds, setDraftIds] = useState<string[]>(selectedCategoryIds);

  const activeCategories = categories.filter((category) => !category.isArchived);
  const activeIds = new Set(activeCategories.map((category) => category.id));
  const activeGroups = groups.filter((group) => !group.isArchived);
  const selectedCount = selectedCategoryIds.length;

  useEffect(() => {
    if (open) setDraftIds(selectedCategoryIds);
  }, [open, selectedCategoryIds]);

  const matchedGroupId =
    activeGroups.find((group) => {
      const ids = group.categoryIds.filter((id) => activeIds.has(id));
      if (ids.length === 0) return false;
      if (ids.length !== draftIds.length) return false;
      return ids.every((id) => draftIds.includes(id));
    })?.id ?? null;

  const applyGroup = (groupId: string | null) => {
    if (!groupId || groupId === "none") {
      setDraftIds([]);
      return;
    }
    const group = activeGroups.find((item) => item.id === groupId);
    if (!group) {
      setDraftIds([]);
      return;
    }
    setDraftIds(group.categoryIds.filter((id) => activeIds.has(id)));
  };

  const groupSelectLabel = (value: string | null) => {
    if (!value || value === "none") return "No group (manual)";
    return (
      activeGroups.find((group) => group.id === value)?.name ?? "Select group"
    );
  };

  const applyFilter = () => {
    onChange(draftIds);
    setOpen(false);
  };

  const clearAndClose = () => {
    setDraftIds([]);
    onChange([]);
    setOpen(false);
  };

  return (
    <div className={className}>
      <Button
        type="button"
        variant={selectedCount > 0 ? "default" : "outline"}
        size="sm"
        className="h-8"
        onClick={() => setOpen(true)}
      >
        <Filter className="mr-2 h-4 w-4" />
        Category filter
        {selectedCount > 0 ? (
          <Badge variant="secondary" className="ml-2">
            {selectedCount}
          </Badge>
        ) : null}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Category filter</DialogTitle>
            <DialogDescription>
              Empty selection shows all categories. Pick a group to select its
              categories at once.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Category group</Label>
              <Select
                value={matchedGroupId ?? "none"}
                onValueChange={(value) => applyGroup(value)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="No group (manual)">
                    {(value) => groupSelectLabel(value as string | null)}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No group (manual)</SelectItem>
                  {activeGroups.map((group) => (
                    <SelectItem key={group.id} value={group.id}>
                      {group.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Categories</Label>
              <CategoryMultiSelect
                categories={activeCategories}
                selectedIds={draftIds}
                onChange={setDraftIds}
                idPrefix="filter-cat"
                maxHeightClassName="max-h-56"
              />
            </div>
          </div>

          <DialogFooter className="gap-2 sm:justify-between">
            <Button type="button" variant="outline" onClick={clearAndClose}>
              Clear filter
            </Button>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setOpen(false)}
              >
                Cancel
              </Button>
              <Button type="button" onClick={applyFilter}>
                Apply
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
