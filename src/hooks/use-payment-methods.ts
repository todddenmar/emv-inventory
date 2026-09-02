import { useEffect, useState } from "react";
import { getPaymentMethods } from "@/lib/firestore/payment-methods";
import type { PaymentMethod } from "@/types";

export function usePaymentMethods(activeOnly = false): {
  methods: PaymentMethod[];
  loading: boolean;
} {
  const [methods, setMethods] = useState<PaymentMethod[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    getPaymentMethods({ activeOnly })
      .then((rows) => {
        if (!cancelled) setMethods(rows);
      })
      .catch(console.error)
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [activeOnly]);

  return { methods, loading };
}
