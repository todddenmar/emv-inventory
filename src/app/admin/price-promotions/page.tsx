"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Loader2, MoreHorizontal, Pencil, Plus, StopCircle } from "lucide-react";
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { TablePagination } from "@/components/admin/table-pagination";
import { useBranchAccess } from "@/hooks/use-branch-access";
import { useAuthStore } from "@/stores/auth-store";
import {
  endPricePromotion,
  getPricePromotions,
} from "@/lib/firestore/price-promotions";
import {
  isPricePromotionCurrentlyActive,
  pricePromotionDisplayStatus,
} from "@/lib/product-pricing";
import { formatCurrency, formatDate } from "@/lib/format";
import { paginateItems } from "@/lib/pagination";
import type { PricePromotion } from "@/types";

type StatusFilter = "all" | "live" | "active" | "scheduled" | "ended" | "expired";

function displayStatus(promo: PricePromotion, now: Date): string {
  return pricePromotionDisplayStatus(promo, now);
}

function promoItemPreview(promo: PricePromotion, limit = 3): string {
  return promo.items
    .slice(0, limit)
    .map(
      (item) =>
        `${item.productName} ${formatCurrency(item.salePrice)}${
          item.saleRetailPrice != null
            ? ` / ${formatCurrency(item.saleRetailPrice)}`
            : ""
        }`
    )
    .join(" · ");
}

