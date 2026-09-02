"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { LinkButton } from "@/components/ui/link-button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
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
import { useBranchAccess } from "@/hooks/use-branch-access";
import { useAuthStore } from "@/stores/auth-store";
import { getCategories } from "@/lib/firestore/categories";
import { getVendors } from "@/lib/firestore/vendors";
import { getProducts } from "@/lib/firestore/products";
import { createPricePromotion } from "@/lib/firestore/price-promotions";
import { endOfLocalDay, toDateInputValue } from "@/lib/dates";
import { formatCurrency } from "@/lib/format";
import { isProductPublished } from "@/lib/products-catalog";
import { formatVariantLabel } from "@/lib/product-variants";
import { normalizeRetailPrice } from "@/lib/product-pricing";
import type { Category, Product, Vendor } from "@/types";

type SaleDraft = Record<
  string,
  { salePrice: string; saleRetailPrice: string; included: boolean }
>;

export default function NewPricePromotionPage() {
  const router = useRouter();
  const { canManagePricePromotions } = useBranchAccess();
  const user = useAuthStore((s) => s.user);

  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const [name, setName] = useState("");
  const [startDate, setStartDate] = useState(toDateInputValue());
  const [endDate, setEndDate] = useState(toDateInputValue());
  const [untilManual, setUntilManual] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [vendorFilter, setVendorFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [drafts, setDrafts] = useState<SaleDraft>({});
  const [bulkCash, setBulkCash] = useState("");
  const [bulkRetail, setBulkRetail] = useState("");

  useEffect(() => {
    Promise.all([getProducts(), getCategories(), getVendors()])
      .then(([p, cats, v]) => {
        setProducts(p.filter((x) => !x.isArchived && isProductPublished(x)));
        setCategories(cats.filter((c) => !c.isArchived));
        setVendors(v);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const variantRows = useMemo(() => {
    const rows: Array<{
      product: Product;
      variantId: string;
      productName: string;
      variantLabel: string;
      price: number;
      retailPrice: number | null;
      sku: string;
    }> = [];

    for (const product of products) {
      if (vendorFilter !== "all" && product.vendorId !== vendorFilter) continue;
      if (
        categoryFilter !== "all" &&
        !product.categoryIds.includes(categoryFilter)
      ) {
        continue;
      }
      for (const variant of product.variants) {
        const variantLabel = formatVariantLabel(variant, product.options);
        rows.push({
          product,
          variantId: variant.id,
          productName: product.name,
          variantLabel,
          price: variant.price,
          retailPrice: normalizeRetailPrice(variant.retailPrice),
          sku: variant.sku,
        });
      }
    }

    const q = search.trim().toLowerCase();
    return rows
      .filter((row) => {
        if (!q) return true;
        return (
          row.productName.toLowerCase().includes(q) ||
          row.sku.toLowerCase().includes(q) ||
          row.variantLabel.toLowerCase().includes(q)
        );
      })
      .sort((a, b) => a.productName.localeCompare(b.productName));
  }, [products, categoryFilter, vendorFilter, search]);

  const includedCount = useMemo(
    () => Object.values(drafts).filter((d) => d.included).length,
    [drafts]
  );

  const getDraft = (variantId: string, price: number, retail: number | null) =>
    drafts[variantId] ?? {
      salePrice: String(price),
      saleRetailPrice: retail != null ? String(retail) : "",
      included: false,
    };

  const updateDraft = (
    variantId: string,
    patch: Partial<SaleDraft[string]>,
    fallback: { price: number; retailPrice: number | null }
  ) => {
    setDrafts((prev) => {
      const current = prev[variantId] ?? {
        salePrice: String(fallback.price),
        saleRetailPrice:
          fallback.retailPrice != null ? String(fallback.retailPrice) : "",
        included: false,
      };
      return {
        ...prev,
        [variantId]: { ...current, ...patch },
      };
    });
  };

  const applyBulkToFiltered = () => {
    if (!bulkCash.trim() && !bulkRetail.trim()) {
      toast.error("Enter a bulk cash and/or retail price");
      return;
    }
    setDrafts((prev) => {
      const next = { ...prev };
      for (const row of variantRows) {
        const current = next[row.variantId] ?? {
          salePrice: String(row.price),
          saleRetailPrice:
            row.retailPrice != null ? String(row.retailPrice) : "",
          included: false,
        };
        next[row.variantId] = {
          ...current,
          included: true,
          salePrice: bulkCash.trim()
            ? String(Number(bulkCash) || 0)
            : current.salePrice,
          saleRetailPrice: bulkRetail.trim()
            ? String(Number(bulkRetail) || 0)
            : current.saleRetailPrice,
        };
      }
      return next;
    });
    toast.success(`Applied to ${variantRows.length} filtered variants`);
  };

  const handleSubmit = async () => {
    if (!user) return;
    if (!name.trim()) {
      toast.error("Name is required");
      return;
    }

    const items = variantRows
      .map((row) => {
        const draft = drafts[row.variantId];
        if (!draft?.included) return null;
        const salePrice = Number(draft.salePrice);
        if (!Number.isFinite(salePrice) || salePrice < 0) return null;
        const saleRetailRaw = draft.saleRetailPrice.trim();
        const saleRetailPrice =
          saleRetailRaw === ""
            ? null
            : normalizeRetailPrice(Number(saleRetailRaw));
        const productName =
          row.variantLabel === "Default"
            ? row.productName
            : `${row.productName} — ${row.variantLabel}`;
        return {
          productId: row.product.id,
          variantId: row.variantId,
          productName,
          salePrice,
          saleRetailPrice,
          basePrice: row.price,
          baseRetailPrice: row.retailPrice,
        };
      })
      .filter((item): item is NonNullable<typeof item> => item != null);

    if (items.length === 0) {
      toast.error("Include at least one variant with a sale price");
      return;
    }

    const startOfSelected = new Date(`${startDate}T00:00:00`);
    const today = toDateInputValue();
    const effectiveStart =
      startDate === today ? new Date() : startOfSelected;

    const endsAt = untilManual ? null : endOfLocalDay(endDate);
    if (endsAt && endsAt.getTime() < effectiveStart.getTime()) {
      toast.error("End must be after start");
      return;
    }

    setSubmitting(true);
    try {
      const id = await createPricePromotion({
        name: name.trim(),
        startsAt: effectiveStart,
        endsAt,
        items,
        createdBy: user.uid,
        createdByName: user.displayName ?? user.email ?? null,
      });
      toast.success("Sale created");
      router.push(`/admin/price-promotions/${id}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create sale");
    } finally {
      setSubmitting(false);
    }
  };

  if (!canManagePricePromotions) {
    return (
      <Card>
        <CardContent className="pt-6">
          <p className="text-muted-foreground">
            Only admins and owners can create price promotions.
          </p>
        </CardContent>
      </Card>
    );
  }

  if (loading) {
    return <p className="text-muted-foreground">Loading products...</p>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <LinkButton href="/admin/price-promotions" variant="ghost" size="icon">
          <ArrowLeft className="h-4 w-4" />
          <span className="sr-only">Back</span>
        </LinkButton>
        <div>
          <h1 className="text-2xl font-bold">New price promotion</h1>
          <p className="text-muted-foreground">
            Set temporary cash and retail prices for selected variants
          </p>
        </div>
      </div>

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
              <div className="space-y-2">
                <Label htmlFor="promo-name">Name</Label>
                <Input
                  id="promo-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Weekend flash sale"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="promo-start">Start date</Label>
                <Input
                  id="promo-start"
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                />
              </div>
              <div className="flex items-center gap-2">
                <Checkbox
                  id="until-manual"
                  checked={untilManual}
                  onCheckedChange={(v) => setUntilManual(v === true)}
                />
                <Label htmlFor="until-manual" className="font-normal">
                  Until I end it
                </Label>
              </div>
              {!untilManual ? (
                <div className="space-y-2">
                  <Label htmlFor="promo-end">End date</Label>
                  <Input
                    id="promo-end"
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    Ends at end of this day
                  </p>
                </div>
              ) : null}

              <div className="rounded-md border p-3 text-sm">
                <p className="text-muted-foreground">Variants included</p>
                <p className="text-lg font-semibold tabular-nums">
                  {includedCount}
                </p>
              </div>

              <Button
                className="w-full"
                disabled={submitting || includedCount === 0}
                onClick={() => void handleSubmit()}
              >
                {submitting && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                Create sale
              </Button>
            </CardContent>
          </Card>
        </aside>

        <div className="min-w-0 flex-1">
          <Card>
            <CardHeader className="space-y-4 pb-3">
              <div>
                <CardTitle className="text-base">Variants</CardTitle>
                <CardDescription>
                  Filter, bulk-fill sale prices, then tweak rows and check
                  Include.
                </CardDescription>
              </div>
              <div className="flex flex-col gap-2 lg:flex-row lg:flex-wrap">
                <Input
                  placeholder="Search product, SKU, variant…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="lg:max-w-xs"
                />
                <Select
                  value={categoryFilter}
                  onValueChange={(v) => setCategoryFilter(v ?? "all")}
                >
                  <SelectTrigger className="lg:w-44">
                    <SelectValue>
                      {(value) =>
                        value === "all"
                          ? "All categories"
                          : (categories.find((c) => c.id === value)?.name ??
                            "Category")
                      }
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All categories</SelectItem>
                    {categories.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select
                  value={vendorFilter}
                  onValueChange={(v) => setVendorFilter(v ?? "all")}
                >
                  <SelectTrigger className="lg:w-44">
                    <SelectValue>
                      {(value) =>
                        value === "all"
                          ? "All suppliers"
                          : (vendors.find((v) => v.id === value)?.name ??
                            "Supplier")
                      }
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All suppliers</SelectItem>
                    {vendors.map((v) => (
                      <SelectItem key={v.id} value={v.id}>
                        {v.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                <div className="space-y-1">
                  <Label className="text-xs">Bulk sale cash</Label>
                  <Input
                    type="number"
                    min={0}
                    value={bulkCash}
                    onChange={(e) => setBulkCash(e.target.value)}
                    className="w-32"
                    placeholder="Cash"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Bulk sale retail</Label>
                  <Input
                    type="number"
                    min={0}
                    value={bulkRetail}
                    onChange={(e) => setBulkRetail(e.target.value)}
                    className="w-32"
                    placeholder="Retail"
                  />
                </div>
                <Button
                  type="button"
                  variant="outline"
                  onClick={applyBulkToFiltered}
                >
                  Apply to filtered
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-14">Include</TableHead>
                      <TableHead>Product / variant</TableHead>
                      <TableHead className="w-24">Current cash</TableHead>
                      <TableHead className="w-24">Current retail</TableHead>
                      <TableHead className="w-28">Sale cash</TableHead>
                      <TableHead className="w-28">Sale retail</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {variantRows.length === 0 ? (
                      <TableRow>
                        <TableCell
                          colSpan={6}
                          className="py-8 text-center text-muted-foreground"
                        >
                          No variants match your filters.
                        </TableCell>
                      </TableRow>
                    ) : (
                      variantRows.map((row) => {
                        const draft = getDraft(
                          row.variantId,
                          row.price,
                          row.retailPrice
                        );
                        return (
                          <TableRow key={row.variantId}>
                            <TableCell>
                              <Checkbox
                                checked={draft.included}
                                onCheckedChange={(v) =>
                                  updateDraft(
                                    row.variantId,
                                    { included: v === true },
                                    row
                                  )
                                }
                              />
                            </TableCell>
                            <TableCell>
                              <p className="font-medium">{row.productName}</p>
                              {row.variantLabel !== "Default" ? (
                                <p className="text-sm text-muted-foreground">
                                  {row.variantLabel}
                                </p>
                              ) : null}
                              {row.sku ? (
                                <p className="text-xs text-muted-foreground">
                                  {row.sku}
                                </p>
                              ) : null}
                            </TableCell>
                            <TableCell className="tabular-nums">
                              {formatCurrency(row.price)}
                            </TableCell>
                            <TableCell className="tabular-nums text-muted-foreground">
                              {row.retailPrice != null
                                ? formatCurrency(row.retailPrice)
                                : "—"}
                            </TableCell>
                            <TableCell>
                              <Input
                                type="number"
                                min={0}
                                value={draft.salePrice}
                                onChange={(e) =>
                                  updateDraft(
                                    row.variantId,
                                    {
                                      salePrice: e.target.value,
                                      included: true,
                                    },
                                    row
                                  )
                                }
                                className="w-24"
                              />
                            </TableCell>
                            <TableCell>
                              <Input
                                type="number"
                                min={0}
                                value={draft.saleRetailPrice}
                                placeholder="—"
                                onChange={(e) =>
                                  updateDraft(
                                    row.variantId,
                                    {
                                      saleRetailPrice: e.target.value,
                                      included: true,
                                    },
                                    row
                                  )
                                }
                                className="w-24"
                              />
                            </TableCell>
                          </TableRow>
                        );
                      })
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
