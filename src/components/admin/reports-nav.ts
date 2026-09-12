import {
  BarChart3,
  ClipboardList,
  PackageOpen,
  type LucideIcon,
} from "lucide-react";

export type ReportsNavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  description: string;
};

export const reportsNavItems: ReportsNavItem[] = [
  {
    href: "/admin/reports",
    label: "Sales overview",
    icon: BarChart3,
    description: "Sales totals, trends, and filters",
  },
  {
    href: "/admin/reports/daily-sales",
    label: "Daily sales",
    icon: ClipboardList,
    description: "Shop day cash record, expenses, and itemized sales",
  },
  {
    href: "/admin/reports/daily-wholesale",
    label: "Daily wholesale",
    icon: PackageOpen,
    description: "Wholesale receipts for the selected day",
  },
];
