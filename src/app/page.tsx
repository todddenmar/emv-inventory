"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { resolvePostLoginRedirect } from "@/lib/post-login-redirect";
import { useAuthStore, useIsStaff } from "@/stores/auth-store";

export default function RootPage() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const loading = useAuthStore((s) => s.loading);
  const isStaff = useIsStaff();

  useEffect(() => {
    if (loading) return;

    if (!user) {
      router.replace("/login");
      return;
    }

    if (isStaff) {
      router.replace(resolvePostLoginRedirect(true, "/admin", user.role));
      return;
    }

    router.replace("/login?denied=1");
  }, [user, loading, isStaff, router]);

  return (
    <div className="flex min-h-[50vh] items-center justify-center">
      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
    </div>
  );
}
