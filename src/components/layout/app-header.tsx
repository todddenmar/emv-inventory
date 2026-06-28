"use client";

import { usePathname } from "next/navigation";
import { SiteHeader } from "@/components/layout/site-header";

export function AppHeader() {
  const pathname = usePathname();

  if (pathname.startsWith("/admin")) {
    return null;
  }

  return <SiteHeader />;
}
