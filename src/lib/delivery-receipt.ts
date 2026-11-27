import { formatCurrency } from "@/lib/format";
import type {
  BranchTransfer,
  DeliveryReceiptCompany,
  PosSale,
} from "@/types";

export type { DeliveryReceiptCompany };

export const EMPTY_DELIVERY_RECEIPT_COMPANY: DeliveryReceiptCompany = {
  companyName: "",
  tagline: "",
  address: "",
  phone: "",
  email: "",
  footerNote: "",
  logoUrl: "",
  logoStoragePath: "",
};

type BranchLike = {
  id?: string;
  name?: string;
  address?: string;
  phone?: string | null;
  deliveryReceipt?: DeliveryReceiptCompany | null;
};

function asTrimmedString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function normalizeDeliveryReceiptCompany(
  value: unknown
): DeliveryReceiptCompany {
  if (!value || typeof value !== "object") {
    return { ...EMPTY_DELIVERY_RECEIPT_COMPANY };
  }
  const row = value as Record<string, unknown>;
  return {
    companyName: asTrimmedString(row.companyName),
    tagline: asTrimmedString(row.tagline),
    address: asTrimmedString(row.address),
    phone: asTrimmedString(row.phone),
    email: asTrimmedString(row.email),
    footerNote: asTrimmedString(row.footerNote),
    logoUrl: asTrimmedString(row.logoUrl),
    logoStoragePath: asTrimmedString(row.logoStoragePath),
  };
}

/** Stored branch fields plus fallbacks from the branch record itself. */
export function getDeliveryReceiptCompany(
  branch?: BranchLike | null
): DeliveryReceiptCompany {
  const stored = normalizeDeliveryReceiptCompany(branch?.deliveryReceipt);
  return {
    companyName: stored.companyName || branch?.name?.trim() || "",
    tagline: stored.tagline,
    address: stored.address || branch?.address?.trim() || "",
    phone: stored.phone || branch?.phone?.trim() || "",
    email: stored.email,
    footerNote: stored.footerNote,
    logoUrl: stored.logoUrl,
    logoStoragePath: stored.logoStoragePath,
  };
}

function sampleItem(
  productId: string,
  productName: string,
  quantity: number,
  unitPrice: number
): PosSale["items"][number] {
  return {
    productId,
    variantId: `${productId}-1`,
    productName,
    quantity,
    unitPrice,
    lineTotal: quantity * unitPrice,
    priceList: "cash",
    payments: [],
    tenderMethod: "cash",
    paymentAccount: null,
    kind: "full",
    note: null,
  };
}

/** Preview-only sale used on the delivery receipt settings page. */
export function sampleDeliverySale(branch?: BranchLike | null): PosSale {
  const items = [
    sampleItem("sample-a", "Sample product A — 500ml", 2, 150),
    sampleItem("sample-b", "Sample product B — 1kg", 1, 499),
    sampleItem("sample-c", "Sample product C — pack of 6", 3, 149),
  ];
  const total = items.reduce((sum, item) => sum + item.lineTotal, 0);

  return {
    id: "SAMPLE-DR-0001",
    branchId: branch?.id || "sample-branch",
    branchName: branch?.name || "Main Branch",
    saleChannel: "shop",
    paymentMethod: "cash",
    tenderMethod: "cash",
    paymentAccount: null,
    payments: [],
    customerType: "walk_in",
    isDelivery: true,
    customer: {
      name: "Juan Dela Cruz",
      mobile: "0917 123 4567",
      email: "juan.delacruz@example.com",
      address:
        "123 Mabini Street\nBarangay San Antonio\nQuezon City 1105",
    },
    resellerId: null,
    resellerName: null,
    voucherId: null,
    voucherCode: null,
    voucherAmountApplied: 0,
    total,
    amountDue: total,
    items,
    itemCount: items.reduce((sum, item) => sum + item.quantity, 0),
    createdBy: "sample",
    createdByName: "Cashier",
    createdAt: new Date("2026-11-27T10:00:00"),
    archivedAt: null,
    archivedBy: null,
    archivedByName: null,
    restockedOnArchive: false,
    resellerCommissionSentAt: null,
    resellerCommissionSentBy: null,
    resellerCommissionSentByName: null,
  };
}

