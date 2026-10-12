"use server";

import { redirect } from "next/navigation";

import { signOut } from "@/lib/auth";
import { normaliseLocale } from "@/lib/copy";
import {authFlowHref,parseAuthFlow} from '@/lib/identity/sign-in-flow';

/** Explicit app-session switch; never logs out Google or changes memberships. */
export async function switchAccountAction(locale:string,returnTo:string|null,claim:string|null):Promise<void>{
  const query=new URLSearchParams({locale:normaliseLocale(locale),intent:'switch_account',method:'google'});
  if(returnTo)query.set('returnTo',returnTo);
  if(claim)query.set('claim',claim);
  const href=authFlowHref(parseAuthFlow(query),'start');
  try{await signOut();}catch{redirect(`${href}&error=auth_unavailable`);}
  redirect(href);
}

/** Clears the local session and returns to the locale's landing page. Bound with the locale by the page that renders the form. */
export async function signOutAction(locale: string): Promise<void> {
  try { await signOut(); }
  catch { redirect(`/${normaliseLocale(locale)}/owner/sign-in?error=auth_unavailable`); }
  redirect(`/${normaliseLocale(locale)}`);
}
