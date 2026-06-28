"use client";

import { useState } from "react";
import Link from "next/link";
import { Menu, Store } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { BrandLogo } from "@/components/layout/brand-logo";
import { UserMenu } from "@/components/layout/user-menu";
import { AdminNavLinks } from "@/components/admin/admin-sidebar";
import { useAuthStore } from "@/stores/auth-store";

export function AdminHeader() {
  const [menuOpen, setMenuOpen] = useState(false);
  const user = useAuthStore((s) => s.user);
  const loading = useAuthStore((s) => s.loading);

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="flex h-16 w-full items-center justify-between gap-3 px-4 lg:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <Button
            variant="outline"
            size="icon"
            className="shrink-0 md:hidden"
            onClick={() => setMenuOpen(true)}
            aria-label="Open admin menu"
          >
            <Menu className="h-4 w-4" />
          </Button>
          <div className="flex min-w-0 items-center gap-2">
            <BrandLogo href="/admin" size="sm" priority />
            <Badge variant="secondary" className="hidden sm:inline-flex">
              Admin
            </Badge>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href="/shop"
            className="hidden items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground md:flex"
          >
            <Store className="h-4 w-4" />
            Shop
          </Link>
          {!loading && user && <UserMenu showAdminLink={false} />}
        </div>
      </div>

      <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
        <SheetContent side="left" className="w-72">
          <SheetHeader>
            <SheetTitle>Admin menu</SheetTitle>
          </SheetHeader>
          <div className="mt-4 px-2">
            <AdminNavLinks onNavigate={() => setMenuOpen(false)} />
          </div>
        </SheetContent>
      </Sheet>
    </header>
  );
}
