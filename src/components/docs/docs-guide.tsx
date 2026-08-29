"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export const DOC_TOC = [
  {
    id: "overview",
    label: "What this app is",
    keywords:
      "overview physical store inventory pos point of sale catalog branch stock activity log",
  },
  {
    id: "getting-started",
    label: "Getting started",
    keywords: "invite login google sign in branch assigned getting started",
  },
  {
    id: "roles",
    label: "Roles & access",
    keywords:
      "roles master admin owner manager cashier access permissions scopes matrix branch who can",
  },
  {
    id: "selling",
    label: "Selling (POS)",
    keywords:
      "pos wholesale shop cart checkout sale assortment voucher reseller freebie",
  },
  {
    id: "inventory",
    label: "Inventory",
    keywords:
      "inventory stock levels daily stock changes opening closing supplier stock in adjustment history transfers low stock",
  },
  {
    id: "reports",
    label: "Reports",
    keywords:
      "reports sales revenue receipts stock movements channel category filter invoice",
  },
  {
    id: "catalog",
    label: "Catalog & branches",
    keywords:
      "products categories branches assortment price promotions variants catalog",
  },
  {
    id: "settings",
    label: "Settings",
    keywords:
      "settings general assortment category groups suppliers resellers vouchers payment accounts users invites import",
  },
  {
    id: "glossary",
    label: "Glossary",
    keywords:
      "glossary variant assortment inventory log opening closing sale channel",
  },
] as const;

export type DocSectionId = (typeof DOC_TOC)[number]["id"];

export type DocsGuideVariant = "page" | "dialog";

function Section({
  id,
  title,
  children,
  compact,
}: {
  id: string;
  title: string;
  children: React.ReactNode;
  compact?: boolean;
}) {
  return (
    <section id={id} className={cn("scroll-mt-4", compact && "scroll-mt-2")}>
      <h2
        className={cn(
          "docs-display font-semibold tracking-tight text-[#12141a]",
          compact ? "text-xl sm:text-2xl" : "text-3xl sm:text-4xl"
        )}
      >
        {title}
      </h2>
      <div
        className={cn(
          "mt-3 space-y-3 leading-relaxed text-[#2a3140]",
          compact ? "text-sm" : "mt-4 space-y-4 text-[15px]"
        )}
      >
        {children}
      </div>
    </section>
  );
}

