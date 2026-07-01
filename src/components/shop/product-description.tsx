import { cn } from "@/lib/utils";
import { sanitizeProductHtml } from "@/lib/html";

interface ProductDescriptionProps {
  html: string;
  className?: string;
}

export function ProductDescription({ html, className }: ProductDescriptionProps) {
  const safe = sanitizeProductHtml(html);
  if (!safe) return null;

  return (
    <div
      className={cn(
        "product-description text-muted-foreground leading-relaxed",
        "[&_p+_p]:mt-3 [&_h2]:mt-4 [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:text-foreground",
        "[&_h3]:mt-3 [&_h3]:font-semibold [&_h3]:text-foreground",
        "[&_ul]:mt-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:mt-2 [&_ol]:list-decimal [&_ol]:pl-5",
        "[&_a]:text-primary [&_a]:underline [&_strong]:font-semibold [&_strong]:text-foreground",
        className
      )}
      dangerouslySetInnerHTML={{ __html: safe }}
    />
  );
}
