"use client";

import { Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatCurrency, formatDate } from "@/lib/format";
import {
  formatSaleItemsSummary,
  voucherSaleCustomerName,
  voucherSaleResellerLabel,
} from "@/lib/voucher-sales";
import type { PosSale } from "@/types";

interface VoucherSalesTableProps {
  sales: PosSale[];
  loading?: boolean;
  emptyMessage?: string;
  showVoucherCode?: boolean;
  showBranch?: boolean;
  showCommission?: boolean;
  canMarkCommission?: boolean;
  markingId?: string | null;
  onMarkCommissionSent?: (saleId: string) => void;
  onClearCommissionSent?: (saleId: string) => void;
}

export function VoucherSalesTable({
  sales,
  loading = false,
  emptyMessage = "No voucher sales found.",
  showVoucherCode = true,
  showBranch = false,
  showCommission = true,
  canMarkCommission = false,
  markingId = null,
  onMarkCommissionSent,
  onClearCommissionSent,
}: VoucherSalesTableProps) {
  if (loading) {
    return <p className="text-muted-foreground">Loading voucher sales…</p>;
  }
  if (sales.length === 0) {
    return <p className="text-muted-foreground">{emptyMessage}</p>;
  }

  return (
    <div className="overflow-x-auto rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Date</TableHead>
            {showBranch ? <TableHead>Branch</TableHead> : null}
            {showVoucherCode ? <TableHead>Voucher</TableHead> : null}
            <TableHead>Customer</TableHead>
            <TableHead>Reseller</TableHead>
            <TableHead>Sold items</TableHead>
            <TableHead className="text-right">Less</TableHead>
            {showCommission ? <TableHead>Commission</TableHead> : null}
          </TableRow>
        </TableHeader>
        <TableBody>
          {sales.map((sale) => {
            const hasReseller = Boolean(sale.resellerId);
            const sent = sale.resellerCommissionSentAt != null;
            const marking = markingId === sale.id;

            return (
              <TableRow key={sale.id}>
                <TableCell className="whitespace-nowrap text-sm">
                  {formatDate(sale.createdAt)}
                </TableCell>
                {showBranch ? (
                  <TableCell className="text-sm">{sale.branchName}</TableCell>
                ) : null}
                {showVoucherCode ? (
                  <TableCell className="font-mono text-sm">
                    {sale.voucherCode ?? "—"}
                  </TableCell>
                ) : null}
                <TableCell>{voucherSaleCustomerName(sale)}</TableCell>
                <TableCell>{voucherSaleResellerLabel(sale)}</TableCell>
                <TableCell className="max-w-xs text-sm">
                  {formatSaleItemsSummary(sale)}
                </TableCell>
                <TableCell className="text-right tabular-nums font-medium">
                  −{formatCurrency(sale.voucherAmountApplied)}
                </TableCell>
                {showCommission ? (
                  <TableCell>
                    {!hasReseller ? (
                      <span className="text-xs text-muted-foreground">
                        No reseller
                      </span>
                    ) : sent ? (
                      <div className="space-y-1">
                        <Badge variant="secondary">Sent</Badge>
                        <p className="text-xs text-muted-foreground">
                          {formatDate(sale.resellerCommissionSentAt!)}
                          {sale.resellerCommissionSentByName
                            ? ` · ${sale.resellerCommissionSentByName}`
                            : ""}
                        </p>
                        {canMarkCommission && onClearCommissionSent ? (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-xs"
                            disabled={marking}
                            onClick={() => onClearCommissionSent(sale.id)}
                          >
                            {marking ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              "Undo"
                            )}
                          </Button>
                        ) : null}
                      </div>
                    ) : canMarkCommission && onMarkCommissionSent ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={marking}
                        onClick={() => onMarkCommissionSent(sale.id)}
                      >
                        {marking ? (
                          <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                        ) : null}
                        Mark sent
                      </Button>
                    ) : (
                      <Badge variant="outline">Pending</Badge>
                    )}
                  </TableCell>
                ) : null}
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
