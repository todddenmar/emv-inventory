"use client";

import { useEffect, useMemo, useState } from "react";
import { Layers } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const variantIds = useMemo(
    () => variants.map((variant) => variant.id),
    [variants]
  );

  const activeSelectedIds = useMemo(() => {
    const allowed = new Set(variantIds);
    return selectedIds.filter((id) => allowed.has(id));
  }, [selectedIds, variantIds]);

  const selectedCount = activeSelectedIds.length;
  const allSelected =
    variants.length > 0 && selectedCount === variants.length;
  const someSelected = selectedCount > 0 && !allSelected;

  const updateVariant = (id: string, patch: Partial<ProductVariant>) => {
    onChange(
      variants.map((variant) =>
        variant.id === id ? { ...variant, ...patch } : variant
      )
    );
  };

  const overrideFor = (variantId: string) =>
    isDefaultScope ? undefined : branchPrices[priceScope]?.[variantId];

  const applyPricesToIds = (
    ids: string[],
    prices: {
      cash: number | null;
      retail: number | null;
      wholesale: number | null;
    }
  ) => {
    const idSet = new Set(ids);
    if (isDefaultScope) {
      onChange(
        variants.map((variant) =>
          idSet.has(variant.id)
            ? {
                ...variant,
                ...(prices.cash != null ? { price: prices.cash } : {}),
                ...(prices.retail != null
                  ? { retailPrice: normalizeRetailPrice(prices.retail) }
                  : {}),
                ...(prices.wholesale != null
                  ? {
                      wholesalePrice: normalizeWholesalePrice(prices.wholesale),
                    }
                  : {}),
              }
            : variant
        )
      );
      return;
    }
    const patch: { cashPrice?: number | null; retailPrice?: number | null } =
      {};
    if (prices.cash != null) patch.cashPrice = prices.cash;
    if (prices.retail != null) {
      patch.retailPrice = normalizeRetailPrice(prices.retail);
    }
    for (const id of ids) {
      onBranchPriceChange?.(id, patch);
    }
  };

  const toggleSelected = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const toggleSelectAll = () => {
    setSelectedIds(allSelected ? [] : variants.map((variant) => variant.id));
  };

  const scopeLabel = isDefaultScope
    ? null
    : (branches.find((branch) => branch.id === priceScope)?.name ??
      "this branch");

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
        <div className="flex w-full min-w-0 flex-col gap-2 sm:w-auto sm:flex-row sm:items-end">
        {variants.length > 1 ? (
          <BulkSetPrices
            variantCount={
              selectedCount > 0 ? selectedCount : variants.length
            }
            mode={selectedCount > 0 ? "selected" : "all"}
            showWholesale={isDefaultScope}
            scopeLabel={scopeLabel}
            disabled={disabled}
            onApply={(prices) =>
              applyPricesToIds(
                selectedCount > 0
                  ? activeSelectedIds
                  : variants.map((variant) => variant.id),
                prices
              )
            }
          />
        ) : null}
        {onPriceScopeChange ? (
          <div className="w-full min-w-0 sm:w-64">
            <Label htmlFor="variant-price-scope" className="text-xs">
              Prices for
            </Label>
            <Select
              value={priceScope}
              onValueChange={(value) => {
                setSelectedIds([]);
                onPriceScopeChange(value || DEFAULT_PRICE_SCOPE);
              }}
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
      </div>

      {variants.length > 1 ? (
        <div className="flex flex-wrap items-center gap-3 rounded-md border bg-muted/30 px-3 py-2 text-sm">
          <div className="flex items-center gap-2">
            <Checkbox
              checked={allSelected}
              indeterminate={someSelected}
              disabled={disabled}
              onCheckedChange={toggleSelectAll}
              aria-label="Select all variants"
            />
            <span className="text-muted-foreground">
              {selectedCount === 0
                ? "Select variants for bulk pricing"
                : `${selectedCount} selected`}
            </span>
          </div>
          {selectedCount > 0 ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8"
              disabled={disabled}
              onClick={() => setSelectedIds([])}
            >
              Clear
            </Button>
          ) : null}
        </div>
      ) : null}

      <div className="space-y-3 lg:hidden">
        {variants.map((variant) => {
          const override = overrideFor(variant.id);
          const selected = activeSelectedIds.includes(variant.id);
          return (
          <div
            key={variant.id}
            className={cn(
              "space-y-3 rounded-md border p-3",
              selected && "border-primary/40 bg-primary/5"
            )}
          >
            <div className="flex items-start gap-3">
              {variants.length > 1 ? (
                <Checkbox
                  checked={selected}
                  disabled={disabled}
                  className="mt-0.5"
                  onCheckedChange={() => toggleSelected(variant.id)}
                  aria-label={`Select ${formatVariantLabel(variant, options)}`}
                />
              ) : null}
              <p className="font-medium">
                {formatVariantLabel(variant, options)}
              </p>
            </div>
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
              {variants.length > 1 ? (
                <TableHead className="w-10">
                  <Checkbox
                    checked={allSelected}
                    indeterminate={someSelected}
                    disabled={disabled}
                    onCheckedChange={toggleSelectAll}
                    aria-label="Select all variants"
                  />
                </TableHead>
              ) : null}
              <TableHead className={variants.length > 1 ? "w-[13%]" : "w-[14%]"}>
                Variant
              </TableHead>
              <TableHead className="w-[15%]">SKU</TableHead>
              <TableHead className="w-[14%]">Cash</TableHead>
              <TableHead className="w-[14%]">Retail</TableHead>
              <TableHead className="w-[14%]">Wholesale</TableHead>
              <TableHead className="w-[26%]">Image</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {variants.map((variant) => {
              const override = overrideFor(variant.id);
              const selected = activeSelectedIds.includes(variant.id);
              return (
              <TableRow
                key={variant.id}
                data-state={selected ? "selected" : undefined}
                className={cn(selected && "bg-primary/5")}
              >
                {variants.length > 1 ? (
                  <TableCell>
                    <Checkbox
                      checked={selected}
                      disabled={disabled}
                      onCheckedChange={() => toggleSelected(variant.id)}
                      aria-label={`Select ${formatVariantLabel(variant, options)}`}
                    />
                  </TableCell>
                ) : null}
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

function BulkSetPrices({
  variantCount,
  mode,
  showWholesale,
  scopeLabel,
  disabled,
  onApply,
}: {
  variantCount: number;
  mode: "all" | "selected";
  showWholesale: boolean;
  scopeLabel: string | null;
  disabled?: boolean;
  onApply: (prices: {
    cash: number | null;
    retail: number | null;
    wholesale: number | null;
  }) => void;
}) {
  const [open, setOpen] = useState(false);
  const [cash, setCash] = useState("");
  const [retail, setRetail] = useState("");
  const [wholesale, setWholesale] = useState("");

  const parse = (raw: string) =>
    raw.trim() === "" ? null : parseMoneyInput(raw);

  const cashValue = parse(cash);
  const retailValue = parse(retail);
  const wholesaleValue = showWholesale ? parse(wholesale) : null;
  const hasValue =
    cashValue != null || retailValue != null || wholesaleValue != null;

  const reset = () => {
    setCash("");
    setRetail("");
    setWholesale("");
  };

  const apply = () => {
    if (!hasValue) return;
    onApply({ cash: cashValue, retail: retailValue, wholesale: wholesaleValue });
    toast.success(
      scopeLabel
        ? `Prices applied to ${variantCount} variant${variantCount === 1 ? "" : "s"} at ${scopeLabel}`
        : `Prices applied to ${variantCount} variant${variantCount === 1 ? "" : "s"}`
    );
    reset();
    setOpen(false);
  };

  const moneyInput = (
    id: string,
    label: string,
    value: string,
    setValue: (next: string) => void
  ) => (
    <div className="min-w-0 space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        inputMode="decimal"
        placeholder="Leave unchanged"
        value={value}
        className="h-9 tabular-nums"
        onChange={(e) => {
          const raw = e.target.value;
          if (!isMoneyDraft(raw)) return;
          setValue(raw);
        }}
      />
    </div>
  );

  const buttonLabel =
    mode === "selected"
      ? `Set selected prices (${variantCount})`
      : "Set all prices";
  const title =
    mode === "selected"
      ? `Set prices for ${variantCount} selected variant${variantCount === 1 ? "" : "s"}`
      : "Set prices for all variants";
  const description = scopeLabel
    ? mode === "selected"
      ? `Overrides cash and retail for the ${variantCount} selected variant${variantCount === 1 ? "" : "s"} at ${scopeLabel}. Blank fields are left unchanged.`
      : `Overrides cash and retail for all ${variantCount} variants at ${scopeLabel}. Blank fields are left unchanged.`
    : mode === "selected"
      ? `Applies to the ${variantCount} selected variant${variantCount === 1 ? "" : "s"}. Blank fields are left unchanged.`
      : `Applies to all ${variantCount} variants. Blank fields are left unchanged.`;

  return (
    <>
      <Button
        type="button"
        variant="outline"
        className="h-9 w-full sm:w-auto"
        disabled={disabled}
        onClick={() => setOpen(true)}
      >
        <Layers className="size-4" />
        {buttonLabel}
      </Button>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) reset();
        }}
      >
        <DialogContent className="sm:max-w-md">
          {/* Portaled, but React submit events still bubble to the product form. */}
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              e.stopPropagation();
              apply();
            }}
          >
            <DialogHeader>
              <DialogTitle>{title}</DialogTitle>
              <DialogDescription>{description}</DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              {moneyInput("bulk-set-cash", "Cash", cash, setCash)}
              {moneyInput("bulk-set-retail", "Retail", retail, setRetail)}
              {showWholesale
                ? moneyInput(
                    "bulk-set-wholesale",
                    "Wholesale",
                    wholesale,
                    setWholesale
                  )
                : null}
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={!hasValue}>
                Apply to {variantCount} variant
                {variantCount === 1 ? "" : "s"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
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
