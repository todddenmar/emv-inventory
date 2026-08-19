"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { useBranchAccess } from "@/hooks/use-branch-access";
import {
  OWNER_HOME,
  isOwnerAllowedPath,
} from "@/lib/post-login-redirect";

export function OwnerRouteGuard({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { isOwner } = useBranchAccess();

  const allowed = !isOwner || isOwnerAllowedPath(pathname);

  useEffect(() => {
    if (isOwner && !isOwnerAllowedPath(pathname)) {
      router.replace(OWNER_HOME);
    }
  }, [isOwner, pathname, router]);

  if (isOwner && !allowed) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return <>{children}</>;
}
