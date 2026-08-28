"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { useBranchAccess } from "@/hooks/use-branch-access";
import { useAuthStore } from "@/stores/auth-store";
import { getTransferRequestsForBranch } from "@/lib/firestore/transfer-requests";
import type { TransferRequest } from "@/types";

const POLL_MS = 20_000;

export function CashierTransferRequestBanner() {
  const loading = useAuthStore((s) => s.loading);
  const user = useAuthStore((s) => s.user);
  const { assignedBranchId } = useBranchAccess();
  const [rows, setRows] = useState<TransferRequest[]>([]);

  const refresh = useCallback(async () => {
    if (!assignedBranchId) {
      setRows([]);
      return;
    }
    try {
      const list = await getTransferRequestsForBranch(assignedBranchId);
      setRows(list);
    } catch (error) {
      console.warn("Transfer request banner fetch failed", error);
      setRows([]);
    }
  }, [assignedBranchId]);

  useEffect(() => {
    if (loading || !user || !assignedBranchId) {
      setRows([]);
      return;
    }

    void refresh();
    const id = window.setInterval(() => {
      void refresh();
    }, POLL_MS);
    return () => window.clearInterval(id);
  }, [loading, user, assignedBranchId, refresh]);

  const summary = useMemo(() => {
    if (!assignedBranchId) {
      return { incoming: 0, ready: 0 };
    }
    let incoming = 0;
    let ready = 0;
    for (const row of rows) {
      if (row.fromBranchId === assignedBranchId && row.status === "requested") {
        incoming += 1;
      }
      if (row.toBranchId === assignedBranchId && row.status === "released") {
        ready += 1;
      }
    }
    return { incoming, ready };
  }, [rows, assignedBranchId]);

  if (summary.incoming === 0 && summary.ready === 0) return null;

  const parts: string[] = [];
  if (summary.incoming > 0) {
    parts.push(
      `${summary.incoming} incoming transfer request${summary.incoming === 1 ? "" : "s"}`
    );
  }
  if (summary.ready > 0) {
    parts.push(
      `${summary.ready} item${summary.ready === 1 ? "" : "s"} ready to receive`
    );
  }

  return (
    <Link
      href="/admin/cashier/transfer-requests"
      className="flex items-start gap-2 border-b border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-950 hover:bg-amber-100/80"
    >
      <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-700" />
      <span className="min-w-0">
        <span className="font-medium">{parts.join(" · ")}</span>
        <span className="text-amber-800/80"> — tap to open Requests</span>
      </span>
    </Link>
  );
}
