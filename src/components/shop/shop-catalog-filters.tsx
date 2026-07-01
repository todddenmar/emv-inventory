"use client";

import { useMemo } from "react";
import { SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { getProductPriceRange } from "@/lib/product-variants";
import type { ProductWithStock } from "@/lib/inventory";
import type { Category } from "@/types";

export type ShopSortOption =
  | "name_asc"
  | "name_desc"
  | "price_asc"
  | "price_desc";

const sortOptions: { value: ShopSortOption; label: string }[] = [
  { value: "name_asc", label: "Name (A–Z)" },
  { value: "name_desc", label: "Name (Z–A)" },
  { value: "price_asc", label: "Price (low to high)" },
  { value: "price_desc", label: "Price (high to low)" },
];

export function sortShopProducts(
  products: ProductWithStock[],
  sort: ShopSortOption
): ProductWithStock[] {
  const sorted = [...products];
  switch (sort) {
    case "name_desc":
      return sorted.sort((a, b) => b.name.localeCompare(a.name));
    case "price_asc":
      return sorted.sort(
        (a, b) => getProductPriceRange(a).min - getProductPriceRange(b).min
      );
    case "price_desc":
      return sorted.sort(
        (a, b) => getProductPriceRange(b).min - getProductPriceRange(a).min
      );
    case "name_asc":
    default:
      return sorted.sort((a, b) => a.name.localeCompare(b.name));
  }
}

interface ShopCatalogFiltersProps {
  categories: Category[];
  categoryId: string;
  sort: ShopSortOption;
  onCategoryChange: (categoryId: string) => void;
  onSortChange: (sort: ShopSortOption) => void;
  onClear: () => void;
}

export function ShopCatalogFilters({
  categories,
  categoryId,
  sort,
  onCategoryChange,
  onSortChange,
  onClear,
}: ShopCatalogFiltersProps) {
  const activeCount = useMemo(() => {
    let count = 0;
    if (categoryId !== "all") count += 1;
    if (sort !== "name_asc") count += 1;
    return count;
  }, [categoryId, sort]);

  return (
    <Popover>
      <PopoverTrigger
        className={cn(
          "inline-flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-lg border border-border bg-background px-2.5 text-sm font-medium whitespace-nowrap transition-colors hover:bg-muted hover:text-foreground dark:border-input dark:bg-input/30 dark:hover:bg-input/50"
        )}
      >
        <SlidersHorizontal className="h-4 w-4" />
        Filters
        {activeCount > 0 && (
          <Badge className="h-5 min-w-5 px-1 text-xs">{activeCount}</Badge>
        )}
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 gap-4 p-4">
        <PopoverHeader>
          <PopoverTitle>Filter & sort</PopoverTitle>
        </PopoverHeader>

        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground uppercase tracking-wide">
            Category
          </Label>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant={categoryId === "all" ? "default" : "outline"}
              className="rounded-full"
              onClick={() => onCategoryChange("all")}
            >
              All
            </Button>
            {categories.map((category) => (
              <Button
                key={category.id}
                type="button"
                size="sm"
                variant={categoryId === category.id ? "default" : "outline"}
                className="rounded-full"
                onClick={() => onCategoryChange(category.id)}
              >
                {category.name}
              </Button>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground uppercase tracking-wide">
            Sort by
          </Label>
          <div className="grid grid-cols-1 gap-1.5">
            {sortOptions.map((option) => (
              <Button
                key={option.value}
                type="button"
                size="sm"
                variant={sort === option.value ? "default" : "outline"}
                className="justify-start"
                onClick={() => onSortChange(option.value)}
              >
                {option.label}
              </Button>
            ))}
          </div>
        </div>

        {activeCount > 0 && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="w-full"
            onClick={onClear}
          >
            Clear filters
          </Button>
        )}
      </PopoverContent>
    </Popover>
  );
}
