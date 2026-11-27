import type { PosCustomerType, PosSale } from "@/types";

export function parsePosCustomerType(value: unknown): PosCustomerType {
  if (
    value === "reservation" ||
    value === "delivery" ||
    value === "warranty" ||
    value === "replacement" ||
    value === "co_owner"
  ) {
    return value;
  }
  return "walk_in";
}

/** Customer types shown in POS / edit-sale pickers (delivery is a separate flag). */
export const POS_CHECKOUT_CUSTOMER_TYPES: PosCustomerType[] = [
  "walk_in",
  "reservation",
  "warranty",
  "replacement",
  "co_owner",
];

export function posCustomerTypeLabel(type: PosCustomerType): string {
  switch (type) {
    case "reservation":
      return "Reservation";
    case "delivery":
      return "Delivery";
    case "warranty":
      return "Warranty";
    case "replacement":
      return "Replacement";
    case "co_owner":
      return "C/O Owner";
    default:
      return "Walk in";
  }
}

export function isPosSaleDelivery(
  sale: Pick<PosSale, "isDelivery" | "customerType">
): boolean {
  return sale.isDelivery === true || sale.customerType === "delivery";
}

export function requiresPosCustomerDetails(
  type: PosCustomerType,
  isDelivery = false
): boolean {
  return type === "reservation" || type === "delivery" || isDelivery;
}

/** Name (or owner note) is required before checkout can proceed. */
export function requiresPosCustomerName(
  type: PosCustomerType,
  isDelivery = false
): boolean {
  return requiresPosCustomerDetails(type, isDelivery) || type === "co_owner";
}

export function isNonRevenueCustomerType(
  type: PosCustomerType | null | undefined
): boolean {
  return (
    type === "warranty" || type === "replacement" || type === "co_owner"
  );
}

export function nonRevenueCustomerTypeNote(
  type: PosCustomerType | null | undefined
): string | null {
  if (type === "warranty") return "WARRANTY";
  if (type === "replacement") return "REPLACEMENT";
  if (type === "co_owner") return "C/O OWNER";
  return null;
}
