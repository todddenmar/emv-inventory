"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, Plus, Search } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import { CategoryFilterPanel } from "@/components/admin/category-filter-panel";
import { TableBulkBar } from "@/components/admin/table-bulk-bar";
import { TablePagination } from "@/components/admin/table-pagination";
import {
  PricePromotionDetailsFields,
  PricePromotionIncludedItems,
  applyPriceDrafts,
  draftsFromItems,
  promotionBranchNames,
  promotionItemFromCatalog,
  resolvePromotionWindow,
  type PriceDraft,
} from "@/components/admin/price-promotion-editor";
import { productIdsForCategoryFilter } from "@/lib/category-filters";
import { toDateInputValue } from "@/lib/dates";
import { formatCurrency } from "@/lib/format";
import { getBranches } from "@/lib/firestore/branches";
import { getCategories } from "@/lib/firestore/categories";
import { getCategoryGroups } from "@/lib/firestore/category-groups";
import { getProducts } from "@/lib/firestore/products";
import { paginateItems } from "@/lib/pagination";
import { isProductPublished } from "@/lib/products-catalog";
import { formatVariantLabel } from "@/lib/product-variants";
import { normalizeRetailPrice } from "@/lib/product-pricing";
import type {
  Branch,
  Category,
  CategoryGroup,
  PricePromotionItem,
  Product,
  ProductVariant,
} from "@/types";

const CATALOG_PAGE_SIZE = 10;

export interface PricePromotionFormValues {
  name: string;
  startsAt: Date;
  endsAt: Date | null;
  items: PricePromotionItem[];
  /** null = all branches. */
  branchIds: string[] | null;
  /** Branch names for audit notes; empty for all branches. */
  branchScopeLabel: string;
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
  const [categories, setCategories] = useState<Category[]>([]);
  const [categoryGroups, setCategoryGroups] = useState<CategoryGroup[]>([]);
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<string[]>([]);
  const [pickIds, setPickIds] = useState<string[]>([]);
  const [loadingCatalog, setLoadingCatalog] = useState(true);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [branchIds, setBranchIds] = useState<string[] | null>(null);

  useEffect(() => {
    getBranches(true)
      .then(setBranches)
      .catch((err) => {
        console.error(err);
        toast.error("Failed to load branches");
      });
  }, []);

