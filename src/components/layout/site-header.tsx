"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Package,
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
import { UserMenu } from "@/components/layout/user-menu";
import { useAuthStore, useIsStaff } from "@/stores/auth-store";
import { useCartStore } from "@/stores/cart-store";
import { cn } from "@/lib/utils";

function CartButton({ className }: { className?: string }) {
  const totalItems = useCartStore((s) => s.totalItems());

  return (
    <LinkButton
      href="/cart"
      variant="outline"
      size="icon"
      className={cn("relative shrink-0", className)}
    >
      <ShoppingCart className="h-4 w-4" />
      {totalItems > 0 && (
        <Badge className="absolute -right-2 -top-2 h-5 min-w-5 px-1 text-xs">
          {totalItems}
        </Badge>
      )}
      <span className="sr-only">Cart</span>
    </LinkButton>
  );
}

export function SiteHeader() {
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

  return (
    <header className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container mx-auto flex h-16 items-center justify-between gap-3 px-4">
        <Link href="/" className="flex min-w-0 items-center gap-2 font-semibold">
          <Package className="h-5 w-5 shrink-0" />
          <span className="truncate">El Mio Vicente</span>
        </Link>

        {/* Desktop navigation */}
        <nav className="hidden items-center gap-2 md:flex">
          {navLinks.map((link) => (
            <LinkButton key={link.href} href={link.href} variant="ghost">
              {link.label}
            </LinkButton>
          ))}

          <CartButton />

          {!loading && (
            <>
              {user ? (
                <UserMenu />
              ) : (
                <LinkButton href="/login" size="sm">
                  Sign in
                </LinkButton>
              )}
            </>
          )}
        </nav>

        {/* Mobile actions */}
        <div className="flex items-center gap-2 md:hidden">
          <CartButton />

          {!loading && (
            <>
              {user ? (
                <UserMenu compact />
              ) : null}
            </>
          )}

          <Button
            variant="outline"
            size="icon"
            className="shrink-0"
            onClick={() => setMenuOpen(true)}
            aria-label="Open menu"
          >
            <Menu className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Mobile menu sheet */}
      <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
        <SheetContent side="left" className="w-72">
          <SheetHeader>
            <SheetTitle>Menu</SheetTitle>
          </SheetHeader>
          <nav className="flex flex-col gap-1 px-4">
            {navLinks.map((link) => {
              const Icon = link.icon;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={closeMenu}
                  className="flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition-colors hover:bg-muted"
                >
                  <Icon className="h-4 w-4 text-muted-foreground" />
                  {link.label}
                </Link>
              );
            })}

            <Link
              href="/cart"
              onClick={closeMenu}
              className="flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition-colors hover:bg-muted"
            >
              <ShoppingCart className="h-4 w-4 text-muted-foreground" />
              Cart
            </Link>

            {!loading && !user && (
              <Link
                href="/login"
                onClick={closeMenu}
                className="flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition-colors hover:bg-muted"
              >
                <User className="h-4 w-4 text-muted-foreground" />
                Sign in
              </Link>
            )}

            {!loading && user && isStaff && (
              <Link
                href="/admin"
                onClick={closeMenu}
                className="flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition-colors hover:bg-muted"
              >
                <LayoutDashboard className="h-4 w-4 text-muted-foreground" />
                Admin dashboard
              </Link>
            )}
          </nav>
        </SheetContent>
      </Sheet>
    </header>
  );
}
