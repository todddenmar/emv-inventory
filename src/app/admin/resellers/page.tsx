"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { MoreHorizontal, Search } from "lucide-react";
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
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { TablePagination } from "@/components/admin/table-pagination";
import { getResellers } from "@/lib/firestore/resellers";
import { getVoucherSales } from "@/lib/firestore/pos-sales";
import { getVouchers } from "@/lib/firestore/vouchers";
import { formatCurrency } from "@/lib/format";
import { paginateItems } from "@/lib/pagination";
import { summarizeVoucherCommission } from "@/lib/voucher-sales";
import type { Reseller } from "@/types";

type ResellerRow = Reseller & {
  voucherCount: number;
  saleCount: number;
  pendingCommission: number;
};

export default function AdminResellersPage() {
  const router = useRouter();
  const [rows, setRows] = useState<ResellerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  useEffect(() => {
    Promise.all([getResellers(), getVouchers(), getVoucherSales({ max: 2000 })])
      .then(([resellers, vouchers, sales]) => {
        const next = resellers.map((reseller) => {
          const resellerVouchers = vouchers.filter(
            (v) => v.resellerId === reseller.id
          );
          const resellerSales = sales.filter(
            (s) => s.resellerId === reseller.id
          );
          const summary = summarizeVoucherCommission(resellerSales);
          return {
            ...reseller,
            voucherCount: resellerVouchers.length,
            saleCount: summary.saleCount,
            pendingCommission: summary.pendingLess,
          };
        });
        setRows(next);
      })
      .catch((err) => {
        console.error(err);
        toast.error("Failed to load resellers");
      })
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (row) =>
        row.name.toLowerCase().includes(q) ||
        (row.mobile?.toLowerCase().includes(q) ?? false) ||
        (row.email?.toLowerCase().includes(q) ?? false)
    );
  }, [rows, search]);

  useEffect(() => {
    setPage(1);
  }, [search]);

  const {
    page: safePage,
    totalPages,
    pagedItems,
    total,
  } = useMemo(() => paginateItems(filtered, page), [filtered, page]);

  useEffect(() => {
    if (page !== safePage) setPage(safePage);
  }, [page, safePage]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Resellers</h1>
          <p className="text-muted-foreground">
            Commission overview, vouchers, and voucher sales by partner
          </p>
        </div>
        <LinkButton href="/admin/settings/resellers" variant="outline">
          Manage resellers
        </LinkButton>
      </div>

      <Card>
        <CardHeader className="gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <CardTitle>All resellers</CardTitle>
            <CardDescription>
              Open a reseller to see vouchers and sales commission
            </CardDescription>
          </div>
          <div className="relative w-full sm:max-w-sm">
            <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="Search resellers…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-muted-foreground">Loading…</p>
          ) : filtered.length === 0 ? (
            <p className="text-muted-foreground">No resellers found.</p>
          ) : (
            <div className="space-y-4">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Contact</TableHead>
                    <TableHead>Vouchers</TableHead>
                    <TableHead>Voucher sales</TableHead>
                    <TableHead className="text-right">
                      Pending commission
                    </TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pagedItems.map((reseller) => (
                    <TableRow key={reseller.id}>
                      <TableCell className="font-medium">
                        {reseller.name}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {[reseller.mobile, reseller.email]
                          .filter(Boolean)
                          .join(" · ") || "—"}
                      </TableCell>
                      <TableCell>{reseller.voucherCount}</TableCell>
                      <TableCell>{reseller.saleCount}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatCurrency(reseller.pendingCommission)}
                      </TableCell>
                      <TableCell>
                        {reseller.isActive ? (
                          <Badge>Active</Badge>
                        ) : (
                          <Badge variant="secondary">Inactive</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger
                            render={
                              <Button
                                type="button"
                                size="icon"
                                variant="ghost"
                              >
                                <MoreHorizontal className="h-4 w-4" />
                                <span className="sr-only">Actions</span>
                              </Button>
                            }
                          />
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              onClick={() =>
                                router.push(`/admin/resellers/${reseller.id}`)
                              }
                            >
                              View
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <TablePagination
                page={safePage}
                totalPages={totalPages}
                total={total}
                onPageChange={setPage}
              />
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
