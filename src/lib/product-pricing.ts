import type {
  BranchInventory,
  PosPaymentMethod,
  PricePromotion,
  ProductVariant,
} from "@/types";

export function normalizeRetailPrice(
  value: number | null | undefined
): number | null {
  if (value == null || !Number.isFinite(value) || value <= 0) {
    return null;
  }
  return value;
}

/** Same rules as retail: optional suggested price, null when unset/invalid. */
export function normalizeWholesalePrice(
  value: number | null | undefined
): number | null {
  return normalizeRetailPrice(value);
}

export function unitPriceForPaymentMethod(
  variant: Pick<ProductVariant, "price" | "retailPrice">,
  method: PosPaymentMethod
): number | null {
  if (method === "cash") return variant.price;
  return normalizeRetailPrice(variant.retailPrice);
}

/** Catalog prices, with optional per-branch cash/retail overrides. */
export function resolveVariantPrices(
  variant: Pick<ProductVariant, "price" | "retailPrice">,
  inventory?: Pick<BranchInventory, "cashPrice" | "retailPrice"> | null
): { price: number; retailPrice: number | null } {
  const cashOverride = inventory?.cashPrice;
  const price =
    cashOverride != null && Number.isFinite(cashOverride)
      ? cashOverride
      : variant.price;
  const retailOverride = inventory?.retailPrice;
  const retailPrice =
    retailOverride != null
      ? normalizeRetailPrice(retailOverride)
      : normalizeRetailPrice(variant.retailPrice);
  return { price, retailPrice };
}

export interface EffectiveSalePrices {
  price: number;
  retailPrice: number | null;
  promotionId: string;
  promotionName: string;
}

export function isPricePromotionCurrentlyActive(
  promo: Pick<PricePromotion, "status" | "startsAt" | "endsAt">,
  now: Date = new Date()
): boolean {
  if (promo.status === "ended") return false;
  const t = now.getTime();
  if (promo.startsAt.getTime() > t) return false;
  if (promo.endsAt != null && promo.endsAt.getTime() < t) return false;
  // scheduled that has started, or active within window
  return promo.status === "active" || promo.status === "scheduled";
}

export function pricePromotionDisplayStatus(
  promo: Pick<PricePromotion, "status" | "startsAt" | "endsAt" | "endedAt">,
  now: Date = new Date()
): "ended" | "expired" | "scheduled" | "active" {
  if (promo.status === "ended" || promo.endedAt) return "ended";
  if (promo.endsAt && promo.endsAt.getTime() < now.getTime()) return "expired";
  if (promo.startsAt.getTime() > now.getTime()) return "scheduled";
  if (isPricePromotionCurrentlyActive(promo, now)) return "active";
  return "ended";
}

export function resolveEffectivePrices(
  variant: Pick<ProductVariant, "price" | "retailPrice">,
  promoMap: Map<string, EffectiveSalePrices> | undefined,
  variantId: string
): {
  price: number;
  retailPrice: number | null;
  promotionId: string | null;
  promotionName: string | null;
  onSale: boolean;
} {
  const sale = promoMap?.get(variantId);
  if (!sale) {
    return {
      price: variant.price,
      retailPrice: normalizeRetailPrice(variant.retailPrice),
      promotionId: null,
      promotionName: null,
      onSale: false,
    };
  }
  return {
    price: sale.price,
    retailPrice: normalizeRetailPrice(sale.retailPrice),
    promotionId: sale.promotionId,
    promotionName: sale.promotionName,
    onSale: true,
  };
}
