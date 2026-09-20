"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ArrowLeftRight,
  LayoutDashboard,
  PackageOpen,
  Receipt,
  Search,
  ShoppingCart,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useBranchAccess } from "@/hooks/use-branch-access";
import { useAppSettings } from "@/hooks/use-app-settings";
import { getBranch } from "@/lib/firestore/branches";

export type CashierNavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
};

export const cashierPrimaryNavItems: CashierNavItem[] = [
  { href: "/admin/cashier", label: "Overview", icon: LayoutDashboard },
  { href: "/admin/cashier/sales", label: "Sales", icon: Receipt },
  { href: "/admin/pos", label: "POS", icon: ShoppingCart },
];

export const cashierWholesaleNavItem: CashierNavItem = {
  href: "/admin/wholesale",
  label: "Wholesale",
  icon: PackageOpen,
};

export const cashierMoreNavItems: CashierNavItem[] = [
  { href: "/admin/cashier/find-stock", label: "Find stock", icon: Search },
  {
    href: "/admin/cashier/transfer-requests",
    label: "Requests",
    icon: ArrowLeftRight,
  },
  { href: "/admin/cashier/daily-cash", label: "Daily cash", icon: Wallet },
];

export function isCashierNavActive(pathname: string, href: string) {
  if (href === "/admin/cashier") {
    return pathname === "/admin/cashier";
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function useCashierNavItems() {
  const { assignedBranchId } = useBranchAccess();
  const [supportsWholesale, setSupportsWholesale] = useState(false);

  useEffect(() => {
    if (!assignedBranchId) {
      setSupportsWholesale(false);
      return;
    }
    let cancelled = false;
    getBranch(assignedBranchId)
      .then((branch) => {
        if (!cancelled) {
          setSupportsWholesale(branch?.supportsWholesale === true);
        }
      })
      .catch(() => {
        if (!cancelled) setSupportsWholesale(false);
      });
    return () => {
      cancelled = true;
    };
  }, [assignedBranchId]);

  const primary = supportsWholesale
    ? [...cashierPrimaryNavItems, cashierWholesaleNavItem]
    : cashierPrimaryNavItems;

  const all = [...primary, ...cashierMoreNavItems];

  return { primary, more: cashierMoreNavItems, all, supportsWholesale };
}

export function CashierNavLinks({
  items,
  onNavigate,
  className,
  compactLabels = false,
}: {
  items: CashierNavItem[];
  onNavigate?: () => void;
  className?: string;
  compactLabels?: boolean;
}) {
  const pathname = usePathname();

  return (
    <nav
      className={cn(
        "space-y-1",
        compactLabels &&
          "flex flex-col items-center group-hover/sidebar:items-stretch",
        className
      )}
    >
      {items.map((item) => {
        const Icon = item.icon;
        const active = isCashierNavActive(pathname, item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            title={item.label}
            className={cn(
              "flex items-center rounded-md text-sm transition-colors",
              compactLabels
                ? "size-10 justify-center gap-0 p-0 group-hover/sidebar:h-auto group-hover/sidebar:w-full group-hover/sidebar:justify-start group-hover/sidebar:gap-2 group-hover/sidebar:px-3 group-hover/sidebar:py-2.5"
                : "gap-2 px-3 py-2.5",
              active
                ? "bg-primary text-primary-foreground"
                : "hover:bg-muted"
            )}
          >
            <Icon className="h-4 w-4 shrink-0" />
            <span
              className={cn(
                "truncate",
                compactLabels &&
                  "hidden group-hover/sidebar:inline group-hover/sidebar:max-w-[12rem]"
              )}
            >
              {item.label}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}

export function CashierSidebar() {
  const { hideSidebarLabelsUntilHover } = useAppSettings();
  const { all } = useCashierNavItems();
  const compact = hideSidebarLabelsUntilHover;

  return (
    <>
      <div
        className={cn("hidden shrink-0 lg:block", compact ? "w-16" : "w-64")}
        aria-hidden
      />
      <aside
        className={cn(
          "group/sidebar fixed top-16 bottom-0 left-0 z-40 hidden flex-col overflow-hidden border-r bg-muted/95 backdrop-blur transition-[width] duration-200 lg:flex",
          compact
            ? "w-16 items-center p-3 hover:w-64 hover:items-stretch hover:shadow-lg"
            : "w-64 p-4"
        )}
      >
        <CashierNavLinks
          items={all}
          className="w-full flex-1 overflow-y-auto"
          compactLabels={compact}
        />
      </aside>
    </>
  );
}
