"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  PosCheckoutDialog,
  emptyPosCustomerDraft,
  normalizePosCustomer,
  type PosCartLine,
  type PosCheckoutStep,
  type PosCustomerDraft,
} from "@/components/admin/pos-cart";
import { useAuthStore } from "@/stores/auth-store";
import { getPaymentAccounts } from "@/lib/firestore/payment-accounts";
import { getPaymentMethods } from "@/lib/firestore/payment-methods";
import { completePosSale } from "@/lib/firestore/pos-sales";
import { setVariantRetailPrices } from "@/lib/firestore/products";
import {
  getVoucherByCode,
  isVoucherRedeemable,
} from "@/lib/firestore/vouchers";
import { formatCurrency } from "@/lib/format";
import { requiresPosCustomerDetails } from "@/lib/pos-customer-type";
import {
  clearPosCheckoutDraft,
  draftAmountDue,
  loadPosCheckoutDraft,
  posHomePath,
  savePosCheckoutDraft,
  type PosCheckoutDraft,
} from "@/lib/pos-checkout-draft";
import {
  cartLineNeedsPayment,
  ensureCartLinePaymentFields,
  resolvePaymentsFromCartLines,
  roundMoney,
  snapshotPaymentAccount,
  syncPaymentsToLineTotal,
  tenderNeedsPaymentAccount,
} from "@/lib/pos-payments";
import type {
  PaymentAccount,
  PaymentMethod,
  PosCustomerType,
  PosPaymentMethod,
  PosSaleChannel,
  PosSaleItem,
  Voucher,
} from "@/types";

