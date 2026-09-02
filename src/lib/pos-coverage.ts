import type { PosItemCoverage } from "@/types";

export function parsePosItemCoverage(value: unknown): PosItemCoverage {
  if (value === "warranty" || value === "replacement") return value;
  return "none";
}

export function posItemCoverageLabel(coverage: PosItemCoverage): string {
  if (coverage === "warranty") return "Warranty";
  if (coverage === "replacement") return "Replacement";
  return "None";
}
