"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Search } from "lucide-react";
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
  emptyPosCustomerDraft,
  type PosCartLine,
  type PosCustomerDraft,
} from "@/components/admin/pos-cart";
import {
  FreebieShortfallDialog,
  type FreebieShortfall,
} from "@/components/admin/freebie-shortfall-dialog";
import {
  VariantSearchDialog,
} from "@/components/admin/variant-search-dialog";
import { useBranchAccess } from "@/hooks/use-branch-access";
import { getBranches } from "@/lib/firestore/branches";
import { getCategories } from "@/lib/firestore/categories";
import { getBranchInventory } from "@/lib/firestore/inventory";
import {
  getProducts,
  getProductsByCategoryId,
} from "@/lib/firestore/products";
import {
  buildActivePromotionPriceMap,
  getActivePricePromotions,
} from "@/lib/firestore/price-promotions";
import {
  mergeSellingVariantsWithInventory,
  type VariantWithStock,
} from "@/lib/inventory";
import { isProductPublished } from "@/lib/products-catalog";
import { getCatalogImageUrl, showCatalogImages } from "@/lib/products";
import { formatVariantLabel } from "@/lib/product-variants";
import {
  normalizeRetailPrice,
  normalizeWholesalePrice,
  resolveEffectivePrices,
  unitPriceForPaymentMethod,
  type EffectiveSalePrices,
} from "@/lib/product-pricing";
import {
  computeDesiredFreebies,
  type DesiredFreebie,
} from "@/lib/pos-freebies";
import {
  clearPosCheckoutDraft,
  loadPosCheckoutDraft,
  posCheckoutPath,
  savePosCheckoutDraft,
} from "@/lib/pos-checkout-draft";
import { formatCurrency } from "@/lib/format";
import { paginateItems } from "@/lib/pagination";
import { TablePagination } from "@/components/admin/table-pagination";
import { useAppSettings } from "@/hooks/use-app-settings";
import type {
  Branch,
  BranchInventory,
  Category,
  PosCustomerType,
  PosPaymentMethod,
  PosSaleChannel,
  PosTenderMethod,
  Product,
  Voucher,
} from "@/types";

const ALL_CATEGORIES_ID = "all";
const POS_PAGE_SIZE = 20;

function resolveUnitPrice(
  cashPrice: number,
  retailPrice: number | null,
  method: PosPaymentMethod
): number {
  if (method === "cash") return cashPrice;
  return normalizeRetailPrice(retailPrice) ?? 0;
}

function resolveWholesaleUnitPrice(
  wholesalePrice: number | null | undefined
): number {
  return normalizeWholesalePrice(wholesalePrice) ?? 0;
}

