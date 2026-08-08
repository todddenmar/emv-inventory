import {
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";
import { getClientDb } from "@/lib/firebase";
import type { CatalogImageSource } from "@/lib/products";

export interface AppSettings {
  catalogImageSource: CatalogImageSource;
  /** When true, main admin sidebar shows icons only until hovered. */
  hideSidebarLabelsUntilHover: boolean;
  updatedAt: Date | null;
}

const DEFAULT_SETTINGS: AppSettings = {
  catalogImageSource: "product",
  hideSidebarLabelsUntilHover: false,
  updatedAt: null,
};

const APP_SETTINGS_PATH = ["settings", "app"] as const;

function appSettingsRef() {
  return doc(getClientDb(), ...APP_SETTINGS_PATH);
}

export async function getAppSettings(): Promise<AppSettings> {
  const snap = await getDoc(appSettingsRef());
  if (!snap.exists()) return { ...DEFAULT_SETTINGS };

  const data = snap.data();
  const source = data.catalogImageSource;
  return {
    catalogImageSource:
      source === "variant" || source === "product" || source === "none"
        ? source
        : "product",
    hideSidebarLabelsUntilHover: data.hideSidebarLabelsUntilHover === true,
    updatedAt:
      data.updatedAt?.toDate?.() instanceof Date
        ? data.updatedAt.toDate()
        : data.updatedAt instanceof Date
          ? data.updatedAt
          : null,
  };
}

export async function updateAppSettings(
  patch: Partial<
    Pick<AppSettings, "catalogImageSource" | "hideSidebarLabelsUntilHover">
  >
): Promise<AppSettings> {
  const current = await getAppSettings();
  const next: AppSettings = {
    catalogImageSource: patch.catalogImageSource ?? current.catalogImageSource,
    hideSidebarLabelsUntilHover:
      patch.hideSidebarLabelsUntilHover ?? current.hideSidebarLabelsUntilHover,
    updatedAt: new Date(),
  };

  await setDoc(
    appSettingsRef(),
    {
      catalogImageSource: next.catalogImageSource,
      hideSidebarLabelsUntilHover: next.hideSidebarLabelsUntilHover,
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );

  return next;
}
