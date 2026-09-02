import type { PaymentAccountType, PaymentMethod, PosTenderMethod } from "@/types";

export interface PaymentMethodDefinition {
  key: string;
  name: string;
  shortLabel: string;
  isCash: boolean;
  needsPaymentAccount: boolean;
  accountType: PaymentAccountType | null;
  position: number;
}

export const BUILT_IN_PAYMENT_METHODS: PaymentMethodDefinition[] = [
  {
    key: "cash",
    name: "Cash",
    shortLabel: "CASH",
    isCash: true,
    needsPaymentAccount: false,
    accountType: null,
    position: 0,
  },
  {
    key: "ewallet",
    name: "E-wallet",
    shortLabel: "EW",
    isCash: false,
    needsPaymentAccount: true,
    accountType: "ewallet",
    position: 1,
  },
  {
    key: "bank_transfer",
    name: "Bank transfer",
    shortLabel: "BT",
    isCash: false,
    needsPaymentAccount: true,
    accountType: "bank_transfer",
    position: 2,
  },
  {
    key: "home_credit",
    name: "Home Credit",
    shortLabel: "HC",
    isCash: false,
    needsPaymentAccount: false,
    accountType: null,
    position: 3,
  },
  {
    key: "skyro",
    name: "Skyro",
    shortLabel: "SK",
    isCash: false,
    needsPaymentAccount: false,
    accountType: null,
    position: 4,
  },
  {
    key: "salmon",
    name: "Salmon",
    shortLabel: "SM",
    isCash: false,
    needsPaymentAccount: false,
    accountType: null,
    position: 5,
  },
  {
    key: "card_swipe",
    name: "Card/Swipe",
    shortLabel: "SW",
    isCash: false,
    needsPaymentAccount: false,
    accountType: null,
    position: 6,
  },
];

const builtInByKey = new Map(
  BUILT_IN_PAYMENT_METHODS.map((method) => [method.key, method])
);

export function paymentMethodKeyFromName(name: string): string {
  const key = name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
  return key || "method";
}

export function humanizeTenderKey(key: string): string {
  return key
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase())
    .trim();
}

export function findPaymentMethod(
  key: string,
  methods?: PaymentMethod[] | null
): PaymentMethod | PaymentMethodDefinition | null {
  const trimmed = key.trim();
  if (!trimmed) return null;
  const fromList = methods?.find((method) => method.key === trimmed);
  if (fromList) return fromList;
  return builtInByKey.get(trimmed) ?? null;
}

export function isCashTender(
  key: string,
  methods?: PaymentMethod[] | null
): boolean {
  const method = findPaymentMethod(key, methods);
  if (method) return method.isCash;
  return key.trim() === "cash";
}

export function paymentMethodName(
  key: string,
  methods?: PaymentMethod[] | null
): string {
  const method = findPaymentMethod(key, methods);
  if (method) return method.name;
  return humanizeTenderKey(key) || "Payment";
}

export function paymentMethodShortLabel(
  key: string,
  methods?: PaymentMethod[] | null
): string {
  const method = findPaymentMethod(key, methods);
  if (method?.shortLabel) return method.shortLabel;
  const name = paymentMethodName(key, methods);
  const compact = name.replace(/[^A-Za-z0-9]/g, "");
  return (compact.slice(0, 4) || key).toUpperCase();
}

export function sortPaymentMethods<T extends { position: number; name: string }>(
  methods: T[]
): T[] {
  return [...methods].sort(
    (a, b) => a.position - b.position || a.name.localeCompare(b.name)
  );
}

export function activeTenderKeys(
  methods?: PaymentMethod[] | null
): PosTenderMethod[] {
  const active = (methods ?? []).filter((method) => method.isActive);
  if (active.length === 0) {
    return BUILT_IN_PAYMENT_METHODS.map((method) => method.key);
  }
  return sortPaymentMethods(active).map((method) => method.key);
}
