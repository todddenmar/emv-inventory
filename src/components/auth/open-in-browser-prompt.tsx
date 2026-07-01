"use client";

import { useEffect, useState } from "react";
import { ExternalLink, Copy, Check } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  detectInAppBrowser,
  externalBrowserUrl,
  type InAppBrowserName,
} from "@/lib/in-app-browser";

interface OpenInBrowserPromptProps {
  className?: string;
}

export function OpenInBrowserPrompt({ className }: OpenInBrowserPromptProps) {
  const [browserName, setBrowserName] = useState<InAppBrowserName | null>(null);
  const [pageUrl, setPageUrl] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setBrowserName(detectInAppBrowser());
    setPageUrl(window.location.href);
  }, []);

  if (!browserName) return null;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(pageUrl);
      setCopied(true);
      toast.success("Link copied");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Could not copy link");
    }
  };

  return (
    <div className={className}>
      <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-4 text-sm">
        <p className="font-medium text-foreground">
          Google sign-in does not work in {browserName}
        </p>
        <p className="mt-1 text-muted-foreground">
          Open this page in Safari or Chrome to sign in.
        </p>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <a
            href={externalBrowserUrl(pageUrl)}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-primary px-2.5 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/80"
          >
            <ExternalLink className="h-4 w-4" />
            Open in browser
          </a>
          <Button
            type="button"
            variant="outline"
            className="flex-1"
            onClick={handleCopy}
          >
            {copied ? (
              <Check className="mr-2 h-4 w-4" />
            ) : (
              <Copy className="mr-2 h-4 w-4" />
            )}
            {copied ? "Copied" : "Copy link"}
          </Button>
        </div>
      </div>
    </div>
  );
}
