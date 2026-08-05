import {
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  type User,
} from "firebase/auth";
import { getClientAuth } from "@/lib/firebase";
import { assignBranchManager } from "@/lib/firestore/branches";
import { acceptInvite, getInviteByToken, isInviteValid } from "@/lib/firestore/invites";
import { upsertUserOnLogin } from "@/lib/firestore/users";

const googleProvider = new GoogleAuthProvider();

export async function signInWithGoogle(inviteToken?: string) {
  const result = await signInWithPopup(getClientAuth(), googleProvider);
  return handlePostLogin(result.user, inviteToken);
}

export async function signOutUser() {
  await signOut(getClientAuth());
}

async function handlePostLogin(user: User, inviteToken?: string) {
  if (inviteToken) {
    const invite = await getInviteByToken(inviteToken);
    if (!invite || !isInviteValid(invite)) {
      throw new Error("Invalid or expired invite");
    }
    if (invite.email && user.email && invite.email !== user.email) {
      throw new Error("This invite was sent to a different email address");
    }
    if (!invite.branchId) {
      throw new Error("This invite is missing a branch assignment");
    }

    const appUser = await upsertUserOnLogin(user, {
      role: "manager",
      branchId: invite.branchId,
    });
    await assignBranchManager(
      invite.branchId,
      user.uid,
      user.displayName || user.email || "Manager"
    );
    await acceptInvite(invite.id, user.uid);
    return appUser;
  }

  return upsertUserOnLogin(user);
}
