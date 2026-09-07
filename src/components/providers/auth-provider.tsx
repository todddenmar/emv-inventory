"use client";

import { useEffect } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { getClientAuth } from "@/lib/firebase";
import { upsertUserOnLogin } from "@/lib/firestore/users";
import { syncAuthClaims } from "@/lib/auth-claims";
import { useAuthStore } from "@/stores/auth-store";

const AUTH_READY_TIMEOUT_MS = 12_000;
const PROFILE_LOAD_TIMEOUT_MS = 8_000;

function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  label: string
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => {
      reject(new Error(`${label} timed out after ${ms}ms`));
    }, ms);
    promise.then(
      (value) => {
        window.clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        window.clearTimeout(timer);
        reject(error);
      }
    );
  });
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { setUser, setLoading } = useAuthStore();

  useEffect(() => {
    let unsubscribe = () => {};

    const timeout = window.setTimeout(() => {
      if (useAuthStore.getState().loading) {
        console.warn("[auth] session restore timed out");
        setLoading(false);
      }
    }, AUTH_READY_TIMEOUT_MS);

    try {
      unsubscribe = onAuthStateChanged(getClientAuth(), async (firebaseUser) => {
        window.clearTimeout(timeout);

        if (!firebaseUser) {
          setUser(null);
          setLoading(false);
          return;
        }

        try {
          const appUser = await withTimeout(
            upsertUserOnLogin(firebaseUser),
            PROFILE_LOAD_TIMEOUT_MS,
            "user profile"
          );
          // Claims sync is best-effort; missing Admin config or user race should not
          // block the session after the Firestore profile was upserted.
          await syncAuthClaims().catch((error) => {
            console.warn(
              "[auth] claims sync skipped:",
              error instanceof Error ? error.message : error
            );
          });
          setUser(appUser);
        } catch (error) {
          console.warn(
            "[auth] profile load failed:",
            error instanceof Error ? error.message : error
          );
          setUser(null);
        } finally {
          setLoading(false);
        }
      });
    } catch (error) {
      window.clearTimeout(timeout);
      console.warn(
        "[auth] failed to start:",
        error instanceof Error ? error.message : error
      );
      setLoading(false);
    }

    return () => {
      window.clearTimeout(timeout);
      unsubscribe();
    };
  }, [setUser, setLoading]);

  return <>{children}</>;
}
