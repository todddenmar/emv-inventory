"use client";

import { useCallback, useEffect, useState } from "react";
import {
  getAppSettings,
  type AppSettings,
} from "@/lib/firestore/app-settings";
import type { CatalogImageSource } from "@/lib/products";

const DEFAULT: AppSettings = {
  catalogImageSource: "product",
  hideSidebarLabelsUntilHover: false,
  updatedAt: null,
};

export function useAppSettings() {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const next = await getAppSettings();
      setSettings(next);
      return next;
    } catch (error) {
      console.error(error);
      return DEFAULT;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    getAppSettings()
      .then((next) => {
        if (!cancelled) setSettings(next);
      })
      .catch(console.error)
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return {
    settings,
    catalogImageSource: settings.catalogImageSource as CatalogImageSource,
    hideSidebarLabelsUntilHover: settings.hideSidebarLabelsUntilHover,
    loading,
    reload,
    setSettings,
  };
}
