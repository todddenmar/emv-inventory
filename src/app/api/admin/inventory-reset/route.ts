import { NextResponse } from "next/server";
import {
  isInventoryResetAction,
  runInventoryReset,
} from "@/lib/firestore/inventory-reset";

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

  const roleFromClaims = decoded.role;
  let role = typeof roleFromClaims === "string" ? roleFromClaims : undefined;

  if (role !== "master-admin") {
    const userDoc = await adminDb.collection("users").doc(decoded.uid).get();
    role = (userDoc.data()?.role as string | undefined) ?? "customer";
  }

  if (role !== "master-admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { action, branchId } = body as {
    action?: unknown;
    branchId?: unknown;
  };

  if (!isInventoryResetAction(action)) {
    return NextResponse.json({ error: "Invalid reset action" }, { status: 400 });
  }

  let scopedBranchId: string | null = null;
  if (branchId != null && branchId !== "") {
    if (typeof branchId !== "string") {
      return NextResponse.json({ error: "Invalid branch" }, { status: 400 });
    }
    scopedBranchId = branchId;
  }

  try {
    const result = await runInventoryReset(adminDb, action, scopedBranchId);
    return NextResponse.json({
      ok: true,
      deleted: result.deleted,
      updated: result.updated,
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to reset inventory",
      },
      { status: 500 }
    );
  }
}
