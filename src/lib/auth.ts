import {
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  type User,
} from "firebase/auth";
import { getClientAuth } from "@/lib/firebase";
import {
  acceptInvite,
  getInviteByToken,
  isInviteValid,
} from "@/lib/firestore/invites";
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

    if (invite.role === "cashier") {
      if (!invite.branchId) {
        throw new Error("This invite is missing a branch assignment");
      }

      const appUser = await upsertUserOnLogin(user, {
        role: invite.role,
        branchId: invite.branchId,
      });
      await acceptInvite(invite.id, user.uid);
      return appUser;
    }

    const appUser = await upsertUserOnLogin(user, {
      role: invite.role === "owner" ? "owner" : "admin",
      branchId: null,
    });
    await acceptInvite(invite.id, user.uid);
    return appUser;
  }

  return upsertUserOnLogin(user);
}
