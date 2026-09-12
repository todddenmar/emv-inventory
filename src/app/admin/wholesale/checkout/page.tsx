"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { PosCheckoutWorkspace } from "@/components/admin/pos-checkout-workspace";
import { parsePosSaleLockFromSearchParams } from "@/lib/pos-sale-lock";

function AdminWholesaleCheckoutPageInner() {
  const searchParams = useSearchParams();
  const saleLock = parsePosSaleLockFromSearchParams(searchParams);
  return (
    <PosCheckoutWorkspace saleChannel="wholesale" saleLock={saleLock} />
  );
}

export default function AdminWholesaleCheckoutPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[40vh] items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      }
    >
      <AdminWholesaleCheckoutPageInner />
    </Suspense>
  );
}
