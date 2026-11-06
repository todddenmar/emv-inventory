"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  BarChart3,
  Check,
  Loader2,
  Package,
  Warehouse,
  X,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { LinkButton } from "@/components/ui/link-button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { InventoryActivityFeed } from "@/components/admin/inventory-activity-feed";
import { useBranchAccess } from "@/hooks/use-branch-access";
import { catalogCountsByCategoryGroup } from "@/lib/catalog-stats";
import { getProducts } from "@/lib/firestore/products";
import { getBranch, getBranches } from "@/lib/firestore/branches";
import { getCategoryGroups } from "@/lib/firestore/category-groups";
import { cn } from "@/lib/utils";
import type { Branch, CategoryGroup, Product } from "@/types";

type LoadStepId = "products" | "branches" | "groups";

type LoadStepStatus = "pending" | "loading" | "done" | "error";

type LoadStep = {
  id: LoadStepId;
  label: string;
  status: LoadStepStatus;
  ms: number | null;
  error: string | null;
};

const INITIAL_LOAD_STEPS: LoadStep[] = [
  {
    id: "products",
    label: "Products catalog",
    status: "pending",
    ms: null,
    error: null,
  },
  { id: "branches", label: "Branches", status: "pending", ms: null, error: null },
  {
    id: "groups",
    label: "Category groups",
    status: "pending",
    ms: null,
    error: null,
  },
];

async function timed<T>(fn: () => Promise<T>): Promise<{ value: T; ms: number }> {
  const started = performance.now();
  const value = await fn();
  return { value, ms: Math.round(performance.now() - started) };
}

function formatLoadMs(ms: number | null): string {
  if (ms == null) return "";
  if (ms < 1000) return `${ms} ms`;
  return `${(ms / 1000).toFixed(1)} s`;
}

function DashboardLoadProgress({ steps }: { steps: LoadStep[] }) {
  const done = steps.filter(
    (s) => s.status === "done" || s.status === "error"
  ).length;
  const total = steps.length;
  const pct = total === 0 ? 0 : Math.round((done / total) * 100);
  const active = steps.find((s) => s.status === "loading");
  const allSettled = done === total;

  if (allSettled) return null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Loading dashboard</CardTitle>
        <CardDescription>
          {active
            ? `Working on: ${active.label}`
            : `${done} of ${total} data sources ready`}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>{pct}%</span>
            <span>
              {done}/{total}
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-[width] duration-300"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
        <ul className="space-y-2">
          {steps.map((step) => (
            <li
              key={step.id}
              className="flex items-center justify-between gap-3 text-sm"
            >
              <div className="flex min-w-0 items-center gap-2">
                {step.status === "done" ? (
                  <Check className="h-4 w-4 shrink-0 text-emerald-600" />
                ) : step.status === "error" ? (
                  <X className="h-4 w-4 shrink-0 text-destructive" />
                ) : step.status === "loading" ? (
                  <Loader2 className="h-4 w-4 shrink-0 animate-spin text-primary" />
                ) : (
                  <span className="h-4 w-4 shrink-0 rounded-full border border-muted-foreground/40" />
                )}
                <span
                  className={cn(
                    "truncate",
                    step.status === "pending" && "text-muted-foreground",
                    step.status === "error" && "text-destructive"
                  )}
                >
                  {step.label}
                  {step.error ? ` — ${step.error}` : ""}
                </span>
              </div>
              <span className="shrink-0 tabular-nums text-xs text-muted-foreground">
                {step.status === "loading" ? "…" : formatLoadMs(step.ms)}
              </span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

function StatCardSkeleton() {
  return (
    <Card>
      <CardHeader className="pb-2">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="mt-2 h-8 w-16" />
      </CardHeader>
    </Card>
  );
}

function PanelSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-3 py-2">
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="h-8 w-full" />
      ))}
    </div>
  );
}

