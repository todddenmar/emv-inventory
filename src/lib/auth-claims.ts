import { getClientAuth } from "@/lib/firebase";

export async function syncAuthClaims(targetUid?: string): Promise<void> {
  const user = getClientAuth().currentUser;
  if (!user) return;

  const idToken = await user.getIdToken();
  const response = await fetch("/api/auth/sync-claims", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${idToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(targetUid ? { uid: targetUid } : {}),
  });

  if (!response.ok) {
    const data = (await response.json().catch(() => null)) as {
      error?: string;
    } | null;
    throw new Error(
      data?.error ??
        `Failed to sync auth claims (${response.status} ${response.statusText})`
    );
  }

  if (!targetUid || targetUid === user.uid) {
    await user.getIdToken(true);
  }
}
