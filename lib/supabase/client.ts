"use client";
import { createBrowserClient } from "@supabase/ssr";

/** Browser anon-key client for auth flows only (magic-link sign-in, sign-out). */
export function createSupabaseBrowserClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) throw new Error("Supabase Auth is not configured");
  return createBrowserClient(url, anonKey);
}