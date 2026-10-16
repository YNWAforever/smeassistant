"use client";

import { type FormEvent, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";

import { loadAuthClient, preloadAuthClient } from "@/lib/identity/load-client";
import { requestEmailCode } from "@/lib/identity/email-code-client";
import { authFlowHref, callbackHref, type AuthFlow, type AuthMethod } from "@/lib/identity/sign-in-flow";

import { signInCopy } from "./sign-in-copy";
import styles from "./sign-in.module.css";

/** Google's "G", on the white chip its sign-in branding asks for on dark buttons. Decorative: the label names the provider. */
function GoogleMark() {
  return (
    <span className={styles.googleMark} aria-hidden="true">
      <svg viewBox="0 0 48 48" width="18" height="18">
        <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
        <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
        <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
        <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
      </svg>
    </span>
  );
}

const subscribeHydration = () => () => {};
const hydratedClient = () => true;
const hydratedServer = () => false;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type SignInState =
  | { kind: "start" }
  | { kind: "opening_google" }
  | { kind: "sending_email" }
  | { kind: "email_sent"; email: string; retryAt: number }
  | { kind: "rate_limited"; email: string; retryAt: number }
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
  // Warm the on-demand auth client once the page is idle, so a press rarely waits for it.
  useEffect(() => {
    const idle = window.requestIdleCallback ? window.requestIdleCallback(preloadAuthClient, { timeout: 3000 }) : window.setTimeout(preloadAuthClient, 1500);
    return () => { if (window.cancelIdleCallback) window.cancelIdleCallback(idle); else window.clearTimeout(idle); };
  }, []);
  const [state, setState] = useState<SignInState>(() => initialState(initialReason, flow));
  const [email, setEmail] = useState("");
  const [fieldError, setFieldError] = useState("");
  const [code, setCode] = useState("");
  const [codeError, setCodeError] = useState("");
  const [verifying, setVerifying] = useState(false);
  const verificationInFlight = useRef(false);
  const [switchAccount,setSwitchAccount]=useState(flow.intent==='switch_account');
  const [now, setNow] = useState(() => Date.now());
  const heading = useRef<HTMLHeadingElement>(null);
  const previousKind = useRef(state.kind);
  const busy = state.kind === "opening_google" || state.kind === "sending_email" || verifying;

  useEffect(() => {
    if (previousKind.current !== state.kind) heading.current?.focus();
    previousKind.current = state.kind;
  }, [state.kind]);
  useEffect(() => {
    if (state.kind !== "email_sent" && state.kind !== "rate_limited") return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [state.kind]);

  function withMethod(method: AuthMethod): AuthFlow { return { ...flow, method }; }
  function clearToStart(method: AuthMethod) {
    setFieldError("");
    setEmail("");
    setCode("");
    setCodeError("");
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
      const result = await (await loadAuthClient()).signIn.social({ provider: "google", callbackURL: callbackHref(next), errorCallbackURL: callbackHref(next) });
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
    setCode("");
    setCodeError("");
    setState({ kind: "sending_email" });
    const next = withMethod("email");
    router.replace(authFlowHref(next, "start"));
    try {
      const result = await requestEmailCode({ email: normalized, callbackURL: callbackHref(next) });
      if (result.error) {
        const until = retryAfter(result.error, Date.now());
        if ((result.error as { status?: number }).status === 429) {
          // Refused before any mail was sent: say so, rather than showing the inbox screen.
          setState({ kind: "rate_limited", email: normalized, retryAt: until });
          return;
        }
        throw result.error;
      }
      setState({ kind: "email_sent", email: normalized, retryAt: Date.now() + 60_000 });
    } catch {
      setState({ kind: "recover", method: "email", reason: "unavailable" });
    }
  }

  function verificationFailure(error: unknown): string {
    const status = error && typeof error === "object" && "status" in error ? error.status : null;
    if (status === 429) return copy.codeRateLimited;
    return status === 400 || status === 401 || status === 403 || status === 422 ? copy.invalidCode : copy.unavailable;
  }

  async function verifyCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || verificationInFlight.current || (state.kind !== "email_sent" && state.kind !== "rate_limited")) return;
    if (!/^\d{6}$/.test(code.trim())) { setCodeError(copy.invalidCode); return; }
    verificationInFlight.current = true;
    setVerifying(true);
    setCodeError("");
    let completing = false;
    try {
      const result = await (await loadAuthClient()).signIn.emailOtp({ email: state.email, otp: code.trim() });
      if (result.error) {
        setCodeError(verificationFailure(result.error));
        return;
      }
      router.replace(authFlowHref(withMethod("email"), "complete"));
      completing = true;
    } catch (error) {
      // The pinned browser SDK throws normalized AuthApiError for HTTP failures.
      setCodeError(verificationFailure(error));
    } finally {
      if (!completing) {
        verificationInFlight.current = false;
        setVerifying(false);
      }
    }
  }

  function codeForm() {
    return <form className={styles.form} onSubmit={event => void verifyCode(event)} noValidate>
      <div className={styles.field}>
        <label htmlFor="sign-in-code">{copy.codeLabel}</label>
        <input id="sign-in-code" className={styles.input} value={code} onChange={event => setCode(event.target.value)}
          type="text" inputMode="numeric" autoComplete="one-time-code" maxLength={6} disabled={verifying}
          aria-invalid={Boolean(codeError)} aria-describedby={codeError ? "sign-in-code-error" : undefined} />
      </div>
      {codeError ? <p id="sign-in-code-error" className={styles.alert} role="alert">{codeError}</p> : null}
      <button className={styles.primary} type="submit" disabled={verifying} aria-busy={verifying}>{copy.verifyCode}</button>
      {verifying ? <p className={styles.status} role="status">{copy.verifyingCode}</p> : null}
    </form>;
  }

  function resendLabel(seconds: number): string {
    if (seconds <= 0) return copy.resend;
    return seconds < 180 ? copy.resendIn(seconds) : copy.resendInMinutes(Math.round(seconds / 60));
  }
  const eligibility = flow.claim ? copy.claimEmailIntro : copy.emailIntro;
  if (state.kind === "recover") return <section className={styles.shell}><div className={styles.card}><h1 className={styles.heading} tabIndex={-1} ref={heading}>{copy.title}</h1><p className={styles.alert} role="alert">{copy[state.reason]}</p><p className={styles.description}>{eligibility}</p><button className={styles.primary} type="button" onClick={() => state.method === "email" ? clearToStart("email") : google()}>{state.method === "email" ? copy.retryEmail : copy.retryGoogle}</button><a className={styles.secondary} href={authFlowHref(withMethod(state.method === "google" ? "email" : "google"), "start")}>{state.method === "google" ? copy.retryEmail : copy.retryGoogle}</a><p className={styles.privacy}>{copy.privacy}</p></div></section>;
  if (state.kind === "rate_limited") {
    const seconds = Math.max(0, Math.ceil((state.retryAt - now) / 1000));
    const minutes = Math.max(1, Math.round(seconds / 60));
    return <section className={styles.shell}><div className={styles.card}><h1 className={styles.heading} tabIndex={-1} ref={heading}>{copy.title}</h1><p className={styles.alert} role="alert">{seconds > 0 ? copy.rateLimited(minutes) : copy.rateLimitedReady}</p><p className={styles.email}>{state.email}</p>{codeForm()}<p className={styles.description}>{copy.rateLimitedHelp}</p><button className={styles.secondary} type="button" disabled={seconds > 0 || verifying} onClick={() => void send()}>{resendLabel(seconds)}</button><button className={styles.link} type="button" disabled={verifying} onClick={() => clearToStart("email")}>{copy.changeEmail}</button><p className={styles.privacy}>{copy.privacy}</p></div></section>;
  }
  if (state.kind === "email_sent") {
    const seconds = Math.max(0, Math.ceil((state.retryAt - now) / 1000));
    return <section className={styles.shell}><div className={styles.card}><h1 className={styles.heading} tabIndex={-1} ref={heading}>{copy.title}</h1><div className={styles.status} role={verifying ? undefined : "status"}>{flow.claim ? copy.claimInbox : copy.inbox}</div><p className={styles.email}>{state.email}</p>{codeForm()}<button className={styles.secondary} type="button" disabled={seconds > 0 || verifying} onClick={() => void send()}>{resendLabel(seconds)}</button><button className={styles.link} type="button" disabled={verifying} onClick={() => clearToStart("email")}>{copy.changeEmail}</button><p className={styles.description}>{flow.claim ? copy.claimNoLinkHelp : copy.noLinkHelp}</p><p className={styles.privacy}>{copy.privacy}</p></div></section>;
  }
  return <section className={styles.shell}><div className={styles.card}><h1 className={styles.heading} tabIndex={-1} ref={heading}>{copy.title}</h1>{plan ? <p className={styles.description}>{plan}</p> : null}<p className={styles.description}>{eligibility}</p><button className={styles.primary} type="button" disabled={!hydrated || busy} aria-busy={state.kind === "opening_google"} onClick={() => void google()}><GoogleMark />{copy.google}</button>{state.kind === "opening_google" ? <div className={styles.status} role="status">{copy.openingGoogle}</div> : null}<button className={styles.link} type="button" disabled={busy} onClick={()=>setSwitchAccount(true)}>{flow.locale==='en'?'Use another Google account':flow.locale==='zh-TW'?'使用另一個 Google 帳戶':'用另一個 Google 帳戶'}</button>{switchAccount && <p role="status" className={styles.description}>{flow.locale==='en'?'Continue with Google and choose Use another account if offered. If Google keeps returning the same account, add or select the intended account in Google first, then return here; you can also use its email sign-in code below.':flow.locale==='zh-TW'?'繼續 Google 登入，並在 Google 提供時選擇「使用其他帳戶」。如一直返回同一帳戶，請先在 Google 新增或選擇目標帳戶，再回來；也可使用下方該帳戶的電子郵件驗證碼。':'繼續 Google 登入，並在 Google 提供時選擇「使用其他帳戶」。如一直返回同一帳戶，請先在 Google 加入或選擇目標帳戶，再回來；亦可使用下方該帳戶的電郵驗證碼。'}</p>}<div className={styles.divider}>{copy.emailAlternative}</div><form className={styles.form} onSubmit={(event) => void send(event)} noValidate><div className={styles.field}><label htmlFor="sign-in-email">{copy.emailLabel}</label><input className={styles.input} id="sign-in-email" disabled={!hydrated || busy} value={email} onChange={(event) => setEmail(event.target.value)} type="email" autoComplete="email" inputMode="email" /></div>{fieldError ? <p className={styles.alert} role="alert">{fieldError}</p> : null}<button className={styles.secondary} type="submit" disabled={!hydrated || busy} aria-busy={state.kind === "sending_email"}>{copy.emailAction}</button>{state.kind === "sending_email" ? <div className={styles.status} role="status">{copy.sendingEmail}</div> : null}</form><p className={styles.privacy}>{copy.privacy}</p></div></section>;
}
