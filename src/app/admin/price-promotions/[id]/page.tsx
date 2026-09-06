"use client";

import { use, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Loader2, Pencil, StopCircle } from "lucide-react";
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
  AddPromotionVariantDialog,
  PricePromotionDetailsDialog,
  PricePromotionIncludedItems,
  applyPriceDrafts,
  draftsFromItems,
  type PriceDraft,
} from "@/components/admin/price-promotion-editor";
import { useBranchAccess } from "@/hooks/use-branch-access";
import { useAuthStore } from "@/stores/auth-store";
import {
  endPricePromotion,
  getPricePromotion,
  updatePricePromotion,
} from "@/lib/firestore/price-promotions";
import {
  isPricePromotionCurrentlyActive,
  pricePromotionDisplayStatus,
} from "@/lib/product-pricing";
import { formatDate } from "@/lib/format";
import type { PricePromotion, PricePromotionItem } from "@/types";

export default function PricePromotionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const { canManagePricePromotions } = useBranchAccess();
  const user = useAuthStore((s) => s.user);
  const [promo, setPromo] = useState<PricePromotion | null>(null);
  const [loading, setLoading] = useState(true);
  const [ending, setEnding] = useState(false);
  const [savingDetails, setSavingDetails] = useState(false);
  const [savingPrices, setSavingPrices] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, PriceDraft>>({});

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
      setDrafts(draftsFromItems(loaded.items));
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
  const statusLabel = promo
    ? pricePromotionDisplayStatus(promo, now)
    : "ended";
  const canEnd = promo != null && promo.status !== "ended";
  const restarting =
    promo != null && (statusLabel === "ended" || statusLabel === "expired");

  const pricesDirty = useMemo(() => {
    if (!promo) return false;
    return promo.items.some((item) => {
      const draft = drafts[item.variantId];
      if (!draft) return false;
      const retail =
        item.saleRetailPrice != null ? String(item.saleRetailPrice) : "";
      return (
        draft.salePrice !== String(item.salePrice) ||
        draft.saleRetailPrice !== retail
      );
    });
  }, [promo, drafts]);

  const persist = async (
    items: PricePromotionItem[],
    extra?: { name: string; startsAt: Date; endsAt: Date | null }
  ) => {
    if (!user || !promo) return;
    await updatePricePromotion(promo.id, {
      name: extra?.name ?? promo.name,
      startsAt: extra?.startsAt ?? promo.startsAt,
      endsAt: extra ? extra.endsAt : promo.endsAt,
      items,
      performedBy: user.uid,
      performedByName: user.displayName ?? user.email ?? null,
    });
  };

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

  const handleSaveDetails = async (values: {
    name: string;
    startsAt: Date;
    endsAt: Date | null;
  }) => {
    if (!promo) return;
    setSavingDetails(true);
    try {
      const items = pricesDirty
        ? applyPriceDrafts(promo.items, drafts)
        : promo.items;
      await persist(items, values);
      toast.success(restarting ? "Sale started again" : "Sale details updated");
      setDetailsOpen(false);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update sale");
    } finally {
      setSavingDetails(false);
    }
  };

  const handleSavePrices = async () => {
    if (!promo) return;
    setSavingPrices(true);
    try {
      await persist(applyPriceDrafts(promo.items, drafts));
      toast.success("Sale prices updated");
      await load();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to update prices"
      );
    } finally {
      setSavingPrices(false);
    }
  };

  const handleAdd = async (item: PricePromotionItem) => {
    if (!promo) return;
    const items = [...applyPriceDrafts(promo.items, drafts), item];
    await persist(items);
    toast.success("Variant added");
    await load();
  };

  const handleRemove = async (variantId: string) => {
    if (!promo) return;
    if (promo.items.length <= 1) {
      toast.error("Keep at least one variant on the sale");
      return;
    }
    const remaining = applyPriceDrafts(
      promo.items.filter((item) => item.variantId !== variantId),
      drafts
    );
    setSavingPrices(true);
    try {
      await persist(remaining);
      toast.success("Variant removed");
      await load();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to remove variant"
      );
    } finally {
      setSavingPrices(false);
    }
  };

  if (!canManagePricePromotions) {
    return (
      <Card>
        <CardContent className="pt-6">
          <p className="text-muted-foreground">
            Only admins and owners can manage price promotions.
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
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => setDetailsOpen(true)}>
            <Pencil className="mr-2 h-4 w-4" />
            {restarting ? "Start again" : "Edit"}
          </Button>
          {canEnd ? (
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
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Sale prices</CardTitle>
          <CardDescription>
            {promo.itemCount} variant{promo.itemCount === 1 ? "" : "s"} included.
            Search to add another. Base values are snapshots from when each
            variant was added.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <PricePromotionIncludedItems
            items={promo.items}
            drafts={drafts}
            onDraftChange={(variantId, patch) =>
              setDrafts((prev) => ({
                ...prev,
                [variantId]: { ...prev[variantId], ...patch },
              }))
            }
            onRemove={(variantId) => void handleRemove(variantId)}
            onAddClick={() => setAddOpen(true)}
            saving={savingPrices}
            onSave={() => void handleSavePrices()}
            pricesDirty={pricesDirty}
          />
        </CardContent>
      </Card>

      <PricePromotionDetailsDialog
        open={detailsOpen}
        onOpenChange={setDetailsOpen}
        promo={promo}
        submitting={savingDetails}
        onSave={handleSaveDetails}
      />
      <AddPromotionVariantDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        excludeVariantIds={new Set(promo.items.map((item) => item.variantId))}
        onAdd={handleAdd}
      />
    </div>
  );
}
