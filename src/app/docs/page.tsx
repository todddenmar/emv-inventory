import type { Metadata } from "next";
import { Fraunces } from "next/font/google";
import Link from "next/link";
import { DocsGuide } from "@/components/docs/docs-guide";
import { BrandLogo, BRAND_NAME } from "@/components/layout/brand-logo";

const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-docs-display",
});

export const metadata: Metadata = {
  title: `Staff guide · ${BRAND_NAME}`,
  description:
    "Public study guide for El Mio Vicente inventory, POS, roles, and reports.",
};

export default function DocsPage() {
  return (
    <div
      className={`${fraunces.variable} docs-guide min-h-full bg-[#e8edf2] text-[#12141a] [--docs-display:var(--font-docs-display)]`}
    >
      <style>{`
        .docs-guide .docs-display {
          font-family: var(--font-docs-display), ui-serif, Georgia, serif;
        }
      `}</style>
      <header className="border-b border-[#12141a]/10 bg-[#12141a] text-[#f7f4ea]">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <BrandLogo
              href="/docs"
              size="sm"
              showName
              nameClassName="text-[#f7f4ea]"
              priority
            />
            <span className="hidden rounded-full bg-[var(--brand-yellow)] px-2.5 py-0.5 text-[11px] font-semibold tracking-wide text-[#12141a] uppercase sm:inline">
              Staff guide
            </span>
          </div>
          <Link
            href="/login"
            className="shrink-0 rounded-lg bg-[var(--brand-yellow)] px-3 py-2 text-sm font-semibold text-[#12141a] transition hover:brightness-95"
          >
            Staff sign in
          </Link>
        </div>
      </header>

      <DocsGuide />
    </div>
  );
}
