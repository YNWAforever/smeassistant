"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { authClient } from "@/lib/identity/client";
import { authFlowHref, callbackHref, type AuthFlow } from "@/lib/identity/sign-in-flow";
import { signInCopy } from "./sign-in-copy";
import styles from "./sign-in.module.css";

type Completion = { kind: "redirect"; destination: string } | { kind: "no_access" } | { kind: "recover"; reason: string };
type Screen = "processing" | "no_access" | "recover" | "changing";

function payload(flow: AuthFlow): Record<string, string> {
  const value: Record<string, string> = { locale: flow.locale };
  if (flow.claim) value.claim = flow.claim;
  if (flow.returnTo) value.returnTo = flow.returnTo;
  if (flow.method) value.method = flow.method;
  return value;
}
function localDestination(value: unknown): string | null {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//")) return null;
  try { return new URL(value, window.location.origin).origin === window.location.origin ? value : null; } catch { return null; }
}
function completionRequest(flow: AuthFlow): Promise<Completion> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 20_000);
  return fetch("/api/owner/sign-in/complete", { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify(payload(flow)), signal: controller.signal })
    .then(async (response) => response.ok ? response.json() as Promise<Completion> : Promise.reject(new Error("completion_failed")))
    .finally(() => window.clearTimeout(timeout));
}

export function SignInCompletion({ flow }: { flow: AuthFlow }) {
  const router = useRouter();
  const copy = signInCopy[flow.locale];
  const [screen, setScreen] = useState<Screen>("processing");
  const promise = useRef<Promise<Completion> | null>(null);
  const routerRef = useRef(router);
  routerRef.current = router;
  useEffect(() => {
    let subscribed = true;
    promise.current ??= completionRequest(flow);
    promise.current.then((result) => {
      if (!subscribed) return;
      if (result.kind === "redirect" && localDestination(result.destination)) { routerRef.current.replace(result.destination); return; }
      setScreen(result.kind === "no_access" ? "no_access" : "recover");
    }).catch(() => { if (subscribed) setScreen("recover"); });
    return () => { subscribed = false; };
  }, [flow]);
  async function retry() {
    if (flow.method === "google") {
      setScreen("processing");
      try { const result = await authClient.signIn.social({ provider: "google", callbackURL: callbackHref(flow), errorCallbackURL: callbackHref(flow) }); if (result.error) throw result.error; } catch { setScreen("recover"); }
      return;
    }
    router.replace(authFlowHref({ ...flow, method: "email" }, "start"));
  }
  async function changeAccount() {
    setScreen("changing");
    try { await authClient.signOut(); router.replace(authFlowHref({ ...flow, method: null }, "start")); } catch { setScreen("recover"); }
  }
  return <section className={styles.shell}><div className={styles.card}><h1 className={styles.heading} tabIndex={-1}>{copy.title}</h1>{screen === "processing" ? <p className={styles.status} role="status">{copy.processing}</p> : null}{screen === "no_access" ? <><p className={styles.alert} role="alert">{copy.noAccess}</p><button className={styles.primary} type="button" onClick={() => void changeAccount()}>{copy.changeAccount}</button></> : null}{screen === "changing" ? <p className={styles.status} role="status">{copy.changingAccount}</p> : null}{screen === "recover" ? <><p className={styles.alert} role="alert">{copy.changeAccountFailed}</p><p className={styles.description}>{copy.technicalFailure}</p><button className={styles.primary} type="button" onClick={() => void retry()}>{flow.method === "email" ? copy.retryEmail : copy.retryGoogle}</button></> : null}<p className={styles.privacy}>{copy.privacy}</p></div></section>;
}
