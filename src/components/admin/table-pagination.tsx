"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TABLE_PAGE_SIZE } from "@/lib/pagination";

interface TablePaginationProps {
  page: number;
  totalPages: number;
  total: number;
  pageSize?: number;
  onPageChange: (page: number) => void;
  className?: string;
  /** Icon-only controls for tight footers (e.g. mobile POS). */
  compact?: boolean;
}

export function TablePagination({
  page,
  totalPages,
  total,
  pageSize = TABLE_PAGE_SIZE,
  onPageChange,
  className,
  compact = false,
}: TablePaginationProps) {
  if (total <= pageSize) return null;

  return (
    <div
      className={`flex items-center justify-end gap-2 ${className ?? ""}`}
    >
      <Button
        type="button"
        variant="outline"
        size={compact ? "icon-sm" : "sm"}
        className={compact ? "size-8 shrink-0" : undefined}
        disabled={page <= 1}
        onClick={() => onPageChange(Math.max(1, page - 1))}
        aria-label="Previous page"
      >
        <ChevronLeft className={compact ? "h-4 w-4" : "mr-1 h-4 w-4"} />
        {compact ? null : "Previous"}
      </Button>
      <span className="text-sm tabular-nums text-muted-foreground">
        {compact ? `${page}/${totalPages}` : `Page ${page} of ${totalPages}`}
      </span>
      <Button
        type="button"
        variant="outline"
        size={compact ? "icon-sm" : "sm"}
        className={compact ? "size-8 shrink-0" : undefined}
        disabled={page >= totalPages}
        onClick={() => onPageChange(Math.min(totalPages, page + 1))}
        aria-label="Next page"
      >
        {compact ? null : "Next"}
        <ChevronRight className={compact ? "h-4 w-4" : "ml-1 h-4 w-4"} />
      </Button>
    </div>
  );
}
