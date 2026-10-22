"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Info } from "lucide-react";
import { useBranchAccess } from "@/hooks/use-branch-access";
import { useAuthStore } from "@/stores/auth-store";
import {
  findProductsMissingFromPos,
  getAllBranchInventory,
} from "@/lib/firestore/inventory";
import { getProducts } from "@/lib/firestore/products";
import { isProductPublished } from "@/lib/products-catalog";

const POLL_MS = 60_000;
const ASSORTMENT_HREF = "/admin/settings/assortment";

export function MissingPosAssortmentBanner() {
  const pathname = usePathname();
  const loading = useAuthStore((s) => s.loading);
  const user = useAuthStore((s) => s.user);
  const { isElevatedAdmin } = useBranchAccess();
  const [productCount, setProductCount] = useState(0);
  const [variantCount, setVariantCount] = useState(0);

  const onAssortmentPage = useMemo(
    () =>
      pathname === ASSORTMENT_HREF ||
      pathname.startsWith(`${ASSORTMENT_HREF}/`),
    [pathname]
  );

  useEffect(() => {
    if (loading || !user || !isElevatedAdmin || onAssortmentPage) {
      return;
    }

    let cancelled = false;

    async function load() {
      try {
        const [products, inventory] = await Promise.all([
          getProducts(),
          getAllBranchInventory(),
        ]);
        if (cancelled) return;
        const gaps = findProductsMissingFromPos(
          products.filter((p) => !p.isArchived),
          inventory,
          isProductPublished
        );
        setProductCount(gaps.length);
        setVariantCount(
          gaps.reduce((sum, gap) => sum + gap.missingVariantCount, 0)
        );
      } catch (error) {
        console.warn("Missing POS assortment banner fetch failed", error);
        if (!cancelled) {
          setProductCount(0);
          setVariantCount(0);
        }
      }
    }

    void load();
    const id = window.setInterval(() => {
      void load();
    }, POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [loading, user, isElevatedAdmin, onAssortmentPage]);

  if (!isElevatedAdmin || onAssortmentPage || productCount === 0) {
    return null;
  }

  const productLabel = `${productCount} product${productCount === 1 ? "" : "s"}`;
  const variantLabel = `${variantCount} variant${variantCount === 1 ? "" : "s"}`;

  return (
    <Link
      href={ASSORTMENT_HREF}
      className="flex items-center justify-center gap-2 border-b border-sky-200 bg-sky-50 px-4 py-2.5 text-center text-sm text-sky-950 hover:bg-sky-100/80"
    >
      <Info className="size-4 shrink-0 text-sky-700" />
      <span className="min-w-0">
        <span className="font-medium">
          {variantLabel} missing from POS across {productLabel}
        </span>
        <span className="text-sky-800/80"> — open Branch assortment</span>
      </span>
    </Link>
  );
}
