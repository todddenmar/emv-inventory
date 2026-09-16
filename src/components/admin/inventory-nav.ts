import {
  ArrowRightLeft,
  History,
  LayoutGrid,
  PackagePlus,
  Scale,
  Truck,
  Warehouse,
  type LucideIcon,
} from "lucide-react";

export type InventoryNavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  description: string;
  /** Owners only see stock levels + remaining stocks. */
  ownerVisible?: boolean;
  /** Inventory-viewer staff: stock levels, remaining, daily changes, history. */
  staffVisible?: boolean;
};

export const inventoryNavItems: InventoryNavItem[] = [
  {
    href: "/admin/inventory",
    label: "Stock levels",
    icon: Warehouse,
    description: "View and adjust branch stock",
    ownerVisible: true,
    staffVisible: true,
  },
  {
    href: "/admin/inventory/remaining-stocks",
    label: "Remaining stocks",
    icon: LayoutGrid,
    description: "Variant stock for a selected branch",
    ownerVisible: true,
    staffVisible: true,
  },
  {
    href: "/admin/inventory/daily-stock-changes",
    label: "Daily stock changes",
    icon: Scale,
    description: "Opening vs closing stock for a selected day",
    staffVisible: true,
  },
  {
    href: "/admin/inventory/stock-in",
    label: "Supplier stock in",
    icon: PackagePlus,
    description: "Receive supplier deliveries into stock",
  },
  {
    href: "/admin/inventory/adjustment-history",
    label: "Adjustment history",
    icon: History,
    description: "Log of inventory quantity changes",
    staffVisible: true,
  },
  {
    href: "/admin/inventory/transfers",
    label: "Transfers",
    icon: ArrowRightLeft,
    description: "Move stock between branches",
  },
  {
    href: "/admin/inventory/reseller-transfers",
    label: "Reseller transfers",
    icon: Truck,
    description: "Issue stock from a branch to a reseller",
  },
];

/** Rewrite admin inventory hrefs for the inventory-viewer staff app. */
export function inventoryHrefForRole(
  href: string,
  isInventoryViewer: boolean
): string {
  if (!isInventoryViewer) return href;
  if (href.startsWith("/admin/inventory")) {
    return `/staff/inventory${href.slice("/admin/inventory".length)}`;
  }
  return href;
}
