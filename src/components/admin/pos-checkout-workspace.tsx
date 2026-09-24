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
  computeVoucherAppliedAmount,
  getVoucherByCode,
  isVoucherRedeemable,
} from "@/lib/firestore/vouchers";
import { formatCurrency } from "@/lib/format";
import { formatDateInputLabel, saleCreatedAtForDate } from "@/lib/dates";
import {
  isNonRevenueCustomerType,
  posCustomerTypeLabel,
  requiresPosCustomerDetails,
} from "@/lib/pos-customer-type";
import {
  clearPosCheckoutDraft,
  draftAmountDue,
  loadPosCheckoutDraft,
  posHomePath,
  savePosCheckoutDraft,
  type PosCheckoutDraft,
} from "@/lib/pos-checkout-draft";
import {
  dailySalesReportPath,
  lockedPosPath,
  type PosSaleLock,
} from "@/lib/pos-sale-lock";
import {
  allocatedPaymentsForCartLines,
  cartLineNeedsPayment,
  ensureCartLinePaymentFields,
  resolvePaymentsFromCartLines,
  roundMoney,
  snapshotPaymentAccount,
  syncPaymentGroupsToLineTotals,
  syncPaymentsToLineTotal,
  tenderNeedsPaymentAccount,
  type PosCheckoutPaymentGroup,
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
  saleLock = null,
}: {
  saleChannel: PosSaleChannel;
  saleLock?: PosSaleLock | null;
}) {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const homePath = saleLock
    ? lockedPosPath(saleLock, saleChannel)
    : posHomePath(saleChannel);
  const afterSalePath = saleLock
    ? dailySalesReportPath(saleLock, saleChannel)
    : homePath;
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
  const [voucherAppliedOverride, setVoucherAppliedOverride] = useState<
    number | null
  >(null);
  const [voucherCodeInput, setVoucherCodeInput] = useState("");
  const [paymentGroups, setPaymentGroups] = useState<
    PosCheckoutPaymentGroup[]
  >([]);
  const [checkoutStep, setCheckoutStep] =
    useState<PosCheckoutStep>("details");
  const [charging, setCharging] = useState(false);

  useEffect(() => {
    const draft = loadPosCheckoutDraft(saleChannel, saleLock);
    if (!draft) {
      toast.error("Cart is empty — return to POS to continue");
      router.replace(homePath);
      return;
    }

    setDraftMeta({
      branchId: draft.branchId,
      branchName: draft.branchName,
    });
    const due = isNonRevenueCustomerType(draft.customerType)
      ? 0
      : draftAmountDue({
          lines: draft.lines,
          appliedVoucher: draft.appliedVoucher,
          voucherAppliedOverride: draft.voucherAppliedOverride ?? null,
        });
    const groups = syncPaymentGroupsToLineTotals(
      draft.paymentGroups,
      draft.lines,
      { resizeSingle: true, targetTotal: due }
    );
    setPaymentGroups(groups);
    setLines(
      draft.lines.map((line) => {
        const ensured = ensureCartLinePaymentFields(
          line,
          draft.paymentMethod === "retail" ? "retail" : "cash"
        );
        return { ...ensured, payments: [] };
      })
    );
    setPaymentMethod(draft.paymentMethod);
    setCustomerType(draft.customerType);
    setCustomer(draft.customer);
    setAppliedVoucher(draft.appliedVoucher);
    setVoucherAppliedOverride(draft.voucherAppliedOverride ?? null);
    setVoucherCodeInput(draft.voucherCodeInput);
    setLoading(false);

    getPaymentAccounts(true)
      .then(setPaymentAccounts)
      .catch(console.error);
    getPaymentMethods({ activeOnly: true })
      .then(setTenderMethods)
      .catch(console.error);
  }, [saleChannel, homePath, router, saleLock?.branchId, saleLock?.saleDate]);

  const amountDue = useMemo(
    () =>
      draftAmountDue({
        lines,
        appliedVoucher,
        voucherAppliedOverride,
      }),
    [lines, appliedVoucher, voucherAppliedOverride]
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
        voucherAppliedOverride,
        voucherCodeInput,
        paymentGroups,
        savedAt: Date.now(),
        ...patch,
      };
      savePosCheckoutDraft(next, saleLock);
    },
    [
      appliedVoucher,
      customer,
      customerType,
      draftMeta,
      lines,
      paymentGroups,
      paymentMethod,
      saleChannel,
      saleLock?.branchId,
      saleLock?.saleDate,
      voucherAppliedOverride,
      voucherCodeInput,
    ]
  );

  const syncGroupsToDue = useCallback(
    (
      nextLines: PosCartLine[],
      nextGroups: PosCheckoutPaymentGroup[],
      voucher: Voucher | null,
      override: number | null,
      type: PosCustomerType = customerType
    ) => {
      const due = isNonRevenueCustomerType(type)
        ? 0
        : draftAmountDue({
            lines: nextLines,
            appliedVoucher: voucher,
            voucherAppliedOverride: override,
          });
      return syncPaymentGroupsToLineTotals(
        nextGroups,
        nextLines,
        { resizeSingle: true, targetTotal: due }
      );
    },
    [customerType]
  );

  const commitLinesAndGroups = (
    nextLines: PosCartLine[],
    nextGroupsInput: PosCheckoutPaymentGroup[] = paymentGroups,
    options?: { resizeSingle?: boolean; targetTotal?: number }
  ) => {
    const due =
      options?.targetTotal ??
      (isNonRevenueCustomerType(customerType)
        ? 0
        : draftAmountDue({
            lines: nextLines,
            appliedVoucher,
            voucherAppliedOverride,
          }));
    const sanitized = syncPaymentGroupsToLineTotals(
      nextGroupsInput,
      nextLines,
      {
        ...options,
        targetTotal: due,
        // Default false so payment editor amount edits are kept.
        // Pass resizeSingle: true when qty/price/voucher changes should resize.
        resizeSingle: options?.resizeSingle ?? false,
      }
    );
    const synced = nextLines.map((line) => ({ ...line, payments: [] }));
    setPaymentGroups(sanitized);
    persistDraft({ lines: synced, paymentGroups: sanitized });
    return synced;
  };

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
          payments: syncPaymentsToLineTotal(line.payments ?? [], lineTotal, {
            resizeSingle: true,
          }),
        };
      });
      return commitLinesAndGroups(next, paymentGroups, { resizeSingle: true });
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
          payments: syncPaymentsToLineTotal(line.payments ?? [], lineTotal, {
            resizeSingle: true,
          }),
        };
      });
      return commitLinesAndGroups(next, paymentGroups, { resizeSingle: true });
    });
  };

  const handleApplyVoucherId = (voucherId: string | null) => {
    if (!voucherId) {
      setAppliedVoucher(null);
      setVoucherAppliedOverride(null);
      const nextGroups = syncGroupsToDue(
        lines,
        paymentGroups,
        null,
        null
      );
      setPaymentGroups(nextGroups);
      persistDraft({
        appliedVoucher: null,
        voucherAppliedOverride: null,
        paymentGroups: nextGroups,
      });
    }
  };

  const handleVoucherAppliedOverrideChange = (amount: number | null) => {
    setVoucherAppliedOverride(amount);
    const nextGroups = syncGroupsToDue(
      lines,
      paymentGroups,
      appliedVoucher,
      amount
    );
    setPaymentGroups(nextGroups);
    persistDraft({
      voucherAppliedOverride: amount,
      paymentGroups: nextGroups,
    });
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
      const subtotal = lines.reduce(
        (sum, line) =>
          sum + (line.isFreebie ? 0 : line.unitPrice * line.quantity),
        0
      );
      const applied = computeVoucherAppliedAmount(voucher, subtotal);
      setAppliedVoucher(voucher);
      setVoucherAppliedOverride(applied);
      setVoucherCodeInput("");
      const nextGroups = syncGroupsToDue(
        lines,
        paymentGroups,
        voucher,
        applied
      );
      setPaymentGroups(nextGroups);
      persistDraft({
        appliedVoucher: voucher,
        voucherAppliedOverride: applied,
        voucherCodeInput: "",
        paymentGroups: nextGroups,
      });
      toast.success(
        `Applied ${voucher.name ? `${voucher.name} (${voucher.code})` : voucher.code}`
      );
    } catch (err) {
      console.error(err);
      toast.error("Failed to look up voucher");
    }
  };

  const handleCharge = async (options?: {
    allowUnequalPayments?: boolean;
  }) => {
    if (!user || !draftMeta || lines.length === 0) return;
    if (saleLock && draftMeta.branchId !== saleLock.branchId) {
      toast.error("This checkout is locked to another branch");
      return;
    }

    const noCharge = isNonRevenueCustomerType(customerType);
    const allowUnequalPayments = options?.allowUnequalPayments === true;

    const missingRetail =
      !noCharge &&
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
        noCharge || amountDue <= 0.01
          ? []
          : resolvePaymentsFromCartLines(
              lines,
              paymentAccounts,
              amountDue,
              paymentGroups,
              { allowUnequalPayments }
            );
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

    if (appliedVoucher && !customer.name.trim()) {
      toast.error("Enter customer name when using a voucher");
      setCheckoutStep("details");
      return;
    }

    setCharging(true);
    try {
      const retailToPersist = noCharge || isWholesale
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
          requiresPosCustomerDetails(customerType) || appliedVoucher
            ? normalizePosCustomer(customer)
            : null,
        resellerId: noCharge ? null : (appliedVoucher?.resellerId ?? null),
        resellerName: noCharge ? null : (appliedVoucher?.resellerName ?? null),
        voucherId: noCharge ? null : (appliedVoucher?.id ?? null),
        voucherAmountApplied: noCharge ? null : voucherAppliedOverride,
        items: (() => {
          const items: PosSaleItem[] = [];
          const scale =
            noCharge || amountDue <= 0.01
              ? 1
              : amountDue /
                Math.max(
                  0.01,
                  lines
                    .filter((l) => !l.isFreebie)
                    .reduce((s, l) => s + l.unitPrice * l.quantity, 0)
                );
          const allocated = allocatedPaymentsForCartLines(
            lines,
            paymentGroups,
            {
              targetTotal: noCharge ? 0 : amountDue,
            }
          );

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
            const unitPrice = noCharge || line.isFreebie ? 0 : line.unitPrice;
            const lineTotal = unitPrice * line.quantity;

            const sourcePayments =
              allocated.get(line.variantId) ?? line.payments ?? [];
            const itemPayments =
              noCharge ||
              !cartLineNeedsPayment(line) ||
              sourcePayments.length === 0
                ? []
                : sourcePayments
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
        soldAt: saleLock
          ? saleCreatedAtForDate(saleLock.saleDate)
          : undefined,
        allowUnequalPayments,
      });

      clearPosCheckoutDraft(saleChannel, saleLock);
      toast.success(
        noCharge
          ? `${posCustomerTypeLabel(customerType)} recorded`
          : "Sale completed"
      );
      router.replace(afterSalePath);
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
            {saleLock
              ? ` · ${formatDateInputLabel(saleLock.saleDate)}`
              : ""}
          </p>
        </div>
        <p className="text-sm tabular-nums text-muted-foreground sm:text-right">
          {isNonRevenueCustomerType(customerType) ? (
            <span className="text-base font-semibold text-foreground">
              No charge
            </span>
          ) : (
            <>
              Amount due{" "}
              <span className="text-base font-semibold text-foreground">
                {formatCurrency(amountDue)}
              </span>
            </>
          )}
        </p>
      </div>
      {saleLock ? (
        <p className="rounded-lg border bg-muted/40 px-3 py-2 text-sm">
          This sale is recorded for{" "}
          <span className="font-medium">
            {formatDateInputLabel(saleLock.saleDate)}
          </span>{" "}
          at <span className="font-medium">{draftMeta.branchName}</span>. Date
          and branch cannot be changed.
        </p>
      ) : null}
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
        voucherAppliedOverride={voucherAppliedOverride}
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
                    lineTotal,
                    { resizeSingle: true }
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
            const synced = commitLinesAndGroups(
              next,
              paymentGroups,
              patch.priceList ? { resizeSingle: true } : undefined
            );
            if (nextMethod !== paymentMethod) {
              persistDraft({
                lines: synced,
                paymentMethod: nextMethod,
              });
            }
            return synced;
          });
        }}
        paymentGroups={paymentGroups}
        onPaymentGroupsChange={(nextGroups) => {
          setLines((prev) =>
            commitLinesAndGroups(prev, nextGroups, { resizeSingle: false })
          );
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
        onVoucherAppliedOverrideChange={handleVoucherAppliedOverrideChange}
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
        onConfirmCharge={(options) => {
          handleCharge(options).catch(console.error);
        }}
      />
    </div>
  );
}
