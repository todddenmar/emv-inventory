"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Package,
  Tags,
  Warehouse,
  Store,
  TrendingUp,
  ShoppingCart,
  Settings,
  BarChart3,
  Tag,
  PackageOpen,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useBranchAccess } from "@/hooks/use-branch-access";
import { useAppSettings } from "@/hooks/use-app-settings";
import { Badge } from "@/components/ui/badge";
import { isOwnerNavHref } from "@/lib/post-login-redirect";

export const adminNavItems = [
  { href: "/admin", label: "Dashboard", icon: LayoutDashboard, masterOnly: false },
  { href: "/admin/pos", label: "POS", icon: ShoppingCart, masterOnly: false },
  {
    href: "/admin/wholesale",
    label: "Wholesale",
    icon: PackageOpen,
    masterOnly: false,
  },
  { href: "/admin/inventory", label: "Inventory", icon: Warehouse, masterOnly: false },
  {
    href: "/admin/reports",
    label: "Reports",
    icon: BarChart3,
    masterOnly: false,
  },
  {
    href: "/admin/price-changes",
    label: "Price changes",
    icon: TrendingUp,
    masterOnly: false,
  },
  {
    href: "/admin/price-promotions",
    label: "Price promotions",
    icon: Tag,
    masterOnly: true,
  },
  { href: "/admin/branches", label: "Branches", icon: Store, masterOnly: true },
  { href: "/admin/products", label: "Products", icon: Package, masterOnly: true },
  { href: "/admin/categories", label: "Categories", icon: Tags, masterOnly: true },
  { href: "/admin/settings", label: "Settings", icon: Settings, masterOnly: false },
];

export function AdminNavLinks({
  onNavigate,
  className,
  compactLabels = false,
}: {
  onNavigate?: () => void;
  className?: string;
  /** Hide labels until the parent group is hovered (desktop sidebar). */
  compactLabels?: boolean;
}) {
  const pathname = usePathname();
  const { isElevatedAdmin, isOwner, assignedBranchId } = useBranchAccess();

  const items = adminNavItems.filter((item) => {
    if (isOwner) return isOwnerNavHref(item.href);
    return isElevatedAdmin || !item.masterOnly;
  });

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
        const hasMoreSpecificMatch = items.some(
          (other) =>
            other.href !== item.href &&
            other.href.startsWith(`${item.href}/`) &&
            (pathname === other.href || pathname.startsWith(`${other.href}/`))
        );
        const isActive =
          item.href === "/admin"
            ? pathname === "/admin"
            : pathname === item.href ||
              (pathname.startsWith(`${item.href}/`) && !hasMoreSpecificMatch);
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
              isActive
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
      {!isElevatedAdmin && !isOwner && assignedBranchId && (
        <div
          className={cn(
            "px-3 pt-3",
            compactLabels && "hidden group-hover/sidebar:block"
          )}
        >
          <Badge variant="outline" className="text-xs">
            Branch-scoped access
          </Badge>
        </div>
      )}
    </nav>
  );
}

export function AdminSidebar() {
  const { hideSidebarLabelsUntilHover } = useAppSettings();
  const compact = hideSidebarLabelsUntilHover;

  return (
    <>
      {/* Spacer keeps main content offset while the fixed sidebar expands on hover */}
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
        <AdminNavLinks
          className="w-full flex-1 overflow-y-auto"
          compactLabels={compact}
        />
      </aside>
    </>
  );
}