export function PosWorkspace({
  saleChannel = "shop",
}: {
  saleChannel?: PosSaleChannel;
}) {
  const isWholesale = saleChannel === "wholesale";
  const { isElevatedAdmin, assignedBranchId, isCashier } = useBranchAccess();
  const { catalogImageSource } = useAppSettings();
  const router = useRouter();

  const [branches, setBranches] = useState<Branch[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedBranchId, setSelectedBranchId] = useState("");
  const [inventory, setInventory] = useState<BranchInventory[]>([]);
  const [selectedCategoryId, setSelectedCategoryId] =
    useState(ALL_CATEGORIES_ID);
  const [categoryCache, setCategoryCache] = useState<Record<string, Product[]>>(
    {}
  );
  const [loadingBootstrap, setLoadingBootstrap] = useState(true);
  const [loadingCategory, setLoadingCategory] = useState(false);
  const [categorySearch, setCategorySearch] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [cart, setCart] = useState<PosCartLine[]>([]);
  const productListRef = useRef<HTMLDivElement>(null);
  const [paymentMethod, setPaymentMethod] =
    useState<PosPaymentMethod>("cash");
  const [tenderMethod, setTenderMethod] = useState<PosTenderMethod>("cash");
  const [selectedPaymentAccountId, setSelectedPaymentAccountId] = useState<
    string | null
  >(null);
  const [customerType, setCustomerType] =
    useState<PosCustomerType>("walk_in");
  const [customer, setCustomer] = useState<PosCustomerDraft>(emptyPosCustomerDraft);
  const [appliedVoucher, setAppliedVoucher] = useState<Voucher | null>(null);
  const [voucherCodeInput, setVoucherCodeInput] = useState("");
  const [ignoredFreebieVariantIds, setIgnoredFreebieVariantIds] = useState<
    Set<string>
  >(() => new Set());
  const [resolvedFreebieShortfalls, setResolvedFreebieShortfalls] = useState<
    Set<string>
  >(() => new Set());
  const [alternateFreebies, setAlternateFreebies] = useState<PosCartLine[]>(
    []
  );
  const [freebieShortfall, setFreebieShortfall] =
    useState<FreebieShortfall | null>(null);
  const [freebiePickerOpen, setFreebiePickerOpen] = useState(false);
  const [mobileCartOpen, setMobileCartOpen] = useState(false);
  const [promoMap, setPromoMap] = useState<Map<string, EffectiveSalePrices>>(
    () => new Map()
  );

  const activeBranchId = isElevatedAdmin
    ? selectedBranchId
    : assignedBranchId ?? "";

  const activeBranch = branches.find((b) => b.id === activeBranchId);

  useEffect(() => {
    async function bootstrap() {
      try {
        const [branchListRaw, cats, promotions] = await Promise.all([
          getBranches(true),
          getCategories(),
          getActivePricePromotions(),
        ]);
        const branchList = isWholesale
          ? branchListRaw.filter((b) => b.supportsWholesale)
          : branchListRaw;
        setBranches(branchList);
        setPromoMap(buildActivePromotionPriceMap(promotions));
        const activeCats = cats.filter((c) => !c.isArchived);
        setCategories(activeCats);

        const initialBranch = isElevatedAdmin
          ? branchList[0]?.id ?? ""
          : assignedBranchId &&
              branchList.some((b) => b.id === assignedBranchId)
            ? assignedBranchId
            : branchList[0]?.id ?? "";
        setSelectedBranchId(initialBranch);
        setSelectedCategoryId(ALL_CATEGORIES_ID);
        // Warm all-products cache for freebie alternate picking.
        getProducts(true)
          .then((products) => {
            setCategoryCache((prev) => ({
              ...prev,
              [ALL_CATEGORIES_ID]: products,
            }));
          })
          .catch(console.error);
      } catch (err) {
        console.error(err);
        toast.error(isWholesale ? "Failed to load wholesale POS" : "Failed to load POS");
      } finally {
        setLoadingBootstrap(false);
      }
    }

    bootstrap();
  }, [isElevatedAdmin, assignedBranchId, isWholesale]);

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
    setIgnoredFreebieVariantIds(new Set());
    setResolvedFreebieShortfalls(new Set());
    setAlternateFreebies([]);
    setFreebieShortfall(null);

    const draft = loadPosCheckoutDraft(saleChannel);
    if (draft && draft.branchId === activeBranchId && draft.lines.length > 0) {
      setCart(draft.lines);
      setPaymentMethod(draft.paymentMethod);
      setTenderMethod(draft.tenderMethod);
      setSelectedPaymentAccountId(draft.selectedPaymentAccountId);
      setCustomerType(draft.customerType);
      setCustomer(draft.customer);
      setAppliedVoucher(draft.appliedVoucher);
      setVoucherCodeInput(draft.voucherCodeInput);
    } else {
      setCart([]);
      setPaymentMethod("cash");
      setTenderMethod("cash");
      setSelectedPaymentAccountId(null);
      setCustomerType("walk_in");
      setCustomer(emptyPosCustomerDraft());
      setAppliedVoucher(null);
      setVoucherCodeInput("");
    }
  }, [activeBranchId, saleChannel]);

  const resetSaleExtras = () => {
    setCustomer(emptyPosCustomerDraft());
    setCustomerType("walk_in");
    setAppliedVoucher(null);
    setVoucherCodeInput("");
    setPaymentMethod("cash");
    setTenderMethod("cash");
    setSelectedPaymentAccountId(null);
    setIgnoredFreebieVariantIds(new Set());
    setResolvedFreebieShortfalls(new Set());
    setAlternateFreebies([]);
    setFreebieShortfall(null);
  };

  const loadCategory = useCallback(
    async (categoryId: string) => {
      if (!categoryId || categoryCache[categoryId]) return;
      setLoadingCategory(true);
      try {
        const products =
          categoryId === ALL_CATEGORIES_ID
            ? await getProducts(true)
            : (await getProductsByCategoryId(categoryId, false)).filter((p) =>
                isProductPublished(p)
              );
        setCategoryCache((prev) => ({
          ...prev,
          [categoryId]: products,
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

  useEffect(() => {
    setPage(1);
  }, [selectedCategoryId, search, activeBranchId]);

  const {
    page: safePage,
    totalPages,
    pagedItems: pagedVariants,
    total,
  } = useMemo(
    () => paginateItems(filteredVariants, page, POS_PAGE_SIZE),
    [filteredVariants, page]
  );

  useEffect(() => {
    if (page !== safePage) setPage(safePage);
  }, [page, safePage]);

  useEffect(() => {
    productListRef.current?.scrollTo({ top: 0 });
  }, [safePage, selectedCategoryId, search]);

  const cartCount = cart.reduce((sum, line) => sum + line.quantity, 0);

  const catalogProducts = categoryCache[ALL_CATEGORIES_ID] ?? categoryProducts;

  const productCategoryIds = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const product of catalogProducts) {
      map.set(product.id, product.categoryIds ?? []);
    }
    for (const products of Object.values(categoryCache)) {
      for (const product of products) {
        if (!map.has(product.id)) {
          map.set(product.id, product.categoryIds ?? []);
        }
      }
    }
    for (const row of sellingVariants) {
      if (!map.has(row.productId)) {
        map.set(row.productId, row.categoryIds ?? []);
      }
    }
    return map;
  }, [catalogProducts, categoryCache, sellingVariants]);

  const allBranchVariants = useMemo(
    () =>
      mergeSellingVariantsWithInventory(
        catalogProducts.length > 0 ? catalogProducts : categoryProducts,
        inventory,
        categories
      ),
    [catalogProducts, categoryProducts, inventory, categories]
  );

  const stockForVariant = (variantId: string) =>
    inventory.find((row) => row.variantId === variantId)?.stock ??
    allBranchVariants.find((row) => row.id === variantId)?.stock ??
    sellingVariants.find((row) => row.id === variantId)?.stock ??
    0;

  const buildFreebieLine = (
    desired: DesiredFreebie,
    quantity: number
  ): PosCartLine => {
    const stock = stockForVariant(desired.variantId);
    return {
      productId: desired.productId,
      variantId: desired.variantId,
      productName: desired.productName,
      variantLabel: desired.variantLabel,
      cashPrice: 0,
      retailPrice: 0,
      retailFromCatalog: true,
      unitPrice: 0,
      quantity,
      maxStock: stock,
      isFreebie: true,
      freebieSourceCategoryIds: desired.sourceCategoryIds,
    };
  };

  const mergePaidWithFreebies = (
    paidLines: PosCartLine[],
    ignored: Set<string> = ignoredFreebieVariantIds,
    resolved: Set<string> = resolvedFreebieShortfalls,
    alternates: PosCartLine[] = alternateFreebies
  ): { nextCart: PosCartLine[]; shortfalls: FreebieShortfall[] } => {
    const desired = computeDesiredFreebies(
      categories,
      paidLines,
      productCategoryIds,
      ignored
    );
    const shortfalls: FreebieShortfall[] = [];
    const freebieLines: PosCartLine[] = [];

    for (const item of desired) {
      const stock = stockForVariant(item.variantId);
      const paidSame = paidLines
        .filter((l) => l.variantId === item.variantId)
        .reduce((sum, l) => sum + l.quantity, 0);
      const availableForFreebie = Math.max(0, stock - paidSame);
      const qty = Math.min(item.quantity, availableForFreebie);
      if (qty < item.quantity && !resolved.has(item.variantId)) {
        shortfalls.push({
          productId: item.productId,
          variantId: item.variantId,
          productName: item.productName,
          variantLabel: item.variantLabel,
          sourceCategoryIds: item.sourceCategoryIds,
          needed: item.quantity,
          available: availableForFreebie,
        });
      }
      if (qty > 0) {
        freebieLines.push(buildFreebieLine(item, qty));
      }
    }

    const alternateLines: PosCartLine[] = [];
    for (const line of alternates) {
      const stock = stockForVariant(line.variantId);
      const paidSame = paidLines
        .filter((l) => l.variantId === line.variantId)
        .reduce((sum, l) => sum + l.quantity, 0);
      const alreadyFree = freebieLines
        .filter((l) => l.variantId === line.variantId)
        .reduce((sum, l) => sum + l.quantity, 0);
      const maxQty = Math.max(0, stock - paidSame - alreadyFree);
      const quantity = Math.min(line.quantity, maxQty);
      if (quantity <= 0) continue;
      alternateLines.push({
        ...line,
        quantity,
        maxStock: stock,
        cashPrice: 0,
        retailPrice: 0,
        unitPrice: 0,
        isFreebie: true,
      });
    }

    return {
      nextCart: [...paidLines, ...freebieLines, ...alternateLines],
      shortfalls,
    };
  };

  const applyCartWithFreebies = (
    paidLines: PosCartLine[],
    ignored: Set<string> = ignoredFreebieVariantIds,
    resolved: Set<string> = resolvedFreebieShortfalls,
    alternates: PosCartLine[] = alternateFreebies
  ) => {
    const { nextCart, shortfalls } = mergePaidWithFreebies(
      paidLines,
      ignored,
      resolved,
      alternates
    );
    setCart(nextCart);
    if (shortfalls.length > 0) {
      setFreebieShortfall((current) => current ?? shortfalls[0]);
    }
  };

  const addVariant = (row: VariantWithStock) => {
    const stock = stockForVariant(row.id);
    if (stock <= 0) {
      toast.error("Out of stock");
      return;
    }

    const product = categoryProducts.find((p) => p.id === row.productId);
    const variantLabel = formatVariantLabel(row, product?.options ?? []);
    const effective = resolveEffectivePrices(row, promoMap, row.id);
    const retailPrice = effective.retailPrice;

    setCart((prev) => {
      const paid = prev.filter((line) => !line.isFreebie);
      const existing = paid.find((line) => line.variantId === row.id);
      let nextPaid: PosCartLine[];
      if (existing) {
        if (existing.quantity >= stock) {
          toast.error("Not enough stock");
          return prev;
        }
        nextPaid = paid.map((line) =>
          line.variantId === row.id
            ? {
                ...line,
                quantity: line.quantity + 1,
                maxStock: stock,
              }
            : line
        );
      } else {
        nextPaid = [
          ...paid,
          {
            productId: row.productId,
            variantId: row.id,
            productName: row.productName,
            variantLabel,
            cashPrice: effective.price,
            retailPrice,
            retailFromCatalog: retailPrice != null,
            wholesalePrice: normalizeWholesalePrice(row.wholesalePrice),
            unitPrice: isWholesale
              ? resolveWholesaleUnitPrice(row.wholesalePrice)
              : resolveUnitPrice(
                  effective.price,
                  retailPrice,
                  paymentMethod
                ),
            quantity: 1,
            maxStock: stock,
            isFreebie: false,
          },
        ];
      }

      const { nextCart, shortfalls } = mergePaidWithFreebies(nextPaid);
      if (shortfalls.length > 0) {
        queueMicrotask(() => {
          setFreebieShortfall((current) => current ?? shortfalls[0]);
        });
      }
      return nextCart;
    });
  };

  const incrementLine = (variantId: string) => {
    setCart((prev) => {
      const paid = prev.filter((line) => !line.isFreebie);
      const target = paid.find((line) => line.variantId === variantId);
      if (!target) return prev;
      const stock = stockForVariant(variantId);
      if (target.quantity >= stock) {
        toast.error("Not enough stock");
        return prev;
      }
      const nextPaid = paid.map((line) =>
        line.variantId === variantId
          ? { ...line, quantity: line.quantity + 1, maxStock: stock }
          : line
      );
      const { nextCart, shortfalls } = mergePaidWithFreebies(nextPaid);
      if (shortfalls.length > 0) {
        queueMicrotask(() => {
          setFreebieShortfall((current) => current ?? shortfalls[0]);
        });
      }
      return nextCart;
    });
  };

  const decrementLine = (variantId: string) => {
    setCart((prev) => {
      const paid = prev.filter((line) => !line.isFreebie);
      const nextPaid = paid.map((line) =>
        line.variantId === variantId
          ? { ...line, quantity: Math.max(1, line.quantity - 1) }
          : line
      );
      const { nextCart } = mergePaidWithFreebies(nextPaid);
      return nextCart;
    });
  };

  const setLineQuantity = (variantId: string, quantity: number) => {
    setCart((prev) => {
      const paid = prev.filter((line) => !line.isFreebie);
      const target = paid.find((line) => line.variantId === variantId);
      if (!target) return prev;
      const stock = stockForVariant(variantId);
      const nextQty = Math.max(
        1,
        Math.min(Math.floor(quantity), stock > 0 ? stock : 1)
      );
      if (quantity > stock) {
        toast.error("Not enough stock");
      }
      if (nextQty === target.quantity && target.maxStock === stock) {
        return prev;
      }
      const nextPaid = paid.map((line) =>
        line.variantId === variantId
          ? { ...line, quantity: nextQty, maxStock: stock }
          : line
      );
      const { nextCart, shortfalls } = mergePaidWithFreebies(nextPaid);
      if (shortfalls.length > 0) {
        queueMicrotask(() => {
          setFreebieShortfall((current) => current ?? shortfalls[0]);
        });
      }
      return nextCart;
    });
  };

  const removeLine = (variantId: string, isFreebie = false) => {
    if (isFreebie) {
      const nextIgnored = new Set(ignoredFreebieVariantIds);
      nextIgnored.add(variantId);
      const nextAlternates = alternateFreebies.filter(
        (l) => l.variantId !== variantId
      );
      setIgnoredFreebieVariantIds(nextIgnored);
      setAlternateFreebies(nextAlternates);
      const paid = cart.filter((l) => !l.isFreebie);
      applyCartWithFreebies(
        paid,
        nextIgnored,
        resolvedFreebieShortfalls,
        nextAlternates
      );
      return;
    }

    setCart((prev) => {
      const paidOnly = prev.filter(
        (line) => !(line.variantId === variantId && !line.isFreebie)
      );
      const { nextCart } = mergePaidWithFreebies(paidOnly);
      return nextCart;
    });
  };

  const clearCart = () => {
    setCart([]);
    resetSaleExtras();
    clearPosCheckoutDraft(saleChannel);
  };

  const handleContinueWithoutFreebie = () => {
    if (!freebieShortfall) return;
    const nextIgnored = new Set(ignoredFreebieVariantIds);
    nextIgnored.add(freebieShortfall.variantId);
    const nextResolved = new Set(resolvedFreebieShortfalls);
    nextResolved.add(freebieShortfall.variantId);
    setIgnoredFreebieVariantIds(nextIgnored);
    setResolvedFreebieShortfalls(nextResolved);
    setFreebieShortfall(null);
    const paid = cart.filter((line) => !line.isFreebie);
    applyCartWithFreebies(
      paid,
      nextIgnored,
      nextResolved,
      alternateFreebies
    );
  };

  const handleChooseAlternateFreebie = () => {
    setFreebiePickerOpen(true);
  };

  const handleSelectAlternateFreebie = (row: VariantWithStock) => {
    if (!freebieShortfall) return;
    const missing = Math.max(
      0,
      freebieShortfall.needed - freebieShortfall.available
    );
    const stock = stockForVariant(row.id);
    if (stock <= 0) {
      toast.error("Selected variant is out of stock");
      return;
    }
    const product = catalogProducts.find((p) => p.id === row.productId);
    const variantLabel = formatVariantLabel(row, product?.options ?? []);
    const qty = Math.min(
      missing > 0 ? missing : freebieShortfall.needed,
      stock
    );

    const nextResolved = new Set(resolvedFreebieShortfalls);
    nextResolved.add(freebieShortfall.variantId);
    const alternateLine: PosCartLine = {
      productId: row.productId,
      variantId: row.id,
      productName: row.productName,
      variantLabel,
      cashPrice: 0,
      retailPrice: 0,
      retailFromCatalog: true,
      unitPrice: 0,
      quantity: qty,
      maxStock: stock,
      isFreebie: true,
      freebieSourceCategoryIds: freebieShortfall.sourceCategoryIds,
    };
    const nextAlternates = [
      ...alternateFreebies.filter((l) => l.variantId !== row.id),
      alternateLine,
    ];
    setResolvedFreebieShortfalls(nextResolved);
    setAlternateFreebies(nextAlternates);
    setFreebieShortfall(null);
    setFreebiePickerOpen(false);
    const paid = cart.filter((line) => !line.isFreebie);
    applyCartWithFreebies(
      paid,
      ignoredFreebieVariantIds,
      nextResolved,
      nextAlternates
    );
  };

  const branchSelectLabel = (value: string | null) => {
    if (!value) return null;
    const branch = branches.find((b) => b.id === value);
    return branch ? `${branch.name} (${branch.code})` : null;
  };

  if (loadingBootstrap) {
    return (
      <p className="text-muted-foreground">
        {isWholesale
          ? "Loading wholesale point of sale..."
          : "Loading point of sale..."}
      </p>
    );
  }

  if (branches.length === 0) {
    return (
      <p className="text-muted-foreground">
        {isWholesale
          ? "No wholesale-capable branch found. Enable Supports wholesale on a branch first."
          : "Create a branch before using POS."}
      </p>
    );
  }

  if (
    isWholesale &&
    !isElevatedAdmin &&
    assignedBranchId &&
    !branches.some((b) => b.id === assignedBranchId)
  ) {
    return (
      <p className="text-muted-foreground">
        Your assigned branch does not support wholesale sales.
      </p>
    );
  }

  const openCheckout = () => {
    if (cart.length === 0 || !activeBranch) return;
    savePosCheckoutDraft({
      saleChannel,
      branchId: activeBranch.id,
      branchName: activeBranch.name,
      lines: cart,
      paymentMethod,
      tenderMethod,
      selectedPaymentAccountId,
      customerType,
      customer,
      appliedVoucher,
      voucherCodeInput,
      savedAt: Date.now(),
    });
    setMobileCartOpen(false);
    router.push(posCheckoutPath(saleChannel));
  };

  const cartPanel = (
    <PosCartPanel
      lines={cart}
      charging={false}
      saleChannel={saleChannel}
      onIncrement={incrementLine}
      onDecrement={decrementLine}
      onQuantityChange={isWholesale ? setLineQuantity : undefined}
      onRemove={removeLine}
      onClear={clearCart}
      onContinue={openCheckout}
      className="h-full"
    />
  );

  const mobileCartPanel = (
    <PosCartPanel
      lines={cart}
      charging={false}
      saleChannel={saleChannel}
      onIncrement={incrementLine}
      onDecrement={decrementLine}
      onQuantityChange={isWholesale ? setLineQuantity : undefined}
      onRemove={removeLine}
      onClear={clearCart}
      onContinue={openCheckout}
      onClose={() => setMobileCartOpen(false)}
      className="h-full"
    />
  );

  return (
    <div
      className={
        isCashier
          ? "-m-4 flex h-[calc(100dvh-3.5rem-4rem)] flex-col md:-m-6 sm:h-[calc(100dvh-4rem-4rem)]"
          : "-m-4 flex h-[calc(100dvh-3.5rem-4rem)] flex-col md:-m-6 lg:h-[calc(100dvh-4rem)]"
      }
    >
      <div className="flex flex-col gap-3 border-b bg-background px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold">
            {isWholesale ? "Wholesale POS" : "Point of sale"}
          </h1>
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
              <Button
                type="button"
                size="sm"
                variant={
                  selectedCategoryId === ALL_CATEGORIES_ID
                    ? "default"
                    : "outline"
                }
                className="shrink-0"
                onClick={() => {
                  setSelectedCategoryId(ALL_CATEGORIES_ID);
                  setSearch("");
                }}
              >
                All categories
              </Button>
              {filteredCategories.length === 0 ? (
                categorySearch.trim() ? (
                  <p className="py-1 text-sm text-muted-foreground">
                    No categories match “{categorySearch.trim()}”.
                  </p>
                ) : null
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
                placeholder={
                  selectedCategoryId === ALL_CATEGORIES_ID
                    ? "Search products..."
                    : "Search in this category..."
                }
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
          </div>

          <div
            ref={productListRef}
            className="min-h-0 flex-1 overflow-y-auto p-4 pb-40 lg:pb-4"
          >
            {loadingCategory && !categoryCache[selectedCategoryId] ? (
              <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin" />
                Loading products...
              </div>
            ) : filteredVariants.length === 0 ? (
              <p className="py-16 text-center text-muted-foreground">
                {selectedCategoryId === ALL_CATEGORIES_ID
                  ? "No selling variants for the selected branch."
                  : "No selling variants in this category for the selected branch."}
              </p>
            ) : (
              <>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                  {pagedVariants.map((row) => {
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
                    const displayName =
                      variantLabel !== "Default"
                        ? `${row.productName} — ${variantLabel}`
                        : row.productName;
                    const effective = resolveEffectivePrices(
                      row,
                      promoMap,
                      row.id
                    );
                    const pricedRow = {
                      price: effective.price,
                      retailPrice: effective.retailPrice,
                    };
                    const outOfStock = row.stock <= 0;
                    const inCart =
                      cart.find((line) => line.variantId === row.id)
                        ?.quantity ?? 0;

                    return (
                      <button
                        key={row.id}
                        type="button"
                        disabled={outOfStock}
                        onClick={() => addVariant(row)}
                        className="flex min-h-0 flex-row items-stretch gap-3 overflow-hidden rounded-xl border bg-card p-3 text-left transition hover:border-primary/40 hover:shadow-sm disabled:cursor-not-allowed disabled:opacity-50 sm:min-h-[140px] sm:flex-col sm:gap-0 sm:p-0"
                      >
                        {showCatalogImages(catalogImageSource) ? (
                          <div className="h-24 w-24 shrink-0 overflow-hidden rounded-lg bg-muted sm:aspect-[4/3] sm:h-auto sm:w-full sm:rounded-none">
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
                        <div className="flex min-w-0 flex-1 flex-col gap-1 sm:p-3">
                          <div className="flex items-start justify-between gap-2">
                            <p className="min-w-0 text-sm font-medium leading-snug break-words">
                              {displayName}
                            </p>
                            {effective.onSale ? (
                              <Badge
                                variant="outline"
                                className="shrink-0 text-[10px] text-amber-700"
                              >
                                Sale
                              </Badge>
                            ) : null}
                          </div>
                          <div className="mt-auto flex items-end justify-between gap-2 pt-2">
                            <span className="text-sm font-semibold tabular-nums">
                              {(() => {
                                if (isWholesale) {
                                  const wholesale = normalizeWholesalePrice(
                                    row.wholesalePrice
                                  );
                                  return wholesale != null
                                    ? formatCurrency(wholesale)
                                    : "Set at checkout";
                                }
                                const display = unitPriceForPaymentMethod(
                                  pricedRow,
                                  paymentMethod
                                );
                                if (display != null) {
                                  return formatCurrency(display);
                                }
                                return paymentMethod === "retail"
                                  ? "Set retail"
                                  : formatCurrency(pricedRow.price);
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
                <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-sm text-muted-foreground">
                    {total === 0
                      ? "No variants"
                      : `Showing ${(safePage - 1) * POS_PAGE_SIZE + 1}–${Math.min(safePage * POS_PAGE_SIZE, total)} of ${total}`}
                  </p>
                  <TablePagination
                    page={safePage}
                    totalPages={totalPages}
                    total={total}
                    pageSize={POS_PAGE_SIZE}
                    onPageChange={setPage}
                  />
                </div>
              </>
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
              cart.reduce(
                (sum, line) =>
                  sum +
                  (isWholesale ? line.unitPrice : line.cashPrice) *
                    line.quantity,
                0
              )
            )}
          </Button>
        </div>
      )}

      <Sheet open={mobileCartOpen} onOpenChange={setMobileCartOpen}>
        <SheetContent
          side="bottom"
          className="flex h-[85dvh] flex-col gap-0 p-0 sm:max-w-none"
          showCloseButton={false}
        >
          <SheetHeader className="sr-only">
            <SheetTitle>Current sale</SheetTitle>
          </SheetHeader>
          {mobileCartPanel}
        </SheetContent>
      </Sheet>

      <FreebieShortfallDialog
        open={Boolean(freebieShortfall) && !freebiePickerOpen}
        shortfall={freebieShortfall}
        onContinueWithout={handleContinueWithoutFreebie}
        onChooseAnother={handleChooseAlternateFreebie}
      />

      <VariantSearchDialog
        open={freebiePickerOpen}
        onOpenChange={(open) => {
          setFreebiePickerOpen(open);
          if (!open && freebieShortfall) {
            // Keep shortfall dialog available if they cancel picker
          }
        }}
        variants={allBranchVariants.filter((row) => stockForVariant(row.id) > 0)}
        products={catalogProducts}
        title="Choose freebie variant"
        description="Pick another in-stock variant to give as the freebie"
        stockLabel={(stock) => `Stock ${stock}`}
        onSelect={handleSelectAlternateFreebie}
      />
    </div>
  );
}
