import type { PosPaymentMethod, ProductVariant } from "@/types";

export function normalizeRetailPrice(
  value: number | null | undefined
): number | null {
  if (value == null || !Number.isFinite(value) || value <= 0) {
    return null;
  }
  return value;
}

export function unitPriceForPaymentMethod(
  variant: Pick<ProductVariant, "price" | "retailPrice">,
  method: PosPaymentMethod
): number | null {
  if (method === "cash") return variant.price;
  return normalizeRetailPrice(variant.retailPrice);
}
