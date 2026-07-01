"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { sanitizeSlugInput, slugify } from "@/lib/slug";

type ResolveSlugFn = (name: string, preferredSlug?: string) => Promise<string>;

export function useSlugField(resolveSlug: ResolveSlugFn) {
  const [slug, setSlugState] = useState("");
  const slugManualRef = useRef(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const resetSlugField = useCallback((initialSlug = "", manual = false) => {
    slugManualRef.current = manual;
    setSlugState(initialSlug);
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
  }, []);

  const syncSlugFromName = useCallback(
    (name: string) => {
      if (slugManualRef.current) return;

      const trimmed = name.trim();
      if (!trimmed) return;

      setSlugState(slugify(trimmed));

      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(async () => {
        if (slugManualRef.current) return;
        try {
          const unique = await resolveSlug(trimmed);
          if (!slugManualRef.current) setSlugState(unique);
        } catch {
          if (!slugManualRef.current) setSlugState(slugify(trimmed));
        }
      }, 300);
    },
    [resolveSlug]
  );

  const handleSlugChange = useCallback((value: string) => {
    slugManualRef.current = true;
    setSlugState(sanitizeSlugInput(value));
  }, []);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  return {
    slug,
    setSlug: handleSlugChange,
    syncSlugFromName,
    resetSlugField,
  };
}
