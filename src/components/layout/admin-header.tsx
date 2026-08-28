"use client";

import { Badge } from "@/components/ui/badge";
import { BrandLogo } from "@/components/layout/brand-logo";
import { DocsHelpButton } from "@/components/docs/docs-help-button";
import { UserMenu } from "@/components/layout/user-menu";
import { useAuthStore } from "@/stores/auth-store";

export function AdminHeader() {
  const user = useAuthStore((s) => s.user);
  const loading = useAuthStore((s) => s.loading);

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="flex h-16 w-full items-center justify-between gap-3 px-4 lg:px-6">
        <div className="flex min-w-0 items-center gap-2">
          <BrandLogo href="/admin" size="sm" showImage={false} priority />
          <Badge variant="secondary" className="hidden sm:inline-flex">
            Inventory
          </Badge>
        </div>

        <div className="flex items-center gap-1 sm:gap-2">
          <DocsHelpButton />
          {!loading && user && <UserMenu showAdminLink={false} />}
        </div>
      </div>
    </header>
  );
}
