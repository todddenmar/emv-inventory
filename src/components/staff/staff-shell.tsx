"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  History,
  LayoutDashboard,
  LayoutGrid,
  MoreHorizontal,
  Scale,
  Search,
  Warehouse,
} from "lucide-react";
import { BrandLogo } from "@/components/layout/brand-logo";
import { UserMenu } from "@/components/layout/user-menu";
import { Badge } from "@/components/ui/badge";
import { StaffRouteGuard } from "@/components/staff/staff-route-guard";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { STAFF_HOME } from "@/lib/post-login-redirect";
import { useAuthStore } from "@/stores/auth-store";
import { cn } from "@/lib/utils";

const staffNavItems = [
  { href: STAFF_HOME, label: "Dashboard", icon: LayoutDashboard },
  { href: "/staff/inventory", label: "Stock levels", icon: Warehouse },
  { href: "/staff/find-stock", label: "Find stock", icon: Search },
  {
    href: "/staff/inventory/remaining-stocks",
    label: "Remaining stocks",
    icon: LayoutGrid,
  },
  {
    href: "/staff/inventory/daily-stock-changes",
    label: "Daily changes",
    icon: Scale,
  },
  {
    href: "/staff/inventory/adjustment-history",
    label: "Adjustment history",
    icon: History,
  },
] as const;

const primaryBottomHrefs = [
  STAFF_HOME,
  "/staff/inventory",
  "/staff/find-stock",
] as const;

function isStaffNavActive(pathname: string, href: string) {
  if (href === STAFF_HOME) return pathname === STAFF_HOME;
  if (href === "/staff/inventory") {
    return pathname === "/staff/inventory";
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

function StaffHeader() {
  const user = useAuthStore((s) => s.user);
  const loading = useAuthStore((s) => s.loading);

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="flex h-14 w-full items-center justify-between gap-3 px-4 sm:h-16">
        <div className="flex min-w-0 items-center gap-2">
          <BrandLogo href={STAFF_HOME} size="sm" showImage={false} priority />
          <Badge variant="secondary" className="hidden sm:inline-flex">
            Staff
          </Badge>
        </div>
        <div className="flex items-center gap-1 sm:gap-2">
          {!loading && user && <UserMenu showAdminLink={false} />}
        </div>
      </div>
    </header>
  );
}

function StaffSidebar() {
  const pathname = usePathname();

  return (
    <aside className="hidden w-56 shrink-0 border-r bg-muted/20 p-4 lg:block">
      <p className="mb-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        Inventory
      </p>
      <nav className="space-y-1">
        {staffNavItems.map((item) => {
          const Icon = item.icon;
          const isActive = isStaffNavActive(pathname, item.href);

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors",
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
      </nav>
    </aside>
  );
}

function StaffBottomNav() {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);

  const primaryItems = staffNavItems.filter((item) =>
    (primaryBottomHrefs as readonly string[]).includes(item.href)
  );
  const moreItems = staffNavItems.filter(
    (item) => !(primaryBottomHrefs as readonly string[]).includes(item.href)
  );
  const moreActive = moreItems.some((item) =>
    isStaffNavActive(pathname, item.href)
  );

  return (
    <>
      <nav
        className="fixed inset-x-0 bottom-0 z-50 border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/90 lg:hidden"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
        aria-label="Staff"
      >
        <div className="grid h-16 grid-cols-4">
          {primaryItems.map((item) => {
            const Icon = item.icon;
            const active = isStaffNavActive(pathname, item.href);
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
              {moreItems.map((item) => {
                const Icon = item.icon;
                const active = isStaffNavActive(pathname, item.href);
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

export function StaffShell({ children }: { children: React.ReactNode }) {
  return (
    <StaffRouteGuard>
      <div className="flex h-dvh min-h-0 w-full flex-col">
        <StaffHeader />
        <div className="flex min-h-0 w-full flex-1">
          <StaffSidebar />
          <div className="flex min-h-0 w-full flex-1 flex-col overflow-auto p-4 pb-[calc(6rem+env(safe-area-inset-bottom))] md:px-6 md:pt-6 lg:p-6">
            {children}
          </div>
        </div>
        <StaffBottomNav />
      </div>
    </StaffRouteGuard>
  );
}
