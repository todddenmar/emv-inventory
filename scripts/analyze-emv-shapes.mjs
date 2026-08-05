import { readFileSync } from "node:fs";

const text = readFileSync("src/lib/sample-data/emv-products.flat.json", "utf8");
const start = text.indexOf("[", text.search(/"products"\s*:/));
const end = text.search(/\],\s*\n\s*"2"\s*:/);
const rows = JSON.parse(text.slice(start, end + 1));

function keys(o) {
  return Object.keys(o).sort().join("|");
}

const counts = {};
const catSamples = [];
for (const row of rows) {
  const k = keys(row);
  counts[k] = (counts[k] || 0) + 1;
  if (k === "ITEMS SOLD" && catSamples.length < 50) {
    catSamples.push(row["ITEMS SOLD"]);
  }
}

console.log("rows", rows.length);
console.log("shapes", counts);
console.log("category-only titles:", catSamples);
