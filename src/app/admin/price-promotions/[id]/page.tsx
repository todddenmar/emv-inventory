"use client";

import { use, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Loader2, StopCircle } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { LinkButton } from "@/components/ui/link-button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useBranchAccess } from "@/hooks/use-branch-access";
import { useAuthStore } from "@/stores/auth-store";
import {
  endPricePromotion,
  getPricePromotion,
} from "@/lib/firestore/price-promotions";
import { isPricePromotionCurrentlyActive } from "@/lib/product-pricing";
import { formatCurrency, formatDate } from "@/lib/format";
import type { PricePromotion } from "@/types";

export default function PricePromotionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const { isElevatedAdmin } = useBranchAccess();
  const user = useAuthStore((s) => s.user);
  const [promo, setPromo] = useState<PricePromotion | null>(null);
  const [loading, setLoading] = useState(true);
  const [ending, setEnding] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const loaded = await getPricePromotion(id);
      if (!loaded) {
        toast.error("Promotion not found");
        router.replace("/admin/price-promotions");
        return;
      }
      setPromo(loaded);
    } catch (error) {
      console.error(error);
      toast.error("Failed to load promotion");
    } finally {
      setLoading(false);
    }
  }, [id, router]);

  useEffect(() => {
    void load();
  }, [load]);

  const now = useMemo(() => new Date(), [promo]);
  const live = promo ? isPricePromotionCurrentlyActive(promo, now) : false;
  const canEnd = promo != null && promo.status !== "ended";

  const handleEnd = async () => {
    if (!user || !promo) return;
    setEnding(true);
    try {
      await endPricePromotion(promo.id, {
        performedBy: user.uid,
        performedByName: user.displayName ?? user.email ?? null,
      });
      toast.success("Sale ended");
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to end sale");
    } finally {
      setEnding(false);
    }
  };

  if (!isElevatedAdmin) {
    return (
      <Card>
        <CardContent className="pt-6">
          <p className="text-muted-foreground">
            Only admins can manage price promotions.
          </p>
        </CardContent>
      </Card>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading…
      </div>
    );
  }

  if (!promo) return null;

  const statusLabel = promo.status === "ended"
    ? "ended"
    : live
      ? "active"
      : promo.startsAt.getTime() > now.getTime()
        ? "scheduled"
        : "expired";

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-2">
          <LinkButton href="/admin/price-promotions" variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
            <span className="sr-only">Back</span>
          </LinkButton>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-bold">{promo.name}</h1>
              <Badge variant={live ? "default" : "outline"}>{statusLabel}</Badge>
            </div>
            <p className="text-muted-foreground">
              {formatDate(promo.startsAt)}
              {" → "}
              {promo.endsAt ? formatDate(promo.endsAt) : "until ended manually"}
            </p>
          </div>
        </div>
        {canEnd && promo.status !== "ended" ? (
          <Button
            variant="outline"
            disabled={ending}
            onClick={() => void handleEnd()}
          >
            {ending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <StopCircle className="mr-2 h-4 w-4" />
            )}
            End now
          </Button>
        ) : null}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Sale prices</CardTitle>
          <CardDescription>
            {promo.itemCount} variant{promo.itemCount === 1 ? "" : "s"}. Base
            values are snapshots from when the sale was created.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Variant</TableHead>
                  <TableHead>Base cash</TableHead>
                  <TableHead>Sale cash</TableHead>
                  <TableHead>Base retail</TableHead>
                  <TableHead>Sale retail</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {promo.items.map((item) => (
                  <TableRow key={item.variantId}>
                    <TableCell className="font-medium">
                      {item.productName}
                    </TableCell>
                    <TableCell className="tabular-nums text-muted-foreground">
                      {formatCurrency(item.basePrice)}
                    </TableCell>
                    <TableCell className="tabular-nums font-medium">
                      {formatCurrency(item.salePrice)}
                    </TableCell>
                    <TableCell className="tabular-nums text-muted-foreground">
                      {item.baseRetailPrice != null
                        ? formatCurrency(item.baseRetailPrice)
                        : "—"}
                    </TableCell>
                    <TableCell className="tabular-nums">
                      {item.saleRetailPrice != null
                        ? formatCurrency(item.saleRetailPrice)
                        : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