function PromoRowActions({
  promo,
  status,
  ending,
  onEnd,
}: {
  promo: PricePromotion;
  status: string;
  ending: boolean;
  onEnd: () => void;
}) {
  const canEnd = status === "active" || status === "scheduled";
  const editLabel =
    status === "ended" || status === "expired" ? "Start again" : "Edit";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button variant="ghost" size="icon-sm">
            {ending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <MoreHorizontal className="h-4 w-4" />
            )}
            <span className="sr-only">Open actions</span>
          </Button>
        }
      />
      <DropdownMenuContent align="end">
        <DropdownMenuItem
          render={
            <Link href={`/admin/price-promotions/${promo.id}`}>
              <Pencil className="h-4 w-4" />
              {editLabel}
            </Link>
          }
        />
        {canEnd ? (
          <DropdownMenuItem disabled={ending} onClick={onEnd}>
            <StopCircle className="h-4 w-4" />
            End now
          </DropdownMenuItem>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function statusBadgeVariant(
  status: string
): "default" | "secondary" | "outline" | "destructive" {
  switch (status) {
    case "active":
      return "default";
    case "scheduled":
      return "secondary";
    case "expired":
    case "ended":
      return "outline";
    default:
      return "outline";
  }
}

export default function AdminPricePromotionsPage() {
  const { canManagePricePromotions } = useBranchAccess();
  const user = useAuthStore((s) => s.user);
  const [promotions, setPromotions] = useState<PricePromotion[]>([]);
  const [loading, setLoading] = useState(true);
  const [endingId, setEndingId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [page, setPage] = useState(1);
  const now = useMemo(() => new Date(), [promotions]);

  const load = () => {
    getPricePromotions()
      .then(setPromotions)
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    if (statusFilter === "all") return promotions;
    if (statusFilter === "live") {
      return promotions.filter((p) => isPricePromotionCurrentlyActive(p, now));
    }
    return promotions.filter((p) => displayStatus(p, now) === statusFilter);
  }, [promotions, statusFilter, now]);

  useEffect(() => {
    setPage(1);
  }, [statusFilter]);

  const {
    page: safePage,
    totalPages,
    pagedItems,
    total,
  } = useMemo(() => paginateItems(filtered, page), [filtered, page]);

  useEffect(() => {
    if (page !== safePage) setPage(safePage);
  }, [page, safePage]);

  const handleEnd = async (id: string) => {
    if (!user) return;
    setEndingId(id);
    try {
      await endPricePromotion(id, {
        performedBy: user.uid,
        performedByName: user.displayName ?? user.email ?? null,
      });
      toast.success("Sale ended — catalog prices apply again");
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to end sale");
    } finally {
      setEndingId(null);
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

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Price promotions</h1>
          <p className="text-muted-foreground">
            Temporary cash and retail sale prices that expire or end manually
          </p>
        </div>
        <LinkButton href="/admin/price-promotions/new">
          <Plus className="mr-2 h-4 w-4" />
          New sale
        </LinkButton>
      </div>

      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle>All promotions</CardTitle>
            <CardDescription>
              Active sales overlay catalog prices in POS only
            </CardDescription>
          </div>
          <Select
            value={statusFilter}
            onValueChange={(v) => setStatusFilter((v as StatusFilter) ?? "all")}
          >
            <SelectTrigger className="w-full sm:w-44">
              <SelectValue>
                {(value) => {
                  switch (value) {
                    case "live":
                      return "Live now";
                    case "active":
                      return "Active";
                    case "scheduled":
                      return "Scheduled";
                    case "ended":
                      return "Ended";
                    case "expired":
                      return "Expired";
                    default:
                      return "All";
                  }
                }}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="live">Live now</SelectItem>
              <SelectItem value="scheduled">Scheduled</SelectItem>
              <SelectItem value="ended">Ended</SelectItem>
              <SelectItem value="expired">Expired</SelectItem>
            </SelectContent>
          </Select>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-muted-foreground">Loading...</p>
          ) : filtered.length === 0 ? (
            <p className="text-muted-foreground">
              No promotions yet.{" "}
              <Link
                href="/admin/price-promotions/new"
                className="underline underline-offset-2"
              >
                Create a one-day sale
              </Link>
              .
            </p>
          ) : (
            <>
              <ul className="space-y-3 md:hidden">
                {pagedItems.map((promo) => {
                  const status = displayStatus(promo, now);
                  const preview = promoItemPreview(promo);
                  const extra = Math.max(0, promo.items.length - 3);
                  return (
                    <li key={promo.id} className="rounded-lg border p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <Link
                            href={`/admin/price-promotions/${promo.id}`}
                            className="font-medium hover:underline"
                          >
                            {promo.name}
                          </Link>
                          <div className="mt-1">
                            <Badge variant={statusBadgeVariant(status)}>
                              {status}
                            </Badge>
                          </div>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {formatDate(promo.startsAt)}
                            {" → "}
                            {promo.endsAt
                              ? formatDate(promo.endsAt)
                              : "until ended"}
                          </p>
                          {preview ? (
                            <p className="mt-2 text-sm">
                              {preview}
                              {extra > 0 ? ` · +${extra} more` : ""}
                            </p>
                          ) : (
                            <p className="mt-2 text-sm text-muted-foreground">
                              {promo.itemCount} item
                              {promo.itemCount === 1 ? "" : "s"}
                            </p>
                          )}
                        </div>
                        <PromoRowActions
                          promo={promo}
                          status={status}
                          ending={endingId === promo.id}
                          onEnd={() => void handleEnd(promo.id)}
                        />
                      </div>
                    </li>
                  );
                })}
              </ul>

              <div className="hidden overflow-x-auto rounded-md border md:block">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Window</TableHead>
                      <TableHead>Items</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pagedItems.map((promo) => {
                      const status = displayStatus(promo, now);
                      return (
                        <TableRow key={promo.id}>
                          <TableCell className="font-medium">
                            <Link
                              href={`/admin/price-promotions/${promo.id}`}
                              className="hover:underline"
                            >
                              {promo.name}
                            </Link>
                            {promo.items[0] ? (
                              <p className="mt-0.5 text-xs text-muted-foreground">
                                {promo.items[0].productName}{" "}
                                {formatCurrency(promo.items[0].salePrice)}
                                {promo.itemCount > 1
                                  ? ` · +${promo.itemCount - 1}`
                                  : ""}
                              </p>
                            ) : null}
                          </TableCell>
                          <TableCell>
                            <Badge variant={statusBadgeVariant(status)}>
                              {status}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {formatDate(promo.startsAt)}
                            {" → "}
                            {promo.endsAt
                              ? formatDate(promo.endsAt)
                              : "until ended"}
                          </TableCell>
                          <TableCell className="tabular-nums">
                            {promo.itemCount}
                          </TableCell>
                          <TableCell className="text-right">
                            <PromoRowActions
                              promo={promo}
                              status={status}
                              ending={endingId === promo.id}
                              onEnd={() => void handleEnd(promo.id)}
                            />
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
              <TablePagination
                page={safePage}
                totalPages={totalPages}
                total={total}
                onPageChange={setPage}
                className="mt-4"
              />
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
