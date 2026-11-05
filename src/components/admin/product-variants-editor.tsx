"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronsUpDown, Layers } from "lucide-react";
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
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
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
    patch: { cashPrice?: number | null; retailPrice?: number | null },
    branchIds: string[]
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
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [selectedBranchIds, setSelectedBranchIds] = useState<string[]>(() =>
    priceScope !== DEFAULT_PRICE_SCOPE ? [priceScope] : []
  );

  const isDefaultScope = selectedBranchIds.length === 0;
  const catalogOnly = !isDefaultScope;
  const viewBranchId = selectedBranchIds[0] ?? null;
  const multiBranch = selectedBranchIds.length > 1;

  const variantIds = useMemo(
    () => variants.map((variant) => variant.id),
    [variants]
  );

  const activeSelectedIds = useMemo(() => {
    const allowed = new Set(variantIds);
    return selectedIds.filter((id) => allowed.has(id));
  }, [selectedIds, variantIds]);

  const selectedBranches = useMemo(
    () =>
      selectedBranchIds
        .map((id) => branches.find((branch) => branch.id === id))
        .filter((branch): branch is Branch => branch != null),
    [selectedBranchIds, branches]
  );

  const selectedCount = activeSelectedIds.length;
  const allSelected =
    variants.length > 0 && selectedCount === variants.length;
  const someSelected = selectedCount > 0 && !allSelected;

  const setBranchSelection = (next: string[]) => {
    setSelectedBranchIds(next);
    setSelectedIds([]);
    onPriceScopeChange?.(next[0] ?? DEFAULT_PRICE_SCOPE);
  };

  const updateVariant = (id: string, patch: Partial<ProductVariant>) => {
    onChange(
      variants.map((variant) =>
        variant.id === id ? { ...variant, ...patch } : variant
      )
    );
  };

  const overrideFor = (variantId: string) =>
    viewBranchId ? branchPrices[viewBranchId]?.[variantId] : undefined;

  const applyBranchPatch = (
    variantId: string,
    patch: { cashPrice?: number | null; retailPrice?: number | null }
  ) => {
    if (selectedBranchIds.length === 0) return;
    onBranchPriceChange?.(variantId, patch, selectedBranchIds);
  };

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
      applyBranchPatch(id, patch);
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
    : selectedBranches.length === 1
      ? selectedBranches[0].name
      : `${selectedBranches.length} branches`;

  const showBulkPrices = variants.length > 1 || selectedBranchIds.length > 0;

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <Label>Variants</Label>
          <p className="text-xs text-muted-foreground">
            {isDefaultScope
              ? "Default cash and retail apply to every branch unless you pick branches and override them."
              : multiBranch
                ? `Showing ${selectedBranches[0]?.name ?? "branch"} values. Edits and bulk set apply to all ${selectedBranchIds.length} selected branches.`
                : "Empty cash or retail uses the default price. Wholesale stays on the catalog."}
          </p>
        </div>
        <div className="flex w-full min-w-0 flex-col gap-2 sm:w-auto sm:flex-row sm:items-end">
        {showBulkPrices ? (
          <BulkSetPrices
            variantCount={
              selectedCount > 0 ? selectedCount : variants.length
            }
            mode={selectedCount > 0 ? "selected" : "all"}
            showWholesale={isDefaultScope}
            scopeLabel={scopeLabel}
            branchNames={selectedBranches.map((branch) => branch.name)}
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
          <BranchScopePicker
            branches={branches}
            selectedBranchIds={selectedBranchIds}
            disabled={disabled}
            onChange={setBranchSelection}
          />
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
                    variantId={`${viewBranchId}-${variant.id}-cash`}
                    amount={override?.cashPrice ?? null}
                    optional
                    disabled={disabled || multiBranch}
                    placeholder={`Default ${formatCurrency(variant.price)}`}
                    onCommit={(value) =>
                      applyBranchPatch(variant.id, { cashPrice: value })
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
                    variantId={`${viewBranchId}-${variant.id}-retail`}
                    amount={override?.retailPrice ?? null}
                    optional
                    disabled={disabled || multiBranch}
                    placeholder={
                      variant.retailPrice != null
                        ? `Default ${formatCurrency(variant.retailPrice)}`
                        : "Default (none)"
                    }
                    onCommit={(value) =>
                      applyBranchPatch(variant.id, {
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
                      variantId={`${viewBranchId}-${variant.id}-cash`}
                      amount={override?.cashPrice ?? null}
                      optional
                      disabled={disabled || multiBranch}
                      placeholder={`Default ${formatCurrency(variant.price)}`}
                      onCommit={(value) =>
                        applyBranchPatch(variant.id, { cashPrice: value })
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
                      variantId={`${viewBranchId}-${variant.id}-retail`}
                      amount={override?.retailPrice ?? null}
                      optional
                      disabled={disabled || multiBranch}
                      placeholder={
                        variant.retailPrice != null
                          ? `Default ${formatCurrency(variant.retailPrice)}`
                          : "Default (none)"
                      }
                      onCommit={(value) =>
                        applyBranchPatch(variant.id, {
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

function BranchScopePicker({
  branches,
  selectedBranchIds,
  disabled,
  onChange,
}: {
  branches: Branch[];
  selectedBranchIds: string[];
  disabled?: boolean;
  onChange: (branchIds: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const allSelected =
    branches.length > 0 && selectedBranchIds.length === branches.length;
  const someSelected =
    selectedBranchIds.length > 0 && !allSelected;

  const label =
    selectedBranchIds.length === 0
      ? "Default (all branches)"
      : selectedBranchIds.length === 1
        ? (branches.find((branch) => branch.id === selectedBranchIds[0])
            ?.name ?? "1 branch")
        : `${selectedBranchIds.length} branches`;

  const toggleBranch = (branchId: string) => {
    onChange(
      selectedBranchIds.includes(branchId)
        ? selectedBranchIds.filter((id) => id !== branchId)
        : [...selectedBranchIds, branchId]
    );
  };

  return (
    <div className="w-full min-w-0 sm:w-64">
      <Label className="text-xs">Prices for</Label>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          render={
            <Button
              type="button"
              variant="outline"
              id="variant-price-scope"
              className="mt-1.5 h-9 w-full justify-between font-normal"
              disabled={disabled}
            />
          }
        >
          <span className="truncate">{label}</span>
          <ChevronsUpDown className="size-4 shrink-0 opacity-50" />
        </PopoverTrigger>
        <PopoverContent align="end" className="w-72 gap-2 p-2">
          <button
            type="button"
            className={cn(
              "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted",
              selectedBranchIds.length === 0 && "bg-muted"
            )}
            onClick={() => onChange([])}
          >
            <Checkbox
              checked={selectedBranchIds.length === 0}
              tabIndex={-1}
              className="pointer-events-none"
            />
            <span>Default (all branches)</span>
          </button>
          <div className="border-t pt-2">
            <div className="mb-1 flex items-center justify-between px-2">
              <p className="text-xs font-medium text-muted-foreground">
                Branches
              </p>
              {branches.length > 0 ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-xs"
                  onClick={() =>
                    onChange(
                      allSelected ? [] : branches.map((branch) => branch.id)
                    )
                  }
                >
                  {allSelected ? "Clear" : "Select all"}
                </Button>
              ) : null}
            </div>
            {branches.length === 0 ? (
              <p className="px-2 py-1.5 text-sm text-muted-foreground">
                No branches available.
              </p>
            ) : (
              <div className="max-h-56 space-y-0.5 overflow-y-auto">
                {branches.map((branch) => {
                  const checked = selectedBranchIds.includes(branch.id);
                  return (
                    <button
                      key={branch.id}
                      type="button"
                      className={cn(
                        "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted",
                        checked && "bg-muted/70"
                      )}
                      onClick={() => toggleBranch(branch.id)}
                    >
                      <Checkbox
                        checked={checked}
                        tabIndex={-1}
                        className="pointer-events-none"
                        aria-hidden
                      />
                      <span className="min-w-0 truncate">
                        <span className="font-medium">{branch.name}</span>
                        <span className="text-muted-foreground">
                          {" "}
                          ({branch.code})
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
            {someSelected || allSelected ? (
              <p className="mt-2 px-2 text-xs text-muted-foreground">
                {selectedBranchIds.length} branch
                {selectedBranchIds.length === 1 ? "" : "es"} selected for
                overrides.
              </p>
            ) : null}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}

function BulkSetPrices({
  variantCount,
  mode,
  showWholesale,
  scopeLabel,
  branchNames,
  disabled,
  onApply,
}: {
  variantCount: number;
  mode: "all" | "selected";
  showWholesale: boolean;
  scopeLabel: string | null;
  branchNames: string[];
  disabled?: boolean;
  onApply: (prices: {
    cash: number | null;
    retail: number | null;
    wholesale: number | null;
  }) => void;
}) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<"edit" | "confirm">("edit");
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
  const needsBranchConfirm = branchNames.length > 0;

  const reset = () => {
    setCash("");
    setRetail("");
    setWholesale("");
    setStep("edit");
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
      : branchNames.length > 1
        ? `Set prices (${branchNames.length} branches)`
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

  const priceSummary = [
    cashValue != null ? `Cash ${formatCurrency(cashValue)}` : null,
    retailValue != null ? `Retail ${formatCurrency(retailValue)}` : null,
    wholesaleValue != null
      ? `Wholesale ${formatCurrency(wholesaleValue)}`
      : null,
  ].filter(Boolean);

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
              if (!hasValue) return;
              if (needsBranchConfirm && step === "edit") {
                setStep("confirm");
                return;
              }
              apply();
            }}
          >
            <DialogHeader>
              <DialogTitle>
                {step === "confirm" ? "Confirm branch prices" : title}
              </DialogTitle>
              <DialogDescription>
                {step === "confirm"
                  ? `Apply these prices to ${variantCount} variant${variantCount === 1 ? "" : "s"} across ${branchNames.length} branch${branchNames.length === 1 ? "" : "es"}.`
                  : description}
              </DialogDescription>
            </DialogHeader>
            {step === "edit" ? (
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
            ) : (
              <div className="space-y-3 rounded-md border bg-muted/30 p-3 text-sm">
                <div>
                  <p className="text-xs font-medium text-muted-foreground">
                    Prices
                  </p>
                  <p className="mt-1 font-medium">
                    {priceSummary.join(" · ") || "No changes"}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-medium text-muted-foreground">
                    Variants
                  </p>
                  <p className="mt-1">
                    {variantCount} variant{variantCount === 1 ? "" : "s"} (
                    {mode === "selected" ? "selected" : "all"})
                  </p>
                </div>
                <div>
                  <p className="text-xs font-medium text-muted-foreground">
                    Branches
                  </p>
                  <ul className="mt-1 max-h-40 space-y-1 overflow-y-auto">
                    {branchNames.map((name) => (
                      <li key={name}>{name}</li>
                    ))}
                  </ul>
                </div>
              </div>
            )}
            <DialogFooter>
              {step === "confirm" ? (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setStep("edit")}
                >
                  Back
                </Button>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setOpen(false)}
                >
                  Cancel
                </Button>
              )}
              <Button type="submit" disabled={!hasValue}>
                {step === "confirm"
                  ? `Confirm · ${branchNames.length} branch${branchNames.length === 1 ? "" : "es"}`
                  : needsBranchConfirm
                    ? "Review branches"
                    : `Apply to ${variantCount} variant${variantCount === 1 ? "" : "s"}`}
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