  useEffect(() => {
    Promise.all([getProducts(), getCategories(), getCategoryGroups()])
      .then(([list, cats, groups]) => {
        setProducts(list.filter((p) => !p.isArchived && isProductPublished(p)));
        setCategories(cats.filter((c) => !c.isArchived));
        setCategoryGroups(groups);
      })
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
    const allowedProductIds = productIdsForCategoryFilter(
      products,
      selectedCategoryIds
    );
    const rows: CatalogRow[] = [];
    for (const product of products) {
      if (allowedProductIds && !allowedProductIds.has(product.id)) continue;
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
  }, [products, selectedIds, search, selectedCategoryIds]);

  const {
    page: safePage,
    totalPages,
    pagedItems,
    total,
  } = useMemo(
    () => paginateItems(catalogRows, page, CATALOG_PAGE_SIZE),
    [catalogRows, page]
  );

  const pageIds = useMemo(
    () => pagedItems.map((row) => row.variant.id),
    [pagedItems]
  );
  const allPagePicked =
    pageIds.length > 0 && pageIds.every((id) => pickIds.includes(id));
  const somePagePicked = pageIds.some((id) => pickIds.includes(id));

  const togglePick = (id: string) => {
    setPickIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const togglePickPage = (checked: boolean) => {
    if (checked) {
      setPickIds((prev) => [...new Set([...prev, ...pageIds])]);
      return;
    }
    setPickIds((prev) => prev.filter((id) => !pageIds.includes(id)));
  };

  const addRows = (rows: CatalogRow[]) => {
    if (rows.length === 0) return;
    const nextItems: PricePromotionItem[] = [];
    const nextDrafts: Record<string, PriceDraft> = {};
    const seen = new Set(selectedIds);
    for (const row of rows) {
      if (seen.has(row.variant.id)) continue;
      seen.add(row.variant.id);
      const item = promotionItemFromCatalog(
        row.product,
        row.variant,
        row.variant.price,
        normalizeRetailPrice(row.variant.retailPrice)
      );
      nextItems.push(item);
      nextDrafts[item.variantId] = {
        salePrice: String(item.salePrice),
        saleRetailPrice:
          item.saleRetailPrice != null ? String(item.saleRetailPrice) : "",
      };
    }
    if (nextItems.length === 0) return;
    setItems((prev) => [...prev, ...nextItems]);
    setDrafts((prev) => ({ ...prev, ...nextDrafts }));
    setPickIds((prev) =>
      prev.filter((id) => !nextItems.some((item) => item.variantId === id))
    );
  };

  const handleAdd = (row: CatalogRow) => {
    addRows([row]);
  };

  const handleAddSelected = () => {
    const pickSet = new Set(pickIds);
    addRows(catalogRows.filter((row) => pickSet.has(row.variant.id)));
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
    if (branchIds != null && branchIds.length === 0) {
      toast.error("Select at least one branch");
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
        branchIds,
        branchScopeLabel: promotionBranchNames(branchIds, branches),
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create sale");
    }
  };

  const emptyCatalogMessage =
    catalogRows.length === 0 &&
    items.length > 0 &&
    !search.trim() &&
    selectedCategoryIds.length === 0
      ? "Every matching variant is already selected."
      : selectedCategoryIds.length > 0 || search.trim()
        ? "No variants match your filters."
        : "No variants match your search.";

  return (
    <div className="flex flex-col gap-6 xl:flex-row xl:items-start">
      <aside className="w-full shrink-0 space-y-4 xl:w-72">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Sale details</CardTitle>
            <CardDescription>
              Catalog prices stay unchanged; POS uses sale prices while live at
              the selected branches.
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
              branches={branches}
              branchIds={branchIds}
              onBranchIdsChange={setBranchIds}
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
              onReplaceDrafts={(next) =>
                setDrafts((prev) => ({ ...prev, ...next }))
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
                {CATALOG_PAGE_SIZE} variants per page. Check rows to add many at
                once, or use Add for a single variant.
              </CardDescription>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <div className="relative min-w-0 flex-1 max-w-md">
                <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setPage(1);
                  }}
                  placeholder="Search product, SKU, or variant…"
                  className="pl-9"
                />
              </div>
              <CategoryFilterPanel
                categories={categories}
                groups={categoryGroups}
                selectedCategoryIds={selectedCategoryIds}
                onChange={(ids) => {
                  setSelectedCategoryIds(ids);
                  setPage(1);
                }}
              />
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {loadingCatalog ? (
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading catalog…
              </p>
            ) : pagedItems.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                {emptyCatalogMessage}
              </p>
            ) : (
              <>
                <TableBulkBar
                  selectedCount={pickIds.length}
                  visibleCount={catalogRows.length}
                  itemLabel="variants"
                  onSelectAllVisible={() =>
                    setPickIds(catalogRows.map((row) => row.variant.id))
                  }
                  onClear={() => setPickIds([])}
                >
                  <Button type="button" size="sm" onClick={handleAddSelected}>
                    <Plus className="mr-1 h-3.5 w-3.5" />
                    Add selected
                  </Button>
                </TableBulkBar>

                <ul className="space-y-2 md:hidden">
                  {pagedItems.map((row) => (
                    <li
                      key={row.variant.id}
                      className="flex items-start gap-3 rounded-lg border p-3"
                    >
                      <Checkbox
                        checked={pickIds.includes(row.variant.id)}
                        onCheckedChange={() => togglePick(row.variant.id)}
                        aria-label={`Select ${row.productName}`}
                        className="mt-1"
                      />
                      <div className="min-w-0 flex-1">
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
                        <TableHead className="w-10">
                          <Checkbox
                            checked={allPagePicked}
                            indeterminate={somePagePicked && !allPagePicked}
                            onCheckedChange={(checked) =>
                              togglePickPage(checked === true)
                            }
                            aria-label="Select all on this page"
                          />
                        </TableHead>
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
                            <Checkbox
                              checked={pickIds.includes(row.variant.id)}
                              onCheckedChange={() => togglePick(row.variant.id)}
                              aria-label={`Select ${row.productName}`}
                            />
                          </TableCell>
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
