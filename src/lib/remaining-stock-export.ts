import type { RemainingStockCategoryGroup } from "@/lib/remaining-stock";
import type { Branch } from "@/types";

type ExportBranch = Pick<Branch, "id" | "name" | "code">;

export interface RemainingStockExportMeta {
  title: string;
  generatedAt: Date;
  /** e.g. "Branches: Main (MN) · Category: Shoes · Search: nike" */
  filterSummary: string;
}

function formatGeneratedAt(date: Date): string {
  return date.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function dateStamp(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function csvCell(value: string | number): string {
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function escapeHtml(value: string | number): string {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function branchHeading(branch: ExportBranch): string {
  return branch.code ? `${branch.name} (${branch.code})` : branch.name;
}

export function buildRemainingStockCsv(
  groups: RemainingStockCategoryGroup[],
  branches: ExportBranch[],
  meta: RemainingStockExportMeta
): string {
  const lines: string[] = [];
  lines.push(csvCell(meta.title));
  lines.push(csvCell(`Generated: ${formatGeneratedAt(meta.generatedAt)}`));
  if (meta.filterSummary) lines.push(csvCell(meta.filterSummary));
  lines.push("");

  const header = ["Category", "Product", "Variant", "SKU"];
  for (const branch of branches) {
    header.push(`${branchHeading(branch)} stock`);
    header.push(`${branchHeading(branch)} actual count`);
  }
  lines.push(header.map(csvCell).join(","));

  for (const group of groups) {
    for (const product of group.products) {
      for (const variant of product.variants) {
        const row: Array<string | number> = [
          group.categoryName,
          product.productName,
          variant.label,
          variant.sku || "",
        ];
        for (const branch of branches) {
          row.push(
            variant.assigned[branch.id] === true
              ? (variant.stocks[branch.id] ?? 0)
              : "Unassigned"
          );
          row.push("");
        }
        lines.push(row.map(csvCell).join(","));
      }
    }
  }

  return `\uFEFF${lines.join("\r\n")}`;
}

export function downloadRemainingStockCsv(
  groups: RemainingStockCategoryGroup[],
  branches: ExportBranch[],
  meta: RemainingStockExportMeta
): void {
  const csv = buildRemainingStockCsv(groups, branches, meta);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const scope =
    branches.length === 1
      ? (branches[0].code || branches[0].name)
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-|-$/g, "")
      : "multi-branch";
  const a = document.createElement("a");
  a.href = url;
  a.download = `remaining-stocks-${scope || "branch"}-${dateStamp(meta.generatedAt)}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function buildPrintHtml(
  groups: RemainingStockCategoryGroup[],
  branches: ExportBranch[],
  meta: RemainingStockExportMeta
): string {
  const landscape = branches.length > 2;
  const colCount = 2 + branches.length * 2;

  const branchHeads = branches
    .map(
      (branch) =>
        `<th class="num">${escapeHtml(branch.name)}<span class="sub">${escapeHtml(
          branch.code ?? ""
        )} · Stock</span></th><th class="count">${escapeHtml(
          branch.name
        )}<span class="sub">Actual count</span></th>`
    )
    .join("");

  const body = groups
    .map((group) => {
      const products = group.products
        .map((product) => {
          const variants = product.variants
            .map((variant) => {
              const cells = branches
                .map((branch) => {
                  const assigned = variant.assigned[branch.id] === true;
                  const stock = assigned
                    ? escapeHtml(variant.stocks[branch.id] ?? 0)
                    : `<span class="muted">—</span>`;
                  return `<td class="num">${stock}</td><td class="count"></td>`;
                })
                .join("");
              return `<tr><td>${escapeHtml(variant.label)}</td><td class="sku">${escapeHtml(
                variant.sku || "—"
              )}</td>${cells}</tr>`;
            })
            .join("");
          return `<tr class="product"><td colspan="${colCount}">${escapeHtml(
            product.productName
          )}</td></tr>${variants}`;
        })
        .join("");
      return `<tr class="category"><td colspan="${colCount}">${escapeHtml(
        group.categoryName
      )}</td></tr>${products}`;
    })
    .join("");

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<title>${escapeHtml(meta.title)}</title>
<style>
  @page { size: ${landscape ? "landscape" : "portrait"}; margin: 12mm; }
  * { box-sizing: border-box; }
  body { font-family: Arial, Helvetica, sans-serif; color: #111; font-size: 11px; margin: 0; }
  h1 { font-size: 18px; margin: 0 0 4px; }
  .meta { color: #444; margin: 0 0 2px; }
  table { width: 100%; border-collapse: collapse; margin-top: 10px; }
  thead { display: table-header-group; }
  tr { page-break-inside: avoid; break-inside: avoid; }
  th, td { border: 1px solid #999; padding: 4px 6px; text-align: left; vertical-align: top; }
  th { background: #eee; font-size: 10px; }
  th .sub { display: block; font-weight: normal; color: #555; }
  td.num, th.num { text-align: right; white-space: nowrap; }
  th.count, td.count { min-width: 70px; width: 70px; }
  td.sku { color: #555; }
  .muted { color: #999; }
  tr.category td { background: #222; color: #fff; font-weight: bold; font-size: 12px;
    -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  tr.product td { background: #e8e8e8; font-weight: bold; padding-left: 10px;
    -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .signatures { display: flex; gap: 32px; margin-top: 24px; font-size: 12px; }
  .signatures span { flex: 1; border-top: 1px solid #333; padding-top: 4px; }
</style>
</head>
<body>
  <h1>${escapeHtml(meta.title)}</h1>
  <p class="meta">Branches: ${escapeHtml(branches.map(branchHeading).join(", "))}</p>
  <p class="meta">Generated: ${escapeHtml(formatGeneratedAt(meta.generatedAt))}</p>
  ${meta.filterSummary ? `<p class="meta">${escapeHtml(meta.filterSummary)}</p>` : ""}
  <table>
    <thead>
      <tr><th>Variant</th><th>SKU</th>${branchHeads}</tr>
    </thead>
    <tbody>${body}</tbody>
  </table>
  <div class="signatures">
    <span>Counted by</span>
    <span>Checked by</span>
    <span>Date</span>
  </div>
</body>
</html>`;
}

/** Prints via a hidden iframe so popup blockers don't interfere. */
export function printRemainingStock(
  groups: RemainingStockCategoryGroup[],
  branches: ExportBranch[],
  meta: RemainingStockExportMeta
): void {
  const iframe = document.createElement("iframe");
  iframe.setAttribute("aria-hidden", "true");
  iframe.style.position = "fixed";
  iframe.style.right = "0";
  iframe.style.bottom = "0";
  iframe.style.width = "0";
  iframe.style.height = "0";
  iframe.style.border = "0";
  document.body.appendChild(iframe);

  const win = iframe.contentWindow;
  const doc = win?.document;
  if (!win || !doc) {
    iframe.remove();
    throw new Error("Printing is not available in this browser");
  }

  doc.open();
  doc.write(buildPrintHtml(groups, branches, meta));
  doc.close();

  let removed = false;
  const cleanup = () => {
    if (removed) return;
    removed = true;
    iframe.remove();
  };
  win.addEventListener("afterprint", () => setTimeout(cleanup, 0));
  // Some browsers never fire afterprint for iframes.
  setTimeout(cleanup, 60_000);

  setTimeout(() => {
    win.focus();
    win.print();
  }, 50);
}
