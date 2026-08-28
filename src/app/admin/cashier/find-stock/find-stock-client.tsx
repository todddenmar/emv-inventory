"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Loader2, Minus, Plus, Search } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useBranchAccess } from "@/hooks/use-branch-access";
import { useAuthStore } from "@/stores/auth-store";
import { getBranches } from "@/lib/firestore/branches";
import { getAllBranchInventory } from "@/lib/firestore/inventory";
import { getProducts } from "@/lib/firestore/products";
import { createTransferRequest } from "@/lib/firestore/transfer-requests";
import { formatVariantLabel } from "@/lib/product-variants";
import type { Branch, BranchInventory, Product, ProductVariant } from "@/types";

type SearchHit = {
  product: Product;
  variant: ProductVariant;
  label: string;
};

export default function FindStockPage() {
  const searchParams = useSearchParams();
  const user = useAuthStore((s) => s.user);
  const { assignedBranchId } = useBranchAccess();

  const [products, setProducts] = useState<Product[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [inventory, setInventory] = useState<BranchInventory[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<SearchHit | null>(null);
  const [qtyByBranch, setQtyByBranch] = useState<Record<string, number>>({});
  const [requestingBranchId, setRequestingBranchId] = useState<string | null>(
    null
  );

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
        setSelected({ product, variant, label });
        setQuery(
          label !== "Default" ? `${product.name} — ${label}` : product.name
        );
        return;
      }
    }
  }, [products, prefVariantId, prefProductId]);

  const branchStocks = useMemo(() => {
    if (!selected) return [];
    const byBranch = new Map<string, number>();
    for (const row of inventory) {
      if (row.variantId !== selected.variant.id) continue;
      byBranch.set(row.branchId, (byBranch.get(row.branchId) ?? 0) + row.stock);
    }
    return branches
      .map((branch) => ({
        branch,
        stock: byBranch.get(branch.id) ?? 0,
        isMine: branch.id === assignedBranchId,
      }))
      .sort((a, b) => {
        if (a.isMine !== b.isMine) return a.isMine ? -1 : 1;
        return b.stock - a.stock;
      });
  }, [selected, inventory, branches, assignedBranchId]);

  const myBranch = branches.find((b) => b.id === assignedBranchId) ?? null;

  const handleRequest = async (fromBranch: Branch, maxStock: number) => {
    if (!user || !assignedBranchId || !myBranch || !selected) return;
    const qty = qtyByBranch[fromBranch.id] ?? 1;
    if (qty <= 0 || qty > maxStock) {
      toast.error(`Enter a quantity between 1 and ${maxStock}`);
      return;
    }

    setRequestingBranchId(fromBranch.id);
    try {
      await createTransferRequest({
        productId: selected.product.id,
        productName: selected.product.name,
        variantId: selected.variant.id,
        variantLabel: selected.label,
        quantity: qty,
        fromBranchId: fromBranch.id,
        fromBranchName: fromBranch.name,
        toBranchId: myBranch.id,
        toBranchName: myBranch.name,
        requestedBy: user.uid,
        requestedByName: user.displayName,
      });
      toast.success(`Requested ${qty} from ${fromBranch.name}`);
      setQtyByBranch((prev) => ({ ...prev, [fromBranch.id]: 1 }));
    } catch (error) {
      console.error(error);
      toast.error(
        error instanceof Error ? error.message : "Failed to create request"
      );
    } finally {
      setRequestingBranchId(null);
    }
  };

  if (!assignedBranchId) {
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
    <div className="mx-auto w-full max-w-lg space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Find stock</h1>
        <p className="text-sm text-muted-foreground">
          Search a product and request a transfer from another branch
        </p>
      </div>

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
            hits.map((hit) => {
              const display =
                hit.label !== "Default"
                  ? `${hit.product.name} — ${hit.label}`
                  : hit.product.name;
              return (
                <li key={hit.variant.id}>
                  <button
                    type="button"
                    className="w-full px-3 py-2.5 text-left text-sm hover:bg-muted/50"
                    onClick={() => {
                      setSelected(hit);
                      setQuery(display);
                    }}
                  >
                    {display}
                  </button>
                </li>
              );
            })
          )}
        </ul>
      ) : (
        <div className="space-y-4">
          <div className="flex items-start justify-between gap-2 rounded-lg border p-3">
            <div className="min-w-0">
              <p className="font-medium">
                {selected.label !== "Default"
                  ? `${selected.product.name} — ${selected.label}`
                  : selected.product.name}
              </p>
              <p className="text-xs text-muted-foreground">Stock by branch</p>
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
            {branchStocks.map(({ branch, stock, isMine }) => (
              <li key={branch.id} className="space-y-2 rounded-lg border p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{branch.name}</p>
                    <p className="text-xs text-muted-foreground">{branch.code}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {isMine ? (
                      <Badge variant="secondary">Your branch</Badge>
                    ) : null}
                    <span className="tabular-nums font-semibold">{stock}</span>
                  </div>
                </div>

                {!isMine && stock > 0 ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="flex items-center gap-1">
                      <Button
                        type="button"
                        size="icon-sm"
                        variant="outline"
                        disabled={requestingBranchId === branch.id}
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
                        disabled={requestingBranchId === branch.id}
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
                      disabled={requestingBranchId === branch.id}
                      onClick={() => void handleRequest(branch, stock)}
                    >
                      {requestingBranchId === branch.id ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : null}
                      Request transfer
                    </Button>
                  </div>
                ) : null}

                {!isMine && stock <= 0 ? (
                  <p className="text-xs text-muted-foreground">No stock</p>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
