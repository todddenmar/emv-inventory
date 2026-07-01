"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
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
import { signInWithGoogle, signInAsGuest } from "@/lib/auth";
import { isInAppBrowser } from "@/lib/in-app-browser";
import { resolvePostLoginRedirect } from "@/lib/post-login-redirect";
import { useAuthStore, useIsStaff } from "@/stores/auth-store";

function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirect = searchParams.get("redirect") || "/";
  const inviteToken = searchParams.get("invite") || undefined;
  const user = useAuthStore((s) => s.user);
  const loading = useAuthStore((s) => s.loading);
  const isStaff = useIsStaff();
  const [signingIn, setSigningIn] = useState(false);
  const [inAppBrowser, setInAppBrowser] = useState(false);

  useEffect(() => {
    setInAppBrowser(isInAppBrowser());
  }, []);

  useEffect(() => {
    if (loading || !user) return;
    router.replace(resolvePostLoginRedirect(isStaff, redirect));
  }, [user, loading, isStaff, router, redirect]);

  const handleGoogleSignIn = async () => {
    if (inAppBrowser) return;

    setSigningIn(true);
    try {
      const appUser = await signInWithGoogle(inviteToken);
      useAuthStore.getState().setUser(appUser);
      toast.success(`Welcome, ${appUser.displayName || "user"}!`);
      const staff =
        appUser.role === "master-admin" || appUser.role === "manager";
      router.push(resolvePostLoginRedirect(staff, redirect));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Sign in failed");
    } finally {
      setSigningIn(false);
    }
  };

  const handleGuestSignIn = async () => {
    setSigningIn(true);
    try {
      const appUser = await signInAsGuest();
      useAuthStore.getState().setUser(appUser);
      toast.success("Signed in as guest");
      router.push(resolvePostLoginRedirect(false, redirect));
    } catch {
      toast.error("Guest sign in failed");
    } finally {
      setSigningIn(false);
    }
  };

  return (
    <div className="container mx-auto flex min-h-[calc(100vh-4rem)] items-center justify-center px-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">Sign in</CardTitle>
          <CardDescription>
            {inviteToken
              ? "Accept your manager invite by signing in with Google"
              : "Sign in to track your orders or manage the shop"}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <OpenInBrowserPrompt />

          <Button
            className="w-full"
            onClick={handleGoogleSignIn}
            disabled={signingIn || inAppBrowser}
          >
            {signingIn && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Continue with Google
          </Button>

          {!inviteToken && (
            <>
              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-card px-2 text-muted-foreground">Or</span>
                </div>
              </div>

              <Button
                variant="outline"
                className="w-full"
                onClick={handleGuestSignIn}
                disabled={signingIn}
              >
                Continue as guest
              </Button>
            </>
          )}

          <p className="text-center text-xs text-muted-foreground">
            <Link href="/" className="underline">
              Back to shop
            </Link>
          </p>
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
