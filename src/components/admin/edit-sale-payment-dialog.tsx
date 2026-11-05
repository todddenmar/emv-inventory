"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getPaymentAccounts } from "@/lib/firestore/payment-accounts";
import { getPaymentMethods } from "@/lib/firestore/payment-methods";
import { getBranchInventory } from "@/lib/firestore/inventory";
import { getProducts } from "@/lib/firestore/products";
import { paymentMethodName } from "@/lib/payment-methods";
import {
  getPosSale,
  resolveSalePaymentDrafts,
  updatePosSale,
} from "@/lib/firestore/pos-sales";
import { formatCurrency } from "@/lib/format";
import { toDateInputValue } from "@/lib/dates";
import { useBranchAccess } from "@/hooks/use-branch-access";
import {
  canChangePosSaleDate,
  canEditPosSale,
} from "@/lib/pos-sale-edit";
import { formatVariantLabel } from "@/lib/product-variants";
import {
  isNonRevenueCustomerType,
  parsePosCustomerType,
  posCustomerTypeLabel,
  requiresPosCustomerName,
} from "@/lib/pos-customer-type";
import {
  POS_PAYMENT_KINDS,
  POS_TENDER_METHODS,
  accountTypeForTender,
  createItemPaymentLine,
  formatPaymentLineNote,
  itemPaymentsCoverLineTotal,
  moneyInputText,
  parseMoneyInput,
  paymentKindLabel,
  paymentRemaining,
  paymentsCoverAmountDue,
  roundMoney,
  salePaymentLineToCheckout,
  sumCheckoutPaymentAmounts,
  tenderNeedsPaymentAccount,
  type PosCheckoutPaymentLine,
} from "@/lib/pos-payments";
import type {
  BranchInventory,
  PaymentAccount,
  PaymentMethod,
  PosCustomerType,
  PosPaymentKind,
  PosPaymentMethod,
  PosSale,
  PosSaleItem,
  PosTenderMethod,
  Product,
} from "@/types";

type ItemLineDraft = {
  key: string;
  productId: string;
  variantId: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  priceList: PosPaymentMethod | null;
};

type CatalogOption = {
  variantId: string;
  productId: string;
  productName: string;
  stock: number;
  unitPrice: number;
};

type LineEditor = {
  payId: string | null;
  draft: PosCheckoutPaymentLine;
};

const CUSTOMER_TYPES: PosCustomerType[] = [
  "walk_in",
  "reservation",
  "delivery",
  "warranty",
  "replacement",
  "co_owner",
];

function accountsForTender(
  accounts: PaymentAccount[],
  method: PosTenderMethod,
  selectedId: string | null
): PaymentAccount[] {
  const expected = accountTypeForTender(method);
  if (!expected) return [];
  return accounts.filter(
    (account) =>
      account.type === expected && (account.isActive || account.id === selectedId)
  );
}

function buildItemLines(sale: PosSale): ItemLineDraft[] {
  return sale.items.map((item, index) => ({
    key: `${item.variantId}-${index}`,
    productId: item.productId,
    variantId: item.variantId,
    productName: item.productName,
    quantity: item.quantity,
    unitPrice: item.unitPrice,
    priceList: item.priceList,
  }));
}

function unitPriceFromCatalog(
  inv: BranchInventory,
  product: Product,
  sale: PosSale
): number {
  const variant = product.variants.find((row) => row.id === inv.variantId);
  if (!variant) return 0;
  if (sale.saleChannel === "wholesale") {
    return roundMoney(Math.max(0, Number(variant.wholesalePrice) || 0));
  }
  if (sale.paymentMethod === "retail") {
    return roundMoney(
      Math.max(
        0,
        Number(inv.retailPrice ?? variant.retailPrice ?? variant.price) || 0
      )
    );
  }
  return roundMoney(
    Math.max(0, Number(inv.cashPrice ?? variant.price) || 0)
  );
}

function catalogLabel(product: Product, variantId: string): string {
  const variant = product.variants.find((row) => row.id === variantId);
  if (!variant) return product.name;
  const label = formatVariantLabel(variant, product.options);
  return label === "Default" ? product.name : `${product.name} — ${label}`;
}

