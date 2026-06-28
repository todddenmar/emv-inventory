import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
  type CollectionReference,
} from "firebase/firestore";
import { getClientDb } from "@/lib/firebase";
import {
  bannerConverter,
  testimonialConverter,
} from "@/lib/firestore/converters";
import type { HomeBanner, Testimonial } from "@/types";

function bannersRef(): CollectionReference<HomeBanner> {
  return collection(getClientDb(), "homeBanners").withConverter(
    bannerConverter
  );
}

function testimonialsRef(): CollectionReference<Testimonial> {
  return collection(getClientDb(), "testimonials").withConverter(
    testimonialConverter
  );
}

export async function getActiveBanners(): Promise<HomeBanner[]> {
  const snapshot = await getDocs(
    query(
      bannersRef(),
      where("isActive", "==", true),
      orderBy("order")
    )
  );
  return snapshot.docs.map((d) => d.data());
}

export async function getAllBanners(): Promise<HomeBanner[]> {
  const snapshot = await getDocs(query(bannersRef(), orderBy("order")));
  return snapshot.docs.map((d) => d.data());
}

export async function createBanner(
  data: Omit<HomeBanner, "id" | "createdAt" | "updatedAt">
): Promise<string> {
  const docRef = await addDoc(collection(getClientDb(), "homeBanners"), {
    ...data,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return docRef.id;
}

export async function updateBanner(
  id: string,
  data: Partial<Omit<HomeBanner, "id" | "createdAt" | "updatedAt">>
): Promise<void> {
  await updateDoc(doc(getClientDb(), "homeBanners", id), {
    ...data,
    updatedAt: serverTimestamp(),
  });
}

export async function deleteBanner(id: string): Promise<void> {
  await deleteDoc(doc(getClientDb(), "homeBanners", id));
}

export async function getActiveTestimonials(): Promise<Testimonial[]> {
  const snapshot = await getDocs(
    query(
      testimonialsRef(),
      where("isActive", "==", true),
      orderBy("order")
    )
  );
  return snapshot.docs.map((d) => d.data());
}

export async function getAllTestimonials(): Promise<Testimonial[]> {
  const snapshot = await getDocs(query(testimonialsRef(), orderBy("order")));
  return snapshot.docs.map((d) => d.data());
}

export async function createTestimonial(
  data: Omit<Testimonial, "id" | "createdAt" | "updatedAt">
): Promise<string> {
  const docRef = await addDoc(collection(getClientDb(), "testimonials"), {
    ...data,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return docRef.id;
}

export async function updateTestimonial(
  id: string,
  data: Partial<Omit<Testimonial, "id" | "createdAt" | "updatedAt">>
): Promise<void> {
  await updateDoc(doc(getClientDb(), "testimonials", id), {
    ...data,
    updatedAt: serverTimestamp(),
  });
}

export async function deleteTestimonial(id: string): Promise<void> {
  await deleteDoc(doc(getClientDb(), "testimonials", id));
}
