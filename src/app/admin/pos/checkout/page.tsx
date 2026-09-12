"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { PosCheckoutWorkspace } from "@/components/admin/pos-checkout-workspace";
import { parsePosSaleLockFromSearchParams } from "@/lib/pos-sale-lock";

function AdminPosCheckoutPageInner() {
  const searchParams = useSearchParams();
  const saleLock = parsePosSaleLockFromSearchParams(searchParams);
  return <PosCheckoutWorkspace saleChannel="shop" saleLock={saleLock} />;
}

export default function AdminPosCheckoutPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[40vh] items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      }
    >
      <AdminPosCheckoutPageInner />
    </Suspense>
  );
}
