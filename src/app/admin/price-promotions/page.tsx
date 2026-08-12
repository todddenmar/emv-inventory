"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Loader2, Plus, StopCircle } from "lucide-react";
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
import { isPricePromotionCurrentlyActive } from "@/lib/product-pricing";
import { formatDate } from "@/lib/format";
import { paginateItems } from "@/lib/pagination";
import type { PricePromotion, PricePromotionStatus } from "@/types";

type StatusFilter = "all" | "live" | PricePromotionStatus;

function displayStatus(promo: PricePromotion, now: Date): string {
  if (promo.status === "ended" || promo.endedAt) return "ended";
  if (promo.endsAt && promo.endsAt.getTime() < now.getTime()) return "expired";
  if (promo.startsAt.getTime() > now.getTime()) return "scheduled";
  if (isPricePromotionCurrentlyActive(promo, now)) return "active";
  return promo.status;
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
  const { isElevatedAdmin } = useBranchAccess();
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
              <div className="overflow-x-auto rounded-md border">
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
                      const canEnd =
                        status === "active" || status === "scheduled";
                      return (
                        <TableRow key={promo.id}>
                          <TableCell className="font-medium">
                            <Link
                              href={`/admin/price-promotions/${promo.id}`}
                              className="hover:underline"
                            >
                              {promo.name}
                            </Link>
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
                            {canEnd ? (
                              <Button
                                variant="outline"
                                size="sm"
                                disabled={endingId === promo.id}
                                onClick={() => void handleEnd(promo.id)}
                              >
                                {endingId === promo.id ? (
                                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                ) : (
                                  <StopCircle className="mr-2 h-4 w-4" />
                                )}
                                End now
                              </Button>
                            ) : (
                              <span className="text-xs text-muted-foreground">
                                —
                              </span>
                            )}
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
