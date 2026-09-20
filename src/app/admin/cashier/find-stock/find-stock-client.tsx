"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Loader2, Minus, Plus, Search, ShoppingCart, X } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useBranchAccess } from "@/hooks/use-branch-access";
import { useAuthStore } from "@/stores/auth-store";
import { getBranches } from "@/lib/firestore/branches";
import { getAllBranchInventory } from "@/lib/firestore/inventory";
import { getProducts } from "@/lib/firestore/products";
import { createTransferRequests } from "@/lib/firestore/transfer-requests";
import { formatCurrency } from "@/lib/format";
import { resolveVariantPrices } from "@/lib/product-pricing";
import { formatVariantLabel } from "@/lib/product-variants";
import type { Branch, BranchInventory, Product, ProductVariant } from "@/types";

type SearchHit = {
  product: Product;
  variant: ProductVariant;
  label: string;
};

type RequestCartLine = {
  id: string;
  productId: string;
  productName: string;
  variantId: string;
  variantLabel: string;
  fromBranchId: string;
  fromBranchName: string;
  quantity: number;
  maxStock: number;
};

function lineId(fromBranchId: string, variantId: string) {
  return `${fromBranchId}:${variantId}`;
}

function displayHit(hit: SearchHit) {
  return hit.label !== "Default"
    ? `${hit.product.name} — ${hit.label}`
    : hit.product.name;
}

