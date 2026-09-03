"use server";

import { redirect } from "next/navigation";

import { signOut } from "@/lib/auth";
import { normaliseLocale } from "@/lib/copy";

/** Clears the local session and returns to the locale's landing page. Bound with the locale by the page that renders the form. */
export async function signOutAction(locale: string): Promise<void> {
  await signOut();
  redirect(`/${normaliseLocale(locale)}`);
}
