"use client";

import { useEffect, useState, type ComponentType } from "react";
import {
  Banknote,
  Loader2,
  MapPin,
  Mail,
  Phone,
  Receipt,
  Store,
  User,
  UsersRound,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getPosSale } from "@/lib/firestore/pos-sales";
import { paymentAccountTypeLabel } from "@/lib/firestore/payment-accounts";
import { formatCurrency, formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { PosSale } from "@/types";

interface SaleInvoiceDialogProps {
  sale: PosSale | null;
  saleId?: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function priceListLabel(method: PosSale["paymentMethod"]): string {
  return method === "retail" ? "Retail" : "Cash";
}

function tenderMethodLabel(method: PosSale["tenderMethod"]): string {
  switch (method) {
    case "ewallet":
      return "E-wallet";
    case "home_credit":
      return "Home Credit";
    case "skyro":
      return "Skyro";
    case "salmon":
      return "Salmon";
    case "card_swipe":
      return "Card/Swipe";
    default:
      return "Cash";
  }
}

function customerTypeLabel(type: PosSale["customerType"]): string {
  if (type === "reservation") return "Reservation";
  if (type === "delivery") return "Delivery";
  return "Walk in";
}

function MetaChip({
  icon: Icon,
  label,
  value,
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  value: string;
}) {
  return (
    <div className="flex min-w-0 items-start gap-2.5 rounded-lg bg-muted/50 px-3 py-2.5">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0">
        <p className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
          {label}
        </p>
        <p className="truncate text-sm font-medium">{value}</p>
      </div>
    </div>
  );
}

function SaleInvoiceBody({ sale }: { sale: PosSale }) {
  const customer = sale.customer;
  const hasCustomer = Boolean(
    customer?.name ||
      customer?.mobile ||
      customer?.email ||
      customer?.address
  );
  const amountDue = sale.amountDue ?? sale.total;
  const hasVoucher = Boolean(
    sale.voucherCode || (sale.voucherAmountApplied ?? 0) > 0
  );
  const paymentAccount = sale.paymentAccount;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        {sale.saleChannel === "wholesale" ? (
          <Badge variant="default">Wholesale</Badge>
        ) : null}
        <Badge variant="secondary">
          {tenderMethodLabel(sale.tenderMethod)}
        </Badge>
        <Badge variant="outline">{customerTypeLabel(sale.customerType)}</Badge>
        <Badge variant="outline" className="font-mono text-[10px]">
          {sale.id.slice(0, 8)}…
        </Badge>
        <span className="text-sm text-muted-foreground">
          {formatDate(sale.createdAt)}
        </span>
      </div>

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <MetaChip
          icon={Store}
          label="Branch"
          value={sale.branchName || sale.branchId}
        />
        <MetaChip
          icon={User}
          label="Staff"
          value={sale.createdByName ?? "Staff"}
        />
        <MetaChip
          icon={Banknote}
          label="Payment method"
          value={tenderMethodLabel(sale.tenderMethod)}
        />
        <MetaChip
          icon={Receipt}
          label="Items"
          value={`${sale.itemCount} line${sale.itemCount === 1 ? "" : "s"}`}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(16rem,0.9fr)] lg:items-start">
        <section className="min-w-0 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold">Line items</h3>
            <span className="text-xs text-muted-foreground">
              {sale.items.length} product{sale.items.length === 1 ? "" : "s"}
            </span>
          </div>

          {/* Mobile cards */}
          <ul className="space-y-2 md:hidden">
            {sale.items.map((item) => (
              <li
                key={`${item.variantId}-${item.productId}`}
                className="rounded-lg border px-3 py-2.5"
              >
                <div className="flex items-start justify-between gap-3">
                  <p className="min-w-0 flex-1 text-sm font-medium leading-snug">
                    {item.productName}
                  </p>
                  <p className="shrink-0 text-sm font-semibold tabular-nums">
                    {formatCurrency(item.lineTotal)}
                  </p>
                </div>
                <p className="mt-1 text-xs text-muted-foreground tabular-nums">
                  {item.quantity} × {formatCurrency(item.unitPrice)}
                </p>
              </li>
            ))}
          </ul>

          {/* Desktop table */}
          <div className="hidden overflow-x-auto rounded-lg border md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead className="w-20 text-right">Qty</TableHead>
                  <TableHead className="w-28 text-right">Unit</TableHead>
                  <TableHead className="w-28 text-right">Line total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sale.items.map((item) => (
                  <TableRow key={`${item.variantId}-${item.productId}`}>
                    <TableCell className="font-medium">
                      {item.productName}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {item.quantity}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {formatCurrency(item.unitPrice)}
                    </TableCell>
                    <TableCell className="text-right font-medium tabular-nums">
                      {formatCurrency(item.lineTotal)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </section>

        <aside className="space-y-3">
          <section className="rounded-xl border bg-muted/20 p-4">
            <h3 className="mb-3 text-sm font-semibold">Payment details</h3>
            <dl className="space-y-2.5 text-sm">
              <div className="flex items-center justify-between gap-3">
                <dt className="text-muted-foreground">Channel</dt>
                <dd className="font-medium">
                  {sale.saleChannel === "wholesale" ? "Wholesale" : "Shop"}
                </dd>
              </div>
              {sale.saleChannel !== "wholesale" ? (
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-muted-foreground">Price list</dt>
                  <dd className="font-medium">
                    {priceListLabel(sale.paymentMethod)}
                  </dd>
                </div>
              ) : null}
              <div className="flex items-center justify-between gap-3">
                <dt className="text-muted-foreground">Payment</dt>
                <dd className="font-medium">
                  {tenderMethodLabel(sale.tenderMethod)}
                </dd>
              </div>
              {paymentAccount ? (
                <>
                  <div className="flex items-center justify-between gap-3">
                    <dt className="text-muted-foreground">
                      {paymentAccountTypeLabel(paymentAccount.type)}
                    </dt>
                    <dd className="text-right font-medium">
                      {paymentAccount.provider}
                    </dd>
                  </div>
                  <div className="flex items-start justify-between gap-3">
                    <dt className="text-muted-foreground">Account</dt>
                    <dd className="max-w-[60%] text-right text-xs">
                      <span className="block font-medium">
                        {paymentAccount.accountName}
                      </span>
                      <span className="font-mono text-muted-foreground">
                        {paymentAccount.accountNumber}
                      </span>
                    </dd>
                  </div>
                </>
              ) : null}
              <div className="flex items-center justify-between gap-3">
                <dt className="text-muted-foreground">Customer type</dt>
                <dd className="font-medium">
                  {customerTypeLabel(sale.customerType)}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-muted-foreground">Subtotal</dt>
                <dd className="tabular-nums">{formatCurrency(sale.total)}</dd>
              </div>
              {hasVoucher ? (
                <>
                  {sale.voucherCode ? (
                    <div className="flex items-center justify-between gap-3">
                      <dt className="text-muted-foreground">Voucher code</dt>
                      <dd className="font-mono text-xs font-medium">
                        {sale.voucherCode}
                      </dd>
                    </div>
                  ) : null}
                  {(sale.voucherAmountApplied ?? 0) > 0 ? (
                    <div className="flex items-center justify-between gap-3">
                      <dt className="text-muted-foreground">Voucher applied</dt>
                      <dd className="tabular-nums text-emerald-700">
                        −{formatCurrency(sale.voucherAmountApplied)}
                      </dd>
                    </div>
                  ) : null}
                </>
              ) : null}
              {sale.resellerName ? (
                <div className="flex items-start justify-between gap-3">
                  <dt className="flex items-center gap-1.5 text-muted-foreground">
                    <UsersRound className="h-3.5 w-3.5" />
                    Reseller
                  </dt>
                  <dd className="max-w-[55%] text-right font-medium">
                    {sale.resellerName}
                  </dd>
                </div>
              ) : null}
              <div className="flex items-center justify-between gap-3 border-t pt-3 text-base font-semibold">
                <dt>Amount due</dt>
                <dd className="tabular-nums">{formatCurrency(amountDue)}</dd>
              </div>
            </dl>
          </section>

          {hasCustomer || sale.customerType !== "walk_in" ? (
            <section className="rounded-xl border p-4">
              <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold">
                <User className="h-4 w-4 text-muted-foreground" />
                Customer
              </h3>
              <dl className="space-y-3 text-sm">
                <div>
                  <dt className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
                    Type
                  </dt>
                  <dd className="font-medium">
                    {customerTypeLabel(sale.customerType)}
                  </dd>
                </div>
                {customer?.name ? (
                  <div>
                    <dt className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
                      Name
                    </dt>
                    <dd className="font-medium">{customer.name}</dd>
                  </div>
                ) : null}
                {customer?.mobile ? (
                  <div className="flex items-start gap-2">
                    <Phone className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    <div>
                      <dt className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
                        Mobile
                      </dt>
                      <dd className="font-medium">{customer.mobile}</dd>
                    </div>
                  </div>
                ) : null}
                {customer?.email ? (
                  <div className="flex items-start gap-2">
                    <Mail className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    <div className="min-w-0">
                      <dt className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
                        Email
                      </dt>
                      <dd className="break-all font-medium">{customer.email}</dd>
                    </div>
                  </div>
                ) : null}
                {customer?.address ? (
                  <div className="flex items-start gap-2">
                    <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    <div>
                      <dt className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
                        Address
                      </dt>
                      <dd className="font-medium leading-snug">
                        {customer.address}
                      </dd>
                    </div>
                  </div>
                ) : null}
              </dl>
            </section>
          ) : null}

          <p className="px-1 text-[11px] break-all text-muted-foreground">
            Full invoice ID: {sale.id}
          </p>
        </aside>
      </div>
    </div>
  );
}

export function SaleInvoiceDialog({
  sale,
  saleId = null,
  open,
  onOpenChange,
}: SaleInvoiceDialogProps) {
  const [loaded, setLoaded] = useState<PosSale | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) {
      setLoaded(null);
      setLoading(false);
      return;
    }

    if (sale) {
      setLoaded(sale);
      setLoading(false);
      return;
    }

    if (!saleId) {
      setLoaded(null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    getPosSale(saleId)
      .then((row) => {
        if (cancelled) return;
        if (!row) {
          toast.error("Sale not found");
          onOpenChange(false);
          return;
        }
        setLoaded(row);
      })
      .catch((error) => {
        console.error(error);
        if (!cancelled) {
          toast.error("Failed to load sale invoice");
          onOpenChange(false);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, sale, saleId, onOpenChange]);

  const invoice = sale ?? loaded;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          "flex max-h-[92dvh] w-[calc(100%-1.25rem)] flex-col gap-0 overflow-hidden p-0",
          "sm:max-w-2xl md:max-w-3xl lg:max-w-5xl"
        )}
      >
        <DialogHeader className="shrink-0 border-b px-4 py-4 sm:px-6">
          <DialogTitle className="flex items-center gap-2 text-base sm:text-lg">
            <Receipt className="h-4 w-4 sm:h-5 sm:w-5" />
            Sale invoice
          </DialogTitle>
          <DialogDescription>
            Receipt, payment, and customer details for this POS sale
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6 sm:py-5">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading invoice…
            </div>
          ) : invoice ? (
            <SaleInvoiceBody sale={invoice} />
          ) : (
            <p className="py-12 text-center text-sm text-muted-foreground">
              No sale selected.
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function SaleInvoiceButton({
  sale,
  saleId,
  disabled,
}: {
  sale?: PosSale | null;
  saleId?: string | null;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const canOpen = Boolean(sale || saleId);

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        disabled={disabled || !canOpen}
        onClick={() => setOpen(true)}
        title="View invoice"
      >
        <Receipt className="h-4 w-4" />
        <span className="sr-only">View invoice</span>
      </Button>
      <SaleInvoiceDialog
        sale={sale ?? null}
        saleId={saleId ?? null}
        open={open}
        onOpenChange={setOpen}
      />
    </>
  );
}
