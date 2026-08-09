import { NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "@/lib/firebase-admin";
import { isElevatedAdminRole } from "@/lib/roles";
import type { UserRole } from "@/types";

export async function POST(request: Request) {
  const authHeader = request.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let adminAuth;
  let adminDb;
  try {
    adminAuth = getAdminAuth();
    adminDb = getAdminDb();
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Firebase Admin is not configured",
      },
      { status: 500 }
    );
  }

  const idToken = authHeader.slice("Bearer ".length);
  let decoded;
  try {
    decoded = await adminAuth.verifyIdToken(idToken);
  } catch {
    return NextResponse.json({ error: "Invalid token" }, { status: 401 });
  }

  let targetUid = decoded.uid;
  const body = (await request.json().catch(() => ({}))) as { uid?: string };

  if (body.uid && body.uid !== decoded.uid) {
    const actorDoc = await adminDb.collection("users").doc(decoded.uid).get();
    if (!isElevatedAdminRole(actorDoc.data()?.role as UserRole | undefined)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    targetUid = body.uid;
  }

  const userDoc = await adminDb.collection("users").doc(targetUid).get();
  if (!userDoc.exists) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const data = userDoc.data()!;
  const role = (data.role as UserRole | undefined) ?? "customer";
  const branchId =
    typeof data.branchId === "string" ? data.branchId : null;

  await adminAuth.setCustomUserClaims(targetUid, { role, branchId });

  return NextResponse.json({ uid: targetUid, role, branchId });
}
