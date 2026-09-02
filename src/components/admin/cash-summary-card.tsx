import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { DailySalesReportSummary } from "@/lib/daily-sales-report";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";

function SummaryRow({
  label,
  value,
  muted,
  strong,
}: {
  label: string;
  value: string;
  muted?: boolean;
  strong?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <span
        className={cn(
          "min-w-0 flex-1 break-words leading-snug",
          muted
            ? "text-muted-foreground"
            : strong
              ? "font-semibold"
              : "font-medium"
        )}
      >
        {label}
      </span>
      <span
        className={cn(
          "shrink-0 text-right tabular-nums whitespace-nowrap",
          strong ? "text-base font-semibold" : "font-medium"
        )}
      >
        {value}
      </span>
    </div>
  );
}

export function CashSummaryCard({
  summary,
  branchName,
  className,
}: {
  summary: DailySalesReportSummary;
  branchName?: string | null;
  className?: string;
}) {
  const name = branchName?.trim() || null;
  return (
    <Card className={cn("h-fit min-w-0", className)}>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Cash summary</CardTitle>
        {name ? (
          <p className="truncate text-sm font-medium text-foreground">{name}</p>
        ) : null}
        <CardDescription className="text-pretty">
          Closing cash is added cash + net cash from the day (sales minus
          non-cash payments and expenses).
        </CardDescription>
      </CardHeader>
      <CardContent className="min-w-0 space-y-2.5 text-sm sm:space-y-3">
        <SummaryRow
          label="TOTAL SALES"
          value={formatCurrency(summary.totalSales)}
        />
        {summary.deductions.map((row) => (
          <SummaryRow
            key={row.key}
            label={row.label}
            value={`− ${formatCurrency(row.amount)}`}
            muted
          />
        ))}
        <div className="border-t pt-3">
          <SummaryRow
            label="Net cash from day"
            value={formatCurrency(summary.netCashFromDay)}
            strong
          />
        </div>
        <SummaryRow
          label="+ Cash added"
          value={formatCurrency(summary.cashAddsTotal)}
        />
        <div className="rounded-md bg-muted/50 px-3 py-3">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between sm:gap-3">
            <span className="font-semibold">Closing cash</span>
            <span className="text-lg font-semibold tabular-nums whitespace-nowrap sm:text-base">
              {formatCurrency(summary.closingCash)}
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