export function PosCheckoutWorkspace({
  saleChannel,
}: {
  saleChannel: PosSaleChannel;
}) {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const homePath = posHomePath(saleChannel);
  const isWholesale = saleChannel === "wholesale";

  const [loading, setLoading] = useState(true);
  const [draftMeta, setDraftMeta] = useState<{
    branchId: string;
    branchName: string;
  } | null>(null);
  const [lines, setLines] = useState<PosCartLine[]>([]);
  const [paymentMethod, setPaymentMethod] =
    useState<PosPaymentMethod>("cash");
  const [paymentAccounts, setPaymentAccounts] = useState<PaymentAccount[]>(
    []
  );
  const [tenderMethods, setTenderMethods] = useState<PaymentMethod[]>([]);
  const [customerType, setCustomerType] =
    useState<PosCustomerType>("walk_in");
  const [customer, setCustomer] = useState<PosCustomerDraft>(
    emptyPosCustomerDraft
  );
  const [appliedVoucher, setAppliedVoucher] = useState<Voucher | null>(null);
  const [voucherCodeInput, setVoucherCodeInput] = useState("");
  const [checkoutStep, setCheckoutStep] =
    useState<PosCheckoutStep>("details");
  const [charging, setCharging] = useState(false);

  useEffect(() => {
    const draft = loadPosCheckoutDraft(saleChannel);
    if (!draft) {
      toast.error("Cart is empty — return to POS to continue");
      router.replace(homePath);
      return;
    }

    setDraftMeta({
      branchId: draft.branchId,
      branchName: draft.branchName,
    });
    setLines(
      draft.lines.map((line) => {
        const ensured = ensureCartLinePaymentFields(
          line,
          draft.paymentMethod === "retail" ? "retail" : "cash"
        );
        if (ensured.isFreebie) return ensured;
        const lineTotal =
          Math.round(ensured.unitPrice * ensured.quantity * 100) / 100;
        return {
          ...ensured,
          payments: syncPaymentsToLineTotal(ensured.payments, lineTotal),
        };
      })
    );
    setPaymentMethod(draft.paymentMethod);
    setCustomerType(draft.customerType);
    setCustomer(draft.customer);
    setAppliedVoucher(draft.appliedVoucher);
    setVoucherCodeInput(draft.voucherCodeInput);
    setLoading(false);

    getPaymentAccounts(true)
      .then(setPaymentAccounts)
      .catch(console.error);
    getPaymentMethods({ activeOnly: true })
      .then(setTenderMethods)
      .catch(console.error);
  }, [saleChannel, homePath, router]);

  const amountDue = useMemo(
    () => draftAmountDue({ lines, appliedVoucher }),
    [lines, appliedVoucher]
  );

  const persistDraft = useCallback(
    (patch: Partial<PosCheckoutDraft>) => {
      if (!draftMeta) return;
      const next: PosCheckoutDraft = {
        saleChannel,
        branchId: draftMeta.branchId,
        branchName: draftMeta.branchName,
        lines,
        paymentMethod,
        customerType,
        customer,
        appliedVoucher,
        voucherCodeInput,
        savedAt: Date.now(),
        ...patch,
      };
      savePosCheckoutDraft(next);
    },
    [
      appliedVoucher,
      customer,
      customerType,
      draftMeta,
      lines,
      paymentMethod,
      saleChannel,
      voucherCodeInput,
    ]
  );

  const setLineRetailPrice = (
    variantId: string,
    retailPrice: number | null
  ) => {
    const nextRetail =
      retailPrice == null || !Number.isFinite(retailPrice) || retailPrice < 0
        ? null
        : roundMoney(retailPrice);
    setLines((prev) => {
      const next = prev.map((line) => {
        if (line.variantId !== variantId || line.isFreebie) return line;
        const unitPrice =
          line.priceList === "cash" ? line.cashPrice : nextRetail ?? 0;
        const lineTotal = Math.round(unitPrice * line.quantity * 100) / 100;
        return {
          ...line,
          retailPrice: nextRetail,
          unitPrice,
          payments: syncPaymentsToLineTotal(line.payments ?? [], lineTotal),
        };
      });
      persistDraft({ lines: next });
      return next;
    });
  };

  const setLineUnitPrice = (variantId: string, unitPrice: number) => {
    const nextPrice =
      Number.isFinite(unitPrice) && unitPrice > 0 ? unitPrice : 0;
    setLines((prev) => {
      const next = prev.map((line) => {
        if (line.variantId !== variantId || line.isFreebie) return line;
        const lineTotal = Math.round(nextPrice * line.quantity * 100) / 100;
        return {
          ...line,
          unitPrice: nextPrice,
          payments: syncPaymentsToLineTotal(line.payments ?? [], lineTotal),
        };
      });
      persistDraft({ lines: next });
      return next;
    });
  };

  const handleApplyVoucherId = (voucherId: string | null) => {
    if (!voucherId) {
      setAppliedVoucher(null);
      persistDraft({ appliedVoucher: null });
    }
  };

  const handleApplyVoucherCode = async () => {
    const code = voucherCodeInput.trim();
    if (!code) return;
    try {
      const voucher = await getVoucherByCode(code);
      if (!voucher || !isVoucherRedeemable(voucher)) {
        toast.error("Invalid or unusable voucher");
        return;
      }
      setAppliedVoucher(voucher);
      setVoucherCodeInput("");
      persistDraft({ appliedVoucher: voucher, voucherCodeInput: "" });
      toast.success(
        `Applied ${voucher.name ? `${voucher.name} (${voucher.code})` : voucher.code}`
      );
    } catch (err) {
      console.error(err);
      toast.error("Failed to look up voucher");
    }
  };

  const handleCharge = async () => {
    if (!user || !draftMeta || lines.length === 0) return;

    const missingRetail =
      !isWholesale &&
      lines.some(
        (line) =>
          !line.isFreebie &&
          line.priceList === "retail" &&
          line.retailPrice == null
      );
    if (missingRetail) {
      toast.error("Enter retail price for every item");
      setCheckoutStep("details");
      return;
    }

    let payments;
    try {
      payments =
        amountDue <= 0.01
          ? []
          : resolvePaymentsFromCartLines(lines, paymentAccounts, amountDue);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Invalid payments");
      setCheckoutStep("details");
      return;
    }

    if (
      requiresPosCustomerDetails(customerType) &&
      !customer.name.trim()
    ) {
      toast.error("Enter customer name");
      setCheckoutStep("details");
      return;
    }

    setCharging(true);
    try {
      const retailToPersist = isWholesale
        ? []
        : lines
            .filter(
              (line) =>
                !line.isFreebie &&
                !line.retailFromCatalog &&
                line.retailPrice != null &&
                line.retailPrice > 0
            )
            .map((line) => ({
              productId: line.productId,
              variantId: line.variantId,
              retailPrice: line.retailPrice as number,
              branchId: draftMeta.branchId,
            }));

      if (retailToPersist.length > 0) {
        await setVariantRetailPrices(retailToPersist);
      }

      await completePosSale({
        branchId: draftMeta.branchId,
        branchName: draftMeta.branchName,
        saleChannel,
        paymentMethod: isWholesale
          ? "cash"
          : (() => {
              const lists = lines
                .filter((l) => !l.isFreebie)
                .map((l) => l.priceList);
              if (lists.length === 0) return "cash";
              const allSame = lists.every((p) => p === lists[0]);
              return allSame ? lists[0] : "cash";
            })(),
        payments,
        customerType,
        customer:
          requiresPosCustomerDetails(customerType)
            ? normalizePosCustomer(customer)
            : null,
        resellerId: appliedVoucher?.resellerId ?? null,
        resellerName: appliedVoucher?.resellerName ?? null,
        voucherId: appliedVoucher?.id ?? null,
        items: (() => {
          const items: PosSaleItem[] = [];
          const scale =
            amountDue > 0.01
              ? amountDue /
                Math.max(
                  0.01,
                  lines
                    .filter((l) => !l.isFreebie)
                    .reduce((s, l) => s + l.unitPrice * l.quantity, 0)
                )
              : 1;

          for (const line of lines) {
            const name = line.isFreebie
              ? `${
                  line.variantLabel && line.variantLabel !== "Default"
                    ? `${line.productName} — ${line.variantLabel}`
                    : line.productName
                } (Freebie)`
              : line.variantLabel && line.variantLabel !== "Default"
                ? `${line.productName} — ${line.variantLabel}`
                : line.productName;
            const unitPrice = line.isFreebie ? 0 : line.unitPrice;
            const lineTotal = unitPrice * line.quantity;

            const itemPayments =
              !cartLineNeedsPayment(line) || !(line.payments?.length > 0)
                ? []
                : line.payments
                    .filter(
                      (pay) =>
                        Number.isFinite(pay.amount) && pay.amount > 0.01
                    )
                    .map((pay) => {
                    const account =
                      tenderNeedsPaymentAccount(pay.tenderMethod) &&
                      pay.paymentAccountId
                        ? paymentAccounts.find(
                            (a) => a.id === pay.paymentAccountId
                          )
                        : null;
                    return {
                      tenderMethod: pay.tenderMethod,
                      amount: Math.round(pay.amount * scale * 100) / 100,
                      paymentAccount: account
                        ? snapshotPaymentAccount(account)
                        : null,
                      kind: pay.kind,
                      note: pay.note.trim() ? pay.note.trim() : null,
                    };
                  });

            const primary = itemPayments[0] ?? null;
            items.push({
              productId: line.productId,
              variantId: line.variantId,
              productName: name,
              quantity: line.quantity,
              unitPrice,
              lineTotal,
              priceList: line.isFreebie || isWholesale ? null : line.priceList,
              payments: itemPayments,
              tenderMethod: primary?.tenderMethod ?? null,
              paymentAccount: primary?.paymentAccount ?? null,
              kind: primary?.kind ?? null,
              note: primary?.note ?? null,
            });
          }
          return items;
        })(),
        createdBy: user.uid,
        createdByName: user.displayName ?? user.email,
      });

      clearPosCheckoutDraft(saleChannel);
      toast.success("Sale completed");
      router.replace(homePath);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Sale failed");
    } finally {
      setCharging(false);
    }
  };

  if (loading || !draftMeta) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-6xl space-y-4 pb-8">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Checkout</h1>
          <p className="text-muted-foreground">
            {isWholesale ? "Wholesale" : "Shop"} · {draftMeta.branchName}
          </p>
        </div>
        <p className="text-sm tabular-nums text-muted-foreground sm:text-right">
          Amount due{" "}
          <span className="text-base font-semibold text-foreground">
            {formatCurrency(amountDue)}
          </span>
        </p>
      </div>
      <PosCheckoutDialog
        layout="page"
        onBack={() => router.push(homePath)}
        step={checkoutStep}
        onStepChange={setCheckoutStep}
        lines={lines}
        branchName={draftMeta.branchName}
        saleChannel={saleChannel}
        paymentAccounts={paymentAccounts}
        tenderMethods={tenderMethods}
        customerType={customerType}
        customer={customer}
        appliedVoucher={appliedVoucher}
        voucherCodeInput={voucherCodeInput}
        charging={charging}
        onLineChange={(variantId, patch) => {
          setLines((prev) => {
            const next = prev.map((line) => {
              if (line.variantId !== variantId || line.isFreebie) return line;
              let nextLine = { ...line, ...patch };
              if (patch.priceList) {
                const unitPrice =
                  patch.priceList === "cash"
                    ? line.cashPrice
                    : line.retailPrice ?? 0;
                const lineTotal =
                  Math.round(unitPrice * line.quantity * 100) / 100;
                nextLine = {
                  ...nextLine,
                  unitPrice,
                  payments: syncPaymentsToLineTotal(
                    patch.payments ?? line.payments ?? [],
                    lineTotal
                  ),
                };
              }
              return nextLine;
            });
            const lists = next
              .filter((l) => !l.isFreebie)
              .map((l) => l.priceList);
            const nextMethod =
              lists.length > 0 && lists.every((p) => p === lists[0])
                ? lists[0]
                : paymentMethod;
            if (nextMethod !== paymentMethod) {
              setPaymentMethod(nextMethod);
            }
            persistDraft({
              lines: next,
              paymentMethod: nextMethod,
            });
            return next;
          });
        }}
        onCustomerTypeChange={(type) => {
          setCustomerType(type);
          if (!requiresPosCustomerDetails(type)) {
            const empty = emptyPosCustomerDraft();
            setCustomer(empty);
            persistDraft({ customerType: type, customer: empty });
          } else {
            persistDraft({ customerType: type });
          }
        }}
        onApplyVoucherId={handleApplyVoucherId}
        onVoucherCodeInputChange={(code) => {
          setVoucherCodeInput(code);
          persistDraft({ voucherCodeInput: code });
        }}
        onApplyVoucherCode={() => {
          handleApplyVoucherCode().catch(console.error);
        }}
        onCustomerChange={(patch) => {
          setCustomer((prev) => {
            const next = { ...prev, ...patch };
            persistDraft({ customer: next });
            return next;
          });
        }}
        onRetailPriceChange={setLineRetailPrice}
        onUnitPriceChange={setLineUnitPrice}
        onConfirmCharge={() => {
          handleCharge().catch(console.error);
        }}
      />
    </div>
  );
}
