"use client";

import { useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { formatVariantLabel } from "@/lib/product-variants";
import type { VariantWithStock } from "@/lib/inventory";
import type { Product } from "@/types";

export interface VariantSearchDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  variants: VariantWithStock[];
  products: Product[];
  title?: string;
  description?: string;
  stockLabel?: (stock: number) => string;
  emptyMessage?: string;
  onSelect: (variant: VariantWithStock) => void;
}

export function VariantSearchDialog({
  open,
  onOpenChange,
  variants,
  products,
  title = "Select variant",
  description = "Search by product name, SKU, or variant",
  stockLabel = (stock) => `Stock ${stock}`,
  emptyMessage = "No variants match your search.",
  onSelect,
}: VariantSearchDialogProps) {
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (!open) setSearch("");
  }, [open]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return variants;
    return variants.filter((row) => {
      const product = products.find((p) => p.id === row.productId);
      const label = formatVariantLabel(row, product?.options ?? []);
      return (
        row.productName.toLowerCase().includes(q) ||
        row.sku.toLowerCase().includes(q) ||
        label.toLowerCase().includes(q)
      );
    });
  }, [variants, products, search]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85dvh] max-w-lg flex-col gap-0 overflow-hidden p-0 sm:max-w-lg">
        <DialogHeader className="border-b p-4">
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div className="border-b p-4">
          <div className="relative">
            <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              autoFocus
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search products, SKU, or variant..."
              className="pl-9"
            />
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {filtered.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-muted-foreground">
              {variants.length === 0
                ? "No variants available."
                : emptyMessage}
            </p>
          ) : (
            <ul className="divide-y">
              {filtered.map((row) => {
                const product = products.find((p) => p.id === row.productId);
                const label = formatVariantLabel(row, product?.options ?? []);
                return (
                  <li key={row.id}>
                    <button
                      type="button"
                      className="flex w-full items-start justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/60"
                      onClick={() => {
                        onSelect(row);
                        onOpenChange(false);
                      }}
                    >
                      <div className="min-w-0">
                        <p className="truncate font-medium">{row.productName}</p>
                        {label !== "Default" ? (
                          <p className="truncate text-sm text-muted-foreground">
                            {label}
                          </p>
                        ) : null}
                        {row.sku ? (
                          <p className="truncate text-xs text-muted-foreground">
                            SKU {row.sku}
                          </p>
                        ) : null}
                      </div>
                      <span className="shrink-0 text-sm tabular-nums text-muted-foreground">
                        {stockLabel(row.stock)}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function VariantPickerButton({
  selectedLabel,
  placeholder = "Select variant",
  disabled,
  onClick,
}: {
  selectedLabel?: string | null;
  placeholder?: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <Button
      type="button"
      variant="outline"
      disabled={disabled}
      onClick={onClick}
      className="h-9 w-full justify-start font-normal"
    >
      <span className={selectedLabel ? "truncate" : "text-muted-foreground"}>
        {selectedLabel || placeholder}
      </span>
    </Button>
  );
}
