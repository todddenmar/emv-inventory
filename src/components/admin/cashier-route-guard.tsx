"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { useBranchAccess } from "@/hooks/use-branch-access";
import {
  CASHIER_HOME,
  isCashierAllowedPath,
} from "@/lib/post-login-redirect";

export function CashierRouteGuard({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { isCashier } = useBranchAccess();

  const allowed = !isCashier || isCashierAllowedPath(pathname);

  useEffect(() => {
    if (isCashier && !isCashierAllowedPath(pathname)) {
      router.replace(CASHIER_HOME);
    }
  }, [isCashier, pathname, router]);

  if (isCashier && !allowed) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return <>{children}</>;
}
