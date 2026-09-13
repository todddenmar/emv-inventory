import {
  Footprints,
  CalendarCheck,
  Truck,
  Ticket,
  type LucideIcon,
} from "lucide-react";

export type SalesNavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  description: string;
};

export const salesNavItems: SalesNavItem[] = [
  {
    href: "/admin/sales/walk-ins",
    label: "Walk-ins",
    icon: Footprints,
    description: "Walk-in shop sales",
  },
  {
    href: "/admin/sales/reservation",
    label: "Reservation",
    icon: CalendarCheck,
    description: "Reservation sales with customer details",
  },
  {
    href: "/admin/sales/delivery",
    label: "Delivery",
    icon: Truck,
    description: "Delivery sales with customer details",
  },
  {
    href: "/admin/sales/vouchers",
    label: "Voucher sales",
    icon: Ticket,
    description: "Sales with a voucher applied",
  },
];
