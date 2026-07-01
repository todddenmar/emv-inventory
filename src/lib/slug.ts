export function slugify(value: string): string {
  return sanitizeSlugInput(value).replace(/^-+|-+$/g, "");
}

/** Preserve dashes while the user is typing (no leading/trailing dash trim). */
export function sanitizeSlugInput(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-{2,}/g, "-")
    .slice(0, 80);
}

export function uniqueSlugFromList(
  base: string,
  takenSlugs: Iterable<string>,
  excludeSlug?: string
): string {
  const taken = new Set(takenSlugs);
  let slug = slugify(base) || "item";
  if (excludeSlug && slug === excludeSlug) return slug;
  if (!taken.has(slug)) return slug;

  let counter = 2;
  while (counter < 100) {
    const candidate = `${slug}-${counter}`;
    if (!taken.has(candidate)) return candidate;
    counter += 1;
  }

  return `${slug}-${Date.now()}`;
}

export function resolveSlug(
  value: string | null | undefined,
  fallbackName: string,
  fallbackId: string
): string {
  const fromValue = value ? slugify(value) : "";
  if (fromValue) return fromValue;
  const fromName = slugify(fallbackName);
  if (fromName) return fromName;
  return fallbackId;
}

export async function ensureUniqueSlug(
  base: string,
  isTaken: (slug: string) => Promise<boolean>,
  excludeSlug?: string
): Promise<string> {
  let slug = slugify(base) || "item";
  if (excludeSlug && slug === excludeSlug) return slug;

  if (!(await isTaken(slug)) || slug === excludeSlug) {
    return slug;
  }

  let counter = 2;
  while (counter < 100) {
    const candidate = `${slug}-${counter}`;
    if (!(await isTaken(candidate)) || candidate === excludeSlug) {
      return candidate;
    }
    counter += 1;
  }

  return `${slug}-${Date.now()}`;
}
