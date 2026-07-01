/** Plain-text HTML helpers safe for server routes (no DOM / DOMPurify). */

export function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<\/p>/gi, " ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function isHtmlEmpty(html: string): boolean {
  return stripHtml(html).length === 0;
}

export function normalizeDescriptionHtml(html: string): string {
  const trimmed = html.trim();
  if (!trimmed) return "";
  if (/<[a-z][\s\S]*>/i.test(trimmed)) return trimmed;
  return trimmed
    .split(/\n{2,}/)
    .map((block) => `<p>${block.replace(/\n/g, "<br>")}</p>`)
    .join("");
}