export function EditSalePaymentDialog({
  sale,
  saleId = null,
  open,
  onOpenChange,
  onUpdated,
}: {
  sale: PosSale | null;
  saleId?: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpdated?: (sale: PosSale) => void;
}) {
  const { user, assignedBranchId } = useBranchAccess();
  const [loaded, setLoaded] = useState<PosSale | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [accounts, setAccounts] = useState<PaymentAccount[]>([]);
  const [tenderMethods, setTenderMethods] = useState<PaymentMethod[]>([]);
  const [itemLines, setItemLines] = useState<ItemLineDraft[]>([]);
  const [saleDrafts, setSaleDrafts] = useState<PosCheckoutPaymentLine[]>([]);
  const [lineEditor, setLineEditor] = useState<LineEditor | null>(null);
  const [saleDate, setSaleDate] = useState("");
  const [allowUnequalPayments, setAllowUnequalPayments] = useState(false);
  const [customerType, setCustomerType] = useState<PosCustomerType>("walk_in");
  const [customerName, setCustomerName] = useState("");
  const [customerMobile, setCustomerMobile] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [customerAddress, setCustomerAddress] = useState("");
  const [catalog, setCatalog] = useState<CatalogOption[]>([]);
  const [addQuery, setAddQuery] = useState("");

  const invoice = sale ?? loaded;
  const canEditDate = canChangePosSaleDate(user?.role);
  const noCharge = isNonRevenueCustomerType(customerType);

  useEffect(() => {
    if (!open) return;

    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setSaving(false);
      setLineEditor(null);
      setAddQuery("");
      setCatalog([]);
      const [accountRows, methodRows, row] = await Promise.all([
        getPaymentAccounts(false),
        getPaymentMethods({ activeOnly: true }),
        sale ? Promise.resolve(sale) : saleId ? getPosSale(saleId) : Promise.resolve(null),
      ]);
      if (cancelled) return;
      if (!row) {
        toast.error("Sale not found");
        onOpenChange(false);
        return;
      }
      setAccounts(accountRows);
      setTenderMethods(methodRows);
      setLoaded(row);
      setSaleDate(toDateInputValue(row.createdAt));
      setItemLines(buildItemLines(row));
      setCustomerType(parsePosCustomerType(row.customerType));
      setCustomerName(row.customer?.name ?? "");
      setCustomerMobile(row.customer?.mobile ?? "");
      setCustomerEmail(row.customer?.email ?? "");
      setCustomerAddress(row.customer?.address ?? "");
      const due = isNonRevenueCustomerType(row.customerType)
        ? 0
        : Math.max(0, roundMoney(row.amountDue ?? row.total));
      setSaleDrafts(
        (row.payments.length > 0
          ? row.payments
          : due > 0.01
            ? [
                {
                  tenderMethod: row.tenderMethod,
                  amount: due,
                  paymentAccount: row.paymentAccount,
                  kind: "full" as const,
                  note: null,
                },
              ]
            : []
        ).map(salePaymentLineToCheckout)
      );
      const existingPayments =
        row.payments.length > 0 ? row.payments : [{ amount: due }];
      setAllowUnequalPayments(
        due > 0.01 && !paymentsCoverAmountDue(due, existingPayments)
      );

      try {
        const [inventory, products] = await Promise.all([
          getBranchInventory(row.branchId),
          getProducts(true),
        ]);
        if (cancelled) return;
        const productMap = new Map(products.map((product) => [product.id, product]));
        const options: CatalogOption[] = [];
        for (const inv of inventory) {
          if (inv.isSelling === false) continue;
          const product = productMap.get(inv.productId);
          if (!product) continue;
          options.push({
            variantId: inv.variantId,
            productId: inv.productId,
            productName: catalogLabel(product, inv.variantId),
            stock: inv.stock,
            unitPrice: unitPriceFromCatalog(inv, product, row),
          });
        }
        options.sort((a, b) => a.productName.localeCompare(b.productName));
        setCatalog(options);
      } catch (error) {
        console.error(error);
        setCatalog([]);
      }
    };

    load()
      .catch((error) => {
        console.error(error);
        if (!cancelled) {
          toast.error("Failed to load sale");
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

  const merchandiseTotal = useMemo(
    () =>
      roundMoney(
        itemLines.reduce(
          (sum, line) => sum + roundMoney(line.unitPrice * line.quantity),
          0
        )
      ),
    [itemLines]
  );
  const voucherApplied = invoice
    ? Math.min(invoice.voucherAmountApplied ?? 0, merchandiseTotal)
    : 0;
  const amountDue = noCharge
    ? 0
    : Math.max(0, roundMoney(merchandiseTotal - voucherApplied));

  const paidSum = sumCheckoutPaymentAmounts(saleDrafts);
  const remaining = paymentRemaining(amountDue, saleDrafts);
  const balanced = Math.abs(paidSum - amountDue) <= 0.01;
  const canSaveUnequal = allowUnequalPayments;
  const paymentsAcceptable = balanced || canSaveUnequal;

  const editorDraft = lineEditor?.draft ?? null;
  const methodOptions = (() => {
    const keys = tenderMethods.map((method) => method.key);
    const current = editorDraft?.tenderMethod;
    if (current && !keys.includes(current)) keys.push(current);
    return keys.length > 0 ? keys : [...POS_TENDER_METHODS];
  })();
  const methodLabel = (key: string) => paymentMethodName(key, tenderMethods);
  const editorExpectedType = editorDraft
    ? accountTypeForTender(editorDraft.tenderMethod)
    : null;
  const editorNeedsAccount = editorDraft
    ? tenderNeedsPaymentAccount(editorDraft.tenderMethod)
    : false;
  const editorAccounts = editorDraft
    ? accountsForTender(
        accounts,
        editorDraft.tenderMethod,
        editorDraft.paymentAccountId
      )
    : [];
  const editorAmountValid =
    editorDraft != null &&
    Number.isFinite(editorDraft.amount) &&
    editorDraft.amount > 0;
  const editorAccountValid =
    !editorNeedsAccount ||
    editorAccounts.some(
      (account) => account.id === editorDraft?.paymentAccountId
    );
  const editorCanSave = editorAmountValid && editorAccountValid && !saving;
  const editorHalfAmount = roundMoney(amountDue / 2);

  const addMatches = useMemo(() => {
    const q = addQuery.trim().toLowerCase();
    if (!q) return [];
    return catalog
      .filter(
        (row) =>
          row.productName.toLowerCase().includes(q) ||
          row.variantId.toLowerCase().includes(q)
      )
      .slice(0, 8);
  }, [addQuery, catalog]);

  const patchEditorDraft = (patch: Partial<PosCheckoutPaymentLine>) => {
    setLineEditor((prev) =>
      prev ? { ...prev, draft: { ...prev.draft, ...patch } } : prev
    );
  };

  const saveLineEditor = () => {
    if (!lineEditor || !editorCanSave) return;
    const parsed = parseMoneyInput(lineEditor.draft.amountText);
    const amount = parsed ?? lineEditor.draft.amount;
    if (!Number.isFinite(amount) || amount <= 0) return;
    const nextPay: PosCheckoutPaymentLine = {
      ...lineEditor.draft,
      amount,
      amountText: moneyInputText(amount),
      note: lineEditor.draft.note.trim(),
    };
    setSaleDrafts((prev) =>
      lineEditor.payId
        ? prev.map((pay) => (pay.id === lineEditor.payId ? nextPay : pay))
        : [...prev, nextPay]
    );
    setLineEditor(null);
  };

  const updateItemLine = (
    key: string,
    patch: Partial<Pick<ItemLineDraft, "quantity" | "unitPrice">>
  ) => {
    setItemLines((prev) =>
      prev.map((line) => {
        if (line.key !== key) return line;
        const quantity =
          patch.quantity != null
            ? Math.max(1, Math.floor(patch.quantity) || 1)
            : line.quantity;
        const unitPrice =
          patch.unitPrice != null
            ? Math.max(0, roundMoney(patch.unitPrice))
            : line.unitPrice;
        return { ...line, quantity, unitPrice };
      })
    );
  };

  const removeItemLine = (key: string) => {
    setItemLines((prev) => prev.filter((line) => line.key !== key));
  };

  const addCatalogItem = (row: CatalogOption) => {
    setItemLines((prev) => {
      const existing = prev.find((line) => line.variantId === row.variantId);
      if (existing) {
        return prev.map((line) =>
          line.variantId === row.variantId
            ? { ...line, quantity: line.quantity + 1 }
            : line
        );
      }
      return [
        ...prev,
        {
          key: `${row.variantId}-${Date.now()}`,
          productId: row.productId,
          variantId: row.variantId,
          productName: row.productName,
          quantity: 1,
          unitPrice: noCharge ? 0 : row.unitPrice,
          priceList:
            invoice?.saleChannel === "wholesale"
              ? null
              : (invoice?.paymentMethod ?? "cash"),
        },
      ];
    });
    setAddQuery("");
  };

  const handleSave = async () => {
    if (!invoice || !user?.uid) return;
    if (itemLines.length === 0) {
      toast.error("Add at least one item");
      return;
    }
    if (requiresPosCustomerName(customerType) && !customerName.trim()) {
      toast.error(
        customerType === "co_owner"
          ? "Owner note is required for C/O Owner"
          : "Customer name is required"
      );
      return;
    }

    const originalDate = toDateInputValue(invoice.createdAt);
    const dateChanged =
      canEditDate && Boolean(saleDate) && saleDate !== originalDate;
    const noPaymentDue = amountDue <= 0.01;

    if (!noPaymentDue && !paymentsAcceptable) return;

    setSaving(true);
    try {
      const payments = noPaymentDue
        ? []
        : resolveSalePaymentDrafts({
            drafts: saleDrafts,
            accounts,
            fallbackAccounts: saleDrafts.map(
              (pay) =>
                invoice.payments.find(
                  (line) => line.paymentAccount?.id === pay.paymentAccountId
                )?.paymentAccount ?? invoice.paymentAccount
            ),
          });

      const items: PosSaleItem[] = itemLines.map((line) => {
        const unitPrice = noCharge ? 0 : roundMoney(line.unitPrice);
        const quantity = Math.max(1, Math.floor(line.quantity) || 1);
        return {
          productId: line.productId,
          variantId: line.variantId,
          productName: line.productName,
          quantity,
          unitPrice,
          lineTotal: noCharge ? 0 : roundMoney(unitPrice * quantity),
          priceList: line.priceList,
          payments: [],
          tenderMethod: null,
          paymentAccount: null,
          kind: null,
          note: null,
        };
      });

      const updated = await updatePosSale(invoice.id, {
        items,
        payments,
        customerType,
        customer: {
          name: customerName.trim() || null,
          mobile: customerMobile.trim() || null,
          email: customerEmail.trim() || null,
          address: customerAddress.trim() || null,
        },
        saleDate: dateChanged ? saleDate : undefined,
        allowUnequalPayments: canSaveUnequal,
        actor: {
          userId: user.uid,
          role: user.role,
          assignedBranchId,
          name: user.displayName ?? user.email ?? null,
        },
      });
      toast.success("Sale updated");
      onUpdated?.(updated);
      onOpenChange(false);
    } catch (error) {
      console.error(error);
      toast.error(
        error instanceof Error ? error.message : "Failed to update sale"
      );
    } finally {
      setSaving(false);
    }
  };

  const renderPaymentList = () => (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium text-muted-foreground">Payments</p>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={saving || noCharge}
          onClick={() =>
            setLineEditor({
              payId: null,
              draft: createItemPaymentLine(
                remaining > 0 ? remaining : 0
              ),
            })
          }
        >
          <Plus className="h-3.5 w-3.5" />
          Add
        </Button>
      </div>
      {saleDrafts.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          No payments yet — click Add.
        </p>
      ) : (
        <ul className="space-y-1.5">
          {saleDrafts.map((pay) => {
            const account =
              tenderNeedsPaymentAccount(pay.tenderMethod) && pay.paymentAccountId
                ? accounts.find((row) => row.id === pay.paymentAccountId)
                : null;
            return (
              <li key={pay.id} className="flex items-stretch gap-1">
                <button
                  type="button"
                  disabled={saving}
                  onClick={() =>
                    setLineEditor({
                      payId: pay.id,
                      draft: { ...pay },
                    })
                  }
                  className="min-w-0 flex-1 rounded-md border px-2.5 py-2 text-left transition-colors hover:bg-muted/40 disabled:opacity-50"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        {methodLabel(pay.tenderMethod)}
                        {account ? ` · ${account.provider}` : ""}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {formatPaymentLineNote(pay) ?? paymentKindLabel(pay.kind)}
                      </p>
                    </div>
                    <p className="shrink-0 text-sm font-semibold tabular-nums">
                      {formatCurrency(pay.amount)}
                    </p>
                  </div>
                </button>
                {saleDrafts.length > 1 ? (
                  <Button
                    type="button"
                    size="icon-sm"
                    variant="ghost"
                    disabled={saving}
                    className="shrink-0 self-center"
                    aria-label="Remove payment"
                    onClick={() =>
                      setSaleDrafts((prev) =>
                        prev.filter((row) => row.id !== pay.id)
                      )
                    }
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
      {!itemPaymentsCoverLineTotal(saleDrafts, amountDue) ? (
        <p
          className={`text-xs ${
            canSaveUnequal ? "text-amber-700" : "text-destructive"
          }`}
        >
          {canSaveUnequal
            ? `Payments do not equal ${formatCurrency(amountDue)} (override on).`
            : `Payments must equal ${formatCurrency(amountDue)}.`}
        </p>
      ) : null}
    </div>
  );

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (saving) return;
        onOpenChange(next);
      }}
    >
      <DialogContent
        className="flex max-h-[92dvh] w-[calc(100%-1.25rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-xl"
        showCloseButton={!saving}
      >
        <DialogHeader className="shrink-0 border-b px-4 py-4 sm:px-6">
          <DialogTitle className="flex items-center gap-2 text-base">
            <Pencil className="h-4 w-4" />
            {lineEditor
              ? lineEditor.payId
                ? "Edit payment"
                : "Add payment"
              : "Edit sale"}
          </DialogTitle>
          <DialogDescription>
            {lineEditor
              ? "Correct this tender for the receipt"
              : "Update items, payments, and customer details. Inventory adjusts with item changes."}
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading sale…
            </div>
          ) : !invoice ? (
            <p className="py-12 text-center text-sm text-muted-foreground">
              No sale selected.
            </p>
          ) : lineEditor && editorDraft ? (
            <div className="space-y-3">
              {editorDraft.kind === "half_payment" && amountDue > 0.01 ? (
                <p className="rounded-md border bg-muted/40 px-3 py-2 text-sm">
                  Half of total{" "}
                  <span className="font-medium tabular-nums">
                    {formatCurrency(amountDue)}
                  </span>{" "}
                  is{" "}
                  <span className="font-semibold tabular-nums">
                    {formatCurrency(editorHalfAmount)}
                  </span>
                  .
                </p>
              ) : null}
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="edit-pay-method">Method</Label>
                  <Select
                    value={editorDraft.tenderMethod}
                    onValueChange={(value) => {
                      const nextMethod = (value as PosTenderMethod) ?? "cash";
                      const prevType = accountTypeForTender(
                        editorDraft.tenderMethod
                      );
                      const nextType = accountTypeForTender(nextMethod);
                      patchEditorDraft({
                        tenderMethod: nextMethod,
                        paymentAccountId:
                          tenderNeedsPaymentAccount(nextMethod) &&
                          prevType === nextType
                            ? editorDraft.paymentAccountId
                            : null,
                      });
                    }}
                  >
                    <SelectTrigger id="edit-pay-method">
                      <SelectValue>
                        {(value) => (value ? methodLabel(value) : null)}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {methodOptions.map((method) => (
                        <SelectItem key={method} value={method}>
                          {methodLabel(method)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="edit-pay-amount">Amount</Label>
                  <Input
                    id="edit-pay-amount"
                    inputMode="decimal"
                    placeholder="0.00"
                    value={editorDraft.amountText}
                    onChange={(e) => {
                      const raw = e.target.value;
                      if (raw !== "" && !/^\d*\.?\d*$/.test(raw)) return;
                      const parsed = parseMoneyInput(raw);
                      patchEditorDraft({
                        amountText: raw,
                        amount: parsed ?? 0,
                      });
                    }}
                    onBlur={() => {
                      const parsed = parseMoneyInput(editorDraft.amountText);
                      if (parsed == null) {
                        patchEditorDraft({ amountText: "", amount: 0 });
                        return;
                      }
                      patchEditorDraft({
                        amount: parsed,
                        amountText: moneyInputText(parsed),
                      });
                    }}
                  />
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="edit-pay-kind">Type</Label>
                  <Select
                    value={editorDraft.kind}
                    onValueChange={(value) =>
                      patchEditorDraft({
                        kind: (value as PosPaymentKind) ?? "full",
                      })
                    }
                  >
                    <SelectTrigger id="edit-pay-kind">
                      <SelectValue>
                        {(value) =>
                          value
                            ? paymentKindLabel(value as PosPaymentKind)
                            : null
                        }
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {POS_PAYMENT_KINDS.map((kind) => (
                        <SelectItem key={kind} value={kind}>
                          {paymentKindLabel(kind)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="edit-pay-note">Note</Label>
                  <Input
                    id="edit-pay-note"
                    placeholder={
                      editorDraft.kind === "down_payment" ||
                      editorDraft.kind === "half_payment"
                        ? "e.g. PAID"
                        : "Optional"
                    }
                    value={editorDraft.note}
                    onChange={(e) =>
                      patchEditorDraft({ note: e.target.value })
                    }
                  />
                </div>
              </div>

              {editorNeedsAccount ? (
                <div className="space-y-1.5">
                  <Label htmlFor="edit-pay-account">
                    {editorExpectedType === "bank_transfer"
                      ? "Bank account"
                      : "E-wallet account"}
                  </Label>
                  <Select
                    value={editorDraft.paymentAccountId ?? ""}
                    onValueChange={(value) =>
                      patchEditorDraft({
                        paymentAccountId: value || null,
                      })
                    }
                  >
                    <SelectTrigger id="edit-pay-account">
                      <SelectValue placeholder="Select account">
                        {(value) => {
                          if (!value) return null;
                          const account = editorAccounts.find(
                            (row) => row.id === value
                          );
                          return account
                            ? `${account.provider} · ${account.accountName}`
                            : null;
                        }}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {editorAccounts.length === 0 ? (
                        <SelectItem value="__none" disabled>
                          No accounts in Settings
                        </SelectItem>
                      ) : (
                        editorAccounts.map((account) => (
                          <SelectItem key={account.id} value={account.id}>
                            {account.provider} · {account.accountName} ·{" "}
                            {account.accountNumber}
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                  {!editorAccountValid ? (
                    <p className="text-xs text-destructive">
                      Select a receiving account.
                    </p>
                  ) : null}
                </div>
              ) : null}

              {!editorAmountValid ? (
                <p className="text-xs text-destructive">
                  Enter an amount greater than zero.
                </p>
              ) : null}
            </div>
          ) : (
            <div className="space-y-5">
              <section className="space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-sm font-medium">Items</h3>
                  <p className="text-xs text-muted-foreground tabular-nums">
                    {formatCurrency(merchandiseTotal)}
                  </p>
                </div>
                <ul className="space-y-2">
                  {itemLines.map((line) => (
                    <li
                      key={line.key}
                      className="space-y-2 rounded-md border p-2.5"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p className="min-w-0 flex-1 truncate text-sm font-medium">
                          {line.productName}
                        </p>
                        <Button
                          type="button"
                          size="icon-sm"
                          variant="ghost"
                          disabled={saving || itemLines.length <= 1}
                          aria-label="Remove item"
                          onClick={() => removeItemLine(line.key)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-1">
                          <Label className="text-xs">Qty</Label>
                          <Input
                            type="number"
                            min={1}
                            step={1}
                            value={line.quantity}
                            disabled={saving}
                            onChange={(e) =>
                              updateItemLine(line.key, {
                                quantity: Number(e.target.value),
                              })
                            }
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Unit price</Label>
                          <Input
                            type="number"
                            min={0}
                            step="0.01"
                            value={line.unitPrice}
                            disabled={saving || noCharge}
                            onChange={(e) =>
                              updateItemLine(line.key, {
                                unitPrice: Number(e.target.value),
                              })
                            }
                          />
                        </div>
                      </div>
                      <p className="text-right text-xs font-medium tabular-nums text-muted-foreground">
                        Line{" "}
                        {formatCurrency(
                          noCharge
                            ? 0
                            : roundMoney(line.unitPrice * line.quantity)
                        )}
                      </p>
                    </li>
                  ))}
                </ul>
                <div className="space-y-1.5">
                  <Label htmlFor="edit-sale-add-item">Add item</Label>
                  <Input
                    id="edit-sale-add-item"
                    placeholder="Search selling catalog…"
                    value={addQuery}
                    disabled={saving}
                    onChange={(e) => setAddQuery(e.target.value)}
                  />
                  {addMatches.length > 0 ? (
                    <ul className="max-h-40 overflow-y-auto rounded-md border">
                      {addMatches.map((row) => (
                        <li key={row.variantId}>
                          <button
                            type="button"
                            className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-muted/50"
                            onClick={() => addCatalogItem(row)}
                          >
                            <span className="min-w-0 truncate">
                              {row.productName}
                            </span>
                            <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                              {formatCurrency(row.unitPrice)} · stock {row.stock}
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              </section>

              <section className="space-y-3">
                <h3 className="text-sm font-medium">Details</h3>
                {canEditDate ? (
                  <div className="space-y-1.5">
                    <Label htmlFor="edit-sale-date">Sale date</Label>
                    <Input
                      id="edit-sale-date"
                      type="date"
                      value={saleDate}
                      max={toDateInputValue()}
                      disabled={saving}
                      onChange={(e) => setSaleDate(e.target.value)}
                    />
                    <p className="text-xs text-muted-foreground">
                      Controls which daily sales report this receipt appears on.
                    </p>
                  </div>
                ) : null}
                <div className="space-y-1.5">
                  <Label htmlFor="edit-customer-type">Customer type</Label>
                  <Select
                    value={customerType}
                    onValueChange={(value) =>
                      setCustomerType(
                        parsePosCustomerType(value ?? "walk_in")
                      )
                    }
                  >
                    <SelectTrigger id="edit-customer-type">
                      <SelectValue>
                        {(value) =>
                          value
                            ? posCustomerTypeLabel(
                                value as PosCustomerType
                              )
                            : null
                        }
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {CUSTOMER_TYPES.map((type) => (
                        <SelectItem key={type} value={type}>
                          {posCustomerTypeLabel(type)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  <div className="space-y-1.5 sm:col-span-2">
                    <Label htmlFor="edit-customer-name">
                      {customerType === "co_owner" ? "Owner note" : "Name"}
                    </Label>
                    <Input
                      id="edit-customer-name"
                      value={customerName}
                      disabled={saving}
                      onChange={(e) => setCustomerName(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="edit-customer-mobile">Mobile</Label>
                    <Input
                      id="edit-customer-mobile"
                      value={customerMobile}
                      disabled={saving}
                      onChange={(e) => setCustomerMobile(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="edit-customer-email">Email</Label>
                    <Input
                      id="edit-customer-email"
                      value={customerEmail}
                      disabled={saving}
                      onChange={(e) => setCustomerEmail(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5 sm:col-span-2">
                    <Label htmlFor="edit-customer-address">Address</Label>
                    <Input
                      id="edit-customer-address"
                      value={customerAddress}
                      disabled={saving}
                      onChange={(e) => setCustomerAddress(e.target.value)}
                    />
                  </div>
                </div>
              </section>

              <section className="space-y-3">
                <h3 className="text-sm font-medium">Payments</h3>
                {amountDue <= 0.01 ? (
                  <p className="rounded-md border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
                    {noCharge
                      ? "This customer type has no amount due."
                      : "This receipt has no amount due (voucher or zero total)."}
                  </p>
                ) : (
                  <>
                    <div className="grid grid-cols-3 gap-2 rounded-md border bg-muted/20 p-2 text-[11px]">
                      <div>
                        <p className="text-muted-foreground">Amount due</p>
                        <p className="font-semibold tabular-nums">
                          {formatCurrency(amountDue)}
                        </p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Paid</p>
                        <p className="font-semibold tabular-nums">
                          {formatCurrency(paidSum)}
                        </p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Left</p>
                        <p
                          className={`font-semibold tabular-nums ${
                            remaining > 0.01
                              ? "text-amber-700"
                              : remaining < -0.01
                                ? "text-destructive"
                                : "text-emerald-700"
                          }`}
                        >
                          {formatCurrency(remaining)}
                        </p>
                      </div>
                    </div>
                    {renderPaymentList()}
                    <label className="flex items-start gap-3 rounded-md border p-3">
                      <Checkbox
                        checked={allowUnequalPayments}
                        disabled={saving}
                        onCheckedChange={(checked) =>
                          setAllowUnequalPayments(checked === true)
                        }
                      />
                      <span className="space-y-1">
                        <span className="block text-sm font-medium leading-none">
                          Allow payments that don’t equal amount due
                        </span>
                        <span className="block text-xs text-muted-foreground">
                          Use for half-paid or partial receipts. Leave off for
                          normal full payments.
                        </span>
                      </span>
                    </label>
                  </>
                )}
              </section>
            </div>
          )}
        </div>

        <DialogFooter className="mx-0 mb-0 px-4 py-4 sm:px-6">
          {lineEditor ? (
            <>
              <Button
                type="button"
                variant="outline"
                disabled={saving}
                onClick={() => setLineEditor(null)}
              >
                Back
              </Button>
              <Button
                type="button"
                disabled={!editorCanSave}
                onClick={saveLineEditor}
              >
                Save payment
              </Button>
            </>
          ) : (
            <>
              <Button
                type="button"
                variant="outline"
                disabled={saving}
                onClick={() => onOpenChange(false)}
              >
                Cancel
              </Button>
              <Button
                type="button"
                disabled={
                  saving ||
                  loading ||
                  !invoice ||
                  !user?.uid ||
                  itemLines.length === 0 ||
                  (canEditDate && !saleDate) ||
                  (amountDue > 0.01 && !paymentsAcceptable)
                }
                onClick={() => void handleSave()}
              >
                {saving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : null}
                Save changes
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function EditSalePaymentButton({
  sale,
  saleId,
  disabled,
  onUpdated,
}: {
  sale?: PosSale | null;
  saleId?: string | null;
  disabled?: boolean;
  onUpdated?: (sale: PosSale) => void;
}) {
  const { user, assignedBranchId, isElevatedAdmin } = useBranchAccess();
  const [open, setOpen] = useState(false);
  const canOpen = Boolean(sale || saleId);
  const allowed = sale
    ? canEditPosSale({
        sale,
        role: user?.role,
        userId: user?.uid,
        assignedBranchId,
      })
    : isElevatedAdmin;

  if (!allowed) return null;

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        disabled={disabled || !canOpen}
        onClick={() => setOpen(true)}
        title="Edit sale"
      >
        <Pencil className="h-4 w-4" />
        <span className="sr-only">Edit sale</span>
      </Button>
      <EditSalePaymentDialog
        sale={sale ?? null}
        saleId={saleId ?? null}
        open={open}
        onOpenChange={setOpen}
        onUpdated={onUpdated}
      />
    </>
  );
}
