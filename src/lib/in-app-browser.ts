export type InAppBrowserName = "Messenger" | "Facebook" | "Instagram";

export function detectInAppBrowser(): InAppBrowserName | null {
  if (typeof navigator === "undefined") return null;

  const ua = navigator.userAgent || "";
  if (/Messenger|FB_IAB.*Messenger/i.test(ua)) return "Messenger";
  if (/FBAN|FBAV|FB_IAB/i.test(ua)) return "Facebook";
  if (/Instagram/i.test(ua)) return "Instagram";

  return null;
}

export function isInAppBrowser(): boolean {
  return detectInAppBrowser() !== null;
}

/** Best-effort link to open the current page in the system browser. */
export function externalBrowserUrl(url: string): string {
  if (typeof navigator === "undefined") return url;

  const ua = navigator.userAgent || "";
  if (/Android/i.test(ua)) {
    const withoutScheme = url.replace(/^https?:\/\//, "");
    return `intent://${withoutScheme}#Intent;scheme=https;package=com.android.chrome;S.browser_fallback_url=${encodeURIComponent(url)};end`;
  }

  return url;
}
