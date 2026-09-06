"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, Plus, Search } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { TablePagination } from "@/components/admin/table-pagination";
import {
  PricePromotionDetailsFields,
  PricePromotionIncludedItems,
  applyPriceDrafts,
  draftsFromItems,
  promotionItemFromCatalog,
  resolvePromotionWindow,
  type PriceDraft,
} from "@/components/admin/price-promotion-editor";
import { toDateInputValue } from "@/lib/dates";
import { formatCurrency } from "@/lib/format";
import { getProducts } from "@/lib/firestore/products";
import { paginateItems } from "@/lib/pagination";
import { isProductPublished } from "@/lib/products-catalog";
import { formatVariantLabel } from "@/lib/product-variants";
import { normalizeRetailPrice } from "@/lib/product-pricing";
import type { PricePromotionItem, Product, ProductVariant } from "@/types";

const CATALOG_PAGE_SIZE = 10;

export interface PricePromotionFormValues {
  name: string;
  startsAt: Date;
  endsAt: Date | null;
  items: PricePromotionItem[];
}

type CatalogRow = {
  product: Product;
  variant: ProductVariant;
  productName: string;
  variantLabel: string;
};

export function PricePromotionForm({
  submitting,
  submitLabel,
  onSubmit,
}: {
  submitting: boolean;
  submitLabel: string;
  onSubmit: (values: PricePromotionFormValues) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [startDate, setStartDate] = useState(() => toDateInputValue());
  const [endDate, setEndDate] = useState(() => toDateInputValue());
  const [untilManual, setUntilManual] = useState(false);
  const [items, setItems] = useState<PricePromotionItem[]>([]);
  const [drafts, setDrafts] = useState<Record<string, PriceDraft>>({});
  const [products, setProducts] = useState<Product[]>([]);
  const [loadingCatalog, setLoadingCatalog] = useState(true);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  useEffect(() => {
    getProducts()
      .then((list) =>
        setProducts(list.filter((p) => !p.isArchived && isProductPublished(p)))
      )
      .catch((err) => {
        console.error(err);
        toast.error("Failed to load products");
      })
      .finally(() => setLoadingCatalog(false));
  }, []);

  const selectedIds = useMemo(
    () => new Set(items.map((item) => item.variantId)),
    [items]
  );

  const catalogRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    const rows: CatalogRow[] = [];
    for (const product of products) {
      for (const variant of product.variants) {
        if (selectedIds.has(variant.id)) continue;
        const variantLabel = formatVariantLabel(variant, product.options);
        if (q) {
          const matches =
            product.name.toLowerCase().includes(q) ||
            variant.sku.toLowerCase().includes(q) ||
            variantLabel.toLowerCase().includes(q);
          if (!matches) continue;
        }
        rows.push({
          product,
          variant,
          productName: product.name,
          variantLabel,
        });
      }
    }
    return rows;
  }, [products, selectedIds, search]);

  useEffect(() => {
    setPage(1);
  }, [search]);

  const {
    page: safePage,
    totalPages,
    pagedItems,
    total,
  } = useMemo(
    () => paginateItems(catalogRows, page, CATALOG_PAGE_SIZE),
    [catalogRows, page]
  );

  useEffect(() => {
    if (page !== safePage) setPage(safePage);
  }, [page, safePage]);

  const handleAdd = (row: CatalogRow) => {
    const item = promotionItemFromCatalog(
      row.product,
      row.variant,
      row.variant.price,
      normalizeRetailPrice(row.variant.retailPrice)
    );
    setItems((prev) => [...prev, item]);
    setDrafts((prev) => ({
      ...prev,
      [item.variantId]: {
        salePrice: String(item.salePrice),
        saleRetailPrice:
          item.saleRetailPrice != null ? String(item.saleRetailPrice) : "",
      },
    }));
  };

  const handleRemove = (variantId: string) => {
    setItems((prev) => prev.filter((item) => item.variantId !== variantId));
    setDrafts((prev) => {
      const next = { ...prev };
      delete next[variantId];
      return next;
    });
  };

  const handleSubmit = async () => {
    if (!name.trim()) {
      toast.error("Name is required");
      return;
    }
    try {
      const window = resolvePromotionWindow(startDate, endDate, untilManual);
      const nextItems = applyPriceDrafts(items, drafts);
      if (nextItems.length === 0) {
        toast.error("Add at least one variant");
        return;
      }
      await onSubmit({
        name: name.trim(),
        ...window,
        items: nextItems,
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create sale");
    }
  };

  return (
    <div className="flex flex-col gap-6 xl:flex-row xl:items-start">
      <aside className="w-full shrink-0 space-y-4 xl:w-72">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Sale details</CardTitle>
            <CardDescription>
              Catalog prices stay unchanged; POS uses sale prices while live.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <PricePromotionDetailsFields
              idPrefix="promo-new"
              name={name}
              onNameChange={setName}
              startDate={startDate}
              onStartDateChange={setStartDate}
              endDate={endDate}
              onEndDateChange={setEndDate}
              untilManual={untilManual}
              onUntilManualChange={setUntilManual}
            />
            <div className="rounded-md border p-3 text-sm">
              <p className="text-muted-foreground">Selected variants</p>
              <p className="text-lg font-semibold tabular-nums">{items.length}</p>
            </div>
            <Button
              className="w-full"
              disabled={submitting || items.length === 0}
              onClick={() => void handleSubmit()}
            >
              {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {submitLabel}
            </Button>
          </CardContent>
        </Card>
      </aside>

      <div className="min-w-0 flex-1 space-y-6">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Selected for this sale</CardTitle>
            <CardDescription>
              Edit sale cash and retail here. This list is separate from the
              catalog below.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <PricePromotionIncludedItems
              items={items}
              drafts={drafts}
              onDraftChange={(variantId, patch) =>
                setDrafts((prev) => ({
                  ...prev,
                  [variantId]: {
                    ...(prev[variantId] ?? draftsFromItems(items)[variantId]),
                    ...patch,
                  },
                }))
              }
              onRemove={handleRemove}
              emptyMessage="Add variants from the catalog below. They will appear here with sale prices."
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="space-y-4 pb-3">
            <div>
              <CardTitle className="text-base">Catalog</CardTitle>
              <CardDescription>
                {CATALOG_PAGE_SIZE} variants per page. Add a variant to move it
                into the selected list.
              </CardDescription>
            </div>
            <div className="relative max-w-md">
              <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search product, SKU, or variant…"
                className="pl-9"
              />
            </div>
          </CardHeader>
          <CardContent>
            {loadingCatalog ? (
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading catalog…
              </p>
            ) : pagedItems.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                {catalogRows.length === 0 && items.length > 0 && !search.trim()
                  ? "Every matching variant is already selected."
                  : "No variants match your search."}
              </p>
            ) : (
              <>
                <ul className="space-y-2 md:hidden">
                  {pagedItems.map((row) => (
                    <li
                      key={row.variant.id}
                      className="flex items-start justify-between gap-3 rounded-lg border p-3"
                    >
                      <div className="min-w-0">
                        <p className="font-medium">{row.productName}</p>
                        {row.variantLabel !== "Default" ? (
                          <p className="text-sm text-muted-foreground">
                            {row.variantLabel}
                          </p>
                        ) : null}
                        {row.variant.sku ? (
                          <p className="text-xs text-muted-foreground">
                            SKU {row.variant.sku}
                          </p>
                        ) : null}
                        <p className="mt-1 text-xs text-muted-foreground">
                          Cash {formatCurrency(row.variant.price)}
                          {row.variant.retailPrice != null
                            ? ` · retail ${formatCurrency(row.variant.retailPrice)}`
                            : ""}
                        </p>
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => handleAdd(row)}
                      >
                        <Plus className="mr-1 h-3.5 w-3.5" />
                        Add
                      </Button>
                    </li>
                  ))}
                </ul>

                <div className="hidden overflow-x-auto rounded-md border md:block">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Product / variant</TableHead>
                        <TableHead>Cash</TableHead>
                        <TableHead>Retail</TableHead>
                        <TableHead className="w-24" />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {pagedItems.map((row) => (
                        <TableRow key={row.variant.id}>
                          <TableCell>
                            <p className="font-medium">{row.productName}</p>
                            {row.variantLabel !== "Default" ? (
                              <p className="text-sm text-muted-foreground">
                                {row.variantLabel}
                              </p>
                            ) : null}
                            {row.variant.sku ? (
                              <p className="text-xs text-muted-foreground">
                                {row.variant.sku}
                              </p>
                            ) : null}
                          </TableCell>
                          <TableCell className="tabular-nums">
                            {formatCurrency(row.variant.price)}
                          </TableCell>
                          <TableCell className="tabular-nums text-muted-foreground">
                            {row.variant.retailPrice != null
                              ? formatCurrency(row.variant.retailPrice)
                              : "—"}
                          </TableCell>
                          <TableCell>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={() => handleAdd(row)}
                            >
                              <Plus className="mr-1 h-3.5 w-3.5" />
                              Add
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>

                <TablePagination
                  page={safePage}
                  totalPages={totalPages}
                  total={total}
                  pageSize={CATALOG_PAGE_SIZE}
                  onPageChange={setPage}
                  className="mt-4"
                />
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
