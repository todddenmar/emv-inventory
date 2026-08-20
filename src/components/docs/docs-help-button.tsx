"use client";

import { useState } from "react";
import { BookOpen } from "lucide-react";
import { Fraunces } from "next/font/google";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DocsGuide } from "@/components/docs/docs-guide";

const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-docs-display",
});

export function DocsHelpButton({
  className,
}: {
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className={className}
        onClick={() => setOpen(true)}
        aria-label="Open staff guide"
        title="Staff guide"
      >
        <BookOpen className="h-5 w-5" />
      </Button>

      <Dialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) setSearchQuery("");
        }}
      >
        <DialogContent
          className={`${fraunces.variable} flex h-[min(92dvh,880px)] w-full max-w-[calc(100%-1rem)] flex-col gap-3 overflow-hidden bg-[#e8edf2] p-3 sm:max-w-3xl sm:p-5 lg:max-w-4xl`}
          showCloseButton
        >
          <style>{`
            .docs-guide .docs-display {
              font-family: var(--font-docs-display), ui-serif, Georgia, serif;
            }
          `}</style>
          <DialogHeader className="shrink-0 gap-1 pr-8 text-left">
            <DialogTitle className="docs-display text-xl text-[#12141a] sm:text-2xl">
              Staff guide
            </DialogTitle>
            <DialogDescription className="text-[#5a6478]">
              Search or browse how inventory, POS, roles, and reports work.
            </DialogDescription>
          </DialogHeader>
          <DocsGuide
            variant="dialog"
            idPrefix="dialog-docs-"
            searchQuery={searchQuery}
            onSearchQueryChange={setSearchQuery}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}
