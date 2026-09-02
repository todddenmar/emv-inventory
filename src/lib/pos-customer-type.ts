import type { PosCustomerType } from "@/types";

export function parsePosCustomerType(value: unknown): PosCustomerType {
  if (
    value === "reservation" ||
    value === "delivery" ||
    value === "warranty" ||
    value === "replacement"
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
    default:
      return "Walk in";
  }
}

export function requiresPosCustomerDetails(type: PosCustomerType): boolean {
  return type === "reservation" || type === "delivery";
}

export function isNonRevenueCustomerType(
  type: PosCustomerType | null | undefined
): boolean {
  return type === "warranty" || type === "replacement";
}

export function nonRevenueCustomerTypeNote(
  type: PosCustomerType | null | undefined
): string | null {
  if (type === "warranty") return "WARRANTY";
  if (type === "replacement") return "REPLACEMENT";
  return null;
}
