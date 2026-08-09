"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  BarChart3,
  Loader2,
  Receipt,
  ShoppingBag,
  TrendingDown,
  TrendingUp,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useBranchAccess } from "@/hooks/use-branch-access";
import {
  formatDateInputLabel,
  previousPeriodRange,
  shiftDateInput,
  toDateInputValue,
} from "@/lib/dates";
import { getBranches } from "@/lib/firestore/branches";
import {
  getInventoryLogs,
  inventoryLogReasonLabel,
} from "@/lib/firestore/inventory-logs";
import { getPosSales } from "@/lib/firestore/pos-sales";
import { formatCurrency, formatDate } from "@/lib/format";
import {
  percentChange,
  salesByDay,
  salesByHour,
  salesByStaff,
  summarizeSales,
  summarizeStockMovements,
  topProducts,
} from "@/lib/reports";
import { cn } from "@/lib/utils";
import type { Branch, InventoryLog, PosSale } from "@/types";

type RangeMode = "day" | "range";

type Preset =
  | "today"
  | "yesterday"
  | "last7"
  | "thisMonth"
  | "custom";

function applyPreset(preset: Preset): {
  mode: RangeMode;
  fromDate: string;
  toDate: string;
} {
  const today = toDateInputValue();
  if (preset === "today") {
    return { mode: "day", fromDate: today, toDate: today };
  }
  if (preset === "yesterday") {
    const yesterday = shiftDateInput(today, -1);
    return { mode: "day", fromDate: yesterday, toDate: yesterday };
  }
  if (preset === "last7") {
    return {
      mode: "range",
      fromDate: shiftDateInput(today, -6),
      toDate: today,
    };
  }
  // thisMonth
  const [y, m] = today.split("-").map(Number);
  const monthStart = `${y}-${String(m).padStart(2, "0")}-01`;
  return { mode: "range", fromDate: monthStart, toDate: today };
}

function ChangeBadge({
  current,
  previous,
}: {
  current: number;
  previous: number;
}) {
  const change = percentChange(current, previous);
  if (change === null) {
    return (
      <span className="text-xs text-muted-foreground">vs prior: new</span>
    );
  }
  if (change === 0) {
    return (
      <span className="text-xs text-muted-foreground">vs prior: 0%</span>
    );
  }
  const up = change > 0;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 text-xs font-medium",
        up ? "text-emerald-700" : "text-red-700"
      )}
    >
      {up ? (
        <TrendingUp className="h-3.5 w-3.5" />
      ) : (
        <TrendingDown className="h-3.5 w-3.5" />
      )}
      {up ? "+" : ""}
      {change.toFixed(1)}% vs prior
    </span>
  );
}

function KpiCard({
  label,
  value,
  current,
  previous,
}: {
  label: string;
  value: string;
  current: number;
  previous: number;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardDescription>{label}</CardDescription>
        <CardTitle className="text-2xl tabular-nums">{value}</CardTitle>
      </CardHeader>
      <CardContent>
        <ChangeBadge current={current} previous={previous} />
      </CardContent>
    </Card>
  );
}

function BarMeter({
  value,
  max,
  className,
}: {
  value: number;
  max: number;
  className?: string;
}) {
  const width = max > 0 ? Math.max((value / max) * 100, value > 0 ? 2 : 0) : 0;
  return (
    <div className="h-2 w-full rounded-full bg-muted">
      <div
        className={cn("h-2 rounded-full bg-primary/80", className)}
        style={{ width: `${width}%` }}
      />
    </div>
  );
}

