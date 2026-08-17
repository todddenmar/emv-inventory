"use client";

import { AdminBottomNav } from "@/components/admin/admin-bottom-nav";
import { AdminSidebar } from "@/components/admin/admin-sidebar";
import { CashierBottomNav } from "@/components/admin/cashier-bottom-nav";
import { CashierRouteGuard } from "@/components/admin/cashier-route-guard";
import { AdminHeader } from "@/components/layout/admin-header";
import { useBranchAccess } from "@/hooks/use-branch-access";
import { CASHIER_HOME } from "@/lib/post-login-redirect";
import { BrandLogo } from "@/components/layout/brand-logo";
import { Badge } from "@/components/ui/badge";
import { UserMenu } from "@/components/layout/user-menu";
import { useAuthStore } from "@/stores/auth-store";

function CashierHeader() {
  const user = useAuthStore((s) => s.user);
  const loading = useAuthStore((s) => s.loading);

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="flex h-14 w-full items-center justify-between gap-3 px-4 sm:h-16">
        <div className="flex min-w-0 items-center gap-2">
          <BrandLogo href={CASHIER_HOME} size="sm" priority />
          <Badge variant="secondary" className="hidden sm:inline-flex">
            Cashier
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          {!loading && user && <UserMenu showAdminLink={false} />}
        </div>
      </div>
    </header>
  );
}

export function AdminShell({ children }: { children: React.ReactNode }) {
  const { isCashier } = useBranchAccess();

  if (isCashier) {
    return (
      <CashierRouteGuard>
        <div className="flex min-h-screen w-full flex-col">
          <CashierHeader />
          <div className="min-w-0 w-full flex-1 overflow-auto p-4 pb-24 md:p-6">
            {children}
          </div>
          <CashierBottomNav />
        </div>
      </CashierRouteGuard>
    );
  }

  return (
    <div className="flex min-h-screen w-full flex-col">
      <AdminHeader />
      <div className="flex w-full flex-1 flex-col lg:flex-row">
        <AdminSidebar />
        <div className="min-w-0 w-full flex-1 overflow-auto p-4 pb-24 md:p-6 lg:pb-6">
          {children}
        </div>
      </div>
      <AdminBottomNav />
    </div>
  );
}
