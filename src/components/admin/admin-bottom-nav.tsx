"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { MoreHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";
import { useBranchAccess } from "@/hooks/use-branch-access";
import { adminNavItems } from "@/components/admin/admin-sidebar";
import { isOwnerNavHref } from "@/lib/post-login-redirect";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

/** Always pinned first; remaining candidates fill as width allows. */
export const adminBottomNavPrimaryHrefs = [
  "/admin",
  "/admin/pos",
  "/admin/inventory",
] as const;

/** Priority order for bottom-bar slots (short labels for tight widths). */
const bottomNavCandidates = [
  { href: "/admin", label: "Dashboard" },
  { href: "/admin/pos", label: "POS" },
  { href: "/admin/inventory", label: "Inventory" },
  { href: "/admin/reports", label: "Reports" },
  { href: "/admin/settings", label: "Settings" },
  { href: "/admin/price-changes", label: "Prices" },
  { href: "/admin/products", label: "Products" },
  { href: "/admin/categories", label: "Categories" },
  { href: "/admin/branches", label: "Branches" },
] as const;

const MIN_VISIBLE = 3;
/** Approx. width per slot including More; used to fit extra links. */
const SLOT_WIDTH_PX = 76;

function isNavActive(pathname: string, href: string) {
  if (href === "/admin") return pathname === "/admin";
  return pathname === href || pathname.startsWith(`${href}/`);
}

function useVisibleSlotCount(enabled: boolean) {
  const [count, setCount] = useState(MIN_VISIBLE);
  const navRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!enabled) return;

    const el = navRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;

    const update = (width: number) => {
      // Reserve one slot for More
      const fit = Math.floor(width / SLOT_WIDTH_PX) - 1;
      setCount(Math.max(MIN_VISIBLE, fit));
    };

    update(el.getBoundingClientRect().width);
    const ro = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width ?? 0;
      update(width);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [enabled]);

  return { navRef, count };
}

export function AdminBottomNav() {
  const pathname = usePathname();
  const { isElevatedAdmin, isOwner } = useBranchAccess();
  const [moreOpen, setMoreOpen] = useState(false);
  const { navRef, count: visibleSlotCount } = useVisibleSlotCount(true);

  const navByHref = new Map(adminNavItems.map((item) => [item.href, item]));

  const allowedCandidates = bottomNavCandidates.filter((candidate) => {
    const item = navByHref.get(candidate.href);
    if (!item) return false;
    if (isOwner) {
      return isOwnerNavHref(candidate.href);
    }
    return isElevatedAdmin || !item.masterOnly;
  });

  const barItems = allowedCandidates
    .slice(0, visibleSlotCount)
    .map((candidate) => {
      const item = navByHref.get(candidate.href)!;
      return {
        href: candidate.href,
        label: candidate.label,
        icon: item.icon,
      };
    });

  const barHrefs = new Set<string>(barItems.map((item) => item.href));

  const moreItems = adminNavItems.filter((item) => {
    if (barHrefs.has(item.href)) return false;
    if (isOwner) {
      return isOwnerNavHref(item.href);
    }
    return isElevatedAdmin || !item.masterOnly;
  });

  const moreActive = moreItems.some((item) => isNavActive(pathname, item.href));
  const showMore = moreItems.length > 0;
  const columns = barItems.length + (showMore ? 1 : 0);

  return (
    <>
      <nav
        ref={navRef}
        className="fixed inset-x-0 bottom-0 z-50 border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/90 lg:hidden"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
        aria-label="Primary"
      >
        <div
          className="grid h-16"
          style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
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
          {showMore ? (
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
          ) : null}
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
