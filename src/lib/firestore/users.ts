import {
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  setDoc,
  updateDoc,
  collection,
} from "firebase/firestore";
import { getClientDb } from "@/lib/firebase";
import { userConverter } from "@/lib/firestore/converters";
import {
  isElevatedAdminRole,
  isMasterAdminRole,
  isStaffRole,
  roleAssignableBy,
} from "@/lib/roles";
import type { AppUser, UserRole } from "@/types";
import type { User } from "firebase/auth";

const usersRef = (uid: string) =>
  doc(getClientDb(), "users", uid).withConverter(userConverter);

export async function getUser(uid: string): Promise<AppUser | null> {
  const snap = await getDoc(usersRef(uid));
  return snap.exists() ? snap.data() : null;
}

export async function getManagers(): Promise<AppUser[]> {
  const users = await getAllUsers();
  return users.filter((u) => u.role === "cashier");
}

export async function getAllUsers(): Promise<AppUser[]> {
  const snapshot = await getDocs(
    collection(getClientDb(), "users").withConverter(userConverter)
  );
  return snapshot.docs
    .map((d) => d.data())
    .sort((a, b) => {
      const nameA = (a.displayName || a.email || a.uid).toLowerCase();
      const nameB = (b.displayName || b.email || b.uid).toLowerCase();
      return nameA.localeCompare(nameB);
    });
}

export async function getStaffUsers(): Promise<AppUser[]> {
  const users = await getAllUsers();
  return users.filter((u) => isStaffRole(u.role));
}

export async function hasMasterAdmin(): Promise<boolean> {
  const bootstrapRef = doc(getClientDb(), "settings", "bootstrap");
  const snap = await getDoc(bootstrapRef);
  return snap.exists() && !!snap.data()?.masterAdminUid;
}

interface LoginOptions {
  role?: UserRole;
  branchId?: string | null;
}

export async function upsertUserOnLogin(
  firebaseUser: User,
  options?: LoginOptions
): Promise<AppUser> {
  const existing = await getUser(firebaseUser.uid);

  if (existing) {
    const updated: Partial<AppUser> = {
      email: firebaseUser.email,
      displayName: firebaseUser.displayName,
      photoURL: firebaseUser.photoURL,
      updatedAt: new Date(),
    };
    if (options?.role) updated.role = options.role;
    if (options?.branchId !== undefined) updated.branchId = options.branchId;

    await updateDoc(doc(getClientDb(), "users", firebaseUser.uid), {
      ...updated,
      updatedAt: serverTimestamp(),
    });
    return { ...existing, ...updated, uid: firebaseUser.uid };
  }

  let role: UserRole = options?.role ?? "customer";
  let branchId: string | null = options?.branchId ?? null;

  if (!options?.role && !firebaseUser.isAnonymous) {
    const masterExists = await hasMasterAdmin();
    if (!masterExists) {
      role = "master-admin";
      branchId = null;
      await setDoc(doc(getClientDb(), "settings", "bootstrap"), {
        masterAdminUid: firebaseUser.uid,
        initializedAt: serverTimestamp(),
      });
    }
  }

  const newUser: AppUser = {
    uid: firebaseUser.uid,
    email: firebaseUser.email,
    displayName: firebaseUser.displayName,
    photoURL: firebaseUser.photoURL,
    role,
    branchId,
    isAnonymous: firebaseUser.isAnonymous,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  await setDoc(doc(getClientDb(), "users", firebaseUser.uid), {
    email: newUser.email,
    displayName: newUser.displayName,
    photoURL: newUser.photoURL,
    role: newUser.role,
    branchId: newUser.branchId,
    isAnonymous: newUser.isAnonymous,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  return newUser;
}

export async function assignUserBranch(
  uid: string,
  branchId: string | null
): Promise<void> {
  await updateDoc(doc(getClientDb(), "users", uid), {
    branchId,
    updatedAt: serverTimestamp(),
  });
}

export async function assignRole(
  uid: string,
  role: UserRole
): Promise<void> {
  await updateDoc(doc(getClientDb(), "users", uid), {
    role,
    updatedAt: serverTimestamp(),
  });
}

export interface UpdateUserAccessInput {
  role: UserRole;
  branchId: string | null;
}

export async function updateUserAccess(
  uid: string,
  data: UpdateUserAccessInput,
  actorUid: string
): Promise<void> {
  if (data.role === "cashier" && !data.branchId) {
    throw new Error("Cashiers must be assigned to a branch");
  }

  const [user, actor] = await Promise.all([getUser(uid), getUser(actorUid)]);
  if (!user) {
    throw new Error("User not found");
  }
  if (!actor || !isElevatedAdminRole(actor.role)) {
    throw new Error("Only admins can update user access");
  }

  if (user.isAnonymous && data.role !== "customer") {
    throw new Error("Guest accounts cannot be assigned staff roles");
  }

  if (
    isMasterAdminRole(user.role) &&
    !isMasterAdminRole(actor.role)
  ) {
    throw new Error("You cannot edit master-admin users");
  }

  if (!roleAssignableBy(actor.role, data.role)) {
    throw new Error("You cannot assign that role");
  }

  if (
    uid === actorUid &&
    isMasterAdminRole(user.role) &&
    !isMasterAdminRole(data.role)
  ) {
    throw new Error("You cannot remove your own master-admin role");
  }

  if (isMasterAdminRole(user.role) && !isMasterAdminRole(data.role)) {
    const staff = await getStaffUsers();
    const masterCount = staff.filter((u) =>
      isMasterAdminRole(u.role)
    ).length;
    if (masterCount <= 1) {
      throw new Error("At least one master-admin is required");
    }
  }

  const branchId = data.role === "cashier" ? data.branchId : null;

  await updateDoc(doc(getClientDb(), "users", uid), {
    role: data.role,
    branchId,
    updatedAt: serverTimestamp(),
  });

  if (isMasterAdminRole(data.role)) {
    await updateDoc(doc(getClientDb(), "settings", "bootstrap"), {
      masterAdminUid: uid,
      updatedAt: serverTimestamp(),
    });
  }
}

export function isStaff(role: UserRole): boolean {
  return isStaffRole(role);
}
