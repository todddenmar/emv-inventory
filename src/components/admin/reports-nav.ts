import {
  BarChart3,
  ClipboardList,
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
    description: "Day cash record, expenses, and itemized sales",
  },
];