export default function AdminReportsPage() {
  const { isElevatedAdmin, assignedBranchId } = useBranchAccess();
  const initial = applyPreset("today");

  const [branches, setBranches] = useState<Branch[]>([]);
  const [selectedBranchId, setSelectedBranchId] = useState("all");
  const [mode, setMode] = useState<RangeMode>(initial.mode);
  const [preset, setPreset] = useState<Preset>("today");
  const [fromDate, setFromDate] = useState(initial.fromDate);
  const [toDate, setToDate] = useState(initial.toDate);
  const [loading, setLoading] = useState(true);
  const [sales, setSales] = useState<PosSale[]>([]);
  const [prevSales, setPrevSales] = useState<PosSale[]>([]);
  const [logs, setLogs] = useState<InventoryLog[]>([]);

  const scopeBranchId = isElevatedAdmin
    ? selectedBranchId === "all"
      ? null
      : selectedBranchId
    : assignedBranchId;

  const effectiveFrom = fromDate;
  const effectiveTo = mode === "day" ? fromDate : toDate;

  useEffect(() => {
    getBranches(true)
      .then((list) => {
        setBranches(list);
        if (!isElevatedAdmin && assignedBranchId) {
          setSelectedBranchId(assignedBranchId);
        }
      })
      .catch(console.error);
  }, [isElevatedAdmin, assignedBranchId]);

  const load = useCallback(async () => {
    if (!isElevatedAdmin && !assignedBranchId) {
      setSales([]);
      setPrevSales([]);
      setLogs([]);
      setLoading(false);
      return;
    }

    if (mode === "range" && effectiveFrom > effectiveTo) {
      toast.error("Start date must be on or before end date");
      return;
    }

    setLoading(true);
    const previous = previousPeriodRange(effectiveFrom, effectiveTo);

    try {
      const [currentSales, priorSales, stockLogs] = await Promise.all([
        getPosSales({
          branchId: scopeBranchId,
          fromDate: effectiveFrom,
          toDate: effectiveTo,
          max: 2000,
        }),
        getPosSales({
          branchId: scopeBranchId,
          fromDate: previous.fromDate,
          toDate: previous.toDate,
          max: 2000,
        }),
        getInventoryLogs({
          branchId: scopeBranchId,
          fromDate: effectiveFrom,
          toDate: effectiveTo,
          max: 2000,
        }),
      ]);
      setSales(currentSales);
      setPrevSales(priorSales);
      setLogs(stockLogs);
    } catch (error) {
      console.error(error);
      toast.error("Failed to load reports");
    } finally {
      setLoading(false);
    }
  }, [
    assignedBranchId,
    effectiveFrom,
    effectiveTo,
    isElevatedAdmin,
    mode,
    scopeBranchId,
  ]);

  useEffect(() => {
    void load();
  }, [load]);

  const totals = useMemo(() => summarizeSales(sales), [sales]);
  const prevTotals = useMemo(() => summarizeSales(prevSales), [prevSales]);
  const dayRows = useMemo(
    () => salesByDay(sales, effectiveFrom, effectiveTo),
    [sales, effectiveFrom, effectiveTo]
  );
  const hourRows = useMemo(() => salesByHour(sales), [sales]);
  const productRows = useMemo(() => topProducts(sales, 20), [sales]);
  const staffRows = useMemo(() => salesByStaff(sales), [sales]);
  const movementRows = useMemo(() => summarizeStockMovements(logs), [logs]);

  const maxDayRevenue = Math.max(...dayRows.map((r) => r.revenue), 0);
  const maxHourRevenue = Math.max(...hourRows.map((r) => r.revenue), 0);
  const busyHours = hourRows
    .filter((r) => r.receipts > 0)
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 3);

  const periodLabel =
    effectiveFrom === effectiveTo
      ? formatDateInputLabel(effectiveFrom)
      : `${formatDateInputLabel(effectiveFrom)} – ${formatDateInputLabel(effectiveTo)}`;

  const previous = previousPeriodRange(effectiveFrom, effectiveTo);
  const previousLabel =
    previous.fromDate === previous.toDate
      ? formatDateInputLabel(previous.fromDate)
      : `${formatDateInputLabel(previous.fromDate)} – ${formatDateInputLabel(previous.toDate)}`;

  const branchSelectLabel = (value: string | null) => {
    if (!value || value === "all") return "All branches";
    const branch = branches.find((b) => b.id === value);
    return branch ? `${branch.name} (${branch.code})` : null;
  };

  const selectPreset = (next: Preset) => {
    const applied = applyPreset(next);
    setPreset(next);
    setMode(applied.mode);
    setFromDate(applied.fromDate);
    setToDate(applied.toDate);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Reports</h1>
        <p className="text-muted-foreground">
          Sales performance, peak hours, and stock movement for managers
        </p>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Filters</CardTitle>
          <CardDescription>
            Compare against the matching prior period ({previousLabel}).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {(
              [
                ["today", "Today"],
                ["yesterday", "Yesterday"],
                ["last7", "Last 7 days"],
                ["thisMonth", "This month"],
              ] as const
            ).map(([key, label]) => (
              <Button
                key={key}
                type="button"
                size="sm"
                variant={preset === key ? "default" : "outline"}
                onClick={() => selectPreset(key)}
              >
                {label}
              </Button>
            ))}
          </div>

          <div className="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-end">
            <div className="space-y-2">
              <Label>Mode</Label>
              <div className="flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant={mode === "day" ? "default" : "outline"}
                  onClick={() => {
                    setMode("day");
                    setPreset("custom");
                    setToDate(fromDate);
                  }}
                >
                  Single day
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={mode === "range" ? "default" : "outline"}
                  onClick={() => {
                    setMode("range");
                    setPreset("custom");
                  }}
                >
                  Date range
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="reports-from">
                {mode === "day" ? "Date" : "From"}
              </Label>
              <Input
                id="reports-from"
                type="date"
                value={fromDate}
                onChange={(e) => {
                  const next = e.target.value || toDateInputValue();
                  setFromDate(next);
                  setPreset("custom");
                  if (mode === "day") setToDate(next);
                }}
                className="w-full lg:w-44"
              />
            </div>

            {mode === "range" ? (
              <div className="space-y-2">
                <Label htmlFor="reports-to">To</Label>
                <Input
                  id="reports-to"
                  type="date"
                  value={toDate}
                  onChange={(e) => {
                    setToDate(e.target.value || toDateInputValue());
                    setPreset("custom");
                  }}
                  className="w-full lg:w-44"
                />
              </div>
            ) : null}

            {isElevatedAdmin ? (
              <div className="space-y-2">
                <Label>Branch</Label>
                <Select
                  value={selectedBranchId}
                  onValueChange={(v) => setSelectedBranchId(v ?? "all")}
                >
                  <SelectTrigger className="w-full lg:w-56">
                    <SelectValue placeholder="All branches">
                      {(value) => branchSelectLabel(value as string | null)}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All branches</SelectItem>
                    {branches.map((branch) => (
                      <SelectItem key={branch.id} value={branch.id}>
                        {branch.name} ({branch.code})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : null}
          </div>
        </CardContent>
      </Card>

      {loading ? (
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading report for {periodLabel}…
        </div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <KpiCard
              label="Gross sales"
              value={formatCurrency(totals.revenue)}
              current={totals.revenue}
              previous={prevTotals.revenue}
            />
            <KpiCard
              label="Receipts"
              value={String(totals.receipts)}
              current={totals.receipts}
              previous={prevTotals.receipts}
            />
            <KpiCard
              label="Items sold"
              value={String(totals.itemsSold)}
              current={totals.itemsSold}
              previous={prevTotals.itemsSold}
            />
            <KpiCard
              label="Average ticket"
              value={formatCurrency(totals.avgTicket)}
              current={totals.avgTicket}
              previous={prevTotals.avgTicket}
            />
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <BarChart3 className="h-4 w-4" />
                  Sales by day
                </CardTitle>
                <CardDescription>{periodLabel}</CardDescription>
              </CardHeader>
              <CardContent>
                {dayRows.every((r) => r.receipts === 0) ? (
                  <p className="text-sm text-muted-foreground">
                    No sales in this period.
                  </p>
                ) : (
                  <div className="space-y-3">
                    {dayRows.map((row) => (
                      <div key={row.date} className="space-y-1">
                        <div className="flex items-center justify-between gap-3 text-sm">
                          <span className="font-medium">
                            {formatDateInputLabel(row.date)}
                          </span>
                          <span className="tabular-nums text-muted-foreground">
                            {formatCurrency(row.revenue)} · {row.receipts}{" "}
                            receipt{row.receipts === 1 ? "" : "s"}
                          </span>
                        </div>
                        <BarMeter value={row.revenue} max={maxDayRevenue} />
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <ShoppingBag className="h-4 w-4" />
                  Peak hours
                </CardTitle>
                <CardDescription>
                  {busyHours.length > 0
                    ? `Busiest: ${busyHours.map((h) => h.label).join(", ")}`
                    : "When tickets were rung up"}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {hourRows.every((r) => r.receipts === 0) ? (
                  <p className="text-sm text-muted-foreground">
                    No sales in this period.
                  </p>
                ) : (
                  <div className="grid grid-cols-6 gap-2 sm:grid-cols-8 md:grid-cols-12">
                    {hourRows.map((row) => {
                      const intensity =
                        maxHourRevenue > 0 ? row.revenue / maxHourRevenue : 0;
                      return (
                        <div
                          key={row.hour}
                          className="space-y-1 text-center"
                          title={`${row.label}: ${formatCurrency(row.revenue)} · ${row.receipts} receipts`}
                        >
                          <div className="relative mx-auto h-16 w-full overflow-hidden rounded-md bg-muted">
                            <div
                              className="absolute inset-x-0 bottom-0 bg-primary/80"
                              style={{ height: `${intensity * 100}%` }}
                            />
                          </div>
                          <p className="text-[10px] text-muted-foreground">
                            {String(row.hour).padStart(2, "0")}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Receipt className="h-4 w-4" />
                  Top products
                </CardTitle>
                <CardDescription>
                  Ranked by revenue (variant line items)
                </CardDescription>
              </CardHeader>
              <CardContent>
                {productRows.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No product sales yet.
                  </p>
                ) : (
                  <div className="overflow-x-auto rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Product</TableHead>
                          <TableHead className="text-right">Qty</TableHead>
                          <TableHead className="text-right">Revenue</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {productRows.map((row, index) => (
                          <TableRow key={row.key}>
                            <TableCell>
                              <div className="flex items-start gap-2">
                                <span className="w-5 shrink-0 text-xs text-muted-foreground">
                                  {index + 1}
                                </span>
                                <span className="font-medium">{row.name}</span>
                              </div>
                            </TableCell>
                            <TableCell className="text-right tabular-nums">
                              {row.quantity}
                            </TableCell>
                            <TableCell className="text-right tabular-nums">
                              {formatCurrency(row.revenue)}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Users className="h-4 w-4" />
                  Staff sales
                </CardTitle>
                <CardDescription>
                  Who rang up receipts in this period
                </CardDescription>
              </CardHeader>
              <CardContent>
                {staffRows.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No staff sales yet.
                  </p>
                ) : (
                  <div className="overflow-x-auto rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Staff</TableHead>
                          <TableHead className="text-right">Receipts</TableHead>
                          <TableHead className="text-right">Avg ticket</TableHead>
                          <TableHead className="text-right">Revenue</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {staffRows.map((row) => (
                          <TableRow key={row.key}>
                            <TableCell className="font-medium">
                              {row.name}
                            </TableCell>
                            <TableCell className="text-right tabular-nums">
                              {row.receipts}
                            </TableCell>
                            <TableCell className="text-right tabular-nums">
                              {formatCurrency(row.avgTicket)}
                            </TableCell>
                            <TableCell className="text-right tabular-nums">
                              {formatCurrency(row.revenue)}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Stock movements</CardTitle>
              <CardDescription>
                Inventory activity alongside sales — units in/out by reason
              </CardDescription>
            </CardHeader>
            <CardContent>
              {movementRows.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No stock movements in this period.
                </p>
              ) : (
                <div className="overflow-x-auto rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Activity</TableHead>
                        <TableHead className="text-right">Events</TableHead>
                        <TableHead className="text-right">Units in</TableHead>
                        <TableHead className="text-right">Units out</TableHead>
                        <TableHead className="text-right">Net</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {movementRows.map((row) => (
                        <TableRow key={row.reason}>
                          <TableCell>
                            <Badge variant="outline">
                              {inventoryLogReasonLabel(row.reason)}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {row.events}
                          </TableCell>
                          <TableCell className="text-right tabular-nums text-emerald-700">
                            {row.unitsIn > 0 ? `+${row.unitsIn}` : "—"}
                          </TableCell>
                          <TableCell className="text-right tabular-nums text-red-700">
                            {row.unitsOut > 0 ? `−${row.unitsOut}` : "—"}
                          </TableCell>
                          <TableCell
                            className={cn(
                              "text-right font-medium tabular-nums",
                              row.netUnits > 0
                                ? "text-emerald-700"
                                : row.netUnits < 0
                                  ? "text-red-700"
                                  : ""
                            )}
                          >
                            {row.netUnits > 0 ? "+" : ""}
                            {row.netUnits}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Recent receipts</CardTitle>
              <CardDescription>
                Latest tickets in {periodLabel} (up to 25)
              </CardDescription>
            </CardHeader>
            <CardContent>
              {sales.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No receipts in this period.
                </p>
              ) : (
                <div className="overflow-x-auto rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>When</TableHead>
                        <TableHead>Branch</TableHead>
                        <TableHead>Staff</TableHead>
                        <TableHead>Items</TableHead>
                        <TableHead className="text-right">Total</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {sales.slice(0, 25).map((sale) => (
                        <TableRow key={sale.id}>
                          <TableCell className="whitespace-nowrap text-sm">
                            {formatDate(sale.createdAt)}
                          </TableCell>
                          <TableCell className="text-sm">
                            {sale.branchName || sale.branchId}
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {sale.createdByName ?? "Staff"}
                          </TableCell>
                          <TableCell className="text-sm">
                            <span className="tabular-nums">{sale.itemCount}</span>
                            <span className="text-muted-foreground">
                              {" "}
                              ·{" "}
                              {sale.items
                                .slice(0, 2)
                                .map((item) => item.productName)
                                .join(", ")}
                              {sale.items.length > 2 ? "…" : ""}
                            </span>
                          </TableCell>
                          <TableCell className="text-right font-medium tabular-nums">
                            {formatCurrency(sale.total)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
        </CardContent>
      </Card>
        </>
      )}
    </div>
  );
}
