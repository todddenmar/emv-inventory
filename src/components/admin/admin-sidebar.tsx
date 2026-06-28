"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Package,
  ShoppingBag,
  UserPlus,
  Users,
  Tags,
  Warehouse,
  Store,
  ArrowRightLeft,
  Layout,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useBranchAccess } from "@/hooks/use-branch-access";
import { Badge } from "@/components/ui/badge";

export const adminNavItems = [
  { href: "/admin", label: "Dashboard", icon: LayoutDashboard, masterOnly: false },
  { href: "/admin/inventory", label: "Inventory", icon: Warehouse, masterOnly: false },
  { href: "/admin/transfers", label: "Transfers", icon: ArrowRightLeft, masterOnly: false },
  { href: "/admin/branches", label: "Branches", icon: Store, masterOnly: true },
  { href: "/admin/homepage", label: "Homepage", icon: Layout, masterOnly: true },
  { href: "/admin/products", label: "Products", icon: Package, masterOnly: true },
  { href: "/admin/categories", label: "Categories", icon: Tags, masterOnly: true },
  { href: "/admin/orders", label: "Orders", icon: ShoppingBag, masterOnly: false },
  { href: "/admin/users", label: "Users", icon: Users, masterOnly: true },
  { href: "/admin/invites", label: "Invites", icon: UserPlus, masterOnly: true },
];

export function AdminNavLinks({
  onNavigate,
  className,
}: {
  onNavigate?: () => void;
  className?: string;
}) {
  const pathname = usePathname();
  const { isMasterAdmin, assignedBranchId } = useBranchAccess();

  const items = adminNavItems.filter(
    (item) => isMasterAdmin || !item.masterOnly
  );

  return (
    <nav className={cn("space-y-1", className)}>
      {items.map((item) => {
        const Icon = item.icon;
        const isActive =
          pathname === item.href ||
          (item.href !== "/admin" && pathname.startsWith(item.href));
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            className={cn(
              "flex items-center gap-2 rounded-md px-3 py-2.5 text-sm transition-colors",
              isActive
                ? "bg-primary text-primary-foreground"
                : "hover:bg-muted"
            )}
          >
            <Icon className="h-4 w-4 shrink-0" />
            {item.label}
          </Link>
        );
      })}
      {!isMasterAdmin && assignedBranchId && (
        <div className="px-3 pt-3">
          <Badge variant="outline" className="text-xs">
            Branch-scoped access
          </Badge>
        </div>
      )}
    </nav>
  );
}

export function AdminSidebar() {
  return (
    <aside className="hidden w-64 shrink-0 border-r bg-muted/30 p-4 md:block">
      <div className="mb-6">
        <h2 className="text-lg font-semibold">Admin Panel</h2>
        <p className="text-sm text-muted-foreground">Inventory Management</p>
      </div>
      <AdminNavLinks />
    </aside>
  );
}
