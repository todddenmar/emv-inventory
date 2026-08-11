"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { useBranchAccess } from "@/hooks/use-branch-access";
import { settingsNavItems } from "@/components/admin/settings-nav";

export function SettingsNav({
  onNavigate,
  className,
}: {
  onNavigate?: () => void;
  className?: string;
}) {
  const pathname = usePathname();
  const { isMasterAdmin, isElevatedAdmin } = useBranchAccess();

  const items = settingsNavItems.filter((item) => {
    if (item.masterAdminOnly && !isMasterAdmin) return false;
    if (item.elevatedOnly && !isElevatedAdmin) return false;
    return true;
  });

  return (
    <nav className={cn("space-y-1", className)}>
      {items.map((item) => {
        const Icon = item.icon;
        const isUsersSection =
          item.href === "/admin/settings/users" &&
          pathname.startsWith("/admin/settings/users") &&
          !pathname.startsWith("/admin/settings/users/invites");
        const isExactOrNested =
          item.href !== "/admin/settings/users" &&
          (pathname === item.href || pathname.startsWith(`${item.href}/`));
        const isActive =
          pathname === item.href || isUsersSection || isExactOrNested;

        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            className={cn(
              "flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors",
              item.underUsers ? "pl-5" : "",
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
  );
}

export default function AdminSettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="-m-4 flex min-h-[calc(100dvh-4rem)] flex-col md:-m-6 md:flex-row">
      <aside className="w-full shrink-0 border-b bg-muted/20 p-4 md:sticky md:top-0 md:max-h-[calc(100dvh-4rem)] md:w-56 md:self-start md:overflow-y-auto md:border-r md:border-b-0">
        <div className="mb-4">
          <h2 className="text-sm font-semibold">Settings</h2>
          <p className="text-xs text-muted-foreground">
            Assortment, partners, and access
          </p>
        </div>
        <SettingsNav />
      </aside>
      <div className="min-w-0 flex-1 p-4 md:p-6">{children}</div>
    </div>
  );
}
