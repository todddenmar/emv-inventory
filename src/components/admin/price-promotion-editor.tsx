"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, Plus, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { endOfLocalDay, toDateInputValue } from "@/lib/dates";
import { formatCurrency } from "@/lib/format";
import { getProducts } from "@/lib/firestore/products";
import { isProductPublished } from "@/lib/products-catalog";
import { formatVariantLabel } from "@/lib/product-variants";
import {
  normalizeRetailPrice,
  pricePromotionDisplayStatus,
} from "@/lib/product-pricing";
import type {
  PricePromotion,
  PricePromotionItem,
  Product,
  ProductVariant,
} from "@/types";

const SEARCH_MIN_CHARS = 2;
const SEARCH_MAX_RESULTS = 20;

export type PriceDraft = { salePrice: string; saleRetailPrice: string };

export function draftsFromItems(
  items: PricePromotionItem[]
): Record<string, PriceDraft> {
  const next: Record<string, PriceDraft> = {};
  for (const item of items) {
    next[item.variantId] = {
      salePrice: String(item.salePrice),
      saleRetailPrice:
        item.saleRetailPrice != null ? String(item.saleRetailPrice) : "",
    };
  }
  return next;
}

export function applyPriceDrafts(
  items: PricePromotionItem[],
  drafts: Record<string, PriceDraft>
): PricePromotionItem[] {
  return items.map((item) => {
    const draft = drafts[item.variantId];
    const salePrice = Number(draft?.salePrice ?? item.salePrice);
    if (!Number.isFinite(salePrice) || salePrice < 0) {
      throw new Error(`Invalid sale cash price for ${item.productName}`);
    }
    const raw = (draft?.saleRetailPrice ?? "").trim();
    return {
      ...item,
      salePrice,
      saleRetailPrice: raw === "" ? null : normalizeRetailPrice(Number(raw)),
    };
  });
}

export function resolvePromotionWindow(
  startDate: string,
  endDate: string,
  untilManual: boolean
): { startsAt: Date; endsAt: Date | null } {
  if (!startDate) throw new Error("Start date is required");
  const startOfSelected = new Date(`${startDate}T00:00:00`);
  const today = toDateInputValue();
  const startsAt = startDate === today ? new Date() : startOfSelected;
  const endsAt = untilManual ? null : endOfLocalDay(endDate);
  if (!untilManual && !endDate) throw new Error("End date is required");
  if (endsAt && endsAt.getTime() < startsAt.getTime()) {
    throw new Error("End must be after start");
  }
  return { startsAt, endsAt };
}

export function promotionItemFromCatalog(
  product: Product,
  variant: ProductVariant,
  salePrice: number,
  saleRetailPrice: number | null
): PricePromotionItem {
  const variantLabel = formatVariantLabel(variant, product.options);
  const productName =
    variantLabel === "Default"
      ? product.name
      : `${product.name} — ${variantLabel}`;
  return {
    productId: product.id,
    variantId: variant.id,
    productName,
    salePrice,
    saleRetailPrice,
    basePrice: variant.price,
    baseRetailPrice: normalizeRetailPrice(variant.retailPrice),
  };
}

export function PricePromotionDetailsFields({
  idPrefix,
  name,
  onNameChange,
  startDate,
  onStartDateChange,
  endDate,
  onEndDateChange,
  untilManual,
  onUntilManualChange,
}: {
  idPrefix: string;
  name: string;
  onNameChange: (value: string) => void;
  startDate: string;
  onStartDateChange: (value: string) => void;
  endDate: string;
  onEndDateChange: (value: string) => void;
  untilManual: boolean;
  onUntilManualChange: (value: boolean) => void;
}) {
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}-name`}>Name</Label>
        <Input
          id={`${idPrefix}-name`}
          value={name}
          onChange={(e) => onNameChange(e.target.value)}
          placeholder="e.g. Weekend flash sale"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}-start`}>Start date</Label>
        <Input
          id={`${idPrefix}-start`}
          type="date"
          value={startDate}
          onChange={(e) => onStartDateChange(e.target.value)}
        />
      </div>
      <div className="flex items-center gap-2">
        <Checkbox
          id={`${idPrefix}-until-manual`}
          checked={untilManual}
          onCheckedChange={(v) => onUntilManualChange(v === true)}
        />
        <Label htmlFor={`${idPrefix}-until-manual`} className="font-normal">
          Until I end it
        </Label>
      </div>
      {!untilManual ? (
        <div className="space-y-2">
          <Label htmlFor={`${idPrefix}-end`}>End date</Label>
          <Input
            id={`${idPrefix}-end`}
            type="date"
            value={endDate}
            onChange={(e) => onEndDateChange(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">Ends at end of this day</p>
        </div>
      ) : null}
    </div>
  );
}

