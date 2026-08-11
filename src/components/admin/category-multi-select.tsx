"use client";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import type { Category } from "@/types";

interface CategoryMultiSelectProps {
  categories: Category[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  idPrefix?: string;
  maxHeightClassName?: string;
  showSelectAll?: boolean;
  disabled?: boolean;
}

export function CategoryMultiSelect({
  categories,
  selectedIds,
  onChange,
  idPrefix = "cat",
  maxHeightClassName = "max-h-48",
  showSelectAll = true,
  disabled = false,
}: CategoryMultiSelectProps) {
  const activeIds = categories.map((category) => category.id);
  const allSelected =
    activeIds.length > 0 && activeIds.every((id) => selectedIds.includes(id));

  const toggle = (id: string) => {
    if (selectedIds.includes(id)) {
      onChange(selectedIds.filter((x) => x !== id));
    } else {
      onChange([...selectedIds, id]);
    }
  };

  const selectAll = () => onChange(activeIds);
  const clearAll = () => onChange([]);

  if (categories.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No categories yet. Create categories in Admin → Categories first.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {showSelectAll ? (
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={disabled || allSelected}
            onClick={selectAll}
          >
            Select all
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={disabled || selectedIds.length === 0}
            onClick={clearAll}
          >
            Clear
          </Button>
        </div>
      ) : null}
      <div
        className={`${maxHeightClassName} space-y-2 overflow-y-auto rounded-md border p-3`}
      >
        {categories.map((category) => (
          <div key={category.id} className="flex items-start gap-3">
            <Checkbox
              id={`${idPrefix}-${category.id}`}
              checked={selectedIds.includes(category.id)}
              disabled={disabled}
              onCheckedChange={() => toggle(category.id)}
            />
            <div className="flex-1 space-y-1">
              <Label
                htmlFor={`${idPrefix}-${category.id}`}
                className="cursor-pointer font-medium"
              >
                {category.name}
              </Label>
              {category.tags.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {category.tags.map((tag) => (
                    <Badge key={tag} variant="outline" className="text-xs">
                      {tag}
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
