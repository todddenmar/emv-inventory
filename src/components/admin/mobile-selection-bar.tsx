"use client";

import { Button } from "@/components/ui/button";
import { ABOVE_BOTTOM_NAV_BOTTOM } from "@/hooks/use-bottom-nav-height";

export function MobileSelectionBar({
  count,
  hint,
  actionLabel = "Review",
  onAction,
}: {
  count: number;
  hint?: string;
  actionLabel?: string;
  onAction: () => void;
}) {
  if (count <= 0) return null;

  return (
    <div
      className="fixed inset-x-0 z-[51] border-t bg-background/95 px-4 py-2.5 shadow-[0_-4px_12px_rgba(0,0,0,0.08)] backdrop-blur lg:hidden"
      style={{ bottom: ABOVE_BOTTOM_NAV_BOTTOM }}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold tabular-nums">
            {count} selected
          </p>
          {hint ? (
            <p className="truncate text-xs text-muted-foreground">{hint}</p>
          ) : null}
        </div>
        <Button type="button" className="h-10 shrink-0" onClick={onAction}>
          {actionLabel}
        </Button>
      </div>
    </div>
  );
}
