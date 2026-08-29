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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getPaymentAccounts } from "@/lib/firestore/payment-accounts";
import {
  getPosSale,
  resolveSalePaymentDrafts,
  updatePosSalePayments,
} from "@/lib/firestore/pos-sales";
import { formatCurrency } from "@/lib/format";
import { useBranchAccess } from "@/hooks/use-branch-access";
import {
  POS_PAYMENT_KINDS,
  POS_TENDER_METHODS,
  accountTypeForTender,
  createItemPaymentLine,
  formatPaymentLineNote,
  itemPaymentsCoverLineTotal,
  itemStoredPaymentTotal,
  moneyInputText,
  parseMoneyInput,
  paymentKindLabel,
  paymentRemaining,
  saleAmountDue,
  salePaymentLineToCheckout,
  shouldEditSalePaymentsByItem,
  sumCheckoutPaymentAmounts,
  tenderMethodLabel,
  tenderNeedsPaymentAccount,
  type PosCheckoutPaymentLine,
} from "@/lib/pos-payments";
import type {
  PaymentAccount,
  PosPaymentKind,
  PosSale,
  PosTenderMethod,
} from "@/types";

interface ItemPaymentDraft {
  index: number;
  productName: string;
  quantity: number;
  targetAmount: number;
  payments: PosCheckoutPaymentLine[];
}

type LineEditor = {
  scope: "sale" | number;
  payId: string | null;
  draft: PosCheckoutPaymentLine;
};

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

