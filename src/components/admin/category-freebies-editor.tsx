"use client";

import { useMemo, useState } from "react";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { VariantSearchDialog } from "@/components/admin/variant-search-dialog";
import { formatVariantLabel } from "@/lib/product-variants";
import type { VariantWithStock } from "@/lib/inventory";
import type { CategoryFreebieVariant, Product } from "@/types";

export function productsToFreebiePickerVariants(
  products: Product[]
): VariantWithStock[] {
  const rows: VariantWithStock[] = [];
  for (const product of products) {
    for (const variant of product.variants ?? []) {
      rows.push({
        ...variant,
        productId: product.id,
        productName: product.name || "Untitled",
        categoryIds: product.categoryIds ?? [],
        stock: 0,
        lowStockThreshold: 5,
        isSelling: true,
      });
    }
  }
  return rows;
}

interface CategoryFreebiesEditorProps {
  freebies: CategoryFreebieVariant[];
  onChange: (freebies: CategoryFreebieVariant[]) => void;
  products: Product[];
  disabled?: boolean;
}

export function CategoryFreebiesEditor({
  freebies,
  onChange,
  products,
  disabled,
}: CategoryFreebiesEditorProps) {
  const [pickerOpen, setPickerOpen] = useState(false);

  const pickerVariants = useMemo(
    () => productsToFreebiePickerVariants(products),
    [products]
  );

  const selectedIds = useMemo(
    () => new Set(freebies.map((f) => f.variantId)),
    [freebies]
  );

  const availableVariants = useMemo(
    () => pickerVariants.filter((row) => !selectedIds.has(row.id)),
    [pickerVariants, selectedIds]
  );

  const addFreebie = (row: VariantWithStock) => {
    if (selectedIds.has(row.id)) return;
    const product = products.find((p) => p.id === row.productId);
    const variantLabel = formatVariantLabel(row, product?.options ?? []);
    onChange([
      ...freebies,
      {
        productId: row.productId,
        variantId: row.id,
        productName: row.productName,
        variantLabel: variantLabel === "Default" ? "" : variantLabel,
      },
    ]);
  };

  const removeFreebie = (variantId: string) => {
    onChange(freebies.filter((f) => f.variantId !== variantId));
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div>
          <Label>Freebies</Label>
          <p className="text-xs text-muted-foreground">
            When a product in this category is added to the POS cart, these
            variants are added free (1 per unit sold)
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled}
          onClick={() => setPickerOpen(true)}
        >
          <Plus className="mr-1 h-3.5 w-3.5" />
          Add freebie
        </Button>
      </div>

      {freebies.length === 0 ? (
        <p className="rounded-md border border-dashed px-3 py-4 text-center text-sm text-muted-foreground">
          No freebies configured
        </p>
      ) : (
        <ul className="divide-y rounded-md border">
          {freebies.map((freebie) => (
            <li
              key={freebie.variantId}
              className="flex items-center justify-between gap-2 px-3 py-2 text-sm"
            >
              <div className="min-w-0">
                <p className="truncate font-medium">{freebie.productName}</p>
                {freebie.variantLabel ? (
                  <p className="truncate text-xs text-muted-foreground">
                    {freebie.variantLabel}
                  </p>
                ) : null}
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                disabled={disabled}
                onClick={() => removeFreebie(freebie.variantId)}
                aria-label="Remove freebie"
              >
                <X className="h-4 w-4" />
              </Button>
            </li>
          ))}
        </ul>
      )}

      <VariantSearchDialog
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        variants={availableVariants}
        products={products}
        title="Add freebie variant"
        description="Search the catalog and pick a variant to give free with this category"
        stockLabel={() => "Add"}
        emptyMessage="No more variants to add."
        onSelect={addFreebie}
      />
    </div>
  );
}
