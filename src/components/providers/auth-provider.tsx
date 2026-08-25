"use client";

import { useEffect } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { getClientAuth } from "@/lib/firebase";
import { upsertUserOnLogin } from "@/lib/firestore/users";
import { syncAuthClaims } from "@/lib/auth-claims";
import { useAuthStore } from "@/stores/auth-store";

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { setUser, setLoading } = useAuthStore();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(getClientAuth(), async (firebaseUser) => {
      if (!firebaseUser) {
        setUser(null);
        setLoading(false);
        return;
      }

      try {
        const appUser = await upsertUserOnLogin(firebaseUser);
        // Claims sync is best-effort; missing Admin config or user race should not
        // block the session after the Firestore profile was upserted.
        await syncAuthClaims().catch((error) => {
          console.warn(
            "[auth] claims sync skipped:",
            error instanceof Error ? error.message : error
          );
        });
        setUser(appUser);
      } catch {
        setUser(null);
      } finally {
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, [setUser, setLoading]);

  return <>{children}</>;
}
