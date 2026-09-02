import {
  Building2,
  CreditCard,
  FileJson,
  FolderKanban,
  ListChecks,
  RotateCcw,
  Settings2,
  Ticket,
  UserPlus,
  Users,
  UsersRound,
  Wallet,
  type LucideIcon,
} from "lucide-react";

export type SettingsNavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Visible to master-admin and admin. */
  elevatedOnly: boolean;
  /** Visible only to master-admin (e.g. product JSON import). */
  masterAdminOnly?: boolean;
  underUsers?: boolean;
  description: string;
};

export const settingsNavItems: SettingsNavItem[] = [
  {
    href: "/admin/settings/general",
    label: "General",
    icon: Settings2,
    elevatedOnly: true,
    description: "App-wide display and catalog preferences",
  },
  {
    href: "/admin/settings/assortment",
    label: "Branch assortment",
    icon: ListChecks,
    elevatedOnly: false,
    description: "Assign products to branches that sell them",
  },
  {
    href: "/admin/settings/category-groups",
    label: "Category groups",
    icon: FolderKanban,
    elevatedOnly: true,
    description: "Bundle categories for report and history filters",
  },
  {
    href: "/admin/settings/vendors",
    label: "Suppliers",
    icon: Building2,
    elevatedOnly: true,
    description: "Suppliers assigned to products",
  },
  {
    href: "/admin/settings/resellers",
    label: "Resellers",
    icon: UsersRound,
    elevatedOnly: false,
    description: "Reseller accounts for prepaid credit and POS",
  },
  {
    href: "/admin/settings/vouchers",
    label: "Vouchers",
    icon: Ticket,
    elevatedOnly: false,
    description: "Prepaid store credit codes",
  },
  {
    href: "/admin/settings/payment-methods",
    label: "Payment methods",
    icon: CreditCard,
    elevatedOnly: false,
    description: "POS tenders and which ones deduct from cash on hand",
  },
  {
    href: "/admin/settings/payment-accounts",
    label: "Payment accounts",
    icon: Wallet,
    elevatedOnly: false,
    description: "E-wallet accounts for POS checkout",
  },
  {
    href: "/admin/settings/import",
    label: "Product JSON import",
    icon: FileJson,
    elevatedOnly: true,
    masterAdminOnly: true,
    description: "Import products from EMV JSON catalogs",
  },
  {
    href: "/admin/settings/inventory-reset",
    label: "Inventory reset",
    icon: RotateCcw,
    elevatedOnly: true,
    masterAdminOnly: true,
    description: "Clear stock changes, transfers, sales, and stock levels",
  },
  {
    href: "/admin/settings/users",
    label: "Users",
    icon: Users,
    elevatedOnly: true,
    description: "Manage staff roles, branch assignment, and remove access",
  },
  {
    href: "/admin/settings/users/invites",
    label: "Invites",
    icon: UserPlus,
    elevatedOnly: true,
    underUsers: true,
    description: "Create cashier, owner, and admin invite links",
  },
];