export function PricePromotionDetailsDialog({
  open,
  onOpenChange,
  promo,
  submitting,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  promo: PricePromotion;
  submitting: boolean;
  onSave: (values: {
    name: string;
    startsAt: Date;
    endsAt: Date | null;
  }) => Promise<void>;
}) {
  const restarting = useMemo(() => {
    const status = pricePromotionDisplayStatus(promo);
    return status === "ended" || status === "expired";
  }, [promo]);

  const [name, setName] = useState(promo.name);
  const [startDate, setStartDate] = useState(toDateInputValue());
  const [endDate, setEndDate] = useState(toDateInputValue());
  const [untilManual, setUntilManual] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(promo.name);
    setStartDate(
      restarting ? toDateInputValue() : toDateInputValue(promo.startsAt)
    );
    setEndDate(
      restarting || !promo.endsAt
        ? toDateInputValue()
        : toDateInputValue(promo.endsAt)
    );
    setUntilManual(!restarting && promo.endsAt == null);
  }, [open, promo, restarting]);

  const handleSave = async () => {
    if (!name.trim()) {
      toast.error("Name is required");
      return;
    }
    try {
      const window = resolvePromotionWindow(startDate, endDate, untilManual);
      await onSave({ name: name.trim(), ...window });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Invalid dates");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {restarting ? "Start sale again" : "Edit sale details"}
          </DialogTitle>
          <DialogDescription>
            {restarting
              ? "Choose a new window. Catalog prices stay the same; POS uses sale prices while live."
              : "Name and date range. Sale prices are edited on the included variants."}
          </DialogDescription>
        </DialogHeader>
        <PricePromotionDetailsFields
          idPrefix="promo-details"
          name={name}
          onNameChange={setName}
          startDate={startDate}
          onStartDateChange={setStartDate}
          endDate={endDate}
          onEndDateChange={setEndDate}
          untilManual={untilManual}
          onUntilManualChange={setUntilManual}
        />
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            Cancel
          </Button>
          <Button disabled={submitting} onClick={() => void handleSave()}>
            {submitting ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : null}
            {restarting ? "Start sale again" : "Save details"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

type CatalogHit = {
  product: Product;
  variant: ProductVariant;
  label: string;
};

function searchCatalogHits(
  products: Product[],
  query: string,
  excludeVariantIds: Set<string>
): CatalogHit[] {
  const q = query.trim().toLowerCase();
  if (q.length < SEARCH_MIN_CHARS) return [];
  const hits: CatalogHit[] = [];
  for (const product of products) {
    if (product.isArchived || !isProductPublished(product)) continue;
    for (const variant of product.variants) {
      if (excludeVariantIds.has(variant.id)) continue;
      const label = formatVariantLabel(variant, product.options);
      if (
        !product.name.toLowerCase().includes(q) &&
        !variant.sku.toLowerCase().includes(q) &&
        !label.toLowerCase().includes(q)
      ) {
        continue;
      }
      hits.push({ product, variant, label });
      if (hits.length >= SEARCH_MAX_RESULTS) return hits;
    }
  }
  return hits;
}

export function AddPromotionVariantDialog({
  open,
  onOpenChange,
  excludeVariantIds,
  onAdd,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  excludeVariantIds: ReadonlySet<string>;
  onAdd: (item: PricePromotionItem) => Promise<void> | void;
}) {
  const [query, setQuery] = useState("");
  const [products, setProducts] = useState<Product[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<CatalogHit | null>(null);
  const [salePrice, setSalePrice] = useState("");
  const [saleRetailPrice, setSaleRetailPrice] = useState("");
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    if (!open) {
      setQuery("");
      setSelected(null);
      setSalePrice("");
      setSaleRetailPrice("");
      return;
    }
    if (products != null) return;
    setLoading(true);
    getProducts()
      .then((list) => {
        setProducts(list.filter((p) => !p.isArchived && isProductPublished(p)));
      })
      .catch((err) => {
        console.error(err);
        toast.error("Failed to load products");
      })
      .finally(() => setLoading(false));
  }, [open, products]);

  const hits = useMemo(() => {
    if (!products || selected) return [];
    return searchCatalogHits(products, query, new Set(excludeVariantIds));
  }, [products, query, excludeVariantIds, selected]);

  const pickHit = (hit: CatalogHit) => {
    setSelected(hit);
    setSalePrice(String(hit.variant.price));
    setSaleRetailPrice(
      hit.variant.retailPrice != null ? String(hit.variant.retailPrice) : ""
    );
  };

  const handleAdd = async () => {
    if (!selected) return;
    const cash = Number(salePrice);
    if (!Number.isFinite(cash) || cash < 0) {
      toast.error("Enter a valid sale cash price");
      return;
    }
    const retailRaw = saleRetailPrice.trim();
    const retail =
      retailRaw === "" ? null : normalizeRetailPrice(Number(retailRaw));
    setAdding(true);
    try {
      await onAdd(
        promotionItemFromCatalog(selected.product, selected.variant, cash, retail)
      );
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to add variant");
    } finally {
      setAdding(false);
    }
  };

  const queryReady = query.trim().length >= SEARCH_MIN_CHARS;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85dvh] max-w-lg flex-col gap-0 overflow-hidden p-0 sm:max-w-lg">
        <DialogHeader className="border-b p-4">
          <DialogTitle>Add variant</DialogTitle>
          <DialogDescription>
            Search by product name, SKU, or variant. Results appear only after
            you type.
          </DialogDescription>
        </DialogHeader>

        {selected ? (
          <div className="space-y-4 p-4">
            <div>
              <p className="font-medium">{selected.product.name}</p>
              {selected.label !== "Default" ? (
                <p className="text-sm text-muted-foreground">{selected.label}</p>
              ) : null}
              {selected.variant.sku ? (
                <p className="text-xs text-muted-foreground">
                  SKU {selected.variant.sku}
                </p>
              ) : null}
              <p className="mt-1 text-xs text-muted-foreground">
                Catalog cash {formatCurrency(selected.variant.price)}
                {selected.variant.retailPrice != null
                  ? ` · retail ${formatCurrency(selected.variant.retailPrice)}`
                  : ""}
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="add-sale-cash">Sale cash</Label>
                <Input
                  id="add-sale-cash"
                  type="number"
                  min={0}
                  inputMode="decimal"
                  value={salePrice}
                  onChange={(e) => setSalePrice(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="add-sale-retail">Sale retail</Label>
                <Input
                  id="add-sale-retail"
                  type="number"
                  min={0}
                  inputMode="decimal"
                  value={saleRetailPrice}
                  placeholder="—"
                  onChange={(e) => setSaleRetailPrice(e.target.value)}
                />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setSelected(null)}
                disabled={adding}
              >
                Back to search
              </Button>
              <Button disabled={adding} onClick={() => void handleAdd()}>
                {adding ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : null}
                Add to sale
              </Button>
            </div>
          </div>
        ) : (
          <>
            <div className="border-b p-4">
              <div className="relative">
                <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  autoFocus
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search products, SKU, or variant…"
                  className="pl-9"
                />
              </div>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">
              {loading ? (
                <p className="flex items-center justify-center gap-2 px-4 py-8 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading catalog…
                </p>
              ) : !queryReady ? (
                <p className="px-4 py-8 text-center text-sm text-muted-foreground">
                  Type at least {SEARCH_MIN_CHARS} characters to search.
                </p>
              ) : hits.length === 0 ? (
                <p className="px-4 py-8 text-center text-sm text-muted-foreground">
                  No matching variants.
                </p>
              ) : (
                <ul className="divide-y">
                  {hits.map((hit) => (
                    <li key={hit.variant.id}>
                      <button
                        type="button"
                        className="flex w-full items-start justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/60"
                        onClick={() => pickHit(hit)}
                      >
                        <div className="min-w-0">
                          <p className="truncate font-medium">
                            {hit.product.name}
                          </p>
                          {hit.label !== "Default" ? (
                            <p className="truncate text-sm text-muted-foreground">
                              {hit.label}
                            </p>
                          ) : null}
                          {hit.variant.sku ? (
                            <p className="truncate text-xs text-muted-foreground">
                              SKU {hit.variant.sku}
                            </p>
                          ) : null}
                        </div>
                        <span className="shrink-0 text-sm tabular-nums text-muted-foreground">
                          {formatCurrency(hit.variant.price)}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function PricePromotionIncludedItems({
  items,
  drafts,
  onDraftChange,
  onRemove,
  onAddClick,
  saving,
  onSave,
  pricesDirty,
  emptyMessage = "No variants on this sale yet. Search to add one.",
}: {
  items: PricePromotionItem[];
  drafts: Record<string, PriceDraft>;
  onDraftChange: (variantId: string, patch: Partial<PriceDraft>) => void;
  onRemove?: (variantId: string) => void;
  onAddClick?: () => void;
  saving?: boolean;
  onSave?: () => void;
  pricesDirty?: boolean;
  emptyMessage?: string;
}) {
  const [pendingRemove, setPendingRemove] =
    useState<PricePromotionItem | null>(null);

  const draftFor = (item: PricePromotionItem): PriceDraft =>
    drafts[item.variantId] ?? {
      salePrice: String(item.salePrice),
      saleRetailPrice:
        item.saleRetailPrice != null ? String(item.saleRetailPrice) : "",
    };

  const confirmRemove = () => {
    if (!pendingRemove || !onRemove) return;
    onRemove(pendingRemove.variantId);
    setPendingRemove(null);
  };

  return (
    <div className="space-y-4">
      {onAddClick || onSave ? (
        <div className="flex flex-wrap items-center justify-end gap-2">
          {onAddClick ? (
            <Button type="button" variant="outline" onClick={onAddClick}>
              <Plus className="mr-1.5 h-4 w-4" />
              Add variant
            </Button>
          ) : null}
          {onSave ? (
            <Button
              type="button"
              disabled={saving || !pricesDirty || items.length === 0}
              onClick={onSave}
            >
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Save prices
            </Button>
          ) : null}
        </div>
      ) : null}

      {items.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          {emptyMessage}
        </p>
      ) : (
        <>
          <ul className="space-y-3 md:hidden">
            {items.map((item) => {
              const draft = draftFor(item);
              return (
                <li key={item.variantId} className="space-y-3 rounded-lg border p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-medium">{item.productName}</p>
                      <p className="text-xs text-muted-foreground">
                        Base cash {formatCurrency(item.basePrice)}
                        {item.baseRetailPrice != null
                          ? ` · retail ${formatCurrency(item.baseRetailPrice)}`
                          : ""}
                      </p>
                    </div>
                    {onRemove ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => setPendingRemove(item)}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                        <span className="sr-only">Remove</span>
                      </Button>
                    ) : null}
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <Label className="text-xs">Sale cash</Label>
                      <Input
                        type="number"
                        min={0}
                        inputMode="decimal"
                        value={draft.salePrice}
                        onChange={(e) =>
                          onDraftChange(item.variantId, {
                            salePrice: e.target.value,
                          })
                        }
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Sale retail</Label>
                      <Input
                        type="number"
                        min={0}
                        inputMode="decimal"
                        value={draft.saleRetailPrice}
                        placeholder="—"
                        onChange={(e) =>
                          onDraftChange(item.variantId, {
                            saleRetailPrice: e.target.value,
                          })
                        }
                      />
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>

          <div className="hidden overflow-x-auto rounded-md border md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Variant</TableHead>
                  <TableHead>Base cash</TableHead>
                  <TableHead>Sale cash</TableHead>
                  <TableHead>Base retail</TableHead>
                  <TableHead>Sale retail</TableHead>
                  {onRemove ? <TableHead className="w-12" /> : null}
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item) => {
                  const draft = draftFor(item);
                  return (
                    <TableRow key={item.variantId}>
                      <TableCell className="font-medium">
                        {item.productName}
                      </TableCell>
                      <TableCell className="tabular-nums text-muted-foreground">
                        {formatCurrency(item.basePrice)}
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          min={0}
                          value={draft.salePrice}
                          onChange={(e) =>
                            onDraftChange(item.variantId, {
                              salePrice: e.target.value,
                            })
                          }
                          className="w-24"
                        />
                      </TableCell>
                      <TableCell className="tabular-nums text-muted-foreground">
                        {item.baseRetailPrice != null
                          ? formatCurrency(item.baseRetailPrice)
                          : "—"}
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          min={0}
                          value={draft.saleRetailPrice}
                          placeholder="—"
                          onChange={(e) =>
                            onDraftChange(item.variantId, {
                              saleRetailPrice: e.target.value,
                            })
                          }
                          className="w-24"
                        />
                      </TableCell>
                      {onRemove ? (
                        <TableCell>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => setPendingRemove(item)}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                            <span className="sr-only">Remove</span>
                          </Button>
                        </TableCell>
                      ) : null}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </>
      )}

      <AlertDialog
        open={pendingRemove != null}
        onOpenChange={(open) => {
          if (!open) setPendingRemove(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove this variant?</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingRemove
                ? `${pendingRemove.productName} will be removed from this sale.`
                : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={confirmRemove}>
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
