import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import { getClientDb } from "@/lib/firebase";
import { siteSettingsConverter } from "@/lib/firestore/converters";
import type { SiteSettings, SocialLink } from "@/types";

const SITE_SETTINGS_DOC = "site";

export const DEFAULT_SITE_SETTINGS: Omit<SiteSettings, "updatedAt"> = {
  footerAddress: "",
  footerPhone: null,
  footerEmail: null,
  socialLinks: [],
};

function siteSettingsRef() {
  return doc(getClientDb(), "settings", SITE_SETTINGS_DOC).withConverter(
    siteSettingsConverter
  );
}

export async function getSiteSettings(): Promise<SiteSettings> {
  const snap = await getDoc(siteSettingsRef());
  if (!snap.exists()) {
    return { ...DEFAULT_SITE_SETTINGS, updatedAt: new Date() };
  }
  return snap.data();
}

export async function updateSiteSettings(
  data: Omit<SiteSettings, "updatedAt">
): Promise<void> {
  await setDoc(
    siteSettingsRef(),
    {
      ...data,
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
}

export function emptySocialLink(): SocialLink {
  return { platform: "facebook", url: "", label: null };
}