export default function AdminDashboardPage() {
  const { canViewAllBranches, assignedBranchId } = useBranchAccess();
  const [branch, setBranch] = useState<Branch | null>(null);
  const [branchCount, setBranchCount] = useState(0);
  const [products, setProducts] = useState<Product[]>([]);
  const [categoryGroups, setCategoryGroups] = useState<CategoryGroup[]>([]);
  const [catalogReady, setCatalogReady] = useState(false);
  const [groupsReady, setGroupsReady] = useState(false);
  const [loadSteps, setLoadSteps] = useState<LoadStep[]>(INITIAL_LOAD_STEPS);

  const productCount = products.length;
  const variantCount = useMemo(
    () => products.reduce((sum, product) => sum + product.variants.length, 0),
    [products]
  );

  const patchStep = useCallback(
    (
      id: LoadStepId,
      patch: Partial<Pick<LoadStep, "status" | "ms" | "error">>
    ) => {
      setLoadSteps((prev) =>
        prev.map((step) => (step.id === id ? { ...step, ...patch } : step))
      );
    },
    []
  );

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setCatalogReady(false);
      setGroupsReady(false);
      setLoadSteps(INITIAL_LOAD_STEPS.map((step) => ({ ...step })));

      patchStep("products", { status: "loading", ms: null, error: null });
      try {
        const { value, ms } = await timed(() => getProducts());
        if (cancelled) return;
        setProducts(value);
        patchStep("products", { status: "done", ms });
        setCatalogReady(true);
      } catch (error) {
        console.error(error);
        if (!cancelled) {
          patchStep("products", {
            status: "error",
            ms: null,
            error: "Failed",
          });
          setCatalogReady(true);
        }
      }

      patchStep("branches", { status: "loading", ms: null, error: null });
      try {
        const { value, ms } = await timed(async () => {
          if (canViewAllBranches) {
            const branches = await getBranches(true);
            return { branches, branch: null as Branch | null };
          }
          if (!assignedBranchId) {
            return { branches: [] as Branch[], branch: null as Branch | null };
          }
          const b = await getBranch(assignedBranchId);
          return {
            branches: b ? [b] : [],
            branch: b,
          };
        });
        if (cancelled) return;
        setBranchCount(value.branches.length);
        setBranch(value.branch);
        patchStep("branches", { status: "done", ms });
      } catch (error) {
        console.error(error);
        if (!cancelled) {
          patchStep("branches", {
            status: "error",
            ms: null,
            error: "Failed",
          });
        }
      }

      patchStep("groups", { status: "loading", ms: null, error: null });
      try {
        const { value, ms } = await timed(() => getCategoryGroups());
        if (cancelled) return;
        setCategoryGroups(value);
        patchStep("groups", { status: "done", ms });
        setGroupsReady(true);
      } catch (error) {
        console.error(error);
        if (!cancelled) {
          patchStep("groups", {
            status: "error",
            ms: null,
            error: "Failed",
          });
          setGroupsReady(true);
        }
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [canViewAllBranches, assignedBranchId, patchStep]);

  const groupCatalogRows = useMemo(
    () => catalogCountsByCategoryGroup(products, categoryGroups),
    [products, categoryGroups]
  );

  const showCatalogSkeletons = !catalogReady;
  const showGroupsSkeleton = !catalogReady || !groupsReady;
  const branchesStep = loadSteps.find((s) => s.id === "branches");
  const branchesReady =
    branchesStep?.status === "done" || branchesStep?.status === "error";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Dashboard</h1>
        {!canViewAllBranches && branch ? (
          <p className="text-muted-foreground">{branch.name} branch overview</p>
        ) : !canViewAllBranches && !branchesReady ? (
          <Skeleton className="mt-1 h-4 w-40" />
        ) : null}
      </div>

      <DashboardLoadProgress steps={loadSteps} />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {canViewAllBranches ? (
          !branchesReady ? (
            <StatCardSkeleton />
          ) : (
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Active branches</CardDescription>
                <CardTitle className="text-3xl">{branchCount}</CardTitle>
              </CardHeader>
            </Card>
          )
        ) : null}
        {showCatalogSkeletons ? (
          <>
            <StatCardSkeleton />
            <StatCardSkeleton />
          </>
        ) : (
          <>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Catalog products</CardDescription>
                <CardTitle className="text-3xl">{productCount}</CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Product variants</CardDescription>
                <CardTitle className="text-3xl">{variantCount}</CardTitle>
              </CardHeader>
            </Card>
          </>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <BarChart3 className="h-4 w-4" />
              Sales reports
            </CardTitle>
            <CardDescription>
              Monthly sales, receipts, and top sellers live on Reports when you
              need them.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <LinkButton href="/admin/reports" variant="outline">
              Open reports
            </LinkButton>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Warehouse className="h-4 w-4" />
              Inventory
            </CardTitle>
            <CardDescription>
              Low stock and branch stock levels are checked on the inventory
              pages.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <LinkButton href="/admin/inventory" variant="outline">
              Open inventory
            </LinkButton>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2 lg:items-start">
        <Card className="min-w-0">
          <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <CardTitle className="flex items-center gap-2 text-base">
                <Package className="h-4 w-4 shrink-0" />
                Products by category group
              </CardTitle>
              <CardDescription>
                Catalog totals per group (products can appear in more than one)
              </CardDescription>
            </div>
            <LinkButton
              href="/admin/settings/category-groups"
              variant="outline"
              size="sm"
              className="w-full shrink-0 sm:w-auto"
            >
              Manage groups
            </LinkButton>
          </CardHeader>
          <CardContent>
            {showGroupsSkeleton ? (
              <PanelSkeleton rows={5} />
            ) : groupCatalogRows.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                No category groups yet. Create groups in Settings to break down
                catalog counts.
              </p>
            ) : (
              <div className="max-h-[28rem] overflow-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Group</TableHead>
                      <TableHead className="text-right">Products</TableHead>
                      <TableHead className="text-right">Variants</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {groupCatalogRows.map((row) => (
                      <TableRow key={row.groupId}>
                        <TableCell className="font-medium">{row.name}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {row.productCount}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {row.variantCount}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="min-w-0">
          <InventoryActivityFeed
            branchId={canViewAllBranches ? null : assignedBranchId}
            description={
              canViewAllBranches
                ? "Adjustments and transfers across all branches"
                : "Stock changes for your branch"
            }
          />
        </div>
      </div>
    </div>
  );
}
