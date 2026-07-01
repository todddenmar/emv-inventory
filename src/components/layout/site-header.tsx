"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ShoppingCart,
  User,
  LayoutDashboard,
  Menu,
  ClipboardList,
  Home,
  Store,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { LinkButton } from "@/components/ui/link-button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { BrandLogo } from "@/components/layout/brand-logo";
import { UserMenu } from "@/components/layout/user-menu";
import { useAuthStore, useIsStaff } from "@/stores/auth-store";
import { useCartStore } from "@/stores/cart-store";
import { cn } from "@/lib/utils";

function CartButton({
  className,
  homeStyle,
}: {
  className?: string;
  homeStyle?: boolean;
}) {
  const totalItems = useCartStore((s) => s.totalItems());

  return (
    <LinkButton
      href="/cart"
      variant="ghost"
      size="icon"
      className={cn(
        "relative shrink-0",
        homeStyle && "text-brand-yellow hover:bg-brand-yellow/10 hover:text-brand-yellow",
        className
      )}
    >
      <ShoppingCart className="h-4 w-4" />
      {totalItems > 0 && (
        <Badge
          className={cn(
            "absolute -right-2 -top-2 h-5 min-w-5 px-1 text-xs",
            homeStyle && "bg-brand-yellow text-brand-black"
          )}
        >
          {totalItems}
        </Badge>
      )}
      <span className="sr-only">Cart</span>
    </LinkButton>
  );
}

export function SiteHeader() {
  const pathname = usePathname();
  const isBrandedHeader =
    pathname === "/" ||
    pathname.startsWith("/shop") ||
    pathname.startsWith("/products/") ||
    pathname.startsWith("/categories/");
  const [menuOpen, setMenuOpen] = useState(false);
  const user = useAuthStore((s) => s.user);
  const loading = useAuthStore((s) => s.loading);
  const isStaff = useIsStaff();

  const navLinks = [
    { href: "/", label: "Home", icon: Home },
    { href: "/shop", label: "Shop", icon: Store },
    ...(user && !isStaff
      ? [{ href: "/orders", label: "My Orders", icon: ClipboardList }]
      : []),
  ];

  const closeMenu = () => setMenuOpen(false);

  const navButtonClass = isBrandedHeader
    ? "text-brand-yellow hover:bg-brand-yellow/10 hover:text-brand-yellow"
    : undefined;

  const signInClass = isBrandedHeader
    ? "rounded-full bg-brand-yellow text-brand-black hover:bg-brand-yellow/90"
    : undefined;

  return (
    <header
      className={cn(
        "z-50",
        isBrandedHeader
          ? "fixed inset-x-0 top-0 bg-transparent px-4 pt-4"
          : "sticky top-0 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60"
      )}
    >
      <div
        className={cn(
          "flex h-14 items-center justify-between gap-3 sm:h-16",
          isBrandedHeader
            ? "container mx-auto rounded-full border border-brand-yellow/20 bg-brand-black px-4 shadow-lg shadow-black/40 sm:px-6"
            : "container mx-auto px-4"
        )}
      >
        <BrandLogo
          href="/"
          size="sm"
          priority
          nameClassName={isBrandedHeader ? "text-brand-yellow" : undefined}
        />

        <nav className="hidden items-center gap-1 md:flex">
          {navLinks.map((link) => (
            <LinkButton
              key={link.href}
              href={link.href}
              variant="ghost"
              className={navButtonClass}
            >
              {link.label}
            </LinkButton>
          ))}

          <CartButton homeStyle={isBrandedHeader} />

          {!loading && (
            <>
              {user ? (
                <UserMenu
                  className={
                    isBrandedHeader
                      ? "text-brand-yellow hover:bg-brand-yellow/10 [&_p]:text-brand-yellow [&_.text-muted-foreground]:text-brand-yellow/70"
                      : undefined
                  }
                />
              ) : (
                <LinkButton href="/login" size="sm" className={signInClass}>
                  Sign in
                </LinkButton>
              )}
            </>
          )}
        </nav>

        <div className="flex items-center gap-2 md:hidden">
          <CartButton homeStyle={isBrandedHeader} />

          {!loading && user ? (
            <UserMenu
              compact
              className={
                isBrandedHeader
                  ? "text-brand-yellow hover:bg-brand-yellow/10"
                  : undefined
              }
            />
          ) : null}

          <Button
            variant="outline"
            size="icon"
            className={cn(
              "shrink-0",
              isBrandedHeader &&
                "border-brand-yellow/30 bg-transparent text-brand-yellow hover:bg-brand-yellow/10"
            )}
            onClick={() => setMenuOpen(true)}
            aria-label="Open menu"
          >
            <Menu className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
        <SheetContent
          side="left"
          className={cn("w-72", isBrandedHeader && "border-brand-yellow/20 bg-brand-black")}
        >
          <SheetHeader>
            <SheetTitle className={isBrandedHeader ? "text-brand-yellow" : undefined}>
              Menu
            </SheetTitle>
          </SheetHeader>
          <nav className="flex flex-col gap-1 px-4">
            {navLinks.map((link) => {
              const Icon = link.icon;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={closeMenu}
                  className={cn(
                    "flex items-center gap-3 rounded-full px-3 py-2.5 text-sm font-medium transition-colors",
                    isBrandedHeader
                      ? "text-brand-yellow hover:bg-brand-yellow/10"
                      : "hover:bg-muted"
                  )}
                >
                  <Icon
                    className={cn(
                      "h-4 w-4",
                      isBrandedHeader ? "text-brand-yellow/70" : "text-muted-foreground"
                    )}
                  />
                  {link.label}
                </Link>
              );
            })}

            <Link
              href="/cart"
              onClick={closeMenu}
              className={cn(
                "flex items-center gap-3 rounded-full px-3 py-2.5 text-sm font-medium transition-colors",
                isBrandedHeader
                  ? "text-brand-yellow hover:bg-brand-yellow/10"
                  : "hover:bg-muted"
              )}
            >
              <ShoppingCart
                className={cn(
                  "h-4 w-4",
                  isBrandedHeader ? "text-brand-yellow/70" : "text-muted-foreground"
                )}
              />
              Cart
            </Link>

            {!loading && !user && (
              <Link
                href="/login"
                onClick={closeMenu}
                className={cn(
                  "flex items-center gap-3 rounded-full px-3 py-2.5 text-sm font-medium transition-colors",
                  isBrandedHeader
                    ? "text-brand-yellow hover:bg-brand-yellow/10"
                    : "hover:bg-muted"
                )}
              >
                <User
                  className={cn(
                    "h-4 w-4",
                    isBrandedHeader ? "text-brand-yellow/70" : "text-muted-foreground"
                  )}
                />
                Sign in
              </Link>
            )}

            {!loading && user && isStaff && (
              <Link
                href="/admin"
                onClick={closeMenu}
                className={cn(
                  "flex items-center gap-3 rounded-full px-3 py-2.5 text-sm font-medium transition-colors",
                  isBrandedHeader
                    ? "text-brand-yellow hover:bg-brand-yellow/10"
                    : "hover:bg-muted"
                )}
              >
                <LayoutDashboard
                  className={cn(
                    "h-4 w-4",
                    isBrandedHeader ? "text-brand-yellow/70" : "text-muted-foreground"
                  )}
                />
                Admin dashboard
              </Link>
            )}
          </nav>
        </SheetContent>
      </Sheet>
    </header>
  );
}
