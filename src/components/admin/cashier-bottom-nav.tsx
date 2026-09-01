"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ArrowLeftRight,
  LayoutDashboard,
  MoreHorizontal,
  PackageOpen,
  Receipt,
  Search,
  ShoppingCart,
  Wallet,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useBranchAccess } from "@/hooks/use-branch-access";
import { getBranch } from "@/lib/firestore/branches";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

const primaryCashierNavItems = [
  { href: "/admin/cashier", label: "Overview", icon: LayoutDashboard },
  { href: "/admin/cashier/sales", label: "Sales", icon: Receipt },
  { href: "/admin/pos", label: "POS", icon: ShoppingCart },
] as const;

const wholesaleNavItem = {
  href: "/admin/wholesale",
  label: "Wholesale",
  icon: PackageOpen,
} as const;

const moreCashierNavItems = [
  { href: "/admin/cashier/find-stock", label: "Find stock", icon: Search },
  {
    href: "/admin/cashier/transfer-requests",
    label: "Requests",
    icon: ArrowLeftRight,
  },
  { href: "/admin/cashier/daily-cash", label: "Daily cash", icon: Wallet },
] as const;

function isNavActive(pathname: string, href: string) {
  if (href === "/admin/cashier") {
    return pathname === "/admin/cashier";
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function CashierBottomNav() {
  const pathname = usePathname();
  const { assignedBranchId } = useBranchAccess();
  const [supportsWholesale, setSupportsWholesale] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);

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

  const barItems = supportsWholesale
    ? [...primaryCashierNavItems, wholesaleNavItem]
    : [...primaryCashierNavItems];

  const moreActive = moreCashierNavItems.some((item) =>
    isNavActive(pathname, item.href)
  );
  const columns = barItems.length + 1;

  return (
    <>
      <nav
        className="fixed inset-x-0 bottom-0 z-50 border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/90"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
        aria-label="Cashier"
      >
        <div
          className="grid h-16"
          style={{
            gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
          }}
        >
          {barItems.map((item) => {
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
          <button
            type="button"
            onClick={() => setMoreOpen(true)}
            className={cn(
              "flex min-w-0 flex-col items-center justify-center gap-0.5 text-[11px] font-medium transition-colors",
              moreActive || moreOpen
                ? "text-primary"
                : "text-muted-foreground hover:text-foreground"
            )}
            aria-label="More navigation"
          >
            <MoreHorizontal className="h-5 w-5 shrink-0" />
            <span>More</span>
          </button>
        </div>
      </nav>

      <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
        <SheetContent
          side="bottom"
          className="max-h-[75dvh] gap-0 p-0 sm:max-w-none"
          showCloseButton
        >
          <SheetHeader className="border-b px-4 py-3 text-left">
            <SheetTitle>More</SheetTitle>
          </SheetHeader>
          <div className="overflow-y-auto p-2 pb-[max(1rem,env(safe-area-inset-bottom))]">
            <nav className="space-y-1">
              {moreCashierNavItems.map((item) => {
                const Icon = item.icon;
                const active = isNavActive(pathname, item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setMoreOpen(false)}
                    className={cn(
                      "flex items-center gap-3 rounded-md px-3 py-3 text-sm transition-colors",
                      active
                        ? "bg-primary text-primary-foreground"
                        : "hover:bg-muted"
                    )}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    {item.label}
                  </Link>
                );
              })}
            </nav>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
