import type { ProductOption, ProductSpec, ProductVariant } from "@/types";

export function parseSpecsText(input: string | null | undefined): ProductSpec[] {
  const parts = (input ?? "")
    .split(/[,\n]+/)
    .map((part) => part.trim())
    .filter(Boolean);

  const parsed: ProductSpec[] = [];

  for (const part of parts) {
    const colonIndex = part.indexOf(":");
    if (colonIndex === -1) continue;

    const label = part.slice(0, colonIndex).trim();
    const value = part.slice(colonIndex + 1).trim();
    if (!label || !value) continue;

    parsed.push({ label, value });
  }

  return parsed;
}

export function specsToText(specs: ProductSpec[]): string {
  return specs
    .filter((s) => s.label.trim() && s.value.trim())
    .map((s) => `${s.label.trim()}: ${s.value.trim()}`)
    .join(", ");
}

export function specsTextMatchesSearch(text: string, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return text.toLowerCase().includes(q);
}
