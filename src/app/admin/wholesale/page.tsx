"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { PosWorkspace } from "@/components/admin/pos-workspace";
import { parsePosSaleLockFromSearchParams } from "@/lib/pos-sale-lock";

function AdminWholesalePosPageInner() {
  const searchParams = useSearchParams();
  const saleLock = parsePosSaleLockFromSearchParams(searchParams);
  return <PosWorkspace saleChannel="wholesale" saleLock={saleLock} />;
}

export default function AdminWholesalePosPage() {
  return (
    <Suspense
      fallback={
        <p className="text-muted-foreground">
          <Loader2 className="mr-2 inline size-4 animate-spin" />
          Loading wholesale point of sale...
        </p>
      }
    >
      <AdminWholesalePosPageInner />
    </Suspense>
  );
}
