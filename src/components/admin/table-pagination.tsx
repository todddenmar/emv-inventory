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
}

export function TablePagination({
  page,
  totalPages,
  total,
  pageSize = TABLE_PAGE_SIZE,
  onPageChange,
  className,
}: TablePaginationProps) {
  if (total <= pageSize) return null;

  return (
    <div
      className={`flex items-center justify-end gap-2 ${className ?? ""}`}
    >
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={page <= 1}
        onClick={() => onPageChange(Math.max(1, page - 1))}
      >
        <ChevronLeft className="mr-1 h-4 w-4" />
        Previous
      </Button>
      <span className="text-sm tabular-nums text-muted-foreground">
        Page {page} of {totalPages}
      </span>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={page >= totalPages}
        onClick={() => onPageChange(Math.min(totalPages, page + 1))}
      >
        Next
        <ChevronRight className="ml-1 h-4 w-4" />
      </Button>
    </div>
  );
}