function Callout({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-[#12141a]/10 border-l-4 border-l-[var(--brand-yellow)] bg-white/70 px-4 py-3 text-sm text-[#2a3140]">
      {children}
    </div>
  );
}

function RoleCard({
  role,
  home,
  sees,
}: {
  role: string;
  home: string;
  sees: string;
}) {
  return (
    <div className="rounded-xl border border-[#12141a]/10 bg-white p-4 shadow-[0_1px_0_rgba(18,20,26,0.04)]">
      <p className="docs-display text-lg font-semibold text-[#12141a]">
        {role}
      </p>
      <p className="mt-1 text-xs font-medium tracking-wide text-[#5a6478] uppercase">
        Lands on {home}
      </p>
      <p className="mt-2 text-sm leading-relaxed text-[#2a3140]">{sees}</p>
    </div>
  );
}

type ScopeMark = "yes" | "no" | "view" | "partial";

const ROLE_SCOPE_COLUMNS = [
  "Master",
  "Admin",
  "Owner",
  "Manager",
  "Cashier",
] as const;

const ROLE_SCOPE_ROWS: {
  scope: string;
  note?: string;
  marks: ScopeMark[];
}[] = [
  {
    scope: "See all branches",
    marks: ["yes", "yes", "yes", "no", "no"],
  },
  {
    scope: "Dashboard / overview",
    note: "Cashiers get a cashier overview instead of the full dashboard.",
    marks: ["yes", "yes", "no", "yes", "partial"],
  },
  {
    scope: "Shop & wholesale POS",
    marks: ["yes", "yes", "no", "yes", "yes"],
  },
  {
    scope: "Stock levels",
    note: "Owners can view only; they cannot edit quantities.",
    marks: ["yes", "yes", "view", "yes", "no"],
  },
  {
    scope: "Inventory tools",
    note: "Daily stock, supplier stock in, adjustments, transfers.",
    marks: ["yes", "yes", "no", "yes", "no"],
  },
  {
    scope: "Find stock & transfer requests",
    note: "Cashier flow to request stock from another branch.",
    marks: ["no", "no", "no", "no", "yes"],
  },
  {
    scope: "Sales reports",
    note: "Cashiers see their sales list, not full report tools.",
    marks: ["yes", "yes", "yes", "yes", "partial"],
  },
  {
    scope: "Price changes",
    marks: ["yes", "yes", "no", "yes", "no"],
  },
  {
    scope: "Price promotions",
    marks: ["yes", "yes", "no", "no", "no"],
  },
  {
    scope: "Products, categories, branches",
    marks: ["yes", "yes", "no", "no", "no"],
  },
  {
    scope: "Settings (ops)",
    note: "Assortment, resellers, vouchers, payment accounts. Managers: branch-scoped where applicable.",
    marks: ["yes", "yes", "no", "partial", "no"],
  },
  {
    scope: "Users & invites",
    marks: ["yes", "yes", "no", "no", "no"],
  },
  {
    scope: "Product JSON import",
    marks: ["yes", "no", "no", "no", "no"],
  },
];

function ScopeMarkCell({ mark }: { mark: ScopeMark }) {
  if (mark === "yes") {
    return (
      <span
        className="inline-flex size-6 items-center justify-center rounded-md bg-[var(--brand-yellow)]/35 text-sm font-bold text-[#12141a]"
        title="Full access"
        aria-label="Full access"
      >
        ✓
      </span>
    );
  }
  if (mark === "view") {
    return (
      <span
        className="text-xs font-semibold tracking-wide text-[#2a3140] uppercase"
        title="View only"
      >
        View
      </span>
    );
  }
  if (mark === "partial") {
    return (
      <span
        className="text-xs font-semibold tracking-wide text-[#5a6478] uppercase"
        title="Limited access"
      >
        Limited
      </span>
    );
  }
  return (
    <span className="text-[#9aa3b2]" title="No access" aria-label="No access">
      —
    </span>
  );
}

function RoleScopeMatrix({ compact }: { compact?: boolean }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-[#12141a]/10 bg-white">
      <table className="w-full min-w-[36rem] text-left text-sm">
        <caption className="sr-only">
          Role access scopes for master admin, admin, owner, manager, and cashier
        </caption>
        <thead className="bg-[#12141a] text-[#f7f4ea]">
          <tr>
            <th
              className={cn(
                "sticky left-0 bg-[#12141a] px-3 font-medium sm:px-4",
                compact ? "py-2.5" : "py-3"
              )}
            >
              Scope
            </th>
            {ROLE_SCOPE_COLUMNS.map((role) => (
              <th
                key={role}
                className={cn(
                  "px-2 text-center font-medium sm:px-3",
                  compact ? "py-2.5" : "py-3"
                )}
              >
                {role}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-[#12141a]/8">
          {ROLE_SCOPE_ROWS.map((row) => (
            <tr key={row.scope} className="align-middle">
              <th
                scope="row"
                className={cn(
                  "sticky left-0 bg-white px-3 text-left font-medium text-[#12141a] sm:px-4",
                  compact ? "py-2.5" : "py-3"
                )}
              >
                <span>{row.scope}</span>
                {row.note ? (
                  <span className="mt-0.5 block text-xs font-normal text-[#5a6478]">
                    {row.note}
                  </span>
                ) : null}
              </th>
              {row.marks.map((mark, i) => (
                <td
                  key={`${row.scope}-${ROLE_SCOPE_COLUMNS[i]}`}
                  className={cn(
                    "px-2 text-center sm:px-3",
                    compact ? "py-2.5" : "py-3"
                  )}
                >
                  <ScopeMarkCell mark={mark} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function DocsSections({
  idPrefix,
  visibleIds,
  compact,
  showFooter,
}: {
  idPrefix: string;
  visibleIds: Set<string>;
  compact?: boolean;
  showFooter?: boolean;
}) {
  const sid = (id: string) => `${idPrefix}${id}`;
  const show = (id: string) => visibleIds.has(id);

  return (
    <div className={cn("space-y-12", compact && "space-y-10")}>
      {show("overview") ? (
        <Section id={sid("overview")} title="What this app is" compact={compact}>
          <p>
            This is the <strong>physical store</strong> inventory and
            point-of-sale system for El Mio Vicente. Staff use it to sell at the
            counter, receive supplier stock, move stock between branches, and
            review sales and stock movement.
          </p>
          <p>
            It is separate from a customer online shop. Guests without a staff
            role cannot sign in.
          </p>
          <Callout>
            Think in three layers: <strong>catalog</strong> (products &amp;
            variants), <strong>branch stock</strong> (how many units each branch
            sells), and <strong>activity</strong> (sales, receiving, transfers,
            adjustments — all leave a log).
          </Callout>
        </Section>
      ) : null}

      {show("getting-started") ? (
        <Section
          id={sid("getting-started")}
          title="Getting started"
          compact={compact}
        >
          <ol className="list-decimal space-y-3 pl-5">
            <li>
              An admin sends you an <strong>invite link</strong> (or assigns your
              Google account a role under Settings → Users).
            </li>
            <li>
              Open{" "}
              <Link
                href="/login"
                className="font-semibold text-[#12141a] underline"
              >
                Staff sign in
              </Link>{" "}
              and continue with Google.
            </li>
            <li>
              You land on the home screen for your role (cashier overview,
              owner reports, or full admin dashboard).
            </li>
          </ol>
          <Callout>
            Managers and cashiers must be linked to a <strong>branch</strong>.
            Until that is set, the app shows a “branch not assigned” message.
          </Callout>
        </Section>
      ) : null}

      {show("roles") ? (
        <Section id={sid("roles")} title="Roles & access" compact={compact}>
          <p>
            Your role decides which menus you see and which branches’ data you
            can touch. Use the matrix below to compare scopes at a glance.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <RoleCard
              role="Master admin"
              home="/admin"
              sees="Everything, including product JSON import and the most sensitive settings."
            />
            <RoleCard
              role="Admin"
              home="/admin"
              sees="Full catalog and multi-branch tools. Cannot use master-only import."
            />
            <RoleCard
              role="Owner"
              home="/admin/reports"
              sees="Sales reports and stock levels across branches. View-only on inventory — no stock edits, POS, or settings."
            />
            <RoleCard
              role="Manager"
              home="/admin"
              sees="Day-to-day ops for one assigned branch: POS, inventory tools, reports for that branch."
            />
            <RoleCard
              role="Cashier"
              home="/admin/cashier"
              sees="Branch overview, sales history, find stock, transfer requests, shop POS, and wholesale when enabled."
            />
          </div>
          <div className="space-y-2">
            <h3
              className={cn(
                "docs-display font-semibold tracking-tight text-[#12141a]",
                compact ? "text-base" : "text-xl"
              )}
            >
              Scope by role
            </h3>
            <p className="text-sm text-[#5a6478]">
              <span className="mr-3">
                <strong className="text-[#12141a]">✓</strong> full access
              </span>
              <span className="mr-3">
                <strong className="text-[#12141a]">View</strong> read-only
              </span>
              <span className="mr-3">
                <strong className="text-[#12141a]">Limited</strong> subset
              </span>
              <span>
                <strong className="text-[#12141a]">—</strong> no access
              </span>
            </p>
            <RoleScopeMatrix compact={compact} />
          </div>
          <Callout>
            Managers and cashiers only work with their <strong>assigned
            branch</strong>. Master admin, admin, and owner can see data across
            all branches.
          </Callout>
        </Section>
      ) : null}

      {show("selling") ? (
        <Section id={sid("selling")} title="Selling (POS)" compact={compact}>
          <p>
            <strong>Shop POS</strong> (
            <code className="rounded bg-white px-1.5 py-0.5 text-[13px]">
              /admin/pos
            </code>
            ) is the retail counter. Pick a branch (admins), browse selling
            variants, add to cart, then checkout.
          </p>
          <p>
            <strong>Wholesale</strong> (
            <code className="rounded bg-white px-1.5 py-0.5 text-[13px]">
              /admin/wholesale
            </code>
            ) uses the same workspace when the branch has wholesale enabled.
            Unit prices can differ from shop cash/retail.
          </p>
          <ul className="list-disc space-y-2 pl-5">
            <li>Only variants assigned to the branch assortment appear.</li>
            <li>Checkout writes a sale and reduces stock (logged as a sale).</li>
            <li>
              Freebies, vouchers, resellers, and payment accounts are configured
              under Settings when your role allows it.
            </li>
          </ul>
        </Section>
      ) : null}

      {show("inventory") ? (
        <Section id={sid("inventory")} title="Inventory" compact={compact}>
          <p>
            Open <strong>Inventory</strong> in the main menu. Inside, a side nav
            groups the stock tools (same idea as Settings).
          </p>
          <div className="overflow-x-auto rounded-xl border border-[#12141a]/10 bg-white">
            <table className="w-full min-w-[28rem] text-left text-sm">
              <thead className="bg-[#12141a] text-[#f7f4ea]">
                <tr>
                  <th className="px-4 py-3 font-medium">Page</th>
                  <th className="px-4 py-3 font-medium">Use it for</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#12141a]/8">
                <tr>
                  <td className="px-4 py-3 font-medium">Stock levels</td>
                  <td className="px-4 py-3 text-[#2a3140]">
                    See and edit quantity on hand per selling variant. Low-stock
                    warnings use each category’s threshold.
                  </td>
                </tr>
                <tr>
                  <td className="px-4 py-3 font-medium">Daily stock changes</td>
                  <td className="px-4 py-3 text-[#2a3140]">
                    Read-only day report: opening vs closing stock derived from
                    that day’s inventory activity. Filter by branch and category
                    groups.
                  </td>
                </tr>
                <tr>
                  <td className="px-4 py-3 font-medium">Supplier stock in</td>
                  <td className="px-4 py-3 text-[#2a3140]">
                    Receive supplier deliveries and increase branch stock.
                  </td>
                </tr>
                <tr>
                  <td className="px-4 py-3 font-medium">Adjustment history</td>
                  <td className="px-4 py-3 text-[#2a3140]">
                    Full log of quantity changes (sales, receiving, transfers,
                    manual edits).
                  </td>
                </tr>
                <tr>
                  <td className="px-4 py-3 font-medium">Transfers</td>
                  <td className="px-4 py-3 text-[#2a3140]">
                    Move selling stock from one branch to another.
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <Callout>
            Daily stock changes does <strong>not</strong> create opening or
            closing records. It reads what already happened in the inventory log
            for the date you pick.
          </Callout>
        </Section>
      ) : null}

      {show("reports") ? (
        <Section id={sid("reports")} title="Reports" compact={compact}>
          <p>
            <strong>Reports</strong> (
            <code className="rounded bg-white px-1.5 py-0.5 text-[13px]">
              /admin/reports
            </code>
            ) summarizes sales for a day or range: revenue, receipts, top
            products, staff performance, peak hours, and stock movements by
            reason.
          </p>
          <ul className="list-disc space-y-2 pl-5">
            <li>
              Filter by branch (admins/owners), sale channel, and categories.
            </li>
            <li>
              Click a <strong>Stock movements</strong> row to see each product
              change and who performed it.
            </li>
            <li>Open a receipt invoice from Recent receipts when needed.</li>
          </ul>
        </Section>
      ) : null}

      {show("catalog") ? (
        <Section
          id={sid("catalog")}
          title="Catalog & branches"
          compact={compact}
        >
          <p>
            Elevated admins maintain the shared catalog. Managers sell from it;
            they do not redesign the catalog.
          </p>
          <ul className="list-disc space-y-2 pl-5">
            <li>
              <strong>Products / Categories</strong> — names, variants, prices,
              category tags and low-stock thresholds.
            </li>
            <li>
              <strong>Branches</strong> — store locations; optional wholesale
              support.
            </li>
            <li>
              <strong>Branch assortment</strong> (Settings) — which variants each
              branch is allowed to sell. Empty assortment means empty POS.
            </li>
            <li>
              <strong>Price changes / promotions</strong> — lasting price logs
              and temporary promo prices.
            </li>
          </ul>
        </Section>
      ) : null}

      {show("settings") ? (
        <Section id={sid("settings")} title="Settings" compact={compact}>
          <p>
            Settings uses its own side nav. What you see depends on role
            (elevated-only and master-only items are hidden from others).
          </p>
          <ul className="list-disc space-y-2 pl-5">
            <li>General display preferences</li>
            <li>Branch assortment</li>
            <li>Category groups (for report filters)</li>
            <li>Suppliers, resellers, vouchers, payment accounts</li>
            <li>Users &amp; invites</li>
            <li>Product JSON import (master admin)</li>
          </ul>
        </Section>
      ) : null}

      {show("glossary") ? (
        <Section id={sid("glossary")} title="Glossary" compact={compact}>
          <dl className="space-y-4">
            <div>
              <dt className="font-semibold text-[#12141a]">Variant</dt>
              <dd>
                A sellable unit of a product (size, pack, or default single
                SKU). Stock and POS work at the variant level.
              </dd>
            </div>
            <div>
              <dt className="font-semibold text-[#12141a]">Assortment</dt>
              <dd>
                The set of variants a branch is allowed to sell. Controls what
                appears in POS and stock screens for that branch.
              </dd>
            </div>
            <div>
              <dt className="font-semibold text-[#12141a]">Inventory log</dt>
              <dd>
                An automatic record every time quantity changes: sale, supplier
                stock in, transfer in/out, or manual adjustment.
              </dd>
            </div>
            <div>
              <dt className="font-semibold text-[#12141a]">
                Opening / closing (daily report)
              </dt>
              <dd>
                For a calendar day, opening is stock before the first change;
                closing is stock after the last change. Products with no net
                change are hidden from Daily stock changes.
              </dd>
            </div>
            <div>
              <dt className="font-semibold text-[#12141a]">Sale channel</dt>
              <dd>
                Shop (retail counter) vs wholesale. Reports can filter by
                channel.
              </dd>
            </div>
          </dl>
        </Section>
      ) : null}

      {showFooter ? (
        <footer className="rounded-2xl border border-dashed border-[#12141a]/20 bg-white/50 px-6 py-8 text-center">
          <p className="docs-display text-2xl font-semibold text-[#12141a]">
            Ready to practice in the app?
          </p>
          <p className="mt-2 text-sm text-[#5a6478]">
            Sign in with the Google account that was invited or assigned a staff
            role.
          </p>
          <Link
            href="/login"
            className="mt-5 inline-flex rounded-lg bg-[var(--brand-yellow)] px-4 py-2.5 text-sm font-semibold text-[#12141a] transition hover:brightness-95"
          >
            Go to staff sign in
          </Link>
        </footer>
      ) : null}
    </div>
  );
}

export function DocsGuide({
  variant = "page",
  searchQuery: controlledSearch,
  onSearchQueryChange,
  idPrefix = "",
}: {
  variant?: DocsGuideVariant;
  searchQuery?: string;
  onSearchQueryChange?: (value: string) => void;
  idPrefix?: string;
}) {
  const [internalSearch, setInternalSearch] = useState("");
  const searchQuery = controlledSearch ?? internalSearch;
  const setSearchQuery = onSearchQueryChange ?? setInternalSearch;
  const isDialog = variant === "dialog";
  const [activeId, setActiveId] = useState<DocSectionId>(DOC_TOC[0].id);
  const scrollRootRef = useRef<HTMLDivElement | null>(null);

  const visibleToc = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return [...DOC_TOC];
    return DOC_TOC.filter((item) => {
      const haystack = `${item.label} ${item.keywords}`.toLowerCase();
      return haystack.includes(q);
    });
  }, [searchQuery]);

  const visibleIds = useMemo(
    () => new Set<DocSectionId>(visibleToc.map((item) => item.id)),
    [visibleToc]
  );

  useEffect(() => {
    if (visibleToc.length === 0) return;
    if (!visibleIds.has(activeId)) {
      setActiveId(visibleToc[0].id);
    }
  }, [visibleToc, visibleIds, activeId]);

  useEffect(() => {
    const nodes = visibleToc
      .map((item) => document.getElementById(`${idPrefix}${item.id}`))
      .filter((el): el is HTMLElement => Boolean(el));
    if (nodes.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort(
            (a, b) =>
              (a.target as HTMLElement).offsetTop -
              (b.target as HTMLElement).offsetTop
          );
        const rawId = visible[0]?.target.id;
        if (!rawId) return;
        const bare = (
          idPrefix ? rawId.replace(idPrefix, "") : rawId
        ) as DocSectionId;
        if (DOC_TOC.some((item) => item.id === bare)) setActiveId(bare);
      },
      {
        root: isDialog ? scrollRootRef.current : null,
        rootMargin: isDialog ? "-10% 0px -70% 0px" : "-20% 0px -65% 0px",
        threshold: [0, 0.25, 1],
      }
    );

    for (const node of nodes) observer.observe(node);
    return () => observer.disconnect();
  }, [visibleToc, idPrefix, isDialog]);

  const scrollToSection = (id: DocSectionId) => {
    const el = document.getElementById(`${idPrefix}${id}`);
    el?.scrollIntoView({ behavior: "smooth", block: "start" });
    setActiveId(id);
  };

  const tocNav = (
    <nav
      className={cn(
        "flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] lg:flex-col lg:overflow-visible lg:pb-0 [&::-webkit-scrollbar]:hidden",
        isDialog && "lg:max-h-[min(24rem,50vh)] lg:overflow-y-auto"
      )}
      aria-label="Guide sections"
    >
      {visibleToc.map((item) => (
        <button
          key={item.id}
          type="button"
          onClick={() => scrollToSection(item.id)}
          className={cn(
            "shrink-0 rounded-full px-3 py-1.5 text-left text-sm transition-colors lg:rounded-lg lg:px-3 lg:py-2",
            activeId === item.id
              ? "bg-[#12141a] font-medium text-[#f7f4ea]"
              : "bg-white/80 text-[#3a4558] hover:bg-white hover:text-[#12141a] lg:bg-transparent"
          )}
        >
          {item.label}
        </button>
      ))}
    </nav>
  );

  const searchField = (
    <div className="relative">
      <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-[#5a6478]" />
      <Input
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        placeholder="Search features, roles, inventory…"
        className="h-9 border-[#12141a]/15 bg-white pl-9"
        aria-label="Search staff guide"
      />
    </div>
  );

  if (isDialog) {
    return (
      <div className="docs-guide flex min-h-0 flex-1 flex-col gap-3 overflow-hidden text-[#12141a]">
        <div className="shrink-0">{searchField}</div>
        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden lg:grid lg:grid-cols-[180px_minmax(0,1fr)] lg:gap-6">
          <aside className="shrink-0 space-y-2">
            <p className="hidden text-xs font-semibold tracking-[0.18em] text-[#5a6478] uppercase lg:block">
              Contents
            </p>
            {visibleToc.length === 0 ? (
              <p className="text-sm text-[#5a6478]">No matching sections.</p>
            ) : (
              tocNav
            )}
          </aside>
          <div
            ref={scrollRootRef}
            className="min-h-0 flex-1 overflow-y-auto overscroll-contain [-webkit-overflow-scrolling:touch] touch-pan-y pr-1"
          >
            {visibleToc.length === 0 ? (
              <p className="py-8 text-center text-sm text-[#5a6478]">
                Try another search term, like “POS”, “transfer”, or “owner”.
              </p>
            ) : (
              <DocsSections
                idPrefix={idPrefix}
                visibleIds={visibleIds}
                compact
                showFooter={false}
              />
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto grid max-w-6xl gap-8 px-4 py-8 sm:px-6 lg:grid-cols-[220px_minmax(0,1fr)] lg:gap-14 lg:py-14">
      <aside className="space-y-4 lg:sticky lg:top-6 lg:self-start">
        <p className="text-xs font-semibold tracking-[0.18em] text-[#5a6478] uppercase">
          Contents
        </p>
        {searchField}
        {visibleToc.length === 0 ? (
          <p className="text-sm text-[#5a6478]">No matching sections.</p>
        ) : (
          tocNav
        )}
        <p className="hidden text-xs leading-relaxed text-[#5a6478] lg:block">
          Public page — no sign-in required. Use it to learn the system before
          or after you get access.
        </p>
      </aside>

      <article className="min-w-0 space-y-12 pb-16 sm:space-y-16 sm:pb-20">
        <header className="relative overflow-hidden rounded-2xl bg-[#12141a] px-5 py-8 text-[#f7f4ea] sm:px-10 sm:py-12">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-y-0 right-0 w-1/2 bg-[radial-gradient(circle_at_70%_30%,rgba(244,196,48,0.35),transparent_55%)]"
          />
          <p className="relative text-xs font-semibold tracking-[0.2em] text-[var(--brand-yellow)] uppercase">
            El Mio Vicente · Operations
          </p>
          <h1 className="docs-display relative mt-3 max-w-xl text-3xl font-semibold tracking-tight sm:text-5xl">
            How to run the store inventory app
          </h1>
          <p className="relative mt-4 max-w-2xl text-sm leading-relaxed text-[#c9d0db] sm:text-base">
            A plain-language study guide for staff. Learn who can do what, where
            stock lives, how sales affect inventory, and where to look when
            something is off.
          </p>
        </header>

        {visibleToc.length === 0 ? (
          <p className="py-8 text-center text-sm text-[#5a6478]">
            Try another search term, like “POS”, “transfer”, or “owner”.
          </p>
        ) : (
          <DocsSections
            idPrefix={idPrefix}
            visibleIds={visibleIds}
            showFooter
          />
        )}
      </article>
    </div>
  );
}
