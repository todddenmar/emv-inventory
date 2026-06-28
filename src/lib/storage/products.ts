import {
  deleteObject,
  getDownloadURL,
  ref,
  uploadBytes,
} from "firebase/storage";
import { getClientStorage } from "@/lib/firebase";

export async function uploadProductImage(
  productId: string,
  imageId: string,
  file: File
): Promise<{ url: string; storagePath: string }> {
  const storagePath = `products/${productId}/${imageId}-${file.name}`;
  const storageRef = ref(getClientStorage(), storagePath);
  await uploadBytes(storageRef, file);
  const url = await getDownloadURL(storageRef);
  return { url, storagePath };
}

export async function deleteProductImage(storagePath: string): Promise<void> {
  if (!storagePath) return;
  await deleteObject(ref(getClientStorage(), storagePath));
}
