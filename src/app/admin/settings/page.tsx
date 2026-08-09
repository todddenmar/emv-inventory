"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useBranchAccess } from "@/hooks/use-branch-access";
import { settingsNavItems } from "@/components/admin/settings-nav";

export default function AdminSettingsPage() {
  const router = useRouter();
  const { isMasterAdmin, isElevatedAdmin } = useBranchAccess();

  useEffect(() => {
    const items = settingsNavItems.filter((item) => {
      if (item.masterAdminOnly && !isMasterAdmin) return false;
      if (item.elevatedOnly && !isElevatedAdmin) return false;
      return true;
    });
    const target = items[0]?.href ?? "/admin/settings/assortment";
    router.replace(target);
  }, [isMasterAdmin, isElevatedAdmin, router]);

  return (
    <p className="text-sm text-muted-foreground">Opening settings…</p>
  );
}
