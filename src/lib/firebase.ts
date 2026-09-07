import { initializeApp, getApps, getApp, type FirebaseApp } from "firebase/app";
import {
  getAuth,
  initializeAuth,
  indexedDBLocalPersistence,
  browserLocalPersistence,
  inMemoryPersistence,
  browserPopupRedirectResolver,
  type Auth,
} from "firebase/auth";
import { type Firestore } from "firebase/firestore";
import { getStorage, type FirebaseStorage } from "firebase/storage";
import { getOrInitFirestore } from "@/lib/firestore-init";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

let app: FirebaseApp | undefined;
let authInstance: Auth | undefined;
let dbInstance: Firestore | undefined;
let storageInstance: FirebaseStorage | undefined;

function assertClient() {
  if (typeof window === "undefined") {
    throw new Error("Firebase is only available in the browser");
  }
}

/** iPadOS 13+ reports as Macintosh; IndexedDB auth persistence can hang there. */
function isIosWebKit(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  if (/iPad|iPhone|iPod/.test(ua)) return true;
  return navigator.maxTouchPoints > 1 && /Macintosh/.test(ua);
}

function getFirebaseApp(): FirebaseApp {
  assertClient();
  if (!firebaseConfig.apiKey) {
    throw new Error(
      "Missing Firebase config. Copy .env.example to .env.local and add your keys."
    );
  }
  if (!app) {
    app = getApps().length ? getApp() : initializeApp(firebaseConfig);
  }
  return app;
}

export function getClientAuth(): Auth {
  if (!authInstance) {
    const firebaseApp = getFirebaseApp();
    try {
      authInstance = initializeAuth(firebaseApp, {
        persistence: isIosWebKit()
          ? [browserLocalPersistence, inMemoryPersistence]
          : [indexedDBLocalPersistence, browserLocalPersistence],
        popupRedirectResolver: browserPopupRedirectResolver,
      });
    } catch {
      authInstance = getAuth(firebaseApp);
    }
  }
  return authInstance;
}

export function getClientDb(): Firestore {
  if (!dbInstance) {
    dbInstance = getOrInitFirestore(getFirebaseApp());
  }
  return dbInstance;
}

export function getClientStorage(): FirebaseStorage {
  if (!storageInstance) {
    storageInstance = getStorage(getFirebaseApp());
  }
  return storageInstance;
}
