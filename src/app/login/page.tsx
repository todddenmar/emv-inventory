"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { OpenInBrowserPrompt } from "@/components/auth/open-in-browser-prompt";
import { signInWithGoogle, signOutUser } from "@/lib/auth";
import { isInAppBrowser } from "@/lib/in-app-browser";
import { resolvePostLoginRedirect } from "@/lib/post-login-redirect";
import { isStaffRole } from "@/lib/roles";
import { useAuthStore, useIsStaff } from "@/stores/auth-store";

function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirect = searchParams.get("redirect") || "/admin";
  const inviteToken = searchParams.get("invite") || undefined;
  const denied = searchParams.get("denied") === "1";
  const user = useAuthStore((s) => s.user);
  const loading = useAuthStore((s) => s.loading);
  const isStaff = useIsStaff();
  const [signingIn, setSigningIn] = useState(false);
  const [inAppBrowser, setInAppBrowser] = useState(false);

  useEffect(() => {
    setInAppBrowser(isInAppBrowser());
  }, []);

  useEffect(() => {
    if (loading) return;

    if (user && isStaff) {
      router.replace(resolvePostLoginRedirect(true, redirect, user.role));
      return;
    }

    if (user && !isStaff && !denied) {
      router.replace("/login?denied=1");
    }
  }, [user, loading, isStaff, router, redirect, denied]);

  const handleGoogleSignIn = async () => {
    if (inAppBrowser) return;

    setSigningIn(true);
    try {
      const appUser = await signInWithGoogle(inviteToken);
      useAuthStore.getState().setUser(appUser);
      const staff = isStaffRole(appUser.role);

      if (!staff) {
        await signOutUser();
        useAuthStore.getState().setUser(null);
        toast.error("Access denied. Staff accounts only.");
        router.replace("/login?denied=1");
        return;
      }

      toast.success(`Welcome, ${appUser.displayName || "user"}!`);
      router.push(resolvePostLoginRedirect(true, redirect, appUser.role));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Sign in failed");
    } finally {
      setSigningIn(false);
    }
  };

  const handleSignOut = async () => {
    setSigningIn(true);
    try {
      await signOutUser();
      useAuthStore.getState().setUser(null);
      router.replace("/login");
    } catch {
      toast.error("Sign out failed");
    } finally {
      setSigningIn(false);
    }
  };

  return (
    <div className="container mx-auto flex min-h-[calc(100vh-4rem)] items-center justify-center px-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">Staff sign in</CardTitle>
          <CardDescription>
            {inviteToken
              ? "Accept your staff invite by signing in with Google"
              : "Sign in to manage physical store inventory"}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <OpenInBrowserPrompt />

          {denied && (
            <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-center text-sm text-destructive">
              Access denied. This app is for staff only.
            </p>
          )}

          {user && !isStaff ? (
            <Button
              variant="outline"
              className="w-full"
              onClick={handleSignOut}
              disabled={signingIn}
            >
              {signingIn && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Sign out
            </Button>
          ) : (
            <Button
              className="w-full"
              onClick={handleGoogleSignIn}
              disabled={signingIn || inAppBrowser}
            >
              {signingIn && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Continue with Google
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center">Loading...</div>}>
      <LoginContent />
    </Suspense>
  );
}
