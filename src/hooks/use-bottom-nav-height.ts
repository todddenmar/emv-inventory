"use client";

import { useEffect, type RefObject } from "react";

export const BOTTOM_NAV_HEIGHT_VAR = "--mobile-bottom-nav-height";

/** Offset for fixed bars that must sit directly above the mobile bottom nav. */
export const ABOVE_BOTTOM_NAV_BOTTOM = `var(${BOTTOM_NAV_HEIGHT_VAR}, calc(4rem + env(safe-area-inset-bottom)))`;

/**
 * Publishes the rendered height of a fixed bottom nav as a CSS variable on
 * <html>. Hidden navs (display: none on desktop) report 0.
 */
export function useBottomNavHeightVar(ref: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const root = document.documentElement;
    const update = () => {
      root.style.setProperty(
        BOTTOM_NAV_HEIGHT_VAR,
        `${el.getBoundingClientRect().height}px`
      );
    };
    update();
    const ro =
      typeof ResizeObserver !== "undefined" ? new ResizeObserver(update) : null;
    ro?.observe(el);
    window.addEventListener("resize", update);
    return () => {
      ro?.disconnect();
      window.removeEventListener("resize", update);
      root.style.removeProperty(BOTTOM_NAV_HEIGHT_VAR);
    };
  }, [ref]);
}
