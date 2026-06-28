import {
  deleteObject,
  getDownloadURL,
  ref,
  uploadBytes,
} from "firebase/storage";
import { getClientStorage } from "@/lib/firebase";

export async function uploadHomepageImage(
  folder: "banners" | "testimonials",
  id: string,
  file: File,
  suffix = "image"
): Promise<{ url: string; storagePath: string }> {
  const storagePath = `homepage/${folder}/${id}-${suffix}-${file.name}`;
  const storageRef = ref(getClientStorage(), storagePath);
  await uploadBytes(storageRef, file);
  const url = await getDownloadURL(storageRef);
  return { url, storagePath };
}

export async function deleteHomepageImage(storagePath: string): Promise<void> {
  if (!storagePath) return;
  await deleteObject(ref(getClientStorage(), storagePath));
}
