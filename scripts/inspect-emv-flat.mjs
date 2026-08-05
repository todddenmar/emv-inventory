import { readFileSync, writeFileSync } from "node:fs";

const path = "src/lib/sample-data/emv-products.flat.json";
let text = readFileSync(path, "utf8");

// Detect multi-sheet workbook export:
// { "products": [ ... ], "2": [ ... ], ... }
// or broken variants of that.

// Restore object wrapper if we accidentally turned it into an array.
if (text.trimStart().startsWith("[")) {
  // Find first sheet close followed by "2":[
  const sheetBreak = text.search(/\n\s*\],\s*\n\s*"2"\s*:\s*\[/);
  if (sheetBreak !== -1) {
    text =
      '{\n  "products": ' +
      text.trimStart() +
      (text.trimEnd().endsWith("}") ? "" : "\n}\n");
    // Current text starts with [ ... ], "2":[ ... ]
    // After prepend: { "products": [ ... ], "2":[ ... ]
    // May need trailing }
    if (!text.trimEnd().endsWith("}")) {
      text = text.trimEnd() + "\n}\n";
    }
    writeFileSync(path, text);
    console.log("Wrapped as multi-sheet object with products key");
  }
}

const data = JSON.parse(readFileSync(path, "utf8"));
if (Array.isArray(data)) {
  console.log("Root is array, length", data.length);
} else {
  console.log("Root keys:", Object.keys(data));
  for (const [key, value] of Object.entries(data)) {
    console.log(
      `  ${key}: ${Array.isArray(value) ? value.length + " rows" : typeof value}`
    );
  }
}
