"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, Search, ShoppingCart } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
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
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  PosCartPanel,
  PosCheckoutDialog,
  emptyPosCustomerDraft,
  normalizePosCustomer,
  type PosCartLine,
  type PosCheckoutStep,
  type PosCustomerDraft,
} from "@/components/admin/pos-cart";
import { useBranchAccess } from "@/hooks/use-branch-access";
import { useAuthStore } from "@/stores/auth-store";
import { getBranches } from "@/lib/firestore/branches";
import { getCategories } from "@/lib/firestore/categories";
import { getBranchInventory } from "@/lib/firestore/inventory";
import {
  getProductsByCategoryId,
  setVariantRetailPrices,
} from "@/lib/firestore/products";
import { completePosSale } from "@/lib/firestore/pos-sales";
import { getResellers } from "@/lib/firestore/resellers";
import {
  getActiveVouchersForReseller,
  getVoucherByCode,
  isVoucherRedeemable,
} from "@/lib/firestore/vouchers";
import { mergeSellingVariantsWithInventory } from "@/lib/inventory";
import { isProductPublished } from "@/lib/products-catalog";
import { getCatalogImageUrl, showCatalogImages } from "@/lib/products";
import { formatVariantLabel } from "@/lib/product-variants";
import {
  normalizeRetailPrice,
  unitPriceForPaymentMethod,
} from "@/lib/product-pricing";
import { formatCurrency } from "@/lib/format";
import { useAppSettings } from "@/hooks/use-app-settings";
import type {
  Branch,
  BranchInventory,
  Category,
  PosPaymentMethod,
  Product,
  Reseller,
  Voucher,
} from "@/types";
import type { VariantWithStock } from "@/lib/inventory";

function resolveUnitPrice(
  cashPrice: number,
  retailPrice: number | null,
  method: PosPaymentMethod
): number {
  if (method === "cash") return cashPrice;
  return normalizeRetailPrice(retailPrice) ?? 0;
}

