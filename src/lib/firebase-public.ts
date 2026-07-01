import { getApp, getApps, initializeApp } from "firebase/app";
import {
  getFirestore,
  initializeFirestore,
  type Firestore,
} from "firebase/firestore";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

let publicDb: Firestore | undefined;

function createPublicDb(app: ReturnType<typeof initializeApp>): Firestore {
  // Long polling is more reliable for Firestore reads in serverless runtimes.
  if (typeof window === "undefined") {
    return initializeFirestore(app, { experimentalForceLongPolling: true });
  }
  return getFirestore(app);
}

/** Firestore for public catalog reads (works on server and client). */
export function getPublicDb(): Firestore {
  if (!firebaseConfig.apiKey) {
    throw new Error("Missing Firebase config.");
  }
  if (!publicDb) {
    const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
    publicDb = createPublicDb(app);
  }
  return publicDb;
}
