"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { reportsNavItems } from "@/components/admin/reports-nav";

export function ReportsNav({
  onNavigate,
  className,
}: {
  onNavigate?: () => void;
  className?: string;
}) {
  const pathname = usePathname();

  return (
    <nav className={cn("flex flex-col gap-1", className)}>
      {reportsNavItems.map((item) => {
        const Icon = item.icon;
        const isOverview = item.href === "/admin/reports";
        const isActive = isOverview
          ? pathname === "/admin/reports"
          : pathname === item.href || pathname.startsWith(`${item.href}/`);

        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            className={cn(
              "flex shrink-0 items-center gap-2 rounded-md px-3 py-2 text-sm whitespace-nowrap transition-colors",
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

export default function AdminReportsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="-m-4 flex min-h-[calc(100dvh-4rem)] min-w-0 flex-col md:-m-6 md:flex-row">
      <aside className="w-full shrink-0 border-b bg-muted/20 p-3 md:sticky md:top-0 md:max-h-[calc(100dvh-4rem)] md:w-56 md:self-start md:overflow-y-auto md:border-r md:border-b-0 md:p-4">
        <div className="mb-3 md:mb-4">
          <h2 className="text-sm font-semibold">Reports</h2>
          <p className="hidden text-xs text-muted-foreground md:block">
            Sales overview and daily cash reports
          </p>
        </div>
        <ReportsNav className="flex-row overflow-x-auto md:flex-col md:overflow-visible" />
      </aside>
      <div className="min-w-0 flex-1 p-4 md:p-6">{children}</div>
    </div>
  );
}