export default function FindStockPage({
  viewOnly = false,
}: {
  viewOnly?: boolean;
}) {
  const searchParams = useSearchParams();
  const user = useAuthStore((s) => s.user);
  const { assignedBranchId, isElevatedAdmin, canViewAllBranches } =
    useBranchAccess();

  const canPickDestination = canViewAllBranches || isElevatedAdmin;

  const [products, setProducts] = useState<Product[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [inventory, setInventory] = useState<BranchInventory[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<SearchHit | null>(null);
  const [qtyByBranch, setQtyByBranch] = useState<Record<string, number>>({});
  const [cart, setCart] = useState<RequestCartLine[]>([]);
  const [cartOpen, setCartOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [toBranchId, setToBranchId] = useState("");

  const prefVariantId = searchParams.get("variantId");
  const prefProductId = searchParams.get("productId");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [productRows, branchRows, invRows] = await Promise.all([
        getProducts(false),
        getBranches(true),
        getAllBranchInventory(),
      ]);
      setProducts(productRows);
      setBranches(branchRows);
      setInventory(invRows);
    } catch (error) {
      console.error(error);
      toast.error("Failed to load products and stock");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (canPickDestination) {
      if (!toBranchId && branches[0]) {
        setToBranchId(assignedBranchId ?? branches[0].id);
      }
      return;
    }
    if (assignedBranchId) setToBranchId(assignedBranchId);
  }, [canPickDestination, assignedBranchId, branches, toBranchId]);

  useEffect(() => {
    if (!toBranchId) return;
    setCart((prev) => prev.filter((line) => line.fromBranchId !== toBranchId));
  }, [toBranchId]);

  const hits = useMemo(() => {
    const q = query.trim().toLowerCase();
    const rows: SearchHit[] = [];
    for (const product of products) {
      for (const variant of product.variants ?? []) {
        const label = formatVariantLabel(variant, product.options ?? []);
        const display =
          label !== "Default"
            ? `${product.name} — ${label}`
            : product.name;
        if (
          q &&
          !display.toLowerCase().includes(q) &&
          !product.name.toLowerCase().includes(q)
        ) {
          continue;
        }
        rows.push({ product, variant, label });
      }
    }
    return rows.slice(0, 40);
  }, [products, query]);

  useEffect(() => {
    if (!prefVariantId && !prefProductId) return;
    if (products.length === 0) return;

    for (const product of products) {
      if (prefProductId && product.id !== prefProductId) continue;
      for (const variant of product.variants ?? []) {
        if (prefVariantId && variant.id !== prefVariantId) continue;
        const label = formatVariantLabel(variant, product.options ?? []);
        const hit = { product, variant, label };
        setSelected(hit);
        setQuery(displayHit(hit));
        return;
      }
    }
  }, [products, prefVariantId, prefProductId]);

  const destinationBranch =
    branches.find((b) => b.id === toBranchId) ?? null;

  const branchStocks = useMemo(() => {
    if (!selected) return [];
    const byBranch = new Map<
      string,
      { stock: number; inventory: BranchInventory | null }
    >();
    for (const row of inventory) {
      if (row.variantId !== selected.variant.id) continue;
      const current = byBranch.get(row.branchId);
      if (current) {
        current.stock += row.stock;
        if (!current.inventory) current.inventory = row;
      } else {
        byBranch.set(row.branchId, { stock: row.stock, inventory: row });
      }
    }
    return branches
      .map((branch) => {
        const row = byBranch.get(branch.id);
        const prices = resolveVariantPrices(
          selected.variant,
          row?.inventory ?? null
        );
        return {
          branch,
          stock: row?.stock ?? 0,
          cashPrice: prices.price,
          retailPrice: prices.retailPrice,
          isDestination: branch.id === toBranchId,
        };
      })
      .sort((a, b) => {
        if (a.isDestination !== b.isDestination) return a.isDestination ? -1 : 1;
        return b.stock - a.stock;
      });
  }, [selected, inventory, branches, toBranchId]);

  const cartCount = cart.reduce((sum, line) => sum + line.quantity, 0);

  const branchSelectLabel = (value: string | null) => {
    if (!value) return null;
    const b = branches.find((row) => row.id === value);
    return b ? `${b.name} (${b.code})` : null;
  };

  const addToCart = (fromBranch: Branch, maxStock: number) => {
    if (!selected || !toBranchId) {
      toast.error("Select a destination branch first");
      return;
    }
    if (fromBranch.id === toBranchId) {
      toast.error("Cannot request from the destination branch");
      return;
    }
    const qty = qtyByBranch[fromBranch.id] ?? 1;
    if (qty <= 0 || qty > maxStock) {
      toast.error(`Enter a quantity between 1 and ${maxStock}`);
      return;
    }

    const id = lineId(fromBranch.id, selected.variant.id);
    setCart((prev) => {
      const existing = prev.find((line) => line.id === id);
      if (existing) {
        const nextQty = Math.min(maxStock, existing.quantity + qty);
        return prev.map((line) =>
          line.id === id
            ? { ...line, quantity: nextQty, maxStock }
            : line
        );
      }
      return [
        ...prev,
        {
          id,
          productId: selected.product.id,
          productName: selected.product.name,
          variantId: selected.variant.id,
          variantLabel: selected.label,
          fromBranchId: fromBranch.id,
          fromBranchName: fromBranch.name,
          quantity: qty,
          maxStock,
        },
      ];
    });
    setQtyByBranch((prev) => ({ ...prev, [fromBranch.id]: 1 }));
    toast.success(`Added to request cart`);
  };

  const setCartQty = (id: string, quantity: number) => {
    setCart((prev) =>
      prev.map((line) => {
        if (line.id !== id) return line;
        return {
          ...line,
          quantity: Math.min(line.maxStock, Math.max(1, quantity)),
        };
      })
    );
  };

  const removeFromCart = (id: string) => {
    setCart((prev) => prev.filter((line) => line.id !== id));
  };

  const handleSubmitCart = async () => {
    if (!user || !destinationBranch) {
      toast.error("Select a destination branch");
      return;
    }
    if (cart.length === 0) {
      toast.error("Add at least one item");
      return;
    }

    setSubmitting(true);
    try {
      await createTransferRequests(
        cart.map((line) => ({
          productId: line.productId,
          productName: line.productName,
          variantId: line.variantId,
          variantLabel: line.variantLabel,
          quantity: line.quantity,
          fromBranchId: line.fromBranchId,
          fromBranchName: line.fromBranchName,
          toBranchId: destinationBranch.id,
          toBranchName: destinationBranch.name,
          requestedBy: user.uid,
          requestedByName: user.displayName,
        }))
      );
      toast.success(
        `Requested ${cart.length} item${cart.length === 1 ? "" : "s"} for ${destinationBranch.name}`
      );
      setCart([]);
      setCartOpen(false);
    } catch (error) {
      console.error(error);
      toast.error(
        error instanceof Error ? error.message : "Failed to create requests"
      );
    } finally {
      setSubmitting(false);
    }
  };

  if (!canPickDestination && !assignedBranchId) {
    return (
      <p className="text-sm text-muted-foreground">
        Your account needs a branch assignment.
      </p>
    );
  }

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div
      className={`mx-auto w-full max-w-lg space-y-6 ${
        !viewOnly && cartCount > 0 ? "pb-24" : ""
      }`}
    >
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Find stock</h1>
        <p className="text-sm text-muted-foreground">
          {viewOnly
            ? "Search a product to see stock levels at every branch"
            : "Search products, add stock from other branches to your request cart, then submit together"}
        </p>
      </div>

      {!viewOnly ? (
        <div className="space-y-1.5">
          <Label>Request to branch</Label>
          {canPickDestination ? (
            <Select
              value={toBranchId}
              onValueChange={(v) => setToBranchId(v ?? "")}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Destination branch">
                  {(value) => branchSelectLabel(value as string | null)}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {branches.map((b) => (
                  <SelectItem key={b.id} value={b.id}>
                    {b.name} ({b.code})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <p className="rounded-md border bg-muted/30 px-3 py-2 text-sm font-medium">
              {destinationBranch
                ? `${destinationBranch.name} (${destinationBranch.code})`
                : "—"}
            </p>
          )}
          <p className="text-xs text-muted-foreground">
            Items you request will be sent to this branch.
          </p>
        </div>
      ) : null}

      <div className="space-y-1.5">
        <Label htmlFor="find-stock-q">Product</Label>
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            id="find-stock-q"
            className="pl-9"
            placeholder="Search by product name…"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelected(null);
            }}
          />
        </div>
      </div>

      {!selected ? (
        <ul className="divide-y rounded-lg border">
          {query.trim() === "" ? (
            <li className="px-3 py-6 text-center text-sm text-muted-foreground">
              Type a product name to search
            </li>
          ) : hits.length === 0 ? (
            <li className="px-3 py-6 text-center text-sm text-muted-foreground">
              No matching products
            </li>
          ) : (
            hits.map((hit) => (
              <li key={hit.variant.id}>
                <button
                  type="button"
                  className="w-full px-3 py-2.5 text-left text-sm hover:bg-muted/50"
                  onClick={() => {
                    setSelected(hit);
                    setQuery(displayHit(hit));
                  }}
                >
                  {displayHit(hit)}
                </button>
              </li>
            ))
          )}
        </ul>
      ) : (
        <div className="space-y-4">
          <div className="flex items-start justify-between gap-2 rounded-lg border p-3">
            <div className="min-w-0">
              <p className="font-medium">{displayHit(selected)}</p>
              <p className="text-xs text-muted-foreground">
                Stock and prices by branch
              </p>
            </div>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => {
                setSelected(null);
                setQuery("");
              }}
            >
              Change
            </Button>
          </div>

          <ul className="space-y-2">
            {branchStocks.map(
              ({ branch, stock, cashPrice, retailPrice, isDestination }) => {
                const inCartQty =
                  cart.find(
                    (line) =>
                      line.id === lineId(branch.id, selected.variant.id)
                  )?.quantity ?? 0;

                return (
                  <li
                    key={branch.id}
                    className="space-y-2 rounded-lg border p-3"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate font-medium">{branch.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {branch.code}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        {isDestination ? (
                          <Badge variant="secondary">Destination</Badge>
                        ) : null}
                        {inCartQty > 0 ? (
                          <Badge variant="outline">{inCartQty} in cart</Badge>
                        ) : null}
                        <span className="tabular-nums font-semibold">
                          {stock}
                        </span>
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      <span className="font-medium text-foreground">
                        Cash {formatCurrency(cashPrice)}
                      </span>
                      {" · "}
                      <span className="font-medium text-foreground">
                        Retail{" "}
                        {retailPrice != null
                          ? formatCurrency(retailPrice)
                          : "—"}
                      </span>
                    </p>

                    {!viewOnly && !isDestination && stock > 0 ? (
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="flex items-center gap-1">
                          <Button
                            type="button"
                            size="icon-sm"
                            variant="outline"
                            onClick={() =>
                              setQtyByBranch((prev) => ({
                                ...prev,
                                [branch.id]: Math.max(
                                  1,
                                  (prev[branch.id] ?? 1) - 1
                                ),
                              }))
                            }
                          >
                            <Minus className="size-3.5" />
                          </Button>
                          <Input
                            className="h-8 w-14 text-center tabular-nums"
                            inputMode="numeric"
                            value={qtyByBranch[branch.id] ?? 1}
                            onChange={(e) => {
                              const n = Number(e.target.value);
                              if (!Number.isFinite(n)) return;
                              setQtyByBranch((prev) => ({
                                ...prev,
                                [branch.id]: Math.min(
                                  stock,
                                  Math.max(1, Math.floor(n))
                                ),
                              }));
                            }}
                          />
                          <Button
                            type="button"
                            size="icon-sm"
                            variant="outline"
                            onClick={() =>
                              setQtyByBranch((prev) => ({
                                ...prev,
                                [branch.id]: Math.min(
                                  stock,
                                  (prev[branch.id] ?? 1) + 1
                                ),
                              }))
                            }
                          >
                            <Plus className="size-3.5" />
                          </Button>
                        </div>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => addToCart(branch, stock)}
                        >
                          Add to cart
                        </Button>
                      </div>
                    ) : null}

                    {!viewOnly && !isDestination && stock <= 0 ? (
                      <p className="text-xs text-muted-foreground">No stock</p>
                    ) : null}

                    {viewOnly && !isDestination && stock <= 0 ? (
                      <p className="text-xs text-muted-foreground">No stock</p>
                    ) : null}
                  </li>
                );
              }
            )}
          </ul>
        </div>
      )}

      {!viewOnly && cartCount > 0 ? (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 p-3 backdrop-blur lg:sticky lg:bottom-0">
          <div className="mx-auto w-full max-w-lg">
            <Button
              type="button"
              className="h-11 w-full"
              onClick={() => setCartOpen(true)}
            >
              <ShoppingCart className="mr-2 size-4" />
              Request cart · {cart.length} line
              {cart.length === 1 ? "" : "s"} · qty {cartCount}
            </Button>
          </div>
        </div>
      ) : null}

      <Sheet open={cartOpen} onOpenChange={setCartOpen}>
        <SheetContent
          side="bottom"
          className="flex h-[min(85dvh,40rem)] flex-col gap-0 p-0 sm:max-w-none"
        >
          <SheetHeader className="border-b px-4 py-3 text-left">
            <SheetTitle>Request cart</SheetTitle>
            <p className="text-sm text-muted-foreground">
              {destinationBranch
                ? `Sending to ${destinationBranch.name}`
                : "Select a destination branch"}
            </p>
          </SheetHeader>

          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
            {cart.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                No items yet.
              </p>
            ) : (
              <ul className="space-y-2">
                {cart.map((line) => {
                  const label =
                    line.variantLabel !== "Default"
                      ? `${line.productName} — ${line.variantLabel}`
                      : line.productName;
                  return (
                    <li
                      key={line.id}
                      className="flex items-start gap-2 rounded-lg border px-2.5 py-2"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium leading-snug">
                          {label}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          From {line.fromBranchName} · max {line.maxStock}
                        </p>
                        <div className="mt-2 flex items-center gap-1">
                          <Button
                            type="button"
                            size="icon-sm"
                            variant="outline"
                            disabled={submitting}
                            onClick={() =>
                              setCartQty(line.id, line.quantity - 1)
                            }
                          >
                            <Minus className="size-3.5" />
                          </Button>
                          <Input
                            className="h-8 w-14 text-center tabular-nums"
                            inputMode="numeric"
                            disabled={submitting}
                            value={line.quantity}
                            onChange={(e) => {
                              const n = Number(e.target.value);
                              if (!Number.isFinite(n)) return;
                              setCartQty(line.id, Math.floor(n));
                            }}
                          />
                          <Button
                            type="button"
                            size="icon-sm"
                            variant="outline"
                            disabled={submitting}
                            onClick={() =>
                              setCartQty(line.id, line.quantity + 1)
                            }
                          >
                            <Plus className="size-3.5" />
                          </Button>
                        </div>
                      </div>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="size-7 shrink-0"
                        disabled={submitting}
                        aria-label={`Remove ${label}`}
                        onClick={() => removeFromCart(line.id)}
                      >
                        <X className="size-3.5" />
                      </Button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div className="space-y-2 border-t p-4">
            {canPickDestination ? (
              <div className="space-y-1.5">
                <Label>Destination</Label>
                <Select
                  value={toBranchId}
                  onValueChange={(v) => setToBranchId(v ?? "")}
                  disabled={submitting}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Destination branch">
                      {(value) => branchSelectLabel(value as string | null)}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {branches.map((b) => (
                      <SelectItem key={b.id} value={b.id}>
                        {b.name} ({b.code})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : null}
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                className="flex-1"
                disabled={submitting || cart.length === 0}
                onClick={() => setCart([])}
              >
                Clear
              </Button>
              <Button
                type="button"
                className="flex-1"
                disabled={
                  submitting || cart.length === 0 || !destinationBranch
                }
                onClick={() => void handleSubmitCart()}
              >
                {submitting ? (
                  <Loader2 className="mr-2 size-4 animate-spin" />
                ) : null}
                Submit {cart.length} request
                {cart.length === 1 ? "" : "s"}
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