export default function AdminPosPage() {
  const { isElevatedAdmin, assignedBranchId } = useBranchAccess();
  const { catalogImageSource } = useAppSettings();
  const user = useAuthStore((s) => s.user);

  const [branches, setBranches] = useState<Branch[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedBranchId, setSelectedBranchId] = useState("");
  const [inventory, setInventory] = useState<BranchInventory[]>([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState("");
  const [categoryCache, setCategoryCache] = useState<Record<string, Product[]>>(
    {}
  );
  const [loadingBootstrap, setLoadingBootstrap] = useState(true);
  const [loadingCategory, setLoadingCategory] = useState(false);
  const [categorySearch, setCategorySearch] = useState("");
  const [search, setSearch] = useState("");
  const [cart, setCart] = useState<PosCartLine[]>([]);
  const [paymentMethod, setPaymentMethod] =
    useState<PosPaymentMethod>("cash");
  const [customer, setCustomer] = useState<PosCustomerDraft>(emptyPosCustomerDraft);
  const [resellers, setResellers] = useState<Reseller[]>([]);
  const [selectedResellerId, setSelectedResellerId] = useState<string | null>(
    null
  );
  const [resellerVouchers, setResellerVouchers] = useState<Voucher[]>([]);
  const [appliedVoucher, setAppliedVoucher] = useState<Voucher | null>(null);
  const [voucherCodeInput, setVoucherCodeInput] = useState("");
  const [mobileCartOpen, setMobileCartOpen] = useState(false);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [checkoutStep, setCheckoutStep] =
    useState<PosCheckoutStep>("details");
  const [charging, setCharging] = useState(false);

  const activeBranchId = isElevatedAdmin
    ? selectedBranchId
    : assignedBranchId ?? "";

  const activeBranch = branches.find((b) => b.id === activeBranchId);

  useEffect(() => {
    async function bootstrap() {
      try {
        const [branchList, cats, resellerList] = await Promise.all([
          getBranches(true),
          getCategories(),
          getResellers(true),
        ]);
        setBranches(branchList);
        setResellers(resellerList);
        const activeCats = cats.filter((c) => !c.isArchived);
        setCategories(activeCats);

        const initialBranch = isElevatedAdmin
          ? branchList[0]?.id ?? ""
          : assignedBranchId ?? branchList[0]?.id ?? "";
        setSelectedBranchId(initialBranch);

        if (activeCats.length > 0) {
          setSelectedCategoryId(activeCats[0].id);
        }
      } catch (err) {
        console.error(err);
        toast.error("Failed to load POS");
      } finally {
        setLoadingBootstrap(false);
      }
    }

    bootstrap();
  }, [isElevatedAdmin, assignedBranchId]);

  useEffect(() => {
    if (!activeBranchId) {
      setInventory([]);
      return;
    }

    getBranchInventory(activeBranchId)
      .then(setInventory)
      .catch((err) => {
        console.error(err);
        toast.error("Failed to load branch stock");
      });

    setCategoryCache({});
    setCart([]);
    setPaymentMethod("cash");
    setCustomer(emptyPosCustomerDraft());
    setSelectedResellerId(null);
    setResellerVouchers([]);
    setAppliedVoucher(null);
    setVoucherCodeInput("");
  }, [activeBranchId]);

  const resetSaleExtras = () => {
    setCustomer(emptyPosCustomerDraft());
    setSelectedResellerId(null);
    setResellerVouchers([]);
    setAppliedVoucher(null);
    setVoucherCodeInput("");
    setPaymentMethod("cash");
  };

  const loadCategory = useCallback(
    async (categoryId: string) => {
      if (!categoryId || categoryCache[categoryId]) return;
      setLoadingCategory(true);
      try {
        const products = await getProductsByCategoryId(categoryId, false);
        setCategoryCache((prev) => ({
          ...prev,
          [categoryId]: products.filter((p) => isProductPublished(p)),
        }));
      } catch (err) {
        console.error(err);
        toast.error("Failed to load category products");
      } finally {
        setLoadingCategory(false);
      }
    },
    [categoryCache]
  );

  useEffect(() => {
    if (!selectedCategoryId) return;
    loadCategory(selectedCategoryId).catch(console.error);
  }, [selectedCategoryId, loadCategory]);

  const categoryProducts = categoryCache[selectedCategoryId] ?? [];

  const filteredCategories = useMemo(() => {
    const q = categorySearch.trim().toLowerCase();
    if (!q) return categories;
    return categories.filter(
      (category) =>
        category.name.toLowerCase().includes(q) ||
        category.tags.some((tag) => tag.toLowerCase().includes(q))
    );
  }, [categories, categorySearch]);

  const sellingVariants = useMemo(
    () => mergeSellingVariantsWithInventory(categoryProducts, inventory),
    [categoryProducts, inventory]
  );

  const filteredVariants = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return sellingVariants;
    return sellingVariants.filter((row) => {
      const product = categoryProducts.find((p) => p.id === row.productId);
      const label = formatVariantLabel(row, product?.options ?? []);
      return (
        row.productName.toLowerCase().includes(q) ||
        row.sku.toLowerCase().includes(q) ||
        label.toLowerCase().includes(q)
      );
    });
  }, [sellingVariants, search, categoryProducts]);

  const cartCount = cart.reduce((sum, line) => sum + line.quantity, 0);

  const selectedReseller =
    resellers.find((r) => r.id === selectedResellerId) ?? null;

  const handleResellerChange = async (resellerId: string | null) => {
    setSelectedResellerId(resellerId);
    setAppliedVoucher(null);
    setVoucherCodeInput("");
    setResellerVouchers([]);

    if (!resellerId) return;

    const reseller = resellers.find((r) => r.id === resellerId);
    if (reseller) {
      setCustomer({
        name: reseller.name,
        mobile: reseller.mobile ?? "",
        email: reseller.email ?? "",
        address: reseller.address ?? "",
      });
    }

    try {
      const vouchers = await getActiveVouchersForReseller(resellerId);
      setResellerVouchers(vouchers);
    } catch (err) {
      console.error(err);
      toast.error("Failed to load reseller vouchers");
    }
  };

  const handleApplyVoucherId = (voucherId: string | null) => {
    if (!voucherId) {
      setAppliedVoucher(null);
      return;
    }
    const voucher =
      resellerVouchers.find((v) => v.id === voucherId) ??
      (appliedVoucher?.id === voucherId ? appliedVoucher : null);
    if (!voucher || !isVoucherRedeemable(voucher)) {
      toast.error("Voucher is not redeemable");
      return;
    }
    setAppliedVoucher(voucher);
  };

  const handleApplyVoucherCode = async () => {
    const code = voucherCodeInput.trim();
    if (!code) return;
    try {
      const voucher = await getVoucherByCode(code);
      if (!voucher || !isVoucherRedeemable(voucher)) {
        toast.error("Invalid or unusable voucher");
        return;
      }

      // Reseller-linked voucher cannot be used for a different selected reseller.
      if (
        selectedResellerId &&
        voucher.resellerId &&
        voucher.resellerId !== selectedResellerId
      ) {
        toast.error("Voucher belongs to a different reseller");
        return;
      }

      // Auto-select reseller only when the voucher is linked and none is selected.
      if (!selectedResellerId && voucher.resellerId) {
        const reseller = resellers.find((r) => r.id === voucher.resellerId);
        if (reseller) {
          setSelectedResellerId(reseller.id);
          setCustomer({
            name: reseller.name,
            mobile: reseller.mobile ?? "",
            email: reseller.email ?? "",
            address: reseller.address ?? "",
          });
          const vouchers = await getActiveVouchersForReseller(reseller.id);
          setResellerVouchers(vouchers);
        } else {
          setSelectedResellerId(voucher.resellerId);
          setCustomer((prev) => ({
            ...prev,
            name: voucher.resellerName || prev.name,
          }));
          setResellerVouchers([voucher]);
        }
      }

      setAppliedVoucher(voucher);
      setVoucherCodeInput("");
      toast.success(`Applied ${voucher.code}`);
    } catch (err) {
      console.error(err);
      toast.error("Failed to look up voucher");
    }
  };

  const stockForVariant = (variantId: string) =>
    inventory.find((row) => row.variantId === variantId)?.stock ??
    sellingVariants.find((row) => row.id === variantId)?.stock ??
    0;

  const addVariant = (row: VariantWithStock) => {
    const stock = stockForVariant(row.id);
    if (stock <= 0) {
      toast.error("Out of stock");
      return;
    }

    const product = categoryProducts.find((p) => p.id === row.productId);
    const variantLabel = formatVariantLabel(row, product?.options ?? []);
    const retailPrice = normalizeRetailPrice(row.retailPrice);

    setCart((prev) => {
      const existing = prev.find((line) => line.variantId === row.id);
      if (existing) {
        if (existing.quantity >= stock) {
          toast.error("Not enough stock");
          return prev;
        }
        return prev.map((line) =>
          line.variantId === row.id
            ? {
                ...line,
                quantity: line.quantity + 1,
                maxStock: stock,
              }
            : line
        );
      }

      return [
        ...prev,
        {
          productId: row.productId,
          variantId: row.id,
          productName: row.productName,
          variantLabel,
          cashPrice: row.price,
          retailPrice,
          retailFromCatalog: retailPrice != null,
          unitPrice: resolveUnitPrice(row.price, retailPrice, paymentMethod),
          quantity: 1,
          maxStock: stock,
        },
      ];
    });
  };

  const applyPaymentMethod = (method: PosPaymentMethod) => {
    setPaymentMethod(method);
    setCart((prev) =>
      prev.map((line) => ({
        ...line,
        unitPrice: resolveUnitPrice(line.cashPrice, line.retailPrice, method),
      }))
    );
  };

  const setLineRetailPrice = (
    variantId: string,
    retailPrice: number | null
  ) => {
    const normalized = normalizeRetailPrice(retailPrice);
    setCart((prev) =>
      prev.map((line) =>
        line.variantId === variantId
          ? {
              ...line,
              retailPrice: normalized,
              unitPrice: resolveUnitPrice(
                line.cashPrice,
                normalized,
                paymentMethod
              ),
            }
          : line
      )
    );
  };

  const incrementLine = (variantId: string) => {
    setCart((prev) =>
      prev.map((line) => {
        if (line.variantId !== variantId) return line;
        const stock = stockForVariant(variantId);
        if (line.quantity >= stock) {
          toast.error("Not enough stock");
          return line;
        }
        return { ...line, quantity: line.quantity + 1, maxStock: stock };
      })
    );
  };

  const decrementLine = (variantId: string) => {
    setCart((prev) =>
      prev.map((line) =>
        line.variantId === variantId
          ? { ...line, quantity: Math.max(1, line.quantity - 1) }
          : line
      )
    );
  };

  const removeLine = (variantId: string) => {
    setCart((prev) => prev.filter((line) => line.variantId !== variantId));
  };

  const clearCart = () => {
    setCart([]);
    resetSaleExtras();
  };

  const missingRetailLines =
    paymentMethod === "retail"
      ? cart.filter((line) => line.retailPrice == null || line.retailPrice <= 0)
      : [];

  const handleCharge = async () => {
    if (!user || !activeBranch || cart.length === 0) return;
    if (missingRetailLines.length > 0) {
      toast.error("Enter retail price for every item");
      return;
    }

    setCharging(true);
    try {
      const retailToPersist = cart
        .filter(
          (line) =>
            !line.retailFromCatalog &&
            line.retailPrice != null &&
            line.retailPrice > 0
        )
        .map((line) => ({
          productId: line.productId,
          variantId: line.variantId,
          retailPrice: line.retailPrice as number,
        }));

      if (retailToPersist.length > 0) {
        await setVariantRetailPrices(retailToPersist);
        setCategoryCache({});
      }

      await completePosSale({
        branchId: activeBranch.id,
        branchName: activeBranch.name,
        paymentMethod,
        customer: normalizePosCustomer(customer),
        resellerId: selectedResellerId,
        resellerName:
          selectedReseller?.name ??
          (appliedVoucher?.resellerId ? appliedVoucher.resellerName : null) ??
          null,
        voucherId: appliedVoucher?.id ?? null,
        items: cart.map((line) => ({
          productId: line.productId,
          variantId: line.variantId,
          productName:
            line.variantLabel && line.variantLabel !== "Default"
              ? `${line.productName} — ${line.variantLabel}`
              : line.productName,
          quantity: line.quantity,
          unitPrice: line.unitPrice,
          lineTotal: line.unitPrice * line.quantity,
        })),
        createdBy: user.uid,
        createdByName: user.displayName ?? user.email,
      });

      toast.success("Sale completed");
      setCart([]);
      resetSaleExtras();
      setCheckoutOpen(false);
      setCheckoutStep("details");
      setMobileCartOpen(false);

      const inv = await getBranchInventory(activeBranch.id);
      setInventory(inv);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Sale failed");
    } finally {
      setCharging(false);
    }
  };

  const branchSelectLabel = (value: string | null) => {
    if (!value) return null;
    const branch = branches.find((b) => b.id === value);
    return branch ? `${branch.name} (${branch.code})` : null;
  };

  if (loadingBootstrap) {
    return (
      <p className="text-muted-foreground">Loading point of sale...</p>
    );
  }

  if (branches.length === 0) {
    return (
      <p className="text-muted-foreground">
        Create a branch before using POS.
      </p>
    );
  }

  if (categories.length === 0) {
    return (
      <p className="text-muted-foreground">
        Add categories and assign products before using POS.
      </p>
    );
  }

  const openCheckout = () => {
    if (cart.length === 0) return;
    setCheckoutStep("details");
    setCheckoutOpen(true);
    setMobileCartOpen(false);
  };

  const cartPanel = (
    <PosCartPanel
      lines={cart}
      charging={charging}
      onIncrement={incrementLine}
      onDecrement={decrementLine}
      onRemove={removeLine}
      onClear={clearCart}
      onContinue={openCheckout}
      className="h-full"
    />
  );

  return (
    <div className="-m-4 flex h-[calc(100dvh-3.5rem-4rem)] flex-col md:-m-6 lg:h-[calc(100dvh-4rem)]">
      <div className="flex flex-col gap-3 border-b bg-background px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold">Point of sale</h1>
          <p className="text-sm text-muted-foreground">
            {activeBranch?.name ?? "Select a branch"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isElevatedAdmin && (
            <Select
              value={selectedBranchId}
              onValueChange={(v) => setSelectedBranchId(v ?? "")}
            >
              <SelectTrigger className="w-full sm:w-56">
                <SelectValue placeholder="Select branch">
                  {(value) => branchSelectLabel(value as string | null)}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {branches.map((branch) => (
                  <SelectItem key={branch.id} value={branch.id}>
                    {branch.name} ({branch.code})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Button
            type="button"
            variant="outline"
            className="relative lg:hidden"
            onClick={() => setMobileCartOpen(true)}
          >
            <ShoppingCart className="h-4 w-4" />
            {cartCount > 0 ? (
              <Badge className="absolute -top-2 -right-2 h-5 min-w-5 px-1">
                {cartCount}
              </Badge>
            ) : null}
          </Button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1">
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <div className="space-y-3 border-b px-4 py-3">
            <div className="relative max-w-md">
              <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search categories..."
                value={categorySearch}
                onChange={(e) => setCategorySearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <div className="flex gap-2 overflow-x-auto pb-1">
              {filteredCategories.length === 0 ? (
                <p className="py-1 text-sm text-muted-foreground">
                  No categories match “{categorySearch.trim()}”.
                </p>
              ) : (
                filteredCategories.map((category) => {
                  const active = category.id === selectedCategoryId;
                  return (
                    <Button
                      key={category.id}
                      type="button"
                      size="sm"
                      variant={active ? "default" : "outline"}
                      className="shrink-0"
                      onClick={() => {
                        setSelectedCategoryId(category.id);
                        setSearch("");
                      }}
                    >
                      {category.name}
                    </Button>
                  );
                })
              )}
            </div>
            <div className="relative max-w-md">
              <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search in this category..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-4 pb-40 lg:pb-4">
            {loadingCategory && !categoryCache[selectedCategoryId] ? (
              <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin" />
                Loading products...
              </div>
            ) : filteredVariants.length === 0 ? (
              <p className="py-16 text-center text-muted-foreground">
                No selling variants in this category for the selected branch.
              </p>
            ) : (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
                {filteredVariants.map((row) => {
                  const product = categoryProducts.find(
                    (p) => p.id === row.productId
                  );
                  const thumb =
                    product && showCatalogImages(catalogImageSource)
                      ? getCatalogImageUrl(product, row, catalogImageSource)
                      : null;
                  const variantLabel = formatVariantLabel(
                    row,
                    product?.options ?? []
                  );
                  const outOfStock = row.stock <= 0;
                  const inCart =
                    cart.find((line) => line.variantId === row.id)?.quantity ??
                    0;

                  return (
                    <button
                      key={row.id}
                      type="button"
                      disabled={outOfStock}
                      onClick={() => addVariant(row)}
                      className="flex min-h-[140px] flex-col overflow-hidden rounded-xl border bg-card text-left transition hover:border-primary/40 hover:shadow-sm disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {showCatalogImages(catalogImageSource) ? (
                        <div className="aspect-[4/3] w-full bg-muted">
                          {thumb ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={thumb}
                              alt=""
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
                              No image
                            </div>
                          )}
                        </div>
                      ) : null}
                      <div className="flex flex-1 flex-col gap-1 p-3">
                        <p className="line-clamp-2 text-sm font-medium leading-snug">
                          {row.productName}
                        </p>
                        {variantLabel !== "Default" ? (
                          <p className="line-clamp-1 text-xs text-muted-foreground">
                            {variantLabel}
                          </p>
                        ) : null}
                        <div className="mt-auto flex items-end justify-between gap-2 pt-2">
                          <span className="text-sm font-semibold tabular-nums">
                            {(() => {
                              const display = unitPriceForPaymentMethod(
                                row,
                                paymentMethod
                              );
                              if (display != null) {
                                return formatCurrency(display);
                              }
                              return paymentMethod === "retail"
                                ? "Set retail"
                                : formatCurrency(row.price);
                            })()}
                          </span>
                          <Badge
                            variant={outOfStock ? "outline" : "secondary"}
                            className="text-xs"
                          >
                            {outOfStock
                              ? "Out"
                              : inCart > 0
                                ? `${row.stock} · ${inCart}`
                                : `${row.stock}`}
                          </Badge>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <aside className="hidden w-[360px] shrink-0 border-l lg:block xl:w-[400px]">
          {cartPanel}
        </aside>
      </div>

      {cartCount > 0 && (
        <div
          className="fixed inset-x-0 z-40 border-t bg-background p-3 lg:hidden"
          style={{
            bottom: "calc(4rem + env(safe-area-inset-bottom))",
          }}
        >
          <Button
            type="button"
            className="h-12 w-full text-base"
            onClick={() => setMobileCartOpen(true)}
          >
            Cart · {cartCount} ·{" "}
            {formatCurrency(
              cart.reduce((sum, line) => sum + line.cashPrice * line.quantity, 0)
            )}
          </Button>
        </div>
      )}

      <Sheet open={mobileCartOpen} onOpenChange={setMobileCartOpen}>
        <SheetContent
          side="bottom"
          className="flex h-[85dvh] flex-col gap-0 p-0 sm:max-w-none"
          showCloseButton
        >
          <SheetHeader className="sr-only">
            <SheetTitle>Current sale</SheetTitle>
          </SheetHeader>
          {cartPanel}
        </SheetContent>
      </Sheet>

      <PosCheckoutDialog
        open={checkoutOpen}
        onOpenChange={(open) => {
          setCheckoutOpen(open);
          if (!open) setCheckoutStep("details");
        }}
        step={checkoutStep}
        onStepChange={setCheckoutStep}
        lines={cart}
        branchName={activeBranch?.name ?? ""}
        paymentMethod={paymentMethod}
        customer={customer}
        resellers={resellers}
        selectedResellerId={selectedResellerId}
        resellerVouchers={resellerVouchers}
        appliedVoucher={appliedVoucher}
        voucherCodeInput={voucherCodeInput}
        charging={charging}
        onPaymentMethodChange={applyPaymentMethod}
        onResellerChange={(id) => {
          handleResellerChange(id).catch(console.error);
        }}
        onApplyVoucherId={handleApplyVoucherId}
        onVoucherCodeInputChange={setVoucherCodeInput}
        onApplyVoucherCode={() => {
          handleApplyVoucherCode().catch(console.error);
        }}
        onCustomerChange={(patch) =>
          setCustomer((prev) => ({ ...prev, ...patch }))
        }
        onRetailPriceChange={setLineRetailPrice}
        onConfirmCharge={() => {
          if (missingRetailLines.length > 0) {
            toast.error("Enter retail price for every item");
            setCheckoutStep("details");
            return;
          }
          handleCharge().catch(console.error);
        }}
      />
    </div>
  );
}
