"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { useBranchAccess } from "@/hooks/use-branch-access";
import {
  STAFF_HOME,
  isStaffAllowedPath,
} from "@/lib/post-login-redirect";

export function StaffRouteGuard({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { isInventoryViewer } = useBranchAccess();

  const allowed = !isInventoryViewer || isStaffAllowedPath(pathname);

  useEffect(() => {
    if (isInventoryViewer && !isStaffAllowedPath(pathname)) {
      router.replace(STAFF_HOME);
    }
  }, [isInventoryViewer, pathname, router]);

  if (isInventoryViewer && !allowed) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return <>{children}</>;
}
