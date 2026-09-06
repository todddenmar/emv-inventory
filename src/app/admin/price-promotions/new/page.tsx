"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { LinkButton } from "@/components/ui/link-button";
import { Card, CardContent } from "@/components/ui/card";
import { PricePromotionForm } from "@/components/admin/price-promotion-form";
import { useBranchAccess } from "@/hooks/use-branch-access";
import { useAuthStore } from "@/stores/auth-store";
import { createPricePromotion } from "@/lib/firestore/price-promotions";

export default function NewPricePromotionPage() {
  const router = useRouter();
  const { canManagePricePromotions } = useBranchAccess();
  const user = useAuthStore((s) => s.user);
  const [submitting, setSubmitting] = useState(false);

  if (!canManagePricePromotions) {
    return (
      <Card>
        <CardContent className="pt-6">
          <p className="text-muted-foreground">
            Only admins and owners can create price promotions.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <LinkButton href="/admin/price-promotions" variant="ghost" size="icon">
          <ArrowLeft className="h-4 w-4" />
          <span className="sr-only">Back</span>
        </LinkButton>
        <div>
          <h1 className="text-2xl font-bold">New price promotion</h1>
          <p className="text-muted-foreground">
            Set temporary cash and retail prices for selected variants
          </p>
        </div>
      </div>

      <PricePromotionForm
        submitting={submitting}
        submitLabel="Create sale"
        onSubmit={async (values) => {
          if (!user) return;
          setSubmitting(true);
          try {
            const id = await createPricePromotion({
              ...values,
              createdBy: user.uid,
              createdByName: user.displayName ?? user.email ?? null,
            });
            toast.success("Sale created");
            router.push(`/admin/price-promotions/${id}`);
          } catch (err) {
            toast.error(
              err instanceof Error ? err.message : "Failed to create sale"
            );
            setSubmitting(false);
          }
        }}
      />
    </div>
  );
}
