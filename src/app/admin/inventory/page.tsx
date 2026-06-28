"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, Save, AlertTriangle } from "lucide-react";
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
import { Badge } from "@/components/ui/badge";
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
import { getBranches } from "@/lib/firestore/branches";
import {
  getAllBranchInventory,
  getBranchInventory,
  setBranchStockWithLog,
} from "@/lib/firestore/inventory";
import { getProducts } from "@/lib/firestore/products";
import { getProductThumbnailUrl } from "@/lib/products";
import { mergeProductsWithInventory, getLowStockItems } from "@/lib/inventory";
import { useAuthStore } from "@/stores/auth-store";
import type { Branch, BranchInventory, Product } from "@/types";

type StockDraft = Record<string, { stock: number; lowStockThreshold: number }>;

export default function AdminInventoryPage() {
  const { isMasterAdmin, assignedBranchId } = useBranchAccess();
  const user = useAuthStore((s) => s.user);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [inventory, setInventory] = useState<BranchInventory[]>([]);
  const [selectedBranchId, setSelectedBranchId] = useState<string>("");
  const [draft, setDraft] = useState<StockDraft>({});
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const activeBranchId = isMasterAdmin ? selectedBranchId : assignedBranchId ?? "";

  const loadBranches = async () => {
    const all = await getBranches(true);
    setBranches(all);
    if (!selectedBranchId && all.length > 0) {
      setSelectedBranchId(
        isMasterAdmin
          ? all.find((b) => b.isOnlineShop)?.id ?? all[0].id
          : assignedBranchId ?? all[0].id
      );
    }
  };

  const loadInventory = async (branchId: string) => {
    if (!branchId) return;
    const [p, inv] = await Promise.all([
      getProducts(),
      isMasterAdmin && branchId === "all"
        ? getAllBranchInventory()
        : getBranchInventory(branchId),
    ]);
    setProducts(p);
    setInventory(inv);

    if (branchId !== "all") {
      const nextDraft: StockDraft = {};
      for (const product of p) {
        const row = inv.find((i) => i.productId === product.id);
        nextDraft[product.id] = {
          stock: row?.stock ?? 0,
          lowStockThreshold: row?.lowStockThreshold ?? 5,
        };
      }
      setDraft(nextDraft);
    }
  };

  useEffect(() => {
    loadBranches().catch(console.error).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!activeBranchId) return;
    loadInventory(activeBranchId).catch(console.error);
  }, [activeBranchId]);

  const branchInventory = useMemo(() => {
    if (activeBranchId === "all") return inventory;
    return inventory.filter((i) => i.branchId === activeBranchId);
  }, [inventory, activeBranchId]);

  const productsWithStock = useMemo(() => {
    if (activeBranchId === "all") return [];
    return mergeProductsWithInventory(products, branchInventory);
  }, [products, branchInventory, activeBranchId]);

  const filteredProducts = productsWithStock.filter((p) =>
    p.name.toLowerCase().includes(search.toLowerCase())
  );

  const lowStock = getLowStockItems(productsWithStock);
  const activeBranch = branches.find((b) => b.id === activeBranchId);

  const branchSummaries = useMemo(() => {
    if (!isMasterAdmin) return [];
    return branches.map((branch) => {
      const rows = inventory.filter((i) => i.branchId === branch.id);
      const stocked = rows.filter((r) => r.stock > 0).length;
      const low = rows.filter(
        (r) => r.stock > 0 && r.stock <= r.lowStockThreshold
      ).length;
      return { branch, stocked, low, totalSkus: rows.length };
    });
  }, [branches, inventory, isMasterAdmin]);

  const updateDraft = (
    productId: string,
    field: "stock" | "lowStockThreshold",
    value: number
  ) => {
    setDraft((prev) => ({
      ...prev,
      [productId]: {
        ...prev[productId],
        [field]: value,
      },
    }));
  };

  const saveStock = async (productId: string) => {
    if (!activeBranchId || activeBranchId === "all") return;
    const values = draft[productId];
    if (!values) return;

    setSavingId(productId);
    try {
      const product = products.find((p) => p.id === productId);
      await setBranchStockWithLog(
        activeBranchId,
        productId,
        values.stock,
        values.lowStockThreshold,
        {
          productName: product?.name ?? null,
          branchName: activeBranch?.name ?? null,
          performedBy: user?.uid ?? "unknown",
          performedByName: user?.displayName ?? user?.email ?? null,
        }
      );
      toast.success("Stock saved");
      await loadInventory(activeBranchId);
    } catch {
      toast.error("Failed to save stock");
    } finally {
      setSavingId(null);
    }
  };

  if (loading) {
    return <p className="text-muted-foreground">Loading inventory...</p>;
  }

  if (branches.length === 0) {
    return (
      <Card>
        <CardContent className="pt-6">
          <p className="text-muted-foreground">
            Create a branch first before managing inventory.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Inventory</h1>
          <p className="text-muted-foreground">
            {isMasterAdmin
              ? "Stock levels across branches"
              : `Stock for ${activeBranch?.name ?? "your branch"}`}
          </p>
        </div>
        {isMasterAdmin && (
          <Select
            value={selectedBranchId}
            onValueChange={(v) => setSelectedBranchId(v ?? "")}
          >
            <SelectTrigger className="w-full lg:w-64">
              <SelectValue placeholder="Select branch" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All branches (overview)</SelectItem>
              {branches.map((branch) => (
                <SelectItem key={branch.id} value={branch.id}>
                  {branch.name} ({branch.code})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {isMasterAdmin && selectedBranchId === "all" && (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {branchSummaries.map(({ branch, stocked, low, totalSkus }) => (
            <Card
              key={branch.id}
              className="cursor-pointer transition-colors hover:bg-muted/30"
              onClick={() => setSelectedBranchId(branch.id)}
            >
              <CardHeader className="pb-2">
                <CardTitle className="text-base">{branch.name}</CardTitle>
                <CardDescription>{branch.code}</CardDescription>
              </CardHeader>
              <CardContent className="flex gap-4 text-sm">
                <div>
                  <p className="text-muted-foreground">SKUs tracked</p>
                  <p className="text-xl font-semibold">{totalSkus}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">In stock</p>
                  <p className="text-xl font-semibold">{stocked}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Low stock</p>
                  <p className="text-xl font-semibold text-amber-600">{low}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {activeBranchId !== "all" && (
        <>
          {lowStock.length > 0 && (
            <Card className="border-amber-200 bg-amber-50/50 dark:bg-amber-950/20">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base text-amber-800 dark:text-amber-200">
                  <AlertTriangle className="h-4 w-4" />
                  Low stock at {activeBranch?.name}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {lowStock.map((p) => (
                    <Badge key={p.id} variant="outline">
                      {p.name}: {p.stock} left
                    </Badge>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>{activeBranch?.name} stock</CardTitle>
              <CardDescription>
                Set stock per product for this branch
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Input
                placeholder="Search products..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="max-w-md"
              />

              <div className="overflow-x-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Product</TableHead>
                      <TableHead className="w-28">Stock</TableHead>
                      <TableHead className="w-28">Low at</TableHead>
                      <TableHead className="w-24 text-right">Save</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredProducts.map((product) => {
                      const thumb = getProductThumbnailUrl(product);
                      const values = draft[product.id] ?? {
                        stock: 0,
                        lowStockThreshold: 5,
                      };
                      const isLow =
                        values.stock > 0 &&
                        values.stock <= values.lowStockThreshold;

                      return (
                        <TableRow key={product.id}>
                          <TableCell>
                            <div className="flex min-w-[200px] items-center gap-3">
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
                              <div>
                                <p className="font-medium">{product.name}</p>
                                {isLow && (
                                  <Badge
                                    variant="outline"
                                    className="mt-1 text-xs text-amber-700"
                                  >
                                    Low stock
                                  </Badge>
                                )}
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Input
                              type="number"
                              min={0}
                              value={values.stock}
                              onChange={(e) =>
                                updateDraft(
                                  product.id,
                                  "stock",
                                  Number(e.target.value) || 0
                                )
                              }
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              type="number"
                              min={0}
                              value={values.lowStockThreshold}
                              onChange={(e) =>
                                updateDraft(
                                  product.id,
                                  "lowStockThreshold",
                                  Number(e.target.value) || 0
                                )
                              }
                            />
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={savingId === product.id}
                              onClick={() => saveStock(product.id)}
                            >
                              {savingId === product.id ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <Save className="h-4 w-4" />
                              )}
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
