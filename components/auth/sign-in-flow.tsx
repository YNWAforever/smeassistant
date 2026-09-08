"use client";

import { type FormEvent, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";

import { authClient } from "@/lib/identity/client";
import { authFlowHref, callbackHref, type AuthFlow, type AuthMethod } from "@/lib/identity/sign-in-flow";

import { signInCopy } from "./sign-in-copy";
import styles from "./sign-in.module.css";

const subscribeHydration = () => () => {};
const hydratedClient = () => true;
const hydratedServer = () => false;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type SignInState =
  | { kind: "start" }
  | { kind: "opening_google" }
  | { kind: "sending_email" }
  | { kind: "email_sent"; email: string; retryAt: number }
  | { kind: "recover"; method: AuthMethod | null; reason: "cancelled" | "expired" | "unavailable" };

function initialState(reason: "cancelled" | "expired" | "unavailable" | null, flow: AuthFlow): SignInState {
  return reason ? { kind: "recover", method: flow.method, reason } : { kind: "start" };
}

function retryAfter(error: unknown, now: number): number {
  const candidate = error && typeof error === "object" ? error as { status?: unknown; headers?: unknown; response?: { headers?: unknown } } : {};
  const headers = candidate.headers ?? candidate.response?.headers;
  const raw = headers && typeof (headers as Headers).get === "function" ? (headers as Headers).get("retry-after") : null;
  if (!raw) return now + 60_000;
  const seconds = Number(raw);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.max(now + 60_000, now + seconds * 1000);
  const date = Date.parse(raw);
  return Number.isFinite(date) ? Math.max(now + 60_000, date) : now + 60_000;
}

export function SignInFlow({ flow, initialReason, plan }: { flow: AuthFlow; initialReason: "cancelled" | "expired" | "unavailable" | null; plan?: string }) {
  const router = useRouter();
  const copy = signInCopy[flow.locale];
  const hydrated = useSyncExternalStore(subscribeHydration, hydratedClient, hydratedServer);
  const [state, setState] = useState<SignInState>(() => initialState(initialReason, flow));
  const [email, setEmail] = useState("");
  const [fieldError, setFieldError] = useState("");
  const [now, setNow] = useState(() => Date.now());
  const heading = useRef<HTMLHeadingElement>(null);
  const previousKind = useRef(state.kind);
  const busy = state.kind === "opening_google" || state.kind === "sending_email";

  useEffect(() => {
    if (previousKind.current !== state.kind) heading.current?.focus();
    previousKind.current = state.kind;
  }, [state.kind]);
  useEffect(() => {
    if (state.kind !== "email_sent") return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [state.kind]);

  function withMethod(method: AuthMethod): AuthFlow { return { ...flow, method }; }
  function clearToStart(method: AuthMethod) {
    setFieldError("");
    setEmail("");
    setState({ kind: "start" });
    router.replace(authFlowHref(withMethod(method), "start"));
  }
  async function google() {
    if (!hydrated || busy) return;
    setFieldError("");
    setState({ kind: "opening_google" });
    const next = withMethod("google");
    router.replace(authFlowHref(next, "start"));
    try {
      const result = await authClient.signIn.social({ provider: "google", callbackURL: callbackHref(next), errorCallbackURL: callbackHref(next) });
      if (result.error) throw result.error;
    } catch {
      setState({ kind: "recover", method: "google", reason: "unavailable" });
    }
  }
  async function send(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    if (!hydrated || busy) return;
    const normalized = email.trim().toLowerCase();
    if (!EMAIL.test(normalized)) { setFieldError(copy.invalidEmail); return; }
    setFieldError("");
    setState({ kind: "sending_email" });
    const next = withMethod("email");
    router.replace(authFlowHref(next, "start"));
    try {
      const result = await authClient.signIn.magicLink({ email: normalized, callbackURL: callbackHref(next) });
      if (result.error) {
        const until = retryAfter(result.error, Date.now());
        if ((result.error as { status?: number }).status === 429) {
          setState({ kind: "email_sent", email: normalized, retryAt: until });
          return;
        }
        throw result.error;
      }
      setState({ kind: "email_sent", email: normalized, retryAt: Date.now() + 60_000 });
    } catch {
      setState({ kind: "recover", method: "email", reason: "unavailable" });
    }
  }

  const eligibility = flow.claim ? copy.claimEmailIntro : copy.emailIntro;
  if (state.kind === "recover") return <section className={styles.shell}><div className={styles.card}><h1 className={styles.heading} tabIndex={-1} ref={heading}>{copy.title}</h1><p className={styles.alert} role="alert">{copy[state.reason]}</p><p className={styles.description}>{eligibility}</p><button className={styles.primary} type="button" onClick={() => state.method === "email" ? clearToStart("email") : google()}>{state.method === "email" ? copy.retryEmail : copy.retryGoogle}</button><button className={styles.secondary} type="button" onClick={() => clearToStart(state.method === "google" ? "email" : "google")}>{state.method === "google" ? copy.retryEmail : copy.retryGoogle}</button><p className={styles.privacy}>{copy.privacy}</p></div></section>;
  if (state.kind === "email_sent") {
    const seconds = Math.max(0, Math.ceil((state.retryAt - now) / 1000));
    return <section className={styles.shell}><div className={styles.card}><h1 className={styles.heading} tabIndex={-1} ref={heading}>{copy.title}</h1><div className={styles.status} role="status">{flow.claim ? copy.claimInbox : copy.inbox}</div><p className={styles.email}>{state.email}</p><button className={styles.secondary} type="button" disabled={seconds > 0} onClick={() => void send()}>{seconds > 0 ? copy.resendIn(seconds) : copy.resend}</button><button className={styles.link} type="button" onClick={() => clearToStart("email")}>{copy.changeEmail}</button><p className={styles.privacy}>{copy.privacy}</p></div></section>;
  }
  return <section className={styles.shell}><div className={styles.card}><h1 className={styles.heading} tabIndex={-1} ref={heading}>{copy.title}</h1>{plan ? <p className={styles.description}>{plan}</p> : null}<p className={styles.description}>{eligibility}</p><button className={styles.primary} type="button" disabled={!hydrated || busy} onClick={() => void google()}>{state.kind === "opening_google" ? copy.openingGoogle : copy.google}</button>{state.kind === "opening_google" ? <div className={styles.status} role="status">{copy.openingGoogle}</div> : null}<div className={styles.divider}>{copy.emailAlternative}</div><form className={styles.form} onSubmit={(event) => void send(event)} noValidate><div className={styles.field}><label htmlFor="sign-in-email">{copy.emailLabel}</label><input className={styles.input} id="sign-in-email" disabled={!hydrated || busy} value={email} onChange={(event) => setEmail(event.target.value)} type="email" autoComplete="email" inputMode="email" /></div>{fieldError ? <p className={styles.alert} role="alert">{fieldError}</p> : null}<button className={styles.secondary} type="submit" disabled={!hydrated || busy}>{state.kind === "sending_email" ? copy.sendingEmail : copy.emailAction}</button>{state.kind === "sending_email" ? <div className={styles.status} role="status">{copy.sendingEmail}</div> : null}</form><p className={styles.privacy}>{copy.privacy}</p></div></section>;
}
