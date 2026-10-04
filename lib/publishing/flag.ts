/**
 * Publishing an approved review reply to Google Business Profile (P4.6, spec
 * §2.1) is off by default. Only the exact string "true" turns it on: "TRUE",
 * "1" or a padded value stay off.
 */
export function gbpReplyPublishEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env.GBP_REPLY_PUBLISH_ENABLED === "true";
}
