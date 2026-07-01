import DOMPurify from "isomorphic-dompurify";

const PRODUCT_DESCRIPTION_TAGS = [
  "p",
  "br",
  "strong",
  "b",
  "em",
  "i",
  "u",
  "ul",
  "ol",
  "li",
  "h2",
  "h3",
  "a",
  "blockquote",
];

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

export function sanitizeProductHtml(html: string): string {
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: PRODUCT_DESCRIPTION_TAGS,
    ALLOWED_ATTR: ["href", "target", "rel"],
    ADD_ATTR: ["target", "rel"],
  });
}
