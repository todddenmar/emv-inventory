import type { PosCustomerType } from "@/types";

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

export function requiresPosCustomerDetails(type: PosCustomerType): boolean {
  return type === "reservation" || type === "delivery";
}

/** Name (or owner note) is required before checkout can proceed. */
export function requiresPosCustomerName(type: PosCustomerType): boolean {
  return requiresPosCustomerDetails(type) || type === "co_owner";
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
