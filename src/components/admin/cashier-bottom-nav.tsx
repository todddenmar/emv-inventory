"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Receipt, ShoppingCart } from "lucide-react";
import { cn } from "@/lib/utils";

const cashierNavItems = [
  { href: "/admin/cashier", label: "Overview", icon: LayoutDashboard },
  { href: "/admin/cashier/sales", label: "Sales", icon: Receipt },
  { href: "/admin/pos", label: "POS", icon: ShoppingCart },
] as const;

function isNavActive(pathname: string, href: string) {
  if (href === "/admin/cashier") {
    return pathname === "/admin/cashier";
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function CashierBottomNav() {
  const pathname = usePathname();

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-50 border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/90"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      aria-label="Cashier"
    >
      <div className="grid h-16 grid-cols-3">
        {cashierNavItems.map((item) => {
          const Icon = item.icon;
          const active = isNavActive(pathname, item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex min-w-0 flex-col items-center justify-center gap-0.5 text-[11px] font-medium transition-colors",
                active
                  ? "text-primary"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Icon className="h-5 w-5 shrink-0" />
              <span className="w-full truncate px-0.5 text-center">
                {item.label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
