"use client";

import { Suspense, use } from "react";
import { useRouter } from "next/navigation";
import { ExternalLink, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { LinkButton } from "@/components/ui/link-button";
import { getInviteByToken, isInviteValid } from "@/lib/firestore/invites";
import type { Invite } from "@/types";
import { useEffect, useState } from "react";

function InviteContent({ token }: { token: string }) {
  const router = useRouter();
  const [invite, setInvite] = useState<Invite | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getInviteByToken(token)
      .then(setInvite)
      .catch(() => setInvite(null))
      .finally(() => setLoading(false));
  }, [token]);

  if (loading) {
    return (
      <div className="flex justify-center p-16">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!invite || !isInviteValid(invite)) {
    return (
      <div className="container mx-auto max-w-md px-4 py-16">
        <Card>
          <CardHeader>
            <CardTitle>Invalid invite</CardTitle>
            <CardDescription>
              This invite link is invalid, expired, or has already been used.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <LinkButton href="/">Go to shop</LinkButton>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto max-w-md px-4 py-16">
      <Card>
        <CardHeader>
          <CardTitle>Manager invite</CardTitle>
          <CardDescription>
            You've been invited by {invite.createdByName} to manage{" "}
            <strong>{invite.branchName || "a branch"}</strong>.
            {invite.email && (
              <>
                {" "}
                This invite was sent to <strong>{invite.email}</strong>.
              </>
            )}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button
            className="w-full"
            onClick={() => router.push(`/login?invite=${token}&redirect=/admin`)}
          >
            <ExternalLink className="mr-2 h-4 w-4" />
            Accept invite with Google
          </Button>
          <p className="text-xs text-muted-foreground text-center">
            Expires {invite.expiresAt.toLocaleDateString()}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

export default function InvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = use(params);

  return (
    <Suspense>
      <InviteContent token={token} />
    </Suspense>
  );
}
