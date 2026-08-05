/** Parse a comma-separated tags string into a clean string array. */
export function parseProductTags(value: string): string[] {
  return value
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
}

/** Format product tags for a text field. */
export function formatProductTags(tags: string[]): string {
  return tags.join(", ");
}
