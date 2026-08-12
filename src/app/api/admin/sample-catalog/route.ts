import { writeFile } from "fs/promises";
import path from "path";
import { NextResponse } from "next/server";
import { parseProductJsonImport } from "@/lib/product-json-import";

const SAMPLE_RELATIVE_PATH = path.join(
  "src",
  "lib",
  "sample-data",
  "emv-products.json"
);

export async function POST(request: Request) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json(
      { error: "Saving the sample catalog is only available in development" },
      { status: 403 }
    );
  }

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
  let role =
    typeof roleFromClaims === "string" ? roleFromClaims : undefined;

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

  if (!Array.isArray(body)) {
    return NextResponse.json(
      { error: "Body must be a JSON array of category groups" },
      { status: 400 }
    );
  }

  const parsed = parseProductJsonImport(body);
  if (parsed.products.length === 0 && parsed.emptyCategories.length === 0) {
    return NextResponse.json(
      { error: "Catalog has no products or categories to save" },
      { status: 400 }
    );
  }

  const filePath = path.join(process.cwd(), SAMPLE_RELATIVE_PATH);
  const contents = `${JSON.stringify(body, null, 2)}\n`;

  try {
    await writeFile(filePath, contents, "utf8");
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to write sample catalog file",
      },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    path: SAMPLE_RELATIVE_PATH.replace(/\\/g, "/"),
    productCount: parsed.products.length,
    categoryCount:
      new Set(parsed.products.map((p) => p.categoryName)).size +
      parsed.emptyCategories.length,
  });
}
