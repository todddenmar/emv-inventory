import DOMPurify from "isomorphic-dompurify";
import {
  isHtmlEmpty,
  normalizeDescriptionHtml,
  stripHtml,
} from "@/lib/html-text";

export { isHtmlEmpty, normalizeDescriptionHtml, stripHtml };

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

export function sanitizeProductHtml(html: string): string {
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: PRODUCT_DESCRIPTION_TAGS,
    ALLOWED_ATTR: ["href", "target", "rel"],
    ADD_ATTR: ["target", "rel"],
  });
}
