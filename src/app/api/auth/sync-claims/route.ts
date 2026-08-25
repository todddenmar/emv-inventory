import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const authHeader = request.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let adminAuth;
  let adminDb;
  try {
    const { getAdminAuth, getAdminDb } = await import("@/lib/firebase-admin");
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
  const syncingOtherUser = Boolean(body.uid && body.uid !== decoded.uid);

  if (syncingOtherUser) {
    const { isElevatedAdminRole } = await import("@/lib/roles");
    const actorDoc = await adminDb.collection("users").doc(decoded.uid).get();
    if (
      !isElevatedAdminRole(
        actorDoc.data()?.role as import("@/types").UserRole | undefined
      )
    ) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    targetUid = body.uid as string;
  }

  let userDoc = await adminDb.collection("users").doc(targetUid).get();
  if (!userDoc.exists) {
    // Client upsert can race Admin read right after first login.
    await new Promise((resolve) => setTimeout(resolve, 400));
    userDoc = await adminDb.collection("users").doc(targetUid).get();
  }

  if (!userDoc.exists) {
    if (syncingOtherUser) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }
    // Best-effort self sync: allow login to continue without claims.
    return NextResponse.json({
      uid: targetUid,
      skipped: true,
      reason: "user_not_found",
    });
  }

  const data = userDoc.data()!;
  const role =
    (data.role as import("@/types").UserRole | undefined) ?? "customer";
  const branchId = typeof data.branchId === "string" ? data.branchId : null;

  await adminAuth.setCustomUserClaims(targetUid, { role, branchId });

  return NextResponse.json({ uid: targetUid, role, branchId, skipped: false });
}