function buildItemDrafts(sale: PosSale): ItemPaymentDraft[] {
  return sale.items
    .map((item, index) => ({
      index,
      productName: item.productName,
      quantity: item.quantity,
      targetAmount: itemStoredPaymentTotal(item),
      payments:
        item.payments.length > 0
          ? item.payments.map(salePaymentLineToCheckout)
          : item.tenderMethod
            ? [
                salePaymentLineToCheckout({
                  tenderMethod: item.tenderMethod,
                  amount: item.lineTotal,
                  paymentAccount: item.paymentAccount,
                  kind: item.kind ?? "full",
                  note: item.note,
                }),
              ]
            : [],
    }))
    .filter((row) => row.targetAmount > 0);
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
  const [loaded, setLoaded] = useState<PosSale | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [accounts, setAccounts] = useState<PaymentAccount[]>([]);
  const [itemDrafts, setItemDrafts] = useState<ItemPaymentDraft[]>([]);
  const [saleDrafts, setSaleDrafts] = useState<PosCheckoutPaymentLine[]>([]);
  const [editByItem, setEditByItem] = useState(false);
  const [lineEditor, setLineEditor] = useState<LineEditor | null>(null);

  const invoice = sale ?? loaded;

  useEffect(() => {
    if (!open) {
      setLoaded(null);
      setLoading(false);
      setSaving(false);
      setItemDrafts([]);
      setSaleDrafts([]);
      setLineEditor(null);
      return;
    }

    let cancelled = false;
    setLoading(true);

    const load = async () => {
      const [accountRows, row] = await Promise.all([
        getPaymentAccounts(false),
        sale ? Promise.resolve(sale) : saleId ? getPosSale(saleId) : Promise.resolve(null),
      ]);
      if (cancelled) return;
      if (!row) {
        toast.error("Sale not found");
        onOpenChange(false);
        return;
      }
      setAccounts(accountRows);
      setLoaded(row);
      setEditByItem(shouldEditSalePaymentsByItem(row));
      setItemDrafts(buildItemDrafts(row));
      setSaleDrafts(
        (row.payments.length > 0
          ? row.payments
          : [
              {
                tenderMethod: row.tenderMethod,
                amount: saleAmountDue(row),
                paymentAccount: row.paymentAccount,
                kind: "full" as const,
                note: null,
              },
            ]
        ).map(salePaymentLineToCheckout)
      );
    };

    load()
      .catch((error) => {
        console.error(error);
        if (!cancelled) {
          toast.error("Failed to load payment");
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

  const amountDue = invoice ? saleAmountDue(invoice) : 0;

  const currentDrafts = useMemo(() => {
    if (editByItem) {
      return itemDrafts.flatMap((row) => row.payments);
    }
    return saleDrafts;
  }, [editByItem, itemDrafts, saleDrafts]);

  const paidSum = sumCheckoutPaymentAmounts(currentDrafts);
  const remaining = paymentRemaining(amountDue, currentDrafts);
  const balanced =
    Math.abs(paidSum - amountDue) <= 0.01 &&
    (editByItem
      ? itemDrafts.every((row) =>
          itemPaymentsCoverLineTotal(row.payments, row.targetAmount)
        )
      : true);

  const editorDraft = lineEditor?.draft ?? null;
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

  const patchEditorDraft = (patch: Partial<PosCheckoutPaymentLine>) => {
    setLineEditor((prev) =>
      prev ? { ...prev, draft: { ...prev.draft, ...patch } } : prev
    );
  };

  const replaceScopePayments = (
    scope: LineEditor["scope"],
    next: PosCheckoutPaymentLine[]
  ) => {
    if (scope === "sale") {
      setSaleDrafts(next);
      return;
    }
    setItemDrafts((prev) =>
      prev.map((row) =>
        row.index === scope ? { ...row, payments: next } : row
      )
    );
  };

  const paymentsForScope = (scope: LineEditor["scope"]) => {
    if (scope === "sale") return saleDrafts;
    return itemDrafts.find((row) => row.index === scope)?.payments ?? [];
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
    const current = paymentsForScope(lineEditor.scope);
    const next = lineEditor.payId
      ? current.map((pay) => (pay.id === lineEditor.payId ? nextPay : pay))
      : [...current, nextPay];
    replaceScopePayments(lineEditor.scope, next);
    setLineEditor(null);
  };

  const handleSave = async () => {
    if (!invoice || !balanced) return;
    setSaving(true);
    try {
      const original = invoice;
      let payments;
      let items = original.items;

      if (editByItem) {
        items = original.items.map((item, index) => {
          const draft = itemDrafts.find((row) => row.index === index);
          if (!draft) return item;
          const resolved = resolveSalePaymentDrafts({
            drafts: draft.payments,
            accounts,
            fallbackAccounts: draft.payments.map(
              (pay) =>
                item.payments.find(
                  (line) => line.paymentAccount?.id === pay.paymentAccountId
                )?.paymentAccount ?? null
            ),
          });
          const primary = resolved[0] ?? null;
          return {
            ...item,
            payments: resolved,
            tenderMethod: primary?.tenderMethod ?? null,
            paymentAccount: primary?.paymentAccount ?? null,
            kind: primary?.kind ?? null,
            note: primary?.note ?? null,
          };
        });
        payments = items.flatMap((item) => item.payments);
      } else {
        payments = resolveSalePaymentDrafts({
          drafts: saleDrafts,
          accounts,
          fallbackAccounts: saleDrafts.map(
            (pay) =>
              original.payments.find(
                (line) => line.paymentAccount?.id === pay.paymentAccountId
              )?.paymentAccount ?? original.paymentAccount
          ),
        });
      }

      const updated = await updatePosSalePayments(original.id, {
        payments,
        items: editByItem ? items : undefined,
      });
      toast.success("Payment updated");
      onUpdated?.(updated);
      onOpenChange(false);
    } catch (error) {
      console.error(error);
      toast.error(
        error instanceof Error ? error.message : "Failed to update payment"
      );
    } finally {
      setSaving(false);
    }
  };

  const renderPaymentList = (
    scope: LineEditor["scope"],
    payments: PosCheckoutPaymentLine[],
    targetAmount: number,
    remainingForScope: number
  ) => (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium text-muted-foreground">Payments</p>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={saving}
          onClick={() =>
            setLineEditor({
              scope,
              payId: null,
              draft: createItemPaymentLine(
                remainingForScope > 0 ? remainingForScope : 0
              ),
            })
          }
        >
          <Plus className="h-3.5 w-3.5" />
          Add
        </Button>
      </div>
      {payments.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          No payments yet — click Add.
        </p>
      ) : (
        <ul className="space-y-1.5">
          {payments.map((pay) => {
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
                      scope,
                      payId: pay.id,
                      draft: { ...pay },
                    })
                  }
                  className="min-w-0 flex-1 rounded-md border px-2.5 py-2 text-left transition-colors hover:bg-muted/40 disabled:opacity-50"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        {tenderMethodLabel(pay.tenderMethod)}
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
                {payments.length > 1 ? (
                  <Button
                    type="button"
                    size="icon-sm"
                    variant="ghost"
                    disabled={saving}
                    className="shrink-0 self-center"
                    aria-label="Remove payment"
                    onClick={() =>
                      replaceScopePayments(
                        scope,
                        payments.filter((row) => row.id !== pay.id)
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
      {!itemPaymentsCoverLineTotal(payments, targetAmount) ? (
        <p className="text-xs text-destructive">
          Payments must equal {formatCurrency(targetAmount)}.
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
        className="flex max-h-[92dvh] w-[calc(100%-1.25rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-lg"
        showCloseButton={!saving}
      >
        <DialogHeader className="shrink-0 border-b px-4 py-4 sm:px-6">
          <DialogTitle className="flex items-center gap-2 text-base">
            <Pencil className="h-4 w-4" />
            {lineEditor
              ? lineEditor.payId
                ? "Edit payment"
                : "Add payment"
              : "Edit payment"}
          </DialogTitle>
          <DialogDescription>
            {lineEditor && invoice
              ? lineEditor.scope === "sale"
                ? "Correct this tender for the receipt"
                : `${invoice.items[lineEditor.scope]?.quantity ?? ""}× ${
                    invoice.items[lineEditor.scope]?.productName ?? "Item"
                  }`
              : "Correct tender methods and accounts. Receipt totals stay the same."}
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading payment…
            </div>
          ) : !invoice ? (
            <p className="py-12 text-center text-sm text-muted-foreground">
              No sale selected.
            </p>
          ) : amountDue <= 0.01 ? (
            <p className="py-12 text-center text-sm text-muted-foreground">
              This receipt was fully covered by a voucher. There is no payment
              to edit.
            </p>
          ) : lineEditor && editorDraft ? (
            <div className="space-y-3">
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
                        {(value) =>
                          value
                            ? tenderMethodLabel(value as PosTenderMethod)
                            : null
                        }
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {POS_TENDER_METHODS.map((method) => (
                        <SelectItem key={method} value={method}>
                          {tenderMethodLabel(method)}
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
                      editorDraft.kind === "down_payment"
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
            <div className="space-y-4">
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

              {editByItem ? (
                <div className="space-y-3">
                  {itemDrafts.map((row) => {
                    const left = paymentRemaining(
                      row.targetAmount,
                      row.payments
                    );
                    return (
                      <div
                        key={row.index}
                        className="space-y-3 rounded-lg border p-3"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium">
                              {row.quantity}× {row.productName}
                            </p>
                          </div>
                          <p className="shrink-0 text-sm font-semibold tabular-nums">
                            {formatCurrency(row.targetAmount)}
                          </p>
                        </div>
                        {renderPaymentList(
                          row.index,
                          row.payments,
                          row.targetAmount,
                          left
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                renderPaymentList("sale", saleDrafts, amountDue, remaining)
              )}
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
                disabled={saving || loading || !invoice || !balanced}
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
  const { isElevatedAdmin } = useBranchAccess();
  const [open, setOpen] = useState(false);
  const canOpen = Boolean(sale || saleId);
  const amountDue = sale ? saleAmountDue(sale) : null;
  const noPayment = amountDue != null && amountDue <= 0.01;

  if (!isElevatedAdmin) return null;

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        disabled={disabled || !canOpen || noPayment}
        onClick={() => setOpen(true)}
        title={noPayment ? "No payment to edit" : "Edit payment"}
      >
        <Pencil className="h-4 w-4" />
        <span className="sr-only">Edit payment</span>
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
