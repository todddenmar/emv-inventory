import {
  ArrowLeftRight,
  FileText,
  Settings,
  Truck,
  type LucideIcon,
} from "lucide-react";

export type DeliveriesNavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  description: string;
};

export const deliveriesNavItems: DeliveriesNavItem[] = [
  {
    href: "/admin/deliveries/sales",
    label: "Delivery sales",
    icon: Truck,
    description: "Sales marked for delivery",
  },
  {
    href: "/admin/deliveries/transfers",
    label: "Delivery Transfers",
    icon: ArrowLeftRight,
    description: "Completed branch-to-branch transfers",
  },
  {
    href: "/admin/deliveries/receipts",
    label: "Delivery receipts",
    icon: FileText,
    description: "View and download delivery receipts",
  },
  {
    href: "/admin/deliveries/settings",
    label: "Settings",
    icon: Settings,
    description: "Company details printed on every receipt",
  },
];
