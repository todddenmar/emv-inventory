import type { Branch } from "@/types";

export function branchMapUrl(branch: Branch): string | null {
  if (branch.latitude != null && branch.longitude != null) {
    return `https://www.google.com/maps?q=${branch.latitude},${branch.longitude}`;
  }
  if (branch.address.trim()) {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(branch.address)}`;
  }
  return null;
}

export function formatCoordinates(
  latitude: number | null,
  longitude: number | null
): string | null {
  if (latitude == null || longitude == null) return null;
  return `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`;
}

export function parseCoordinate(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const num = Number(trimmed);
  return Number.isFinite(num) ? num : null;
}
