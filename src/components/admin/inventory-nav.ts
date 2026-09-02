import {
  ArrowRightLeft,
  History,
  LayoutGrid,
  PackagePlus,
  Scale,
  Warehouse,
  type LucideIcon,
} from "lucide-react";

export type InventoryNavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  description: string;
  /** Owners only see stock levels; other roles see all. */
  ownerVisible?: boolean;
};

export const inventoryNavItems: InventoryNavItem[] = [
  {
    href: "/admin/inventory",
    label: "Stock levels",
    icon: Warehouse,
    description: "View and adjust branch stock",
    ownerVisible: true,
  },
  {
    href: "/admin/inventory/remaining-stocks",
    label: "Remaining stocks",
    icon: LayoutGrid,
    description: "Variant stock across all branches",
    ownerVisible: true,
  },
  {
    href: "/admin/inventory/daily-stock-changes",
    label: "Daily stock changes",
    icon: Scale,
    description: "Opening vs closing stock for a selected day",
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
  },
  {
    href: "/admin/inventory/transfers",
    label: "Transfers",
    icon: ArrowRightLeft,
    description: "Move stock between branches",
  },
];
