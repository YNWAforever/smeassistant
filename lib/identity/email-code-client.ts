"use client";

/** The app adds report/invitation eligibility and mail limits before the SDK sends. */
export async function requestEmailCode(input: { email: string; callbackURL: string }) {
  const response = await fetch("/api/auth/email-otp/send-verification-otp", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: input.email, type: "sign-in", callbackURL: input.callbackURL }),
  });
  return { error: response.ok ? null : { status: response.status, headers: response.headers } };
}
