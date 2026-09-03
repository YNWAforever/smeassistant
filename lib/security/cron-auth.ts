import { timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";

/**
 * Authorize a Vercel Cron invocation.
 *
 * Vercel attaches `Authorization: Bearer $CRON_SECRET` to every cron request
 * when that environment variable is set, so this is the platform's own contract
 * rather than a scheme invented here. The routes behind it INSERT jobs and burn
 * paid provider quota, so it fails closed in every ambiguous case: no secret
 * configured, a secret too short to resist guessing, a missing header, or the
 * wrong scheme.
 *
 * Nothing here distinguishes "no secret configured" from "wrong secret" in its
 * return value or its response — a caller must not be able to probe which.
 */
const MIN_SECRET_LENGTH = 16;
const BEARER = "Bearer ";

export function authorizeCronRequest(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret || secret.length < MIN_SECRET_LENGTH) return false;

  const header = req.headers.get("authorization");
  if (!header || !header.startsWith(BEARER)) return false;

  const presented = Buffer.from(header.slice(BEARER.length), "utf8");
  const expected = Buffer.from(secret, "utf8");
  // Length is compared first and separately: timingSafeEqual throws rather than
  // returning false when the buffers differ in size.
  if (presented.length !== expected.length) return false;

  return timingSafeEqual(presented, expected);
}

export function cronUnauthorizedResponse(): NextResponse {
  return NextResponse.json({ error: "unauthorized" }, { status: 401 });
}
