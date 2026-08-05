import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Extract the products sheet from a multi-sheet EMV export and transform
 * to clean nested JSON (title/price).
 */

function findKey(row, candidates) {
  const keys = Object.keys(row);
  for (const candidate of candidates) {
    const found = keys.find((k) => k.toLowerCase() === candidate.toLowerCase());
    if (found) return found;
  }
  return null;
}

function getString(row, candidates) {
  const key = findKey(row, candidates);
  if (!key) return "";
  const value = row[key];
  return typeof value === "string" ? value.trim() : String(value ?? "").trim();
}

function getNumber(row, candidates) {
  const key = findKey(row, candidates);
  if (!key) return null;
  const value = row[key];
  const num = typeof value === "number" ? value : Number(value);
  return Number.isFinite(num) ? num : null;
}

function hasKey(row, candidates) {
  return findKey(row, candidates) != null;
}

function splitGroupName(groupName) {
  const parts = groupName.trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 1) {
    const name = parts[0] || "";
    return { category: name, vendor: name, productType: name };
  }
  return {
    category: groupName.trim(),
    vendor: parts.slice(0, -1).join(" "),
    productType: parts[parts.length - 1],
  };
}

function classify(row) {
  const title = getString(row, ["title", "ITEMS SOLD", "items sold"]);
  if (!title) return "unknown";
  const hasPrice = hasKey(row, ["price", "Column15", "column15"]);
  const hasFilter = hasKey(row, ["FILTER", "filter"]);
  const hasStock = Object.keys(row).some(
    (k) => k === "13" || k === "0" || /^\d+$/.test(k)
  );
  // Variant rows include stock columns (13/0) and usually Column15 price
  if (hasPrice || hasStock) return "variant";
  // Product: ITEMS SOLD + FILTER only
  if (hasFilter) return "product";
  // Category: ITEMS SOLD only
  return "category";
}

function transform(rows) {
  const groups = [];
  const errors = [];
  let currentGroup = null;
  let currentGroupProductType = "";
  let currentProduct = null;

  const flushProduct = () => {
    if (currentGroup && currentProduct) {
      currentGroup.products.push(currentProduct);
      currentProduct = null;
    }
  };

  rows.forEach((row, index) => {
    if (!row || typeof row !== "object" || Array.isArray(row)) {
      errors.push(`[${index}]: expected object`);
      return;
    }
    const kind = classify(row);
    const title = getString(row, ["title", "ITEMS SOLD", "items sold"]);

    if (kind === "category") {
      flushProduct();
      const split = splitGroupName(title);
      currentGroupProductType = split.productType;
      currentGroup = {
        category: split.category,
        vendor: split.vendor,
        products: [],
      };
      groups.push(currentGroup);
      return;
    }

    if (kind === "product") {
      if (!currentGroup) {
        errors.push(`[${index}]: product before category (${title})`);
        return;
      }
      flushProduct();
      currentProduct = {
        title,
        productType: currentGroupProductType,
        variants: [],
      };
      return;
    }

    if (kind === "variant") {
      if (!currentGroup || !currentProduct) {
        errors.push(`[${index}]: variant before product (${title})`);
        return;
      }
      const price = getNumber(row, ["price", "Column15", "column15"]);
      if (price == null || price < 0) {
        errors.push(`[${index}]: variant missing price (${title})`);
        return;
      }
      currentProduct.variants.push({ title, price });
      return;
    }

    // Skip empty filter-only noise rows
    if (!title && hasKey(row, ["FILTER", "filter"])) return;
    errors.push(`[${index}]: unrecognized row`);
  });

  flushProduct();
  return { groups, errors };
}

function extractProductsSheet(text) {
  // Preferred: multi-sheet object with "products" array
  const productsKey = text.search(/"products"\s*:\s*\[/);
  if (productsKey !== -1) {
    const arrayStart = text.indexOf("[", productsKey);
    // Find matching close before ,"2": or ,"3":
    const nextSheet = text.search(/\],\s*\n\s*"\d+"\s*:/);
    if (nextSheet !== -1 && nextSheet > arrayStart) {
      return text.slice(arrayStart, nextSheet + 1);
    }
  }

  // Fallback: leading array until first sheet break
  const trimmed = text.trimStart();
  if (trimmed.startsWith("[")) {
    const nextSheet = text.search(/\],\s*\n\s*"\d+"\s*:/);
    if (nextSheet !== -1) {
      return text.slice(text.indexOf("["), nextSheet + 1);
    }
    return trimmed;
  }

  throw new Error("Could not locate products sheet array");
}

const inputPath = resolve(
  process.argv[2] || "src/lib/sample-data/emv-products.flat.json"
);
const outputPath = resolve(
  process.argv[3] || "src/lib/sample-data/emv-products.json"
);

const text = readFileSync(inputPath, "utf8");
const sheetJson = extractProductsSheet(text);
const rows = JSON.parse(sheetJson);
if (!Array.isArray(rows)) {
  console.error("Products sheet is not an array");
  process.exit(1);
}

const { groups, errors } = transform(rows);
writeFileSync(outputPath, `${JSON.stringify(groups, null, 2)}\n`, "utf8");

const productCount = groups.reduce((n, g) => n + g.products.length, 0);
const variantCount = groups.reduce(
  (n, g) => n + g.products.reduce((m, p) => m + p.variants.length, 0),
  0
);

console.log(`Rows in products sheet: ${rows.length}`);
console.log(`Wrote ${groups.length} category groups → ${outputPath}`);
console.log(`Products: ${productCount}, variants: ${variantCount}`);
if (errors.length) {
  console.warn(`Warnings: ${errors.length}`);
  errors.slice(0, 25).forEach((e) => console.warn(`  ${e}`));
  if (errors.length > 25) console.warn(`  …and ${errors.length - 25} more`);
}