function escapeHtml(value: string | number): string {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatReceiptDate(date: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

function customerText(
  sale: PosSale,
  field: "name" | "mobile" | "email" | "address"
): string {
  return sale.customer?.[field]?.trim() || "";
}

function metaRow(label: string, value: string): string {
  if (!value) return "";
  return `<tr>
    <td class="meta-label">${escapeHtml(label)}</td>
    <td class="meta-colon">:</td>
    <td class="meta-value">${escapeHtml(value)}</td>
  </tr>`;
}

function receiptDocumentCss(): string {
  return `
  @page { size: A4 portrait; margin: 12mm; }
  * { box-sizing: border-box; }
  html, body { background: #fff; }
  body {
    font-family: Arial, Helvetica, sans-serif;
    color: #111;
    font-size: 12px;
    margin: 0;
    line-height: 1.35;
  }
  @media screen {
    body { padding: 12mm; }
  }
  @media print {
    body { padding: 0; }
  }
  .header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 24px;
    margin-bottom: 18px;
  }
  .brand { min-width: 0; flex: 1; }
  .logo { max-height: 72px; max-width: 200px; object-fit: contain; display: block; margin-bottom: 8px; }
  .company-name { font-size: 22px; font-weight: 800; letter-spacing: 0.04em; margin: 0 0 2px; }
  .tagline { font-size: 13px; font-weight: 600; margin: 0 0 6px; }
  .contact { margin: 0; color: #333; white-space: pre-wrap; }
  .doc { text-align: right; min-width: 220px; }
  .doc-title {
    color: #0f7a7c;
    font-size: 26px;
    font-weight: 800;
    letter-spacing: 0.04em;
    margin: 0 0 10px;
    text-transform: uppercase;
  }
  .meta { border-collapse: collapse; margin-left: auto; font-size: 12px; }
  .meta-label { text-align: right; color: #444; padding: 1px 6px 1px 0; white-space: nowrap; }
  .meta-colon { color: #444; padding: 1px 6px 1px 0; }
  .meta-value { text-align: left; font-weight: 600; padding: 1px 0; }
  .bill-to { margin: 8px 0 16px; }
  .bill-label { font-weight: 700; margin: 0 0 4px; }
  .bill-name { font-weight: 700; margin: 0; }
  .bill-line { margin: 2px 0 0; white-space: pre-wrap; }
  table.items { width: 100%; border-collapse: collapse; }
  .items th, .items td { border: 1px solid #9aa; padding: 7px 8px; vertical-align: top; }
  .items th {
    background: #0b5558;
    color: #fff;
    font-size: 11px;
    letter-spacing: 0.04em;
    text-align: left;
  }
  .items td.num, .items th.num { text-align: right; white-space: nowrap; }
  .items th.num { text-align: right; }
  .totals-wrap { display: flex; justify-content: flex-end; margin-top: 10px; }
  .totals { border-collapse: collapse; min-width: 240px; }
  .totals td { padding: 4px 8px; }
  .totals td.num { text-align: right; font-weight: 600; white-space: nowrap; }
  .totals tr.due td {
    background: #e7f4f4;
    border: 1px solid #0f7a7c;
    font-weight: 800;
    color: #0b5558;
  }
  .sign-block { margin-top: 28px; font-size: 12px; }
  .sign-row { display: flex; gap: 32px; margin-top: 14px; }
  .sign-line { flex: 1; }
  .sign-line span { display: inline-block; min-width: 140px; border-bottom: 1px solid #333; }
  .processed { margin-top: 18px; }
  .processed .name { font-weight: 800; letter-spacing: 0.04em; margin-top: 2px; }
  .footer-note { margin-top: 20px; }
  .bottom {
    display: flex;
    justify-content: space-between;
    gap: 16px;
    margin-top: 16px;
    color: #555;
    font-size: 11px;
  }`;
}

function companyHeaderHtml(details: DeliveryReceiptCompany): {
  brand: string;
  footer: string;
} {
  const companyName = details.companyName;
  const contactLines = [
    details.address
      ? `<p class="contact">${escapeHtml(details.address)}</p>`
      : "",
    details.phone
      ? `<p class="contact">${escapeHtml(details.phone)}</p>`
      : "",
    details.email
      ? `<p class="contact">${escapeHtml(details.email)}</p>`
      : "",
  ]
    .filter(Boolean)
    .join("");
  const brand = `<div class="brand">
      ${
        details.logoUrl
          ? `<img class="logo" src="${escapeHtml(details.logoUrl)}" alt="" />`
          : ""
      }
      ${companyName ? `<p class="company-name">${escapeHtml(companyName)}</p>` : ""}
      ${details.tagline ? `<p class="tagline">${escapeHtml(details.tagline)}</p>` : ""}
      ${contactLines}
    </div>`;
  const footer = details.footerNote || "Thank you for doing business with us!";
  return { brand, footer };
}

function signatureBlockHtml(processedBy: string, footer: string): string {
  return `<div class="sign-block">
    <div class="sign-row">
      <div class="sign-line">Date: <span></span></div>
      <div class="sign-line">Time : <span></span></div>
    </div>
    <div class="sign-row">
      <div class="sign-line">Receiving Signature : <span></span></div>
      <div class="sign-line">Print Name : <span></span></div>
    </div>
    ${
      processedBy
        ? `<div class="processed"><div>Processed by</div><div class="name">${escapeHtml(processedBy)}</div></div>`
        : ""
    }
  </div>
  <p class="footer-note">${escapeHtml(footer)}</p>
  <div class="bottom">
    <span>System Generated</span>
    <span>${escapeHtml(formatReceiptDate(new Date()))}</span>
  </div>`;
}

function waitForImages(doc: Document): Promise<void> {
  const pending = Array.from(doc.images).filter((img) => !img.complete);
  if (pending.length === 0) return Promise.resolve();

  return Promise.race([
    Promise.all(
      pending.map(
        (img) =>
          new Promise<void>((resolve) => {
            img.addEventListener("load", () => resolve(), { once: true });
            img.addEventListener("error", () => resolve(), { once: true });
          })
      )
    ).then(() => undefined),
    new Promise<void>((resolve) => {
      window.setTimeout(resolve, 4000);
    }),
  ]);
}

function wrapReceiptHtml(title: string, body: string): string {
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<title>${escapeHtml(title)}</title>
<style>${receiptDocumentCss()}</style>
</head>
<body>
${body}
</body>
</html>`;
}

export function buildDeliveryReceiptHtml(
  sale: PosSale,
  company?: DeliveryReceiptCompany | null,
  options?: { title?: string }
): string {
  const details = normalizeDeliveryReceiptCompany(company);
  const { brand, footer } = companyHeaderHtml(details);
  const merchandiseTotal = sale.total ?? 0;
  const discount = sale.voucherAmountApplied ?? 0;
  const amountDue = sale.amountDue ?? merchandiseTotal;
  const customerName = customerText(sale, "name");
  const customerAddress = customerText(sale, "address");
  const customerMobile = customerText(sale, "mobile");
  const customerEmail = customerText(sale, "email");
  const processedBy = sale.createdByName?.trim() || "";
  const receiptNo = sale.id;

  const items = (sale.items ?? [])
    .map((item) => {
      return `<tr>
        <td>${escapeHtml(item.productName)}</td>
        <td class="num">${escapeHtml(item.quantity)}</td>
        <td class="num">${escapeHtml(formatCurrency(item.unitPrice))}</td>
        <td class="num">${escapeHtml(formatCurrency(item.lineTotal))}</td>
      </tr>`;
    })
    .join("");

  const billToLines = [
    customerName
      ? `<p class="bill-name">${escapeHtml(customerName)}</p>`
      : "",
    customerAddress
      ? `<p class="bill-line">${escapeHtml(customerAddress)}</p>`
      : "",
    customerMobile
      ? `<p class="bill-line">${escapeHtml(customerMobile)}</p>`
      : "",
    customerEmail
      ? `<p class="bill-line">${escapeHtml(customerEmail)}</p>`
      : "",
  ]
    .filter(Boolean)
    .join("");

  const totalsRows = [
    `<tr><td>SUBTOTAL</td><td class="num">${escapeHtml(formatCurrency(merchandiseTotal))}</td></tr>`,
    discount > 0
      ? `<tr><td>Discount</td><td class="num">${escapeHtml(formatCurrency(discount))}</td></tr>`
      : "",
    `<tr class="due"><td>AMOUNT DUE</td><td class="num">${escapeHtml(formatCurrency(amountDue))}</td></tr>`,
  ]
    .filter(Boolean)
    .join("");

  const title = options?.title || `Delivery receipt ${receiptNo}`;
  return wrapReceiptHtml(
    title,
    `  <div class="header">
    ${brand}
    <div class="doc">
      <p class="doc-title">Delivery receipt</p>
      <table class="meta">
        ${metaRow("Receipt Date", formatReceiptDate(sale.createdAt))}
        ${metaRow("Receipt No", receiptNo)}
      </table>
    </div>
  </div>
  <div class="bill-to">
    <p class="bill-label">Bill To :</p>
    ${billToLines || `<p class="bill-line">—</p>`}
  </div>
  <table class="items">
    <thead>
      <tr>
        <th>DESCRIPTION</th>
        <th class="num">QTY</th>
        <th class="num">UNIT PRICE</th>
        <th class="num">TOTAL</th>
      </tr>
    </thead>
    <tbody>${items}</tbody>
  </table>
  <div class="totals-wrap">
    <table class="totals">${totalsRows}</table>
  </div>
  ${signatureBlockHtml(processedBy, footer)}`
  );
}

export type TransferReceiptDestination = {
  name: string;
  address?: string;
  phone?: string | null;
};

export function buildTransferDeliveryReceiptHtml(
  transfer: BranchTransfer,
  company?: DeliveryReceiptCompany | null,
  destination?: TransferReceiptDestination | null,
  options?: { title?: string }
): string {
  const details = normalizeDeliveryReceiptCompany(company);
  const { brand, footer } = companyHeaderHtml(details);
  const destName =
    destination?.name?.trim() || transfer.toBranchName?.trim() || "";
  const destAddress = destination?.address?.trim() || "";
  const destPhone = destination?.phone?.trim() || "";
  const processedBy = transfer.createdByName?.trim() || "";
  const receiptNo = transfer.id;

  const items = (transfer.items ?? [])
    .map((item) => {
      return `<tr>
        <td>${escapeHtml(item.productName)}</td>
        <td class="num">${escapeHtml(item.quantity)}</td>
      </tr>`;
    })
    .join("");

  const billToLines = [
    destName ? `<p class="bill-name">${escapeHtml(destName)}</p>` : "",
    destAddress
      ? `<p class="bill-line">${escapeHtml(destAddress)}</p>`
      : "",
    destPhone ? `<p class="bill-line">${escapeHtml(destPhone)}</p>` : "",
  ]
    .filter(Boolean)
    .join("");

  const title = options?.title || `Delivery receipt ${receiptNo}`;
  return wrapReceiptHtml(
    title,
    `  <div class="header">
    ${brand}
    <div class="doc">
      <p class="doc-title">Delivery receipt</p>
      <table class="meta">
        ${metaRow("Receipt Date", formatReceiptDate(transfer.createdAt))}
        ${metaRow("Transfer No", receiptNo)}
        ${metaRow("From", transfer.fromBranchName?.trim() || "")}
        ${metaRow("To", destName)}
      </table>
    </div>
  </div>
  <div class="bill-to">
    <p class="bill-label">Bill To :</p>
    ${billToLines || `<p class="bill-line">—</p>`}
  </div>
  <table class="items">
    <thead>
      <tr>
        <th>DESCRIPTION</th>
        <th class="num">QTY</th>
      </tr>
    </thead>
    <tbody>${items || `<tr><td colspan="2">—</td></tr>`}</tbody>
  </table>
  ${signatureBlockHtml(processedBy, footer)}`
  );
}

async function printReceiptHtml(
  html: string,
  title?: string
): Promise<void> {
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
  doc.write(html);
  doc.close();
  if (title) {
    doc.title = title;
  }

  let removed = false;
  const cleanup = () => {
    if (removed) return;
    removed = true;
    iframe.remove();
  };
  win.addEventListener("afterprint", () => setTimeout(cleanup, 0));
  setTimeout(cleanup, 60_000);

  await waitForImages(doc);
  win.focus();
  win.print();
}

export async function printDeliveryReceipt(
  sale: PosSale,
  company?: DeliveryReceiptCompany | null,
  options?: { title?: string }
): Promise<void> {
  await printReceiptHtml(
    buildDeliveryReceiptHtml(sale, company, options),
    options?.title
  );
}

export async function printTransferDeliveryReceipt(
  transfer: BranchTransfer,
  company?: DeliveryReceiptCompany | null,
  destination?: TransferReceiptDestination | null,
  options?: { title?: string }
): Promise<void> {
  await printReceiptHtml(
    buildTransferDeliveryReceiptHtml(transfer, company, destination, options),
    options?.title
  );
}
