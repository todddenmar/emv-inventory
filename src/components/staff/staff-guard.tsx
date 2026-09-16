"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/stores/auth-store";
import { isInventoryViewerRole, isStaffRole } from "@/lib/roles";
import { STAFF_HOME } from "@/lib/post-login-redirect";

export function StaffGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const loading = useAuthStore((s) => s.loading);
  const user = useAuthStore((s) => s.user);
  const isInventoryViewer = isInventoryViewerRole(user?.role);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace(`/login?redirect=${STAFF_HOME}`);
      return;
    }
    if (!isInventoryViewer) {
      if (isStaffRole(user.role)) {
        router.replace("/admin");
      } else {
        router.replace("/login?denied=1");
      }
    }
  }, [loading, user, isInventoryViewer, router]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  if (!user || !isInventoryViewer) return null;

  return <>{children}</>;
}
