"use client";

import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import type { Category } from "@/types";

interface CategoryMultiSelectProps {
  categories: Category[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
}

export function CategoryMultiSelect({
  categories,
  selectedIds,
  onChange,
}: CategoryMultiSelectProps) {
  const toggle = (id: string) => {
    if (selectedIds.includes(id)) {
      onChange(selectedIds.filter((x) => x !== id));
    } else {
      onChange([...selectedIds, id]);
    }
  };

  if (categories.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No categories yet. Create categories in Admin → Categories first.
      </p>
    );
  }

  return (
    <div className="max-h-48 space-y-2 overflow-y-auto rounded-md border p-3">
      {categories.map((category) => (
        <div key={category.id} className="flex items-start gap-3">
          <Checkbox
            id={`cat-${category.id}`}
            checked={selectedIds.includes(category.id)}
            onCheckedChange={() => toggle(category.id)}
          />
          <div className="flex-1 space-y-1">
            <Label
              htmlFor={`cat-${category.id}`}
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
  );
}
