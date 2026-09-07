import {
  getFirestore,
  initializeFirestore,
  type Firestore,
} from "firebase/firestore";
import type { FirebaseApp } from "firebase/app";

/**
 * Safari / iPad WebChannel often never completes. Long polling is slower on
 * desktop but actually finishes on iOS. The Node SDK rejects this option, so
 * the server falls back to the default transport.
 */
export function getOrInitFirestore(firebaseApp: FirebaseApp): Firestore {
  try {
    return initializeFirestore(firebaseApp, {
      experimentalForceLongPolling: true,
      experimentalLongPollingOptions: { timeoutSeconds: 25 },
    });
  } catch {
    return getFirestore(firebaseApp);
  }
}
