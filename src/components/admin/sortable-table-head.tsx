"use client";

import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { TableHead } from "@/components/ui/table";
import type { SortState } from "@/hooks/use-table-sort";
import { cn } from "@/lib/utils";

export function SortableTableHead<K extends string>({
  label,
  sortKey,
  sort,
  onSort,
  align = "left",
  className,
}: {
  label: string;
  sortKey: K;
  sort: SortState<K>;
  onSort: (key: K) => void;
  align?: "left" | "right";
  className?: string;
}) {
  const active = sort?.key === sortKey ? sort.direction : null;
  const Icon =
    active === "asc" ? ArrowUp : active === "desc" ? ArrowDown : ArrowUpDown;

  return (
    <TableHead
      className={cn(align === "right" && "text-right", className)}
      aria-sort={
        active === "asc"
          ? "ascending"
          : active === "desc"
            ? "descending"
            : "none"
      }
    >
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onSort(sortKey);
        }}
        className={cn(
          "-mx-1 inline-flex items-center gap-1 rounded px-1 py-0.5 transition-colors hover:bg-muted hover:text-foreground",
          align === "right" && "flex-row-reverse",
          active && "text-foreground"
        )}
        title={`Sort by ${label.toLowerCase()}`}
      >
        <span>{label}</span>
        <Icon
          className={cn(
            "size-3.5 shrink-0",
            active ? "text-foreground" : "text-muted-foreground/60"
          )}
        />
      </button>
    </TableHead>
  );
}
