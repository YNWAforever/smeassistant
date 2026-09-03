import { NextResponse } from "next/server";

/**
 * Legacy compatibility endpoint. Existing scanner clients still post here;
 * a 307 preserves the POST method and body while moving them to the
 * transaction-backed report-access endpoint. The response from the target
 * endpoint sets the viewer cookie only after the unlock RPC commits.
 */
export function POST(req: Request) {
  return NextResponse.redirect(new URL("/api/report-access/unlock", req.url), 307);
}
