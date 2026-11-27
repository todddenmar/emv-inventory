import {
  deleteObject,
  getDownloadURL,
  ref,
  uploadBytes,
} from "firebase/storage";
import { getClientAuth, getClientStorage } from "@/lib/firebase";

function safeFileName(fileName: string): string {
  const base = fileName.replace(/[^a-zA-Z0-9._-]/g, "-").replace(/-+/g, "-");
  return base.slice(0, 80) || "logo";
}

export async function uploadDeliveryReceiptLogo(
  branchId: string,
  file: File
): Promise<{ url: string; storagePath: string }> {
  if (!getClientAuth().currentUser) {
    throw new Error("You must be signed in to upload a logo.");
  }

  const storagePath = `delivery-receipts/${branchId}/${Date.now()}-${safeFileName(file.name)}`;
  const storageRef = ref(getClientStorage(), storagePath);
  await uploadBytes(storageRef, file, {
    contentType: file.type || "image/png",
  });
  const url = await getDownloadURL(storageRef);
  return { url, storagePath };
}

export async function deleteDeliveryReceiptLogo(
  storagePath: string
): Promise<void> {
  if (!storagePath) return;
  await deleteObject(ref(getClientStorage(), storagePath));
}
