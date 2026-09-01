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
    <div className="flex items-baseline justify-between gap-3">
      <span
        className={
          muted
            ? "text-muted-foreground"
            : strong
              ? "font-semibold"
              : "font-medium"
        }
      >
        {label}
      </span>
      <span
        className={
          strong
            ? "tabular-nums text-base font-semibold"
            : "tabular-nums font-medium"
        }
      >
        {value}
      </span>
    </div>
  );
}

export function CashSummaryCard({
  summary,
  className,
}: {
  summary: DailySalesReportSummary;
  className?: string;
}) {
  return (
    <Card className={cn("h-fit", className)}>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Cash summary</CardTitle>
        <CardDescription>
          Closing cash is added cash + net cash from the day (sales minus bank
          transfer, home credit, Skyro, Salmon, and expenses).
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <SummaryRow
          label="TOTAL SALES"
          value={formatCurrency(summary.totalSales)}
        />
        <SummaryRow
          label="BT (Bank transfer)"
          value={`− ${formatCurrency(summary.bankTransferTotal)}`}
          muted
        />
        <SummaryRow
          label="HC (Home Credit)"
          value={`− ${formatCurrency(summary.homeCreditTotal)}`}
          muted
        />
        <SummaryRow
          label="SK (Skyro)"
          value={`− ${formatCurrency(summary.skyroTotal)}`}
          muted
        />
        <SummaryRow
          label="SM (Salmon)"
          value={`− ${formatCurrency(summary.salmonTotal)}`}
          muted
        />
        <SummaryRow
          label="EX (Expenses)"
          value={`− ${formatCurrency(summary.expensesTotal)}`}
          muted
        />
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
          <SummaryRow
            label="Closing cash"
            value={formatCurrency(summary.closingCash)}
            strong
          />
        </div>
      </CardContent>
    </Card>
  );
}
