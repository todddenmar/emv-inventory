"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useBranchAccess } from "@/hooks/use-branch-access";
import { settingsNavItems } from "@/components/admin/settings-nav";

export default function AdminSettingsPage() {
  const router = useRouter();
  const { isMasterAdmin } = useBranchAccess();

  useEffect(() => {
    const items = settingsNavItems.filter(
      (item) => isMasterAdmin || !item.masterOnly
    );
    const target = items[0]?.href ?? "/admin/settings/assortment";
    router.replace(target);
  }, [isMasterAdmin, router]);

  return (
    <p className="text-sm text-muted-foreground">Opening settings…</p>
  );
}
