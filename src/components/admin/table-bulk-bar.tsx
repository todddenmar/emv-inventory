"use client";

import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export function TableBulkBar({
  selectedCount,
  visibleCount,
  itemLabel,
  onSelectAllVisible,
  onClear,
  children,
}: {
  selectedCount: number;
  visibleCount: number;
  itemLabel: string;
  onSelectAllVisible: () => void;
  onClear: () => void;
  children: ReactNode;
}) {
  if (selectedCount === 0) return null;

  return (
    <div className="flex flex-col gap-3 rounded-lg border bg-muted/30 p-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="secondary">{selectedCount} selected</Badge>
        {selectedCount < visibleCount ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onSelectAllVisible}
          >
            Select all {visibleCount} {itemLabel}
          </Button>
        ) : null}
        <Button type="button" variant="ghost" size="sm" onClick={onClear}>
          Clear
        </Button>
      </div>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  );
}
