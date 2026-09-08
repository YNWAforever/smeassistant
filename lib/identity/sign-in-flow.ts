import { DEFAULT_LOCALE, isLocale, type Locale } from "@/lib/locale";

import { safeReturnPath } from "./return-path";

export type AuthMethod = "google" | "email";
export type AuthFlow = {
  locale: Locale;
  claim: string | null;
  returnTo: string | null;
  method: AuthMethod | null;
};
export type AuthScreen = "start" | "complete";

const CLAIM_RE = /^[A-Za-z0-9_-]{6,64}$/;
const METHODS = new Set<AuthMethod>(["google", "email"]);

function single(query: URLSearchParams, key: string): string | null {
  const values = query.getAll(key);
  return values.length === 1 ? values[0] : null;
}

function safeFlowReturnPath(value: string | null): string | null {
  if (!value) return null;
  const path = safeReturnPath(value, "");
  if (!path) return null;

  let decoded = path;
  for (let depth = 0; depth < 8; depth++) {
    const next = decodeURIComponent(decoded);
    if (next === decoded) break;
    decoded = next;
  }
  const pathname = new URL(decoded, "https://local.invalid").pathname;
  if (
    pathname === "/auth/callback" ||
    /^\/(?:zh-HK|en|zh-TW)\/owner\/sign-in(?:\/complete)?$/.test(pathname)
  ) return null;

  return path;
}

/** Parses only context that may safely survive an authentication redirect. */
export function parseAuthFlow(query: URLSearchParams): AuthFlow {
  const locale = single(query, "locale");
  const claim = single(query, "claim");
  const method = single(query, "method");

  return {
    locale: isLocale(locale) ? locale : DEFAULT_LOCALE,
    claim: claim && CLAIM_RE.test(claim) ? claim : null,
    returnTo: safeFlowReturnPath(single(query, "returnTo")),
    method: method && METHODS.has(method as AuthMethod) ? method as AuthMethod : null,
  };
}

function flowParams(flow: AuthFlow): URLSearchParams {
  const query = new URLSearchParams();
  if (flow.claim) query.set("claim", flow.claim);
  if (flow.returnTo) query.set("returnTo", flow.returnTo);
  if (flow.method) query.set("method", flow.method);
  return query;
}

/** Builds a sign-in URL from parsed fields only. */
export function authFlowHref(flow: AuthFlow, screen: AuthScreen): string {
  const path = `/${flow.locale}/owner/sign-in${screen === "complete" ? "/complete" : ""}`;
  const query = flowParams(flow);
  return query.size ? `${path}?${query.toString()}` : path;
}

/** Builds the sole managed-identity callback URL from parsed fields only. */
export function callbackHref(flow: AuthFlow): string {
  const query = new URLSearchParams({ locale: flow.locale });
  if (flow.claim) query.set("claim", flow.claim);
  if (flow.returnTo) query.set("returnTo", flow.returnTo);
  if (flow.method) query.set("method", flow.method);
  return `/auth/callback?${query.toString()}`;
}
