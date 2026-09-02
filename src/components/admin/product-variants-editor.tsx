"use client";

import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/format";
import { formatVariantLabel } from "@/lib/product-variants";
import {
  normalizeRetailPrice,
  normalizeWholesalePrice,
} from "@/lib/product-pricing";
import { moneyInputText, parseMoneyInput } from "@/lib/pos-payments";
import type { Branch, ProductImage, ProductOption, ProductVariant } from "@/types";

const moneyInputClass = "h-9 min-w-[7.5rem] tabular-nums";
export const DEFAULT_PRICE_SCOPE = "default";

export type BranchPriceOverrides = Record<
  string,
  Record<string, { cashPrice: number | null; retailPrice: number | null }>
>;

interface ProductVariantsEditorProps {
  variants: ProductVariant[];
  options: ProductOption[];
  images: ProductImage[];
  onChange: (variants: ProductVariant[]) => void;
  disabled?: boolean;
  branches?: Branch[];
  priceScope?: string;
  onPriceScopeChange?: (scope: string) => void;
  branchPrices?: BranchPriceOverrides;
  onBranchPriceChange?: (
    variantId: string,
    patch: { cashPrice?: number | null; retailPrice?: number | null }
  ) => void;
}

export function ProductVariantsEditor({
  variants,
  options,
  images,
  onChange,
  disabled,
  branches = [],
  priceScope = DEFAULT_PRICE_SCOPE,
  onPriceScopeChange,
  branchPrices = {},
  onBranchPriceChange,
}: ProductVariantsEditorProps) {
  const isDefaultScope = priceScope === DEFAULT_PRICE_SCOPE;
  const catalogOnly = !isDefaultScope;

  const updateVariant = (id: string, patch: Partial<ProductVariant>) => {
    onChange(
      variants.map((variant) =>
        variant.id === id ? { ...variant, ...patch } : variant
      )
    );
  };

  const overrideFor = (variantId: string) =>
    isDefaultScope ? undefined : branchPrices[priceScope]?.[variantId];

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <Label>Variants</Label>
          <p className="text-xs text-muted-foreground">
            {isDefaultScope
              ? "Default cash and retail apply to every branch unless you pick a branch and override them."
              : "Empty cash or retail uses the default price. Wholesale stays on the catalog."}
          </p>
        </div>
        {onPriceScopeChange ? (
          <div className="w-full min-w-0 sm:w-64">
            <Label htmlFor="variant-price-scope" className="text-xs">
              Prices for
            </Label>
            <Select
              value={priceScope}
              onValueChange={(value) =>
                onPriceScopeChange(value || DEFAULT_PRICE_SCOPE)
              }
              disabled={disabled}
            >
              <SelectTrigger id="variant-price-scope" className="mt-1.5 h-9">
                <SelectValue>
                  {(value) => {
                    if (!value || value === DEFAULT_PRICE_SCOPE) {
                      return "Default (all branches)";
                    }
                    return (
                      branches.find((branch) => branch.id === value)?.name ??
                      "Branch"
                    );
                  }}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={DEFAULT_PRICE_SCOPE}>
                  Default (all branches)
                </SelectItem>
                {branches.map((branch) => (
                  <SelectItem key={branch.id} value={branch.id}>
                    {branch.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : null}
      </div>

      <div className="space-y-3 lg:hidden">
        {variants.map((variant) => {
          const override = overrideFor(variant.id);
          return (
          <div
            key={variant.id}
            className="space-y-3 rounded-md border p-3"
          >
            <p className="font-medium">
              {formatVariantLabel(variant, options)}
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2 space-y-1.5">
                <Label className="text-xs text-muted-foreground">SKU</Label>
                <SkuField
                  variant={variant}
                  disabled={disabled || catalogOnly}
                  onChange={(sku) => updateVariant(variant.id, { sku })}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Cash</Label>
                {isDefaultScope ? (
                  <CashField
                    variant={variant}
                    disabled={disabled}
                    onChange={(price) => updateVariant(variant.id, { price })}
                  />
                ) : (
                  <VariantMoneyField
                    variantId={`${priceScope}-${variant.id}-cash`}
                    amount={override?.cashPrice ?? null}
                    optional
                    disabled={disabled}
                    placeholder={`Default ${formatCurrency(variant.price)}`}
                    onCommit={(value) =>
                      onBranchPriceChange?.(variant.id, { cashPrice: value })
                    }
                  />
                )}
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Retail</Label>
                {isDefaultScope ? (
                  <RetailField
                    variant={variant}
                    disabled={disabled}
                    onChange={(retailPrice) =>
                      updateVariant(variant.id, { retailPrice })
                    }
                  />
                ) : (
                  <VariantMoneyField
                    variantId={`${priceScope}-${variant.id}-retail`}
                    amount={override?.retailPrice ?? null}
                    optional
                    disabled={disabled}
                    placeholder={
                      variant.retailPrice != null
                        ? `Default ${formatCurrency(variant.retailPrice)}`
                        : "Default (none)"
                    }
                    onCommit={(value) =>
                      onBranchPriceChange?.(variant.id, {
                        retailPrice: normalizeRetailPrice(value),
                      })
                    }
                  />
                )}
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">
                  Wholesale
                </Label>
                <WholesaleField
                  variant={variant}
                  disabled={disabled || catalogOnly}
                  onChange={(wholesalePrice) =>
                    updateVariant(variant.id, { wholesalePrice })
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Image</Label>
                <VariantImageField
                  variant={variant}
                  images={images}
                  disabled={disabled || catalogOnly}
                  onChange={(imageId) => updateVariant(variant.id, { imageId })}
                />
              </div>
            </div>
          </div>
          );
        })}
      </div>

      <div className="hidden overflow-hidden rounded-md border lg:block">
        <Table className="min-w-[60rem] table-fixed">
          <TableHeader>
            <TableRow>
              <TableHead className="w-[14%]">Variant</TableHead>
              <TableHead className="w-[16%]">SKU</TableHead>
              <TableHead className="w-[14%]">Cash</TableHead>
              <TableHead className="w-[14%]">Retail</TableHead>
              <TableHead className="w-[14%]">Wholesale</TableHead>
              <TableHead className="w-[28%]">Image</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {variants.map((variant) => {
              const override = overrideFor(variant.id);
              return (
              <TableRow key={variant.id}>
                <TableCell className="font-medium whitespace-normal">
                  {formatVariantLabel(variant, options)}
                </TableCell>
                <TableCell>
                  <SkuField
                    variant={variant}
                    disabled={disabled || catalogOnly}
                    onChange={(sku) => updateVariant(variant.id, { sku })}
                  />
                </TableCell>
                <TableCell>
                  {isDefaultScope ? (
                    <CashField
                      variant={variant}
                      disabled={disabled}
                      onChange={(price) => updateVariant(variant.id, { price })}
                    />
                  ) : (
                    <VariantMoneyField
                      variantId={`${priceScope}-${variant.id}-cash`}
                      amount={override?.cashPrice ?? null}
                      optional
                      disabled={disabled}
                      placeholder={`Default ${formatCurrency(variant.price)}`}
                      onCommit={(value) =>
                        onBranchPriceChange?.(variant.id, { cashPrice: value })
                      }
                    />
                  )}
                </TableCell>
                <TableCell>
                  {isDefaultScope ? (
                    <RetailField
                      variant={variant}
                      disabled={disabled}
                      onChange={(retailPrice) =>
                        updateVariant(variant.id, { retailPrice })
                      }
                    />
                  ) : (
                    <VariantMoneyField
                      variantId={`${priceScope}-${variant.id}-retail`}
                      amount={override?.retailPrice ?? null}
                      optional
                      disabled={disabled}
                      placeholder={
                        variant.retailPrice != null
                          ? `Default ${formatCurrency(variant.retailPrice)}`
                          : "Default (none)"
                      }
                      onCommit={(value) =>
                        onBranchPriceChange?.(variant.id, {
                          retailPrice: normalizeRetailPrice(value),
                        })
                      }
                    />
                  )}
                </TableCell>
                <TableCell>
                  <WholesaleField
                    variant={variant}
                    disabled={disabled || catalogOnly}
                    onChange={(wholesalePrice) =>
                      updateVariant(variant.id, { wholesalePrice })
                    }
                  />
                </TableCell>
                <TableCell>
                  <VariantImageField
                    variant={variant}
                    images={images}
                    disabled={disabled || catalogOnly}
                    onChange={(imageId) =>
                      updateVariant(variant.id, { imageId })
                    }
                  />
                </TableCell>
              </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function SkuField({
  variant,
  disabled,
  onChange,
}: {
  variant: ProductVariant;
  disabled?: boolean;
  onChange: (sku: string) => void;
}) {
  return (
    <Input
      value={variant.sku}
      placeholder="SKU"
      disabled={disabled}
      className="h-9 min-w-[8rem]"
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

function isMoneyDraft(raw: string): boolean {
  return raw === "" || /^\d*\.?\d*$/.test(raw);
}

function VariantMoneyField({
  variantId,
  amount,
  optional,
  disabled,
  placeholder,
  onCommit,
}: {
  variantId: string;
  amount: number | null;
  optional?: boolean;
  disabled?: boolean;
  placeholder?: string;
  onCommit: (value: number | null) => void;
}) {
  const [focused, setFocused] = useState(false);
  const [text, setText] = useState(() =>
    amount == null ? "" : moneyInputText(amount)
  );

  useEffect(() => {
    if (focused) return;
    setText(amount == null ? "" : moneyInputText(amount));
  }, [amount, focused, variantId]);

  const commit = (raw: string) => {
    if (raw.trim() === "") {
      onCommit(optional ? null : 0);
      return;
    }
    const parsed = parseMoneyInput(raw);
    if (parsed == null) {
      onCommit(optional ? null : 0);
      return;
    }
    onCommit(optional ? normalizeRetailPrice(parsed) : parsed);
  };

  return (
    <Input
      inputMode="decimal"
      placeholder={placeholder}
      value={text}
      disabled={disabled}
      className={moneyInputClass}
      onFocus={() => setFocused(true)}
      onBlur={() => {
        setFocused(false);
        commit(text);
      }}
      onChange={(e) => {
        const raw = e.target.value;
        if (!isMoneyDraft(raw)) return;
        setText(raw);
        if (raw.endsWith(".")) return;
        commit(raw);
      }}
    />
  );
}

function CashField({
  variant,
  disabled,
  onChange,
}: {
  variant: ProductVariant;
  disabled?: boolean;
  onChange: (price: number) => void;
}) {
  return (
    <VariantMoneyField
      variantId={variant.id}
      amount={variant.price}
      disabled={disabled}
      onCommit={(value) => onChange(value ?? 0)}
    />
  );
}

function RetailField({
  variant,
  disabled,
  onChange,
}: {
  variant: ProductVariant;
  disabled?: boolean;
  onChange: (retailPrice: number | null) => void;
}) {
  return (
    <VariantMoneyField
      variantId={variant.id}
      amount={variant.retailPrice}
      optional
      disabled={disabled}
      placeholder="Optional"
      onCommit={(value) => onChange(normalizeRetailPrice(value))}
    />
  );
}

function WholesaleField({
  variant,
  disabled,
  onChange,
}: {
  variant: ProductVariant;
  disabled?: boolean;
  onChange: (wholesalePrice: number | null) => void;
}) {
  return (
    <VariantMoneyField
      variantId={variant.id}
      amount={variant.wholesalePrice}
      optional
      disabled={disabled}
      placeholder="Optional"
      onCommit={(value) => onChange(normalizeWholesalePrice(value))}
    />
  );
}

function VariantImageField({
  variant,
  images,
  disabled,
  onChange,
}: {
  variant: ProductVariant;
  images: ProductImage[];
  disabled?: boolean;
  onChange: (imageId: string | null) => void;
}) {
  const selected = images.find((img) => img.id === variant.imageId);

  return (
    <div className="flex min-w-0 items-center gap-2">
      {selected ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={selected.url}
          alt=""
          className="size-9 shrink-0 rounded-md border bg-muted object-cover object-center"
        />
      ) : (
        <div className="size-9 shrink-0 rounded-md border bg-muted" />
      )}
      <Select
        value={variant.imageId ?? "none"}
        onValueChange={(value) => onChange(value === "none" ? null : value)}
        disabled={disabled || images.length === 0}
      >
        <SelectTrigger className={cn("h-9 min-w-0 flex-1")}>
          <SelectValue placeholder="Image">
            {(value) => {
              if (!value || value === "none") return "None";
              const image = images.find((img) => img.id === value);
              return image
                ? `Image ${images.findIndex((img) => img.id === value) + 1}`
                : "None";
            }}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="none">None</SelectItem>
          {images.map((image, index) => (
            <SelectItem key={image.id} value={image.id}>
              <span className="flex items-center gap-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={image.url}
                  alt=""
                  className="size-6 rounded object-cover object-center"
                />
                Image {index + 1}
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
