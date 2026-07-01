import { cert, getApps, initializeApp, type App } from "firebase-admin/app";
import { getAuth, type Auth } from "firebase-admin/auth";
import { getFirestore, type Firestore } from "firebase-admin/firestore";

let adminApp: App | undefined;
let adminAuth: Auth | undefined;
let adminDb: Firestore | undefined;

function getProjectId(): string {
  const projectId =
    process.env.FIREBASE_ADMIN_PROJECT_ID ??
    process.env.FIREBASE_PROJECT_ID ??
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  if (!projectId) {
    throw new Error(
      "Missing FIREBASE_ADMIN_PROJECT_ID, FIREBASE_PROJECT_ID, or NEXT_PUBLIC_FIREBASE_PROJECT_ID"
    );
  }
  return projectId;
}

function normalizePrivateKey(raw: string | undefined): string | undefined {
  if (!raw?.trim()) return undefined;

  let key = raw.trim();
  if (
    (key.startsWith('"') && key.endsWith('"')) ||
    (key.startsWith("'") && key.endsWith("'"))
  ) {
    key = key.slice(1, -1);
  }

  if (key.includes("\\n")) {
    key = key.replace(/\\n/g, "\n");
  }

  return key;
}

function getServiceAccountCredentials():
  | { projectId: string; clientEmail: string; privateKey: string }
  | null {
  const projectId = getProjectId();
  const clientEmail =
    process.env.FIREBASE_ADMIN_CLIENT_EMAIL?.trim() ??
    process.env.FIREBASE_CLIENT_EMAIL?.trim();
  const privateKey = normalizePrivateKey(
    process.env.FIREBASE_ADMIN_PRIVATE_KEY ?? process.env.FIREBASE_PRIVATE_KEY
  );

  if (clientEmail && privateKey) {
    return { projectId, clientEmail, privateKey };
  }

  const json = process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim();
  if (json) {
    try {
      const parsed = JSON.parse(json) as {
        project_id?: string;
        client_email?: string;
        private_key?: string;
      };
      if (parsed.client_email && parsed.private_key) {
        return {
          projectId: parsed.project_id ?? projectId,
          clientEmail: parsed.client_email,
          privateKey: normalizePrivateKey(parsed.private_key) ?? parsed.private_key,
        };
      }
    } catch {
      // fall through
    }
  }

  return null;
}

function getAdminApp(): App {
  if (adminApp) return adminApp;

  const existing = getApps()[0];
  if (existing) {
    adminApp = existing;
    return adminApp;
  }

  const credentials = getServiceAccountCredentials();
  if (!credentials) {
    throw new Error(
      "Missing Firebase Admin credentials. Set FIREBASE_ADMIN_CLIENT_EMAIL and FIREBASE_ADMIN_PRIVATE_KEY (or FIREBASE_CLIENT_EMAIL and FIREBASE_PRIVATE_KEY)."
    );
  }

  adminApp = initializeApp({
    credential: cert(credentials),
  });
  return adminApp;
}

export function getAdminAuth(): Auth {
  if (!adminAuth) {
    adminAuth = getAuth(getAdminApp());
  }
  return adminAuth;
}

export function getAdminDb(): Firestore {
  if (!adminDb) {
    adminDb = getFirestore(getAdminApp());
  }
  return adminDb;
}
