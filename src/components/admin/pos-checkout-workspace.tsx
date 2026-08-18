"use client";

import { useCallback, useEffect, useState } from "react";
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
import { completePosSale } from "@/lib/firestore/pos-sales";
import { setVariantRetailPrices } from "@/lib/firestore/products";
import {
  getVoucherByCode,
  isVoucherRedeemable,
} from "@/lib/firestore/vouchers";
import { normalizeRetailPrice } from "@/lib/product-pricing";
import {
  clearPosCheckoutDraft,
  loadPosCheckoutDraft,
  posHomePath,
  savePosCheckoutDraft,
  type PosCheckoutDraft,
} from "@/lib/pos-checkout-draft";
import type {
  PaymentAccount,
  PosCustomerType,
  PosPaymentMethod,
  PosSaleChannel,
  PosTenderMethod,
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
  const [tenderMethod, setTenderMethod] = useState<PosTenderMethod>("cash");
  const [paymentAccounts, setPaymentAccounts] = useState<PaymentAccount[]>(
    []
  );
  const [selectedPaymentAccountId, setSelectedPaymentAccountId] = useState<
    string | null
  >(null);
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
    setLines(draft.lines);
    setPaymentMethod(draft.paymentMethod);
    setTenderMethod(draft.tenderMethod);
    setSelectedPaymentAccountId(draft.selectedPaymentAccountId);
    setCustomerType(draft.customerType);
    setCustomer(draft.customer);
    setAppliedVoucher(draft.appliedVoucher);
    setVoucherCodeInput(draft.voucherCodeInput);
    setLoading(false);

    getPaymentAccounts(true)
      .then(setPaymentAccounts)
      .catch(console.error);
  }, [saleChannel, homePath, router]);

  const persistDraft = useCallback(
    (patch: Partial<PosCheckoutDraft>) => {
      if (!draftMeta) return;
      const next: PosCheckoutDraft = {
        saleChannel,
        branchId: draftMeta.branchId,
        branchName: draftMeta.branchName,
        lines,
        paymentMethod,
        tenderMethod,
        selectedPaymentAccountId,
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
      selectedPaymentAccountId,
      tenderMethod,
      voucherCodeInput,
    ]
  );

  const applyPaymentMethod = (method: PosPaymentMethod) => {
    setPaymentMethod(method);
    setLines((prev) => {
      const next = prev.map((line) =>
        line.isFreebie
          ? { ...line, unitPrice: 0 }
          : {
              ...line,
              unitPrice:
                method === "cash"
                  ? line.cashPrice
                  : normalizeRetailPrice(line.retailPrice) ?? 0,
            }
      );
      persistDraft({ paymentMethod: method, lines: next });
      return next;
    });
  };

  const setLineRetailPrice = (
    variantId: string,
    retailPrice: number | null
  ) => {
    const normalized = normalizeRetailPrice(retailPrice);
    setLines((prev) => {
      const next = prev.map((line) =>
        line.variantId === variantId && !line.isFreebie
          ? {
              ...line,
              retailPrice: normalized,
              unitPrice:
                paymentMethod === "cash"
                  ? line.cashPrice
                  : normalized ?? 0,
            }
          : line
      );
      persistDraft({ lines: next });
      return next;
    });
  };

  const setLineUnitPrice = (variantId: string, unitPrice: number) => {
    const nextPrice =
      Number.isFinite(unitPrice) && unitPrice > 0 ? unitPrice : 0;
    setLines((prev) => {
      const next = prev.map((line) =>
        line.variantId === variantId && !line.isFreebie
          ? { ...line, unitPrice: nextPrice }
          : line
      );
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
      paymentMethod === "retail" &&
      lines.some(
        (line) =>
          !line.isFreebie &&
          (line.retailPrice == null || line.retailPrice <= 0)
      );
    if (missingRetail) {
      toast.error("Enter retail price for every item");
      setCheckoutStep("details");
      return;
    }

    const missingWholesale = isWholesale
      ? lines.some((line) => !line.isFreebie && !(line.unitPrice > 0))
      : false;
    if (missingWholesale) {
      toast.error("Enter a unit price greater than 0 for every item");
      setCheckoutStep("details");
      return;
    }

    const needsAccount = tenderMethod === "ewallet";
    const selectedAccount = paymentAccounts.find(
      (a) => a.id === selectedPaymentAccountId && a.type === "ewallet"
    );
    if (needsAccount && !selectedAccount) {
      toast.error("Select an e-wallet account");
      setCheckoutStep("details");
      return;
    }

    if (
      (customerType === "reservation" || customerType === "delivery") &&
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
            }));

      if (retailToPersist.length > 0) {
        await setVariantRetailPrices(retailToPersist);
      }

      await completePosSale({
        branchId: draftMeta.branchId,
        branchName: draftMeta.branchName,
        saleChannel,
        paymentMethod: isWholesale ? "cash" : paymentMethod,
        tenderMethod,
        paymentAccount: selectedAccount
          ? {
              id: selectedAccount.id,
              type: selectedAccount.type,
              provider: selectedAccount.provider,
              accountName: selectedAccount.accountName,
              accountNumber: selectedAccount.accountNumber,
            }
          : null,
        customerType,
        customer:
          customerType === "walk_in" ? null : normalizePosCustomer(customer),
        resellerId: appliedVoucher?.resellerId ?? null,
        resellerName: appliedVoucher?.resellerName ?? null,
        voucherId: appliedVoucher?.id ?? null,
        items: (() => {
          const merged = new Map<
            string,
            {
              productId: string;
              variantId: string;
              productName: string;
              quantity: number;
              unitPrice: number;
              lineTotal: number;
            }
          >();
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
            const existing = merged.get(line.variantId);
            if (!existing) {
              merged.set(line.variantId, {
                productId: line.productId,
                variantId: line.variantId,
                productName: name,
                quantity: line.quantity,
                unitPrice,
                lineTotal,
              });
            } else {
              const quantity = existing.quantity + line.quantity;
              const total = existing.lineTotal + lineTotal;
              existing.quantity = quantity;
              existing.lineTotal = total;
              existing.unitPrice = quantity > 0 ? total / quantity : 0;
              if (line.isFreebie && !existing.productName.includes("(Freebie)")) {
                existing.productName = `${existing.productName} + freebie`;
              }
            }
          }
          return [...merged.values()];
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
    <div className="mx-auto w-full max-w-lg space-y-4 pb-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Checkout</h1>
        <p className="text-muted-foreground">
          {isWholesale ? "Wholesale" : "Shop"} · {draftMeta.branchName}
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
        paymentMethod={paymentMethod}
        tenderMethod={tenderMethod}
        paymentAccounts={paymentAccounts}
        selectedPaymentAccountId={selectedPaymentAccountId}
        customerType={customerType}
        customer={customer}
        appliedVoucher={appliedVoucher}
        voucherCodeInput={voucherCodeInput}
        charging={charging}
        onPaymentMethodChange={applyPaymentMethod}
        onTenderMethodChange={(method) => {
          setTenderMethod(method);
          setSelectedPaymentAccountId(null);
          persistDraft({
            tenderMethod: method,
            selectedPaymentAccountId: null,
          });
        }}
        onPaymentAccountChange={(id) => {
          setSelectedPaymentAccountId(id);
          persistDraft({ selectedPaymentAccountId: id });
        }}
        onCustomerTypeChange={(type) => {
          setCustomerType(type);
          if (type === "walk_in") {
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
