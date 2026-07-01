"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore, useIsStaff } from "@/stores/auth-store";

export function AdminGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const loading = useAuthStore((s) => s.loading);
  const user = useAuthStore((s) => s.user);
  const isStaff = useIsStaff();

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace("/login?redirect=/admin");
      return;
    }
    if (!isStaff) {
      router.replace("/");
    }
  }, [loading, user, isStaff, router]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  if (!user || !isStaff) return null;

  return <>{children}</>;
}
