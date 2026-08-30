"use client";

import { use, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ExternalLink,
  Loader2,
  MoreHorizontal,
  Plus,
  Save,
  Search,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { LinkButton } from "@/components/ui/link-button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { CategoryFreebiesEditor } from "@/components/admin/category-freebies-editor";
import { useBranchAccess } from "@/hooks/use-branch-access";
import { useSlugField } from "@/hooks/use-slug-field";
import { formatCurrency } from "@/lib/format";
import {
  getCategory,
  resolveCategorySlug,
  updateCategory,
} from "@/lib/firestore/categories";
import {
  addProductToCategory,
  getProducts,
  getProductsByCategoryId,
  removeProductFromCategory,
} from "@/lib/firestore/products";
import {
  formatVariantLabel,
  getDefaultVariant,
  getProductPriceRange,
} from "@/lib/product-variants";
import { getProductThumbnailUrl } from "@/lib/products";
import {
  isProductPublished,
  productStatusLabel,
} from "@/lib/products-catalog";
import { slugify } from "@/lib/slug";
import type { Category, CategoryFreebieVariant, Product } from "@/types";

export default function EditCategoryPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const { isElevatedAdmin } = useBranchAccess();

  const [category, setCategory] = useState<Category | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [allProducts, setAllProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [removingProductId, setRemovingProductId] = useState<string | null>(
    null
  );
  const [addingProductId, setAddingProductId] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [addSearch, setAddSearch] = useState("");

  const [name, setName] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [lowStockThreshold, setLowStockThreshold] = useState(5);
  const [freebieVariants, setFreebieVariants] = useState<
    CategoryFreebieVariant[]
  >([]);
  const resolveSlug = useCallback(
    (categoryName: string, preferredSlug?: string) =>
      resolveCategorySlug(categoryName, preferredSlug, id),
    [id]
  );
  const { slug, syncSlugFromName, resetSlugField } =
    useSlugField(resolveSlug);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [loadedCategory, categoryProducts, catalog] = await Promise.all([
        getCategory(id),
        getProductsByCategoryId(id, true),
        getProducts(true),
      ]);

      if (!loadedCategory) {
        toast.error("Category not found");
        router.replace("/admin/categories");
        return;
      }

      setCategory(loadedCategory);
      setName(loadedCategory.name);
      resetSlugField(loadedCategory.slug, true);
      setTags(loadedCategory.tags ?? []);
      setLowStockThreshold(loadedCategory.lowStockThreshold ?? 5);
      setFreebieVariants(loadedCategory.freebieVariants ?? []);
      setProducts(categoryProducts);
      setAllProducts(catalog);
    } catch (error) {
      console.error(error);
      toast.error("Failed to load category");
    } finally {
      setLoading(false);
    }
  }, [id, resetSlugField, router]);

  useEffect(() => {
    void load();
  }, [load]);

  const assignedIds = useMemo(
    () => new Set(products.map((p) => p.id)),
    [products]
  );

  const candidates = useMemo(() => {
    const q = addSearch.trim().toLowerCase();
    return allProducts
      .filter((p) => !assignedIds.has(p.id))
      .filter((p) => {
        if (!q) return true;
        return (
          p.name.toLowerCase().includes(q) ||
          p.productType.toLowerCase().includes(q) ||
          p.slug.toLowerCase().includes(q)
        );
      })
      .slice(0, 50);
  }, [allProducts, assignedIds, addSearch]);

  if (!isElevatedAdmin) {
    return (
      <Card>
        <CardContent className="pt-6">
          <p className="text-muted-foreground">
            Only admins can manage categories.
          </p>
        </CardContent>
      </Card>
    );
  }

  const handleSave = async () => {
    if (!name.trim()) {
      toast.error("Category name is required");
      return;
    }

    setSaving(true);
    try {
      await updateCategory(id, {
        name: name.trim(),
        slug: slug.trim() || slugify(name),
        tags,
        lowStockThreshold: Math.max(0, lowStockThreshold),
        freebieVariants,
      });
      const refreshed = await getCategory(id);
      if (refreshed) {
        setCategory(refreshed);
        setName(refreshed.name);
        resetSlugField(refreshed.slug, true);
        setTags(refreshed.tags ?? []);
        setLowStockThreshold(refreshed.lowStockThreshold ?? 5);
        setFreebieVariants(refreshed.freebieVariants ?? []);
      }
      toast.success("Category updated");
    } catch (error) {
      console.error(error);
      toast.error("Failed to update category");
    } finally {
      setSaving(false);
    }
  };

  const handleRemoveProduct = async (product: Product) => {
    setRemovingProductId(product.id);
    try {
      await removeProductFromCategory(product.id, id);
      setProducts((prev) => prev.filter((item) => item.id !== product.id));
      toast.success(
        `Removed “${product.name || "Untitled draft"}” from category`
      );
    } catch (error) {
      console.error(error);
      toast.error("Failed to remove product from category");
    } finally {
      setRemovingProductId(null);
    }
  };

  const handleAddProduct = async (product: Product) => {
    setAddingProductId(product.id);
    try {
      const updated = await addProductToCategory(product.id, id);
      if (updated) {
        setProducts((prev) =>
          [...prev, updated].sort((a, b) =>
            a.name.localeCompare(b.name, undefined, { sensitivity: "base" })
          )
        );
      }
      toast.success(`Added “${product.name || "Untitled draft"}”`);
    } catch (error) {
      console.error(error);
      toast.error("Failed to add product");
    } finally {
      setAddingProductId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading category…
      </div>
    );
  }

  if (!category) {
    return null;
  }

  return (
    <div className="w-full space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <LinkButton href="/admin/categories" variant="ghost" size="icon">
              <ArrowLeft className="h-4 w-4" />
              <span className="sr-only">Back to categories</span>
            </LinkButton>
            <h1 className="text-2xl font-bold">Edit category</h1>
          </div>
          <p className="text-muted-foreground">
            Update category details and manage products assigned to it.
          </p>
        </div>
        <Button type="button" onClick={() => void handleSave()} disabled={saving}>
          {saving ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Save className="mr-2 h-4 w-4" />
          )}
          Save changes
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Category details</CardTitle>
          <CardDescription>
            {category.isArchived ? (
              <Badge variant="secondary">Archived</Badge>
            ) : (
              "Name, low-stock threshold, and freebies"
            )}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_minmax(12rem,16rem)]">
            <div className="space-y-2">
              <Label htmlFor="category-name">Name</Label>
              <Input
                id="category-name"
                value={name}
                onChange={(e) => {
                  const nextName = e.target.value;
                  setName(nextName);
                  syncSlugFromName(nextName);
                }}
                placeholder="e.g. Beverages"
                disabled={saving || category.isArchived}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="category-low-at">Low at</Label>
              <Input
                id="category-low-at"
                type="number"
                min={0}
                inputMode="numeric"
                className="h-9 min-w-[8rem] tabular-nums [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                value={lowStockThreshold}
                onChange={(e) =>
                  setLowStockThreshold(Number(e.target.value) || 0)
                }
                disabled={saving || category.isArchived}
              />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Inventory alerts when stock is at or below this for products in
            this category. Products in multiple categories use the lowest
            threshold.
          </p>
          <CategoryFreebiesEditor
            freebies={freebieVariants}
            onChange={setFreebieVariants}
            products={allProducts}
            disabled={saving || category.isArchived}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div>
            <CardTitle>Products in this category</CardTitle>
            <CardDescription>
              {products.length} product{products.length === 1 ? "" : "s"}. Add or
              remove assignments without deleting products.
            </CardDescription>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={category.isArchived}
            onClick={() => {
              setAddSearch("");
              setAddOpen(true);
            }}
          >
            <Plus className="mr-2 h-4 w-4" />
            Add products
          </Button>
        </CardHeader>
        <CardContent>
          {products.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No products are assigned to this category yet.
            </p>
          ) : (
            <Accordion multiple className="rounded-md border">
              {products.map((product) => {
                const thumb = getProductThumbnailUrl(product);
                const range = getProductPriceRange(product);
                const removing = removingProductId === product.id;
                const variantCount = product.variants.length;
                const priceLabel =
                  range.min !== range.max
                    ? `${formatCurrency(range.min)} – ${formatCurrency(range.max)}`
                    : formatCurrency(getDefaultVariant(product).price);

                return (
                  <AccordionItem key={product.id} value={product.id}>
                    <div className="flex items-center gap-1 pr-2">
                      <AccordionTrigger className="min-w-0 flex-1 items-center justify-start gap-1 rounded-none px-3 hover:no-underline **:data-[slot=accordion-trigger-icon]:ml-0">
                        <div className="flex min-w-0 flex-1 items-center gap-3">
                          <div className="h-10 w-10 shrink-0 overflow-hidden rounded-md bg-muted">
                            {thumb ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={thumb}
                                alt=""
                                className="h-full w-full object-cover"
                              />
                            ) : null}
                          </div>
                          <div className="min-w-0 flex-1 text-left">
                            <p className="truncate font-medium">
                              {product.name.trim() || "Untitled draft"}
                            </p>
                            <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                              {product.productType ? (
                                <span className="truncate">
                                  {product.productType}
                                </span>
                              ) : null}
                              <span className="tabular-nums">{priceLabel}</span>
                              <span>
                                {variantCount} variant
                                {variantCount === 1 ? "" : "s"}
                              </span>
                            </div>
                          </div>
                          <Badge
                            variant={
                              isProductPublished(product)
                                ? "default"
                                : "secondary"
                            }
                            className="shrink-0"
                          >
                            {productStatusLabel(product)}
                          </Badge>
                        </div>
                      </AccordionTrigger>
                      <DropdownMenu>
                        <DropdownMenuTrigger
                          render={
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              disabled={removing}
                            >
                              {removing ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <MoreHorizontal className="h-4 w-4" />
                              )}
                              <span className="sr-only">Open menu</span>
                            </Button>
                          }
                        />
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            render={
                              <Link href={`/admin/products/${product.id}`}>
                                <ExternalLink className="h-4 w-4" />
                                Open product
                              </Link>
                            }
                          />
                          {!category.isArchived ? (
                            <>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                variant="destructive"
                                disabled={removing}
                                onClick={() =>
                                  void handleRemoveProduct(product)
                                }
                              >
                                <X className="h-4 w-4" />
                                Remove from category
                              </DropdownMenuItem>
                            </>
                          ) : null}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                    <AccordionContent className="px-3 pb-3">
                      {variantCount === 0 ? (
                        <p className="text-sm text-muted-foreground">
                          No variants on this product.
                        </p>
                      ) : (
                        <div className="overflow-x-auto rounded-md border bg-muted/20">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>Variant</TableHead>
                                <TableHead>SKU</TableHead>
                                <TableHead className="text-right">
                                  Cash
                                </TableHead>
                                <TableHead className="text-right">
                                  Retail
                                </TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {[...product.variants]
                                .sort((a, b) => a.position - b.position)
                                .map((variant) => (
                                  <TableRow key={variant.id}>
                                    <TableCell className="font-medium">
                                      {formatVariantLabel(
                                        variant,
                                        product.options
                                      )}
                                    </TableCell>
                                    <TableCell className="text-muted-foreground">
                                      {variant.sku || "—"}
                                    </TableCell>
                                    <TableCell className="text-right tabular-nums">
                                      {formatCurrency(variant.price)}
                                    </TableCell>
                                    <TableCell className="text-right tabular-nums text-muted-foreground">
                                      {variant.retailPrice != null
                                        ? formatCurrency(variant.retailPrice)
                                        : "—"}
                                    </TableCell>
                                  </TableRow>
                                ))}
                            </TableBody>
                          </Table>
                        </div>
                      )}
                    </AccordionContent>
                  </AccordionItem>
                );
              })}
            </Accordion>
          )}
        </CardContent>
      </Card>

      <Dialog
        open={addOpen}
        onOpenChange={(open) => {
          setAddOpen(open);
          if (!open) setAddSearch("");
        }}
      >
        <DialogContent className="flex max-h-[85dvh] max-w-lg flex-col gap-0 overflow-hidden p-0 sm:max-w-lg">
          <DialogHeader className="border-b p-4">
            <DialogTitle>Add products</DialogTitle>
            <DialogDescription>
              Search the catalog and assign products to this category.
            </DialogDescription>
          </DialogHeader>
          <div className="border-b p-4">
            <div className="relative">
              <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                autoFocus
                value={addSearch}
                onChange={(e) => setAddSearch(e.target.value)}
                placeholder="Search products..."
                className="pl-9"
              />
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {candidates.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-muted-foreground">
                No matching products to add.
              </p>
            ) : (
              <ul className="divide-y">
                {candidates.map((product) => {
                  const thumb = getProductThumbnailUrl(product);
                  const adding = addingProductId === product.id;
                  return (
                    <li
                      key={product.id}
                      className="flex items-center justify-between gap-3 px-4 py-3"
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <div className="h-10 w-10 shrink-0 overflow-hidden rounded-md bg-muted">
                          {thumb ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={thumb}
                              alt=""
                              className="h-full w-full object-cover"
                            />
                          ) : null}
                        </div>
                        <div className="min-w-0">
                          <p className="truncate font-medium">
                            {product.name.trim() || "Untitled draft"}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {productStatusLabel(product)}
                          </p>
                        </div>
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={adding}
                        onClick={() => void handleAddProduct(product)}
                      >
                        {adding ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          "Add"
                        )}
                      </Button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
